// Unit checks for minute buckets and the realtime document (no harness, no network).
import assert from 'node:assert/strict';

import { buildRealtimeDocument } from '../lib/usage.js';
import { foldSessionEvents } from '../lib/log-fold.js';

const M = Date.UTC(2026, 0, 1, 12, 0, 0);
const MINUTE = 60000;
const now = M + 30000;

function sample(at, total, provider = 'opencode-go', model = 'deepseek-v4.1-flash') {
  return {
    at,
    total,
    provider,
    model,
    uncachedInputTokens: Math.round(total * 0.1),
    cacheReadTokens: Math.round(total * 0.8),
    cacheWriteTokens: 0,
    outputTokens: total - Math.round(total * 0.1) - Math.round(total * 0.8),
  };
}

const sessions = [
  {
    id: 'session-a',
    recent: [sample(M - 15000, 100), sample(M + 10000, 50), sample(M - 61 * MINUTE, 999)],
  },
  { id: 'session-b', recent: [sample(M - 2 * MINUTE, 30, 'deepseek', 'deepseek-v3.2')] },
];

const doc = buildRealtimeDocument(sessions, { now, windowMinutes: 60 });

assert.equal(doc.schemaVersion, 1);
assert.equal(doc.kind, 'usage-realtime');
assert.equal(doc.bucketMs, MINUTE);
assert.equal(doc.buckets.length, 60, 'zero-filled window has one bucket per minute');
assert.equal(doc.buckets[59].start, M, 'last bucket is the ongoing minute');
assert.equal(doc.buckets[0].start, M - 59 * MINUTE, 'first bucket is window start');
for (let index = 1; index < doc.buckets.length; index += 1) {
  assert.equal(doc.buckets[index].start - doc.buckets[index - 1].start, MINUTE, 'buckets are contiguous');
}
assert.equal(doc.buckets[59].total, 50, 'current minute sums its samples');
assert.equal(doc.buckets[58].total, 100, 'previous minute sums its samples');
assert.equal(doc.buckets[57].total, 30, 'two minutes ago buckets the other route');
assert.equal(doc.buckets[59].sessions, 1);
assert.equal(doc.buckets[59].calls, 1);
assert.ok(doc.buckets[59].uncachedInputTokens > 0 && doc.buckets[59].cacheReadTokens > 0, 'bucket split');
assert.deepEqual(Object.keys(doc.buckets[58].routes), ['opencode-go\u0000deepseek-v4.1-flash']);

assert.equal(doc.totals.last1m, 150, 'rolling minute counts every sample in the trailing 60s');
assert.equal(doc.totals.last5m, 180, 'rolling 5 minutes adds the older sample');
assert.equal(doc.totals.lastWindow, 180, 'samples before the window are excluded');
assert.equal(doc.rate.currentMinute, 50);
assert.equal(doc.rate.previousMinute, 100);
assert.equal(doc.rate.rollingMinute, 150);
assert.equal(doc.rate.peakMinute, 100, 'peak ignores the ongoing partial minute');
assert.equal(doc.rate.peakStart, M - MINUTE);
assert.equal(doc.rate.averagePerMinute5, 36);
assert.equal(doc.rate.lastSampleAt, M + 10000);
assert.equal(doc.activity.sessions, 2);
assert.equal(doc.activity.models.length, 2);
assert.equal(doc.activity.models[0].key, 'opencode-go/deepseek-v4.1-flash');
assert.equal(doc.activity.models[0].total, 150);
assert.ok(Math.abs(doc.activity.models[0].share - (150 / 180) * 100) < 1e-9);

// Window bounds are clamped, not trusted.
assert.equal(buildRealtimeDocument(sessions, { now, windowMinutes: 1 }).windowMinutes, 5);
assert.equal(buildRealtimeDocument(sessions, { now, windowMinutes: 10000 }).windowMinutes, 240);
assert.equal(buildRealtimeDocument(sessions, { now, windowMinutes: 240 }).buckets.length, 240);

// No data at all still answers with an empty, well-formed window.
const empty = buildRealtimeDocument([], { now });
assert.equal(empty.buckets.length, 60);
assert.ok(empty.buckets.every((bucket) => bucket.total === 0));
assert.equal(empty.rate.currentMinute, 0);
assert.equal(empty.rate.peakStart, null);
assert.equal(empty.rate.lastSampleAt, null);
assert.deepEqual(empty.activity.models, []);

// Events in the future minute (clock skew) never land in a bucket.
const skewed = buildRealtimeDocument([{ id: 's', recent: [sample(M + MINUTE, 77)] }], { now });
assert.equal(skewed.buckets[59].total, 0);
assert.equal(skewed.totals.last1m, 0);
assert.equal(skewed.activity.models.length, 0);

// A cached fold older than the window still cannot leak into the numbers.
const stale = buildRealtimeDocument(
  [{ id: 's', recent: [sample(M - 90 * MINUTE, 500)] }],
  { now, windowMinutes: 60 },
);
assert.equal(stale.totals.lastWindow, 0);
assert.equal(stale.rate.peakStart, null);

// Folding keeps minutes only inside the retained window and reports samples.
const events = [
  { type: 'assistant/message', time: M - 5000, data: { usage: { inputTokens: 10, cacheReadTokens: 90, outputTokens: 5 }, message: { source: { provider: 'p', model: 'm' } } } },
  { type: 'assistant/message', time: M + 5000, data: { usage: { inputTokens: 1, cacheReadTokens: 9, outputTokens: 2 }, message: { source: { provider: 'p', model: 'm' } } } },
  { type: 'assistant/message', time: M - 10 * 60 * MINUTE, data: { usage: { inputTokens: 1, cacheReadTokens: 1, outputTokens: 1 }, message: { source: { provider: 'p', model: 'm' } } } },
  { type: 'step/end', time: M },
  { type: 'turn/end', time: M },
];
const folded = foldSessionEvents(events, { now, recentWindowMs: 60 * MINUTE });
assert.equal(folded.total, 105 + 12 + 3);
assert.deepEqual([...folded.minutes.keys()].sort((a, b) => a - b), [M - MINUTE, M]);
assert.equal(folded.minutes.get(M).totals.uncachedInputTokens, 1);
assert.equal(folded.minutes.get(M - MINUTE).totals.cacheReadTokens, 90);
assert.equal(folded.minutes.get(M).calls, 1);
assert.equal(folded.recent.length, 2, 'samples outside the retained window are dropped');
assert.equal(folded.recent[1].at, M + 5000);
assert.equal(folded.turns, 1);
assert.equal(folded.steps, 1);

console.log('unit realtime checks passed');
