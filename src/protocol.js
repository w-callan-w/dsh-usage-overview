export const USAGE_SCHEMA_VERSION = 1;

export const PANEL_ID = 'usage-overview';

export const NS = 'usage-overview';

export const USAGE_STATS_PATH = '/plugins/dsh-usage-overview/stats';


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

export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}分${String(seconds % 60)}秒`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}小时${String(minutes % 60)}分`;
  const days = Math.floor(hours / 24);
  return `${String(days)}天${String(hours % 24)}小时`;
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
