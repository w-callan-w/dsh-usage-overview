import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_REFRESH_INTERVAL_MS,
  MINUTE_MS,
  RANGE_PRESETS,
  REALTIME_WINDOW_MINUTES,
  REFRESH_INTERVALS,
  USAGE_REALTIME_PATH,
  USAGE_STATS_PATH,
  dayKeyOf,
  formatPercent,
  formatTokensZh,
  isRealtimeDocument,
  isUsageDocument,
  minuteLabel,
} from '../protocol.js';
import {
  ModelDonut,
  ModelUsageChart,
  TokenCacheRate,
  TokenHeatmap,
  TokenTrend,
  Tooltip,
  pointerToViewBox,
  useMeasuredWidth,
  viewBoxToClient,
} from './charts.js';

const POLL_INTERVAL_MS = 30000;

const AUTO_REFRESH_STORAGE_KEY = 'dsh-usage-overview/auto-refresh';

// Which headline cards and panels the viewer keeps on the board is a personal
// preference, so it is remembered the same way as the refresh cadence.
const CARDS_STORAGE_KEY = 'dsh-usage-overview/cards';
const PANELS_STORAGE_KEY = 'dsh-usage-overview/panels';

// The saved value is `{ version, visible }`. Version 1 was a bare array written
// before the board grew, and it must not swallow the cards added since.
const PREFERENCE_VERSION = 2;
const CARDS_ADDED_SINCE_V1 = ['today'];
const PANELS_ADDED_SINCE_V1 = [];

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

async function fetchRealtime({ windowMinutes, signal }) {
  const response = await fetch(
    `${USAGE_REALTIME_PATH}?minutes=${encodeURIComponent(String(windowMinutes))}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal,
    },
  );
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const body = await response.json();
  if (!isRealtimeDocument(body)) throw new Error('malformed realtime document');
  return body;
}

// Pause only when the page explicitly reports itself hidden, so a host that never
// reports visibility still keeps refreshing.
function pageHidden() {
  try {
    return document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}

function readAutoRefresh() {
  const fallback = { enabled: true, intervalMs: DEFAULT_REFRESH_INTERVAL_MS };
  try {
    const raw = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    const known = REFRESH_INTERVALS.some((item) => item.ms === parsed?.intervalMs);
    return {
      enabled: parsed?.enabled !== false,
      intervalMs: known ? parsed.intervalMs : fallback.intervalMs,
    };
  } catch {
    return fallback;
  }
}

function writeAutoRefresh(preference) {
  try {
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, JSON.stringify(preference));
  } catch {
  }
}

function useUsageDashboard() {
  const [rangeId, setRangeId] = useState('30d');
  const [state, setState] = useState({ status: 'loading', document: null, error: null });
  const [live, setLive] = useState({ status: 'loading', data: null, error: null, updatedAt: null });
  const [auto, setAutoState] = useState(readAutoRefresh);
  const [reloadToken, setReloadToken] = useState(0);
  const [liveToken, setLiveToken] = useState(0);
  const inFlight = useRef(false);
  const lastDocumentAt = useRef(0);

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
        lastDocumentAt.current = Date.now();
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

  // The realtime payload is small and always fetched for the current minute, so it
  // is what every automatic and manual refresh updates first.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLive((previous) => ({ ...previous, status: previous.data === null ? 'loading' : 'refreshing' }));

    void (async () => {
      try {
        const data = await fetchRealtime({
          windowMinutes: REALTIME_WINDOW_MINUTES,
          signal: controller.signal,
        });
        if (!active) return;
        setLive({ status: 'ready', data, error: null, updatedAt: Date.now() });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setLive((previous) => ({
          status: previous.data === null ? 'error' : 'stale',
          data: previous.data,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: previous.updatedAt,
        }));
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [liveToken]);

  useEffect(() => {
    if (!auto.enabled) return undefined;
    const tick = () => {
      if (pageHidden()) return;
      setLiveToken((value) => value + 1);
      if (Date.now() - lastDocumentAt.current >= Math.max(POLL_INTERVAL_MS, auto.intervalMs)) {
        setReloadToken((value) => value + 1);
      }
    };
    const timer = window.setInterval(tick, auto.intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [auto.enabled, auto.intervalMs]);

  // Returning to the panel should show current numbers immediately instead of
  // waiting for the next tick.
  useEffect(() => {
    const onVisible = () => {
      if (pageHidden()) return;
      setLiveToken((value) => value + 1);
      if (Date.now() - lastDocumentAt.current >= POLL_INTERVAL_MS) {
        setReloadToken((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const setAuto = useCallback((next) => {
    setAutoState((previous) => (typeof next === 'function' ? next(previous) : next));
  }, []);

  useEffect(() => {
    writeAutoRefresh(auto);
  }, [auto]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLiveToken((value) => value + 1);
    setReloadToken((value) => value + 1);
    window.setTimeout(() => {
      inFlight.current = false;
    }, 500);
  }, []);

  return { rangeId, setRangeId, range, state, live, auto, setAuto, refresh };
}

function StatCard({ value, label, title }) {
  return h(
    'div',
    { className: 'dus-card', title },
    h('div', { className: 'dus-card-value' }, value),
    h('div', { className: 'dus-card-label' }, label),
  );
}

// Exact figure for the tooltip: the cards themselves are abbreviated.
function formatExactTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Today is always inside every range preset, so its bucket is already in `days`
// and needs no extra host field.
function todayTokensOf(usage) {
  if (typeof usage?.generatedAt !== 'number') return 0;
  const key = dayKeyOf(usage.generatedAt);
  const entry = (usage?.days ?? []).find((day) => day?.day === key);
  return typeof entry?.total === 'number' && Number.isFinite(entry.total) && entry.total > 0 ? entry.total : 0;
}

function TodayCard({ label, usage }) {
  const today = todayTokensOf(usage);
  const day = typeof usage?.generatedAt === 'number' ? dayKeyOf(usage.generatedAt) : null;
  return h(StatCard, {
    value: formatStatTokens(today),
    label,
    title: `${day === null ? '今天' : day} 已消耗 ${formatExactTokens(today)} tokens`,
  });
}

function TotalCard({ label, usage }) {
  return h(StatCard, { value: formatStatTokens(usage?.totals.total ?? 0), label });
}

function PeakDayCard({ label, usage }) {
  return h(StatCard, {
    value: formatStatTokens(usage?.totals.peakDayTokens ?? 0),
    label,
    title: usage?.totals.peakDay == null ? undefined : `用量最高的一天：${usage.totals.peakDay}`,
  });
}

function DailyAverageCard({ label, usage }) {
  return h(StatCard, {
    value: formatStatTokens(usage?.totals.averageTokensPerActiveDay ?? 0),
    label,
    title:
      (usage?.totals.activeDays ?? 0) > 0
        ? `按 ${String(usage.totals.activeDays)} 个活跃日计算`
        : '这个范围内还没有用量记录',
  });
}

function CurrentStreakCard({ label, usage }) {
  return h(StatCard, { value: `${String(usage?.totals.currentStreak ?? 0)} 天`, label });
}

function LongestStreakCard({ label, usage }) {
  return h(StatCard, { value: `${String(usage?.totals.longestStreak ?? 0)} 天`, label });
}

function CacheHitCard({ usage, label }) {
  const totals = usage?.totals;
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
    h('div', { className: 'dus-card-label' }, label),
    rate !== null &&
      h(
        'div',
        { className: 'dus-meter', role: 'img', 'aria-label': `缓存命中率 ${formatPercent(rate)}` },
        h('div', { className: 'dus-meter-fill', style: { width: `${String(Math.min(100, rate))}%` } }),
      ),
  );
}

function RealtimeCard({ live, label }) {
  const data = live?.data ?? null;
  const rate = data?.rate ?? null;
  const detail =
    rate === null
      ? '正在读取实时用量…'
      : [
          `滚动 60 秒 ${formatTokensZh(rate.rollingMinute)} token`,
          `本分钟 ${formatTokensZh(rate.currentMinute)}`,
          `上分钟 ${formatTokensZh(rate.previousMinute)}`,
          `近 5 分钟均值 ${formatTokensZh(rate.averagePerMinute5)}/分`,
          `窗口峰值 ${formatTokensZh(rate.peakMinute)}/分`,
        ].join(' · ');

  return h(
    'div',
    { className: 'dus-card dus-card-live', title: detail },
    h(
      'div',
      { className: 'dus-card-value dus-live-value' },
      rate === null ? '—' : formatStatTokens(rate.rollingMinute),
    ),
    h('div', { className: 'dus-card-label' }, label),
  );
}

// The headline cards, in display order. `label` is shared by the card itself and
// the chooser, so a card can never be renamed in one place only.
const STAT_CARDS = [
  { id: 'today', label: '今日消耗', Component: TodayCard },
  { id: 'total', label: '累计 Token 数', Component: TotalCard },
  { id: 'peak-day', label: '单日峰值 Token 数', Component: PeakDayCard },
  { id: 'daily-average', label: '日均 Token 数', Component: DailyAverageCard },
  { id: 'realtime', label: '实时 Token / 分钟', Component: RealtimeCard },
  { id: 'current-streak', label: '当前连续天数', Component: CurrentStreakCard },
  { id: 'longest-streak', label: '最长连续天数', Component: LongestStreakCard },
  { id: 'cache-hit', label: '缓存命中率', Component: CacheHitCard },
];

// The big panels under the cards, in display order. They are edited from the same
// chooser as the headline cards, but unlike them they can all be closed.
const CONTENT_PANELS = [
  { id: 'heatmap', label: 'Token 活动' },
  { id: 'trend', label: '每日 Token 趋势图' },
  { id: 'cache', label: '每日平均缓存命中率' },
  { id: 'models', label: '模型用量' },
  { id: 'realtime', label: '实时 Token 消耗' },
];

const STAT_CARD_BY_ID = new Map(STAT_CARDS.map((card) => [card.id, card]));
const STAT_CARD_IDS = STAT_CARDS.map((card) => card.id);
const PANEL_IDS = CONTENT_PANELS.map((panel) => panel.id);

// Unknown, duplicated, or renamed items from an older build are dropped; an
// empty selection falls back to everything so a group can never come up blank.
function normalizeVisible(value, allIds) {
  if (!Array.isArray(value)) return allIds;
  const wanted = new Set(value.filter((item) => typeof item === 'string'));
  const picked = allIds.filter((id) => wanted.has(id));
  return picked.length === 0 ? allIds : picked;
}

function readVisible(storageKey, allIds, addedIds) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return allIds;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // A selection saved before the catalog grew: ids introduced since then join
      // it, so a new card is not hidden by a choice made before it existed.
      return normalizeVisible([...parsed, ...addedIds], allIds);
    }
    return normalizeVisible(parsed?.visible, allIds);
  } catch {
    return allIds;
  }
}

function writeVisible(storageKey, visible) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ version: PREFERENCE_VERSION, visible }));
  } catch {
  }
}

/**
 * `minimum` is how many items must stay visible: the headline strip always keeps
 * one card, while every panel can be closed.
 */
function useVisibleItems({ storageKey, allIds, addedIds, minimum }) {
  const [visible, setVisible] = useState(() => readVisible(storageKey, allIds, addedIds));

  useEffect(() => {
    writeVisible(storageKey, visible);
  }, [storageKey, visible]);

  const toggle = useCallback(
    (id) => {
      setVisible((previous) => {
        if (!previous.includes(id)) return allIds.filter((item) => item === id || previous.includes(item));
        // A board with no numbers would be a bug, not a choice.
        if (previous.length <= minimum) return previous;
        return previous.filter((item) => item !== id);
      });
    },
    [allIds, minimum],
  );

  const showAll = useCallback(() => {
    setVisible(allIds);
  }, [allIds]);

  return { visible, toggle, showAll };
}

function CardsIcon({ size = 14 } = {}) {
  return h(
    'svg',
    {
      width: String(size),
      height: String(size),
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    h('rect', { x: '2.2', y: '2.6', width: '4.6', height: '4.6', rx: '1.1' }),
    h('rect', { x: '9.2', y: '2.6', width: '4.6', height: '4.6', rx: '1.1' }),
    h('rect', { x: '2.2', y: '9', width: '4.6', height: '4.6', rx: '1.1' }),
    h('rect', { x: '9.2', y: '9', width: '4.6', height: '4.6', rx: '1.1' }),
  );
}

function CheckIcon({ size = 10 } = {}) {
  return h(
    'svg',
    {
      width: String(size),
      height: String(size),
      viewBox: '0 0 12 12',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    h('path', { d: 'M2.6 6.3 4.8 8.5 9.4 3.5' }),
  );
}

// One editable group: the headline strip and the panel stack are chosen the same
// way, so the chooser renders both from this shape.
const PICKER_GROUPS = [
  {
    id: 'cards',
    title: '指标卡',
    items: STAT_CARDS,
    minimum: 1,
    lockedHint: '指标卡至少保留一张',
  },
  {
    id: 'panels',
    title: '内容面板',
    items: CONTENT_PANELS,
    minimum: 0,
    lockedHint: null,
  },
];

function CardPicker({ groups }) {
  const [open, setOpen] = useState(false);
  const host = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (host.current !== null && !host.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const shown = groups.reduce((sum, group) => sum + group.state.visible.length, 0);
  const locked = groups.find((group) => group.minimum > 0 && group.state.visible.length <= group.minimum);

  return h(
    'div',
    { className: 'dus-cards-picker', ref: host },
    h(
      'button',
      {
        type: 'button',
        className: 'dus-btn dus-cards-toggle',
        'aria-label': '选择要展示的卡片',
        'aria-haspopup': 'true',
        'aria-expanded': open,
        title: '选择要展示的卡片',
        'data-open': open ? '' : undefined,
        onClick: () => {
          setOpen((value) => !value);
        },
      },
      h(CardsIcon, { size: 14 }),
      h('span', null, '卡片'),
      h('span', { className: 'dus-cards-count' }, `${String(shown)}/${String(total)}`),
    ),
    open &&
      h(
        'div',
        { className: 'dus-cards-menu', role: 'group', 'aria-label': '选择要展示的卡片' },
        ...groups.map((group) => {
          const count = group.state.visible.length;
          const all = group.items.length;
          return h(
            'div',
            { className: 'dus-cards-group', key: group.id, 'data-group': group.id },
            h(
              'div',
              { className: 'dus-cards-menu-head' },
              h('span', { className: 'dus-cards-menu-title' }, group.title),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dus-cards-all',
                  disabled: count === all,
                  onClick: group.state.showAll,
                },
                '全选',
              ),
            ),
            h(
              'div',
              { className: 'dus-cards-list' },
              ...group.items.map((item) => {
                const checked = group.state.visible.includes(item.id);
                const itemLocked = checked && group.minimum > 0 && count <= group.minimum;
                return h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    role: 'checkbox',
                    className: 'dus-cards-option',
                    'aria-checked': checked,
                    'data-checked': checked ? '' : undefined,
                    'data-locked': itemLocked ? '' : undefined,
                    title: itemLocked ? group.lockedHint : `展示「${item.label}」`,
                    onClick: () => {
                      group.state.toggle(item.id);
                    },
                  },
                  h(
                    'span',
                    { className: 'dus-cards-box', 'aria-hidden': 'true' },
                    checked ? h(CheckIcon, { size: 9 }) : null,
                  ),
                  h('span', { className: 'dus-cards-option-label' }, item.label),
                );
              }),
            ),
          );
        }),
        h(
          'div',
          { className: 'dus-cards-menu-foot' },
          locked === undefined ? `已展示 ${String(shown)} / ${String(total)} 项` : locked.lockedHint,
        ),
      ),
  );
}

function RealtimeBars({ data, loading }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const [hoverAnchor, setHoverAnchor] = useState(null);
  const { host, width } = useMeasuredWidth();

  const height = Math.round(Math.max(150, Math.min(196, 108 + width * 0.1)));
  const padTop = 10;
  const padRight = 12;
  const padBottom = 24;
  const padLeft = Math.round(Math.max(34, Math.min(48, width * 0.05)));
  const axisSize = Math.max(10, Math.min(11, 9.5 + width * 0.0015));

  const plot = useMemo(() => {
    const buckets = Array.isArray(data?.buckets) ? data.buckets : [];
    const count = Math.max(1, buckets.length);
    const usableWidth = Math.max(1, width - padLeft - padRight);
    const usableHeight = Math.max(1, height - padTop - padBottom);
    const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.total ?? 0), 0);
    const step = peak <= 1000 ? 100 : 10 ** Math.max(0, Math.floor(Math.log10(peak)) - 1);
    const ceiling = Math.max(step, Math.ceil(peak / step) * step);
    const slot = usableWidth / count;
    const barWidth = Math.max(2, Math.min(16, slot * 0.66));

    const bars = buckets.map((bucket, index) => {
      const total = bucket.total ?? 0;
      const scaled = total <= 0 ? 0 : Math.max(1.5, (total / ceiling) * usableHeight);
      return {
        key: String(bucket.start),
        index,
        start: bucket.start,
        total,
        x: padLeft + slot * index + (slot - barWidth) / 2,
        width: barWidth,
        y: padTop + usableHeight - scaled,
        height: scaled,
        routes: bucket.routes ?? {},
        calls: bucket.calls ?? 0,
        sessions: bucket.sessions ?? 0,
      };
    });

    const gridLines = [0, 0.5, 1].map((ratio) => ({
      y: padTop + usableHeight - usableHeight * ratio,
      label: ratio === 0 ? '0' : formatTokensZh(Math.round(ceiling * ratio)),
    }));

    const ticks = [];
    const stride = count <= 20 ? 5 : 10;
    if (buckets.length > 0) {
      for (let index = count - 1; index >= 0; index -= stride) {
        const bucket = buckets[index];
        if (bucket === undefined) continue;
        ticks.push({ index, x: padLeft + slot * index + slot / 2, text: minuteLabel(bucket.start) });
      }
    }

    return { buckets, bars, gridLines, ticks, slot, usableWidth, usableHeight, ceiling };
  }, [data, width, height, padLeft, padRight, padTop, padBottom]);

  const empty = plot.buckets.length === 0 || plot.bars.every((bar) => bar.total <= 0);
  const hover = hoverIndex === null ? null : (plot.bars[hoverIndex] ?? null);
  const hoverRows = [];
  if (hover !== null) {
    hoverRows.push(`合计 ${formatTokensZh(hover.total)} tokens`);
    const routes = Object.entries(hover.routes)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);
    for (const [routeKey, total] of routes) {
      const model = routeKey.split('\u0000')[1] ?? routeKey;
      hoverRows.push(`${model}  ${formatTokensZh(total)} tokens`);
    }
    if (hover.calls > 0) hoverRows.push(`${String(hover.calls)} 次调用`);
  }

  return h(
    'div',
    { className: 'dus-chart-host dus-realtime-host', ref: host, 'data-chart': 'realtime' },
    empty &&
      h(
        'div',
        { className: 'dus-state dus-realtime-empty', style: { padding: '36px 0' } },
        h(
          'div',
          { className: 'dus-state-desc' },
          data !== null ? '最近 60 分钟没有 Token 消耗。' : loading ? '正在读取实时用量…' : '没有实时用量数据，正在重试…',
        ),
      ),
    h(
      'svg',
      {
        key: 'chart',
        viewBox: `0 0 ${String(width)} ${String(height)}`,
        width: '100%',
        height: String(height),
        role: 'img',
        'aria-label': '每分钟 Token 消耗',
        onMouseLeave: () => {
          setHoverIndex(null);
          setHoverAnchor(null);
        },
        onMouseMove: (event) => {
          const svg = event.currentTarget;
          const local = pointerToViewBox(svg, event.clientX, event.clientY);
          if (plot.slot <= 0) return;
          const index = Math.floor((local.x - padLeft) / plot.slot);
          const clamped = Math.max(0, Math.min(plot.bars.length - 1, index));
          setHoverIndex(clamped);
          const bar = plot.bars[clamped];
          if (bar.total > 0) {
            const screen = viewBoxToClient(svg, bar.x + bar.width / 2, bar.y);
            setHoverAnchor({ x: screen.x, y: screen.y });
          } else {
            setHoverAnchor({ x: event.clientX, y: event.clientY });
          }
        },
      },
      ...plot.gridLines.map((line, index) =>
        h('line', {
          key: `rg-${String(index)}`,
          x1: String(padLeft),
          x2: String(width - padRight),
          y1: String(line.y),
          y2: String(line.y),
          stroke: 'var(--dsw-alias-border-l2)',
          'stroke-width': '1',
          'stroke-dasharray': index === 0 ? undefined : '3 5',
        }),
      ),
      ...plot.gridLines.map((line, index) =>
        h(
          'text',
          {
            key: `rgl-${String(index)}`,
            x: String(padLeft - 8),
            y: String(line.y + 4),
            'text-anchor': 'end',
            fill: 'var(--dsw-alias-label-secondary)',
            'font-size': String(axisSize),
          },
          line.label,
        ),
      ),
      ...plot.bars.map((bar) =>
        h('rect', {
          key: bar.key,
          x: String(bar.x),
          y: String(bar.y),
          width: String(bar.width),
          height: String(Math.max(bar.height, bar.total > 0 ? 1.5 : 0)),
          rx: '1.5',
          fill: bar.index === plot.bars.length - 1 ? 'var(--dus-live-bar-current, #39c07a)' : 'var(--dus-live-bar, #4f8ef7)',
          opacity: bar.total > 0 ? '1' : '0.18',
          className: 'dus-live-bar',
        }),
      ),
      ...plot.ticks.map((tick) =>
        h(
          'text',
          {
            key: `rt-${String(tick.index)}`,
            x: String(tick.x),
            y: String(height - 8),
            'text-anchor': 'middle',
            fill: 'var(--dsw-alias-label-secondary)',
            'font-size': String(axisSize),
          },
          tick.text,
        ),
      ),
      hover !== null &&
        h('rect', {
          x: String(padLeft + plot.slot * hover.index),
          y: String(padTop),
          width: String(Math.max(1, plot.slot)),
          height: String(plot.usableHeight),
          fill: 'var(--dsw-alias-bg-layer-3)',
          opacity: '0.4',
          rx: '2',
        }),
    ),
    hover !== null &&
      h(Tooltip, {
        key: 'tip',
        anchor: hoverAnchor ?? { x: 0, y: 0 },
        title: `${minuteLabel(hover.start)} – ${minuteLabel(hover.start + MINUTE_MS)}`,
        rows: hoverRows,
      }),
  );
}

function RealtimePanel({ live }) {
  const data = live?.data ?? null;
  const rate = data?.rate ?? null;
  const loading = live?.status === 'loading';

  return h(
    'section',
    { className: 'dus-panel dus-live-panel' },
    h(
      'div',
      { className: 'dus-panel-head dus-live-head' },
      h('h2', { className: 'dus-panel-title' }, '实时 Token 消耗'),
    ),
    h(
      'div',
      { className: 'dus-live-hero' },
      h(
        'div',
        { className: 'dus-live-hero-value' },
        rate === null ? '—' : formatStatTokens(rate.rollingMinute),
      ),
    ),
    h(RealtimeBars, { data, loading }),
  );
}

function Toolbar({ auto, setAuto, onRefresh, busy, live, groups }) {
  const enabled = auto.enabled;
  return h(
    'div',
    { className: 'dus-toolbar' },
    h(
      'div',
      { className: 'dus-seg dus-seg-sm dus-refresh-seg', role: 'group', 'aria-label': '自动刷新间隔' },
      h(
        'button',
        {
          type: 'button',
          className: 'dus-seg-btn',
          'data-active': enabled ? undefined : '',
          'aria-pressed': !enabled,
          onClick: () => {
            setAuto({ enabled: false, intervalMs: auto.intervalMs });
          },
        },
        '关闭',
      ),
      ...REFRESH_INTERVALS.map((option) =>
        h(
          'button',
          {
            key: option.id,
            type: 'button',
            className: 'dus-seg-btn',
            'data-active': enabled && auto.intervalMs === option.ms ? '' : undefined,
            'aria-pressed': enabled && auto.intervalMs === option.ms,
            onClick: () => {
              setAuto({ enabled: true, intervalMs: option.ms });
            },
          },
          `${String(Math.round(option.ms / 1000))}秒`,
        ),
      ),
    ),
    live.error !== null && h('span', { className: 'dus-toolbar-error' }, live.error),
    h(
      'div',
      { className: 'dus-toolbar-end' },
      h(CardPicker, { groups }),
      h(RefreshButton, { onRefresh, busy }),
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
  const { rangeId, setRangeId, range, state, live, auto, setAuto, refresh } = useUsageDashboard();
  const cardState = useVisibleItems({
    storageKey: CARDS_STORAGE_KEY,
    allIds: STAT_CARD_IDS,
    addedIds: CARDS_ADDED_SINCE_V1,
    minimum: 1,
  });
  const panelState = useVisibleItems({
    storageKey: PANELS_STORAGE_KEY,
    allIds: PANEL_IDS,
    addedIds: PANELS_ADDED_SINCE_V1,
    minimum: 0,
  });
  const document_ = state.document;

  const cards = cardState.visible.map((id) => {
    const card = STAT_CARD_BY_ID.get(id);
    if (card === undefined) return null;
    return h(card.Component, { key: id, label: card.label, usage: document_, live });
  });

  const groups = PICKER_GROUPS.map((group) => ({
    ...group,
    state: group.id === 'cards' ? cardState : panelState,
  }));

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

  const realtimePanel = () => h(RealtimePanel, { key: 'realtime', live });

  const panelRenderers = {
    heatmap: () =>
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
    trend: () =>
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
    cache: () =>
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
    models: () =>
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
    realtime: realtimePanel,
  };

  const panels = panelState.visible.map((id) => panelRenderers[id]?.()).filter(Boolean);

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

        h(Toolbar, {
          key: 'toolbar',
          auto,
          setAuto,
          onRefresh: refresh,
          busy: state.status === 'refreshing',
          live,
          groups,
        }),

        state.status === 'error' && document_ === null
          ? [
              h(StateView, { key: 'state', status: state.status, error: state.error, onRetry: refresh }),
              live.data !== null && panelState.visible.includes('realtime') && realtimePanel(),
            ]
          : [
              cards.length === 0
                ? h(
                    'div',
                    { className: 'dus-cards-empty', key: 'cards' },
                    h('span', null, '所有卡片都被隐藏了。'),
                    h(
                      'button',
                      { type: 'button', className: 'dus-cards-all', onClick: cardState.showAll },
                      '恢复默认',
                    ),
                  )
                : h('div', { className: 'dus-cards', key: 'cards' }, ...cards),

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

              ...panels,
            ],
      ),
    ),
  );
}
