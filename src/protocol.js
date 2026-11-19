export const USAGE_SCHEMA_VERSION = 1;

export const REALTIME_SCHEMA_VERSION = 1;

export const PANEL_ID = 'usage-overview';

export const NS = 'usage-overview';

export const USAGE_STATS_PATH = '/plugins/dsh-usage-overview/stats';

export const USAGE_REALTIME_PATH = '/plugins/dsh-usage-overview/realtime';

/** One realtime bucket spans one minute. */
export const MINUTE_MS = 60000;

/** Default realtime window, and the hard bounds the route clamps to. */
export const REALTIME_WINDOW_MINUTES = 60;
export const REALTIME_MIN_WINDOW_MINUTES = 5;
export const REALTIME_MAX_WINDOW_MINUTES = 240;

/** Auto-refresh cadences the panel offers; the first one is the default. */
export const REFRESH_INTERVALS = Object.freeze([
  { id: '5s', ms: 5000 },
  { id: '10s', ms: 10000 },
  { id: '30s', ms: 30000 },
  { id: '60s', ms: 60000 },
]);

export const DEFAULT_REFRESH_INTERVAL_MS = 5000;


export const RANGE_PRESETS = Object.freeze([
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: 'all', days: null },
]);

export const PROVIDER_SOURCE_LABELS = Object.freeze({
  'workbuddy-ai': 'WorkBuddy AI',
  'workbuddy': 'WorkBuddy',
  'opencode-go': 'OpenCode Go',
  'deepseek-official': 'DeepSeek Official',
  'deepseek': 'DeepSeek',
});

export const SERIES_COLORS = Object.freeze([
  '#4f8ef7',
  '#39c07a',
  '#f2a33c',
  '#c471f5',
  '#f2557a',
  '#3cc8d6',
  '#9aa7ff',
  '#e0c341',
]);

export const TOKEN_BUCKETS = Object.freeze([
  'uncachedInputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'outputTokens',
]);

export function cacheHitRate(buckets) {
  const read = numberOr0(buckets?.cacheReadTokens);
  const write = numberOr0(buckets?.cacheWriteTokens);
  const uncached = numberOr0(buckets?.uncachedInputTokens);
  const input = read + write + uncached;
  if (input <= 0) return null;
  return (read / input) * 100;
}

function numberOr0(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function isUsageDocument(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (value.schemaVersion !== USAGE_SCHEMA_VERSION) return false;
  if (typeof value.generatedAt !== 'number') return false;
  if (typeof value.totals !== 'object' || value.totals === null) return false;
  if (!Array.isArray(value.days)) return false;
  if (!Array.isArray(value.models)) return false;
  return true;
}

/**
 * The realtime document is a fixed-length list of one-minute buckets plus the
 * rolling rates derived from the same events. The panel tolerates a missing
 * realtime payload, so validation only rejects a document it cannot trust.
 */
export function isRealtimeDocument(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (value.schemaVersion !== REALTIME_SCHEMA_VERSION) return false;
  if (typeof value.generatedAt !== 'number') return false;
  if (typeof value.bucketMs !== 'number' || value.bucketMs <= 0) return false;
  if (!Array.isArray(value.buckets)) return false;
  if (!value.buckets.every((bucket) => typeof bucket?.start === 'number' && typeof bucket?.total === 'number')) {
    return false;
  }
  if (typeof value.rate !== 'object' || value.rate === null) return false;
  if (typeof value.totals !== 'object' || value.totals === null) return false;
  return true;
}

export function clampNumber(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Minute-aligned start of the bucket containing `ms`. */
export function minuteStartOf(ms, bucketMs = MINUTE_MS) {
  return Math.floor(ms / bucketMs) * bucketMs;
}

/** Local `HH:MM` label for a bucket start. */
export function minuteLabel(ms) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Local `HH:MM:SS` label for an instant. */
export function clockLabel(ms) {
  const date = new Date(ms);
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');
}

export function formatTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  if (value < 1000) return String(Math.round(value));
  if (value < 10000) return `${(value / 1000).toFixed(2)}K`;
  if (value < 1000000) return `${(value / 1000).toFixed(1)}K`;
  if (value < 100000000) return `${(value / 1000000).toFixed(1)}M`;
  return `${(value / 100000000).toFixed(2)}亿`;
}

export function formatTokensZh(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  if (value < 10000) return String(Math.round(value));
  if (value < 100000000) return `${(value / 10000).toFixed(1)}万`;
  return `${(value / 100000000).toFixed(1)}亿`;
}

export function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
}

export function dayKeyOf(ms) {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}
