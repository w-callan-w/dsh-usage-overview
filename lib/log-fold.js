import { readFileSync, statSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const MINUTE_MS = 60000;

/** How much per-minute detail a fold keeps. Only the newest part can matter. */
const DEFAULT_RECENT_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Upper bound on retained sample events, so a pathological log cannot grow without limit. */
const MAX_RECENT_EVENTS = 20000;

export function readLogText(path) {
  const compressed = readFileSync(path);
  const offsets = [];
  let index = compressed.indexOf(FRAME_MAGIC);
  while (index !== -1) {
    offsets.push(index);
    index = compressed.indexOf(FRAME_MAGIC, index + FRAME_MAGIC.length);
  }
  if (offsets.length === 0) return zstdDecompressSync(compressed).toString('utf8');

  const parts = [];
  for (const [position, start] of offsets.entries()) {
    const end = offsets[position + 1] ?? compressed.length;
    try {
      parts.push(zstdDecompressSync(compressed.subarray(start, end)).toString('utf8'));
    } catch {
    }
  }
  return parts.join('');
}

export function parseLogEvents(text) {
  const events = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
    }
  }
  return events;
}

function localDayKey(ms) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

function emptyBuckets() {
  return {
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  };
}

function bucketsOf(usage) {
  return {
    uncachedInputTokens: num(usage?.inputTokens),
    cacheReadTokens: num(usage?.cacheReadTokens),
    cacheWriteTokens: num(usage?.cacheWriteTokens),
    outputTokens: num(usage?.outputTokens),
  };
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function bucketTotal(buckets) {
  return (
    buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens + buckets.outputTokens
  );
}

function addBuckets(target, source) {
  target.uncachedInputTokens += source.uncachedInputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.outputTokens += source.outputTokens;
}

/**
 * Fold a session log into day totals and, for the newest `recentWindowMs`,
 * into one-minute buckets plus the raw samples the realtime routes use for
 * exact rolling-window rates. `options.now` and `options.recentWindowMs` exist
 * for tests; production folds use the wall clock.
 */
export function foldSessionEvents(events, options = {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const recentWindowMs =
    typeof options.recentWindowMs === 'number' ? options.recentWindowMs : DEFAULT_RECENT_WINDOW_MS;
  const recentSince = now - recentWindowMs;

  const totals = emptyBuckets();
  const byDay = new Map();
  const byModel = new Map();
  const minutes = new Map();
  const recent = [];
  let firstAt;
  let lastAt;
  let turns = 0;
  let steps = 0;
  let samples = 0;

  for (const event of events) {
    const at = typeof event.time === 'number' ? event.time : undefined;
    if (at !== undefined) {
      if (firstAt === undefined || at < firstAt) firstAt = at;
      if (lastAt === undefined || at > lastAt) lastAt = at;
    }

    if (event.type === 'step/end') {
      steps += 1;
      continue;
    }
    if (event.type === 'turn/end') {
      turns += 1;
      continue;
    }
    if (event.type !== 'assistant/message') continue;

    const usage = event.data?.usage;
    if (usage === undefined || usage === null) continue;

    const buckets = bucketsOf(usage);
    const total = bucketTotal(buckets);
    if (total <= 0) continue;
    samples += 1;
    addBuckets(totals, buckets);

    const source = event.data?.message?.source;
    const model = typeof source?.model === 'string' && source.model.length > 0 ? source.model : 'unknown';
    const provider =
      typeof source?.provider === 'string' && source.provider.length > 0 ? source.provider : 'unknown';

    const routeKey = `${provider}\u0000${model}`;
    const turn = typeof event.data?.turn === 'number' ? event.data.turn : undefined;

    if (at !== undefined) {
      const key = localDayKey(at);
      let day = byDay.get(key);
      if (day === undefined) {
        day = { totals: emptyBuckets(), samples: 0, byRoute: new Map() };
        byDay.set(key, day);
      }
      addBuckets(day.totals, buckets);
      day.samples += 1;
      let dayRoute = day.byRoute.get(routeKey);
      if (dayRoute === undefined) {
        dayRoute = { provider, model, total: 0, samples: 0, totals: emptyBuckets(), turns: new Set() };
        day.byRoute.set(routeKey, dayRoute);
      }
      addBuckets(dayRoute.totals, buckets);
      dayRoute.total += total;
      dayRoute.samples += 1;
      if (turn !== undefined) dayRoute.turns.add(turn);

      if (at >= recentSince) {
        recent.push({
          at,
          total,
          provider,
          model,
          uncachedInputTokens: buckets.uncachedInputTokens,
          cacheReadTokens: buckets.cacheReadTokens,
          cacheWriteTokens: buckets.cacheWriteTokens,
          outputTokens: buckets.outputTokens,
        });
        const start = Math.floor(at / MINUTE_MS) * MINUTE_MS;
        let minute = minutes.get(start);
        if (minute === undefined) {
          minute = { start, totals: emptyBuckets(), calls: 0, byRoute: new Map() };
          minutes.set(start, minute);
        }
        addBuckets(minute.totals, buckets);
        minute.calls += 1;
        minute.byRoute.set(routeKey, (minute.byRoute.get(routeKey) ?? 0) + total);
      }
    }

    let route = byModel.get(routeKey);
    if (route === undefined) {
      route = { provider, model, totals: emptyBuckets(), samples: 0, turns: new Set() };
      byModel.set(routeKey, route);
    }
    addBuckets(route.totals, buckets);
    route.samples += 1;
    if (turn !== undefined) route.turns.add(turn);
  }

  if (recent.length > MAX_RECENT_EVENTS) recent.splice(0, recent.length - MAX_RECENT_EVENTS);

  return {
    totals,
    total: bucketTotal(totals),
    byDay,
    byModel,
    minutes,
    recent,
    firstAt,
    lastAt,
    wallMs: firstAt !== undefined && lastAt !== undefined ? Math.max(0, lastAt - firstAt) : 0,
    turns,
    steps,
    samples,
  };
}

const cache = new Map();

export function foldSessionLog(path) {
  let revision;
  try {
    const info = statSync(path);
    revision = `${String(info.size)}:${String(info.mtimeMs)}`;
  } catch {
    return undefined;
  }

  const cached = cache.get(path);
  if (cached !== undefined && cached.revision === revision) return cached.value;

  let value;
  try {
    value = foldSessionEvents(parseLogEvents(readLogText(path)));
  } catch {
    return undefined;
  }

  cache.set(path, { revision, value });
  return value;
}

export function clearLogCache() {
  cache.clear();
}
