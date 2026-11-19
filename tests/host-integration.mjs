// End-to-end host check: mount the plugin routes on a throwaway HTTP server and
// compare the realtime answer against an independent aggregation of the same logs.
import http from 'node:http';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { apply } from '../lib/index.js';
import { parseLogEvents, readLogText } from '../lib/log-fold.js';

const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh');

const routes = new Map();
const ctx = {
  effect(fn) {
    const dispose = fn();
    return () => dispose?.();
  },
  get(name) {
    if (name === 'webServer') {
      return {
        register({ path, handler }) {
          routes.set(path, handler);
          return () => routes.delete(path);
        },
      };
    }
    return undefined;
  },
  logger: { warn: (message) => console.log('[host warn]', message) },
};

apply(ctx);
assert.ok(routes.has('/plugins/dsh-usage-overview/stats'), 'stats route registered');
assert.ok(routes.has('/plugins/dsh-usage-overview/realtime'), 'realtime route registered');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const handler = routes.get(url.pathname);
  if (handler === undefined) {
    res.writeHead(404).end();
    return;
  }
  handler(req, res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${String(port)}`;
console.log('harness listening on', base);

async function get(path, init) {
  const started = performance.now();
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  return { status: res.status, text, ms: Math.round(performance.now() - started), headers: res.headers };
}

async function collectRecent(now) {
  const sessions = join(HOME, 'sessions');
  const events = [];
  for (const workspace of await readdir(sessions, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const workspacePath = join(sessions, workspace.name);
    for (const session of await readdir(workspacePath, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const file = join(workspacePath, session.name, 'session.v4.jsonl.zstd');
      let parsed;
      try {
        parsed = parseLogEvents(readLogText(file));
      } catch {
        continue;
      }
      for (const event of parsed) {
        if (event.type !== 'assistant/message') continue;
        const usage = event.data?.usage;
        if (usage === undefined || usage === null) continue;
        const total =
          (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) + (usage.outputTokens ?? 0);
        if (!(total > 0) || typeof event.time !== 'number') continue;
        const at = event.time;
        if (at < now - 3600000 || at > now) continue;
        events.push({ at, total });
      }
    }
  }
  return events;
}

// A session keeps appending while this runs, so sample the raw logs before and
// after the request: the document must sit between those two recounts.
const beforeAt = Date.now();
const beforeEvents = await collectRecent(beforeAt);
const realtime = await get('/plugins/dsh-usage-overview/realtime?minutes=60');
assert.equal(realtime.status, 200, realtime.text.slice(0, 300));
const doc = JSON.parse(realtime.text);
console.log('realtime:', realtime.ms, 'ms,', realtime.text.length, 'bytes, buckets', doc.buckets.length);

assert.equal(doc.schemaVersion, 1);
assert.equal(doc.windowMinutes, 60);
assert.equal(doc.buckets.length, 60);
assert.equal(doc.buckets[59].start, Math.floor(doc.generatedAt / 60000) * 60000);

const windowTotal = doc.buckets.reduce((sum, bucket) => sum + bucket.total, 0);
assert.equal(windowTotal, doc.totals.lastWindow, 'bucket sum matches the window total');
for (const key of ['last1m', 'last5m', 'last15m', 'lastWindow']) {
  assert.ok(doc.totals[key] >= 0 && doc.totals[key] <= doc.totals.lastWindow, `${key} ordering`);
}
assert.ok(doc.rate.lastSampleAt === null || doc.rate.lastSampleAt <= doc.generatedAt + 60000);
console.log('totals:', doc.totals, 'rate:', doc.rate.currentMinute, doc.rate.previousMinute);
console.log('activity:', JSON.stringify(doc.activity).slice(0, 300));

// Independent recomputation of the same window from the raw logs. Sessions keep
// appending while this runs, so only the ongoing minute may differ.
const expected = await collectRecent(doc.generatedAt);
const now = doc.generatedAt;
const firstStart = Math.floor(now / 60000) * 60000 - 59 * 60000;
const currentStart = Math.floor(now / 60000) * 60000;
const recount = new Map();
for (const event of expected) {
  if (event.at < firstStart || event.at >= currentStart + 60000) continue;
  const start = Math.floor(event.at / 60000) * 60000;
  recount.set(start, (recount.get(start) ?? 0) + event.total);
}
for (const bucket of doc.buckets) {
  if (bucket.start >= currentStart) continue;
  const wanted = recount.get(bucket.start) ?? 0;
  assert.equal(bucket.total, wanted, `bucket ${new Date(bucket.start).toISOString()} matches the raw log`);
}
const sumCompleted = doc.buckets
  .filter((bucket) => bucket.start < currentStart)
  .reduce((sum, bucket) => sum + bucket.total, 0);
const recountCompleted = [...recount.entries()]
  .filter(([start]) => start < currentStart)
  .reduce((sum, [, total]) => sum + total, 0);
console.log('completed-minute sum:', sumCompleted, 'independent:', recountCompleted);
assert.equal(sumCompleted, recountCompleted, 'document matches an independent recount of completed minutes');
assert.ok(doc.buckets[doc.buckets.length - 1].total <= (recount.get(currentStart) ?? 0) || (recount.get(currentStart) ?? 0) === 0);

const last1mBefore = beforeEvents
  .filter((event) => event.at > now - 60000 && event.at <= now)
  .reduce((sum, event) => sum + event.total, 0);
const last1mAfter = expected
  .filter((event) => event.at > now - 60000 && event.at <= now)
  .reduce((sum, event) => sum + event.total, 0);
assert.ok(
  doc.totals.last1m >= last1mBefore && doc.totals.last1m <= last1mAfter,
  `rolling minute ${String(doc.totals.last1m)} lies between the recounts (${String(last1mBefore)}..${String(last1mAfter)})`,
);

// The stats route keeps its old shape and now uses the shared snapshot.
const stats = await get('/plugins/dsh-usage-overview/stats?range=30d');
assert.equal(stats.status, 200);
const statsDoc = JSON.parse(stats.text);
assert.equal(statsDoc.schemaVersion, 1);
assert.ok(Array.isArray(statsDoc.days) && Array.isArray(statsDoc.models));
console.log('stats:', stats.ms, 'ms, days', statsDoc.days.length, 'models', statsDoc.models.length, 'total', statsDoc.totals.total);

// Restarting a rapid poll must be cheap because folds are cached.
const times = [];
for (let index = 0; index < 6; index += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1100));
  times.push((await get('/plugins/dsh-usage-overview/realtime?minutes=60')).ms);
}
console.log('poll latencies:', times.join(', '), 'ms');
assert.ok(Math.max(...times) < 2000, 'realtime route stays interactive');

// Route contracts that the panel relies on.
const notFound = await get('/plugins/dsh-usage-overview/nope');
assert.equal(notFound.status, 404);
const post = await get('/plugins/dsh-usage-overview/realtime', { method: 'POST' });
assert.equal(post.status, 405);
assert.equal(post.headers.get('cache-control'), 'no-store');
const clampedLow = JSON.parse((await get('/plugins/dsh-usage-overview/realtime?minutes=1')).text);
assert.equal(clampedLow.windowMinutes, 5);
const clampedHigh = JSON.parse((await get('/plugins/dsh-usage-overview/realtime?minutes=9999')).text);
assert.equal(clampedHigh.windowMinutes, 240);
const garbage = JSON.parse((await get('/plugins/dsh-usage-overview/realtime?minutes=abc')).text);
assert.equal(garbage.windowMinutes, 60);

// Remote-looking Host headers are refused, exactly like the stats route.
const untrusted = await new Promise((resolve, reject) => {
  const request = http.request(
    { hostname: '127.0.0.1', port, path: '/plugins/dsh-usage-overview/realtime', headers: { host: 'example.com' } },
    (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode }));
    },
  );
  request.on('error', reject);
  request.end();
});
assert.equal(untrusted.status, 403);

server.close();
console.log('host integration checks passed');
