import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  RANGE_PRESETS,
  USAGE_STATS_PATH,
  formatPercent,
  formatTokensZh,
  isUsageDocument,
} from '../protocol.js';
import { ModelDonut, ModelUsageChart, TokenCacheRate, TokenHeatmap, TokenTrend } from './charts.js';

const POLL_INTERVAL_MS = 30000;

// Headline stat cards show two decimal places (e.g. 53.80亿).
function formatStatTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  if (value < 10000) return String(Math.round(value));
  if (value < 100000000) return `${(value / 10000).toFixed(2)}万`;
  return `${(value / 100000000).toFixed(2)}亿`;
}

async function fetchUsage({ range, signal }) {
  const query = range === null ? 'all' : range;
  const response = await fetch(`${USAGE_STATS_PATH}?range=${encodeURIComponent(query)}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const body = await response.json();
  if (!isUsageDocument(body)) throw new Error('malformed usage document');
  return body;
}

function useUsageDocument() {
  const [rangeId, setRangeId] = useState('30d');
  const [state, setState] = useState({ status: 'loading', document: null, error: null });
  const [reloadToken, setReloadToken] = useState(0);
  const inFlight = useRef(null);

  const range = useMemo(() => {
    const preset = RANGE_PRESETS.find((item) => item.id === rangeId);
    return preset === undefined ? 30 : preset.days;
  }, [rangeId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, status: previous.document === null ? 'loading' : 'refreshing' }));

    void (async () => {
      try {
        const document = await fetchUsage({ range, signal: controller.signal });
        if (!active) return;
        setState({ status: 'ready', document, error: null });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setState((previous) => ({
          status: 'error',
          document: previous.document,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, reloadToken]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      setReloadToken((value) => value + 1);
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current !== null) return;
    inFlight.current = true;
    setReloadToken((value) => value + 1);
    window.setTimeout(() => {
      inFlight.current = null;
    }, 600);
  }, []);

  return { rangeId, setRangeId, range, state, refresh };
}

function StatCard({ value, label, title }) {
  return h(
    'div',
    { className: 'dus-card', title },
    h('div', { className: 'dus-card-value' }, value),
    h('div', { className: 'dus-card-label' }, label),
  );
}

function CacheHitCard({ totals }) {
  const rate = typeof totals?.cacheHitRate === 'number' ? totals.cacheHitRate : null;
  const cached = totals?.cacheReadTokens ?? 0;
  const written = totals?.cacheWriteTokens ?? 0;
  const uncached = totals?.uncachedInputTokens ?? 0;
  const input = cached + written + uncached;

  const detail =
    rate === null
      ? '这个范围内还没有输入 token 记录。'
      : [
          `缓存读取 ${formatTokensZh(cached)}`,
          `缓存写入 ${formatTokensZh(written)}`,
          `未缓存 ${formatTokensZh(uncached)}`,
          `输入合计 ${formatTokensZh(input)}`,
        ].join(' · ');

  return h(
    'div',
    { className: 'dus-card', title: detail },
    h(
      'div',
      { className: 'dus-card-value' },
      rate === null ? '—' : formatPercent(rate),
    ),
    h('div', { className: 'dus-card-label' }, '缓存命中率'),
    rate !== null &&
      h(
        'div',
        { className: 'dus-meter', role: 'img', 'aria-label': `缓存命中率 ${formatPercent(rate)}` },
        h('div', { className: 'dus-meter-fill', style: { width: `${String(Math.min(100, rate))}%` } }),
      ),
  );
}

function rangeLabel(id) {
  if (id === '7d') return '近 7 日';
  if (id === '30d') return '近 30 日';
  if (id === '90d') return '近 90 日';
  return '全部';
}

function StateView({ status, error, onRetry }) {
  if (status === 'loading') {
    return h(
      'div',
      { className: 'dus-state' },
      h('div', { className: 'dus-state-icon' }, h(SpinnerIcon, { size: 18 })),
      h('div', { className: 'dus-state-desc' }, '正在统计用量…'),
    );
  }
  return h(
    'div',
    { className: 'dus-state' },
    h(
      'div',
      { className: 'dus-state-icon' },
      h(
        'svg',
        { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' },
        h('circle', { cx: '12', cy: '12', r: '9' }),
        h('path', { d: 'M12 8v5' }),
        h('path', { d: 'M12 16.5v.01' }),
      ),
    ),
    h('div', { className: 'dus-state-title' }, '无法读取用量统计'),
    h('div', { className: 'dus-state-desc' }, error ?? '宿主未返回可用的统计数据。'),
    h(
      'button',
      { type: 'button', className: 'dus-btn dus-btn-primary', onClick: onRetry },
      '重试',
    ),
  );
}

function SpinnerIcon({ size = 14 }) {
  return h(
    'svg',
    { className: 'dus-spin', width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
    h('path', {
      d: 'M12 3a9 9 0 1 0 9 9',
      stroke: 'currentColor',
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
    }),
  );
}

function RefreshButton({ onRefresh, busy }) {
  return h(
    'button',
    {
      type: 'button',
      className: 'dus-btn dus-refresh',
      onClick: onRefresh,
      'aria-label': '刷新用量统计',
      title: '刷新',
    },
    busy ? h(SpinnerIcon, { size: 14 }) : h(RefreshIcon, { size: 14 }),
    h('span', null, busy ? '刷新中' : '刷新'),
  );
}

function RefreshIcon({ size = 14 }) {
  return h(
    'svg',
    { width: String(size), height: String(size), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
    h('path', { d: 'M21 3v6h-6' }),
  );
}

export function UsageDashboard() {
  const { rangeId, setRangeId, range, state, refresh } = useUsageDocument();
  const document_ = state.document;

  const modelsWithUsage = useMemo(
    () => (document_?.models ?? []).filter((model) => model.total > 0),
    [document_],
  );

  const series = useMemo(
    () =>
      modelsWithUsage.map((model) => ({
        key: `${model.provider}/${model.model}`,
        model: model.model,
        provider: model.provider,
        source: model.source,
      })),
    [modelsWithUsage],
  );

  const days = document_?.days ?? [];
  const now = document_?.generatedAt ?? Date.now();

  return h(
    'div',
    { className: 'dus-root' },
    h(
      'div',
      { className: 'dus-shell' },
      h(
        'div',
        { className: 'dus-inner' },
        h(
          'div',
          { className: 'dus-head' },
          h('h1', { className: 'dus-title' }, '使用统计'),
          h('span', { className: 'dus-badge' }, '应用用量'),
          document_ !== null &&
            h(
              'span',
              { className: 'dus-live' },
              h('span', { className: 'dus-live-dot', style: { background: 'var(--dsw-alias-state-success-primary)' } }),
              `${String(document_.scope.sessionCount)} 个会话`,
            ),
        ),

        state.status === 'error' && document_ === null
          ? h(StateView, { status: state.status, error: state.error, onRetry: refresh })
          : [
              h(
                'div',
                { className: 'dus-cards', key: 'cards' },
                h(StatCard, { value: formatStatTokens(document_?.totals.total ?? 0), label: '累计 Token 数' }),
                h(StatCard, {
                  value: formatStatTokens(document_?.totals.peakDayTokens ?? 0),
                  label: '单日峰值 Token 数',
                  title:
                    document_?.totals.peakDay == null
                      ? undefined
                      : `用量最高的一天：${document_.totals.peakDay}`,
                }),
                h(StatCard, {
                  value: formatStatTokens(document_?.totals.averageTokensPerActiveDay ?? 0),
                  label: '日均 Token 数',
                  title:
                    (document_?.totals.activeDays ?? 0) > 0
                      ? `按 ${String(document_.totals.activeDays)} 个活跃日计算`
                      : '这个范围内还没有用量记录',
                }),
                h(StatCard, {
                  value: `${String(document_?.totals.currentStreak ?? 0)} 天`,
                  label: '当前连续天数',
                }),
                h(StatCard, {
                  value: `${String(document_?.totals.longestStreak ?? 0)} 天`,
                  label: '最长连续天数',
                }),
                h(CacheHitCard, { totals: document_?.totals }),
              ),

              h(
                'div',
                { className: 'dus-range-row', key: 'range' },
                h('span', { className: 'dus-range-label' }, '时间范围'),
                h(
                  'div',
                  { className: 'dus-seg', role: 'tablist', 'aria-label': '时间范围' },
                  ...RANGE_PRESETS.map((preset) =>
                    h(
                      'button',
                      {
                        key: preset.id,
                        type: 'button',
                        role: 'tab',
                        className: 'dus-seg-btn',
                        'data-active': preset.id === rangeId ? '' : undefined,
                        'aria-selected': preset.id === rangeId,
                        onClick: () => {
                          setRangeId(preset.id);
                        },
                      },
                      rangeLabel(preset.id),
                    ),
                  ),
                ),
              ),

              h(
                'section',
                { className: 'dus-panel', key: 'heatmap' },
                h(
                  'div',
                  { className: 'dus-panel-head' },
                  h('h2', { className: 'dus-panel-title' }, 'Token 活动'),
                  h('div', { className: 'dus-head-spacer' }),
                  h('span', { className: 'dus-panel-sub' }, '最近一年'),
                ),
                h(TokenHeatmap, { days, rangeDays: range, now }),
              ),

              h(
                'section',
                { className: 'dus-panel', key: 'trend' },
                h(
                  'div',
                  { className: 'dus-panel-head' },
                  h('h2', { className: 'dus-panel-title' }, '每日 Token 趋势图'),
                  h('div', { className: 'dus-head-spacer' }),
                  h('span', { className: 'dus-panel-sub' }, rangeLabel(rangeId)),
                ),
                series.length === 0
                  ? h('div', { className: 'dus-state', style: { padding: '48px 0' } }, h('div', { className: 'dus-state-desc' }, '这个时间范围内还没有模型调用记录。'))
                  : h(TokenTrend, { days, series, rangeDays: range }),
              ),

              h(
                'section',
                { className: 'dus-panel', key: 'cache' },
                h(
                  'div',
                  { className: 'dus-panel-head' },
                  h('h2', { className: 'dus-panel-title' }, '每日平均缓存命中率'),
                ),
                h(TokenCacheRate, { days, rangeDays: range }),
              ),

              h(
                'section',
                { className: 'dus-panel', key: 'models' },
                h(
                  'div',
                  { className: 'dus-panel-head' },
                  h('h2', { className: 'dus-panel-title' }, '模型用量'),
                ),
                h(ModelDonut, { models: modelsWithUsage }),
                h(ModelUsageChart, { days, models: modelsWithUsage, rangeDays: range }),
              ),
            ],
      ),
    ),
    h(RefreshButton, { onRefresh: refresh, busy: state.status === 'refreshing' }),
  );
}
