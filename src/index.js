import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  PANEL_ID,
  PROVIDER_SOURCE_LABELS,
  USAGE_STATS_PATH,
} from './protocol.js';
import { buildUsageDocument, collectSessions, mergeLive } from './usage.js';

export { PANEL_ID, NS, USAGE_STATS_PATH } from './protocol.js';

export const inject = ['webServer'];

function resolveHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  return join(homedir(), '.dsh');
}

function loopbackRequest(req) {
  const host = req.headers.host;
  if (typeof host !== 'string' || host.length === 0) return false;
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  const normalized = hostname.toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

function trustedRequest(ctx, req) {
  if (loopbackRequest(req)) return true;
  const connection = ctx.get('connection');
  if (connection !== undefined && typeof connection.requestRejection === 'function') {
    try {
      return connection.requestRejection({ headers: req.headers }) === undefined;
    } catch {
    }
  }
  return false;
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

function collectLive(ctx) {
  const live = new Map();
  const sessions = ctx.get('sessions');
  const registry = ctx.get('sessionProjections');
  if (sessions === undefined) return live;

  let list;
  try {
    list = typeof sessions.list === 'function' ? sessions.list() : undefined;
  } catch {
    return live;
  }
  if (!Array.isArray(list)) return live;

  for (const session of list) {
    try {
      const id = session?.id;
      if (typeof id !== 'string' || id.length === 0) continue;

      let values;
      if (registry !== undefined && typeof registry.snapshot === 'function') {
        try {
          values = registry.snapshot(session)?.values;
        } catch {
          values = undefined;
        }
      }

      const usage = values?.tokenUsage;
      const totals = {
        uncachedInputTokens: numberOr(usage?.totals?.uncachedInputTokens, 0),
        cacheReadTokens: numberOr(usage?.totals?.cacheReadTokens, 0),
        cacheWriteTokens: numberOr(usage?.totals?.cacheWriteTokens, 0),
        outputTokens: numberOr(usage?.totals?.outputTokens, 0),
      };

      const stats = values?.sessionStats;
      const selection = values?.modelSelection?.lastUsed;

      live.set(id, {
        totals,
        provider: typeof selection?.provider === 'string' ? selection.provider : undefined,
        model: typeof selection?.model === 'string' ? selection.model : undefined,
        createdAt: numberOr(session.createdAt, undefined),
        sessionStats:
          typeof stats === 'object' && stats !== null
            ? {
                turns: numberOr(stats.turns, 0),
                steps: numberOr(stats.steps, 0),
                llmMs: numberOr(stats.llmMs, 0),
                toolMs: numberOr(stats.toolMs, 0),
              }
            : undefined,
      });
    } catch {
    }
  }
  return live;
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function usageDocument(ctx, rangeDays) {
  const home = resolveHome();
  const sessions = await collectSessions(home);
  const live = collectLive(ctx);
  const merged = mergeLive(sessions, live);

  return buildUsageDocument(merged, {
    now: Date.now(),
    rangeDays,
    providerLabels: PROVIDER_SOURCE_LABELS,
    liveIds: new Set(live.keys()),
  });
}

function parseRange(url) {
  const raw = url.searchParams.get('range');
  if (raw === null || raw === 'all') return null;
  if (raw === '7d') return 7;
  if (raw === '30d') return 30;
  if (raw === '90d') return 90;
  return 30;
}

export function apply(ctx) {
  const mount = (path, handler, label) => {
    ctx.effect(() => {
      const webServer = ctx.get('webServer');
      if (webServer === undefined) return () => {};
      const dispose = webServer.register({ kind: 'exact', path, handler });
      return () => {
        dispose();
      };
    }, `dsh-usage-overview: ${label}`);
  };

  mount(
    USAGE_STATS_PATH,
    (req, res) => {
      void (async () => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          json(res, 405, { error: 'method-not-allowed' });
          return;
        }
        if (!trustedRequest(ctx, req)) {
          json(res, 403, { error: 'request-not-trusted' });
          return;
        }
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          json(res, 200, await usageDocument(ctx, parseRange(url)));
        } catch (error) {
          ctx.logger?.warn?.(`dsh-usage-overview: stats read failed: ${String(error)}`);
          json(res, 500, { error: 'usage-unavailable' });
        }
      })();
    },
    'stats route',
  );
}
