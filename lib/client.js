window.__ModuleLoader__.load({
	id: "dsh-usage-overview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
  // ---- src/protocol.js ----
  const __m0 = (() => {


  const USAGE_SCHEMA_VERSION = 1;

  const REALTIME_SCHEMA_VERSION = 1;

  const PANEL_ID = 'usage-overview';

  const NS = 'usage-overview';

  const USAGE_STATS_PATH = '/plugins/dsh-usage-overview/stats';

  const USAGE_REALTIME_PATH = '/plugins/dsh-usage-overview/realtime';

  /** One realtime bucket spans one minute. */
  const MINUTE_MS = 60000;

  /** Default realtime window, and the hard bounds the route clamps to. */
  const REALTIME_WINDOW_MINUTES = 60;
  const REALTIME_MIN_WINDOW_MINUTES = 5;
  const REALTIME_MAX_WINDOW_MINUTES = 240;

  /** Auto-refresh cadences the panel offers; the first one is the default. */
  const REFRESH_INTERVALS = Object.freeze([
    { id: '5s', ms: 5000 },
    { id: '10s', ms: 10000 },
    { id: '30s', ms: 30000 },
    { id: '60s', ms: 60000 },
  ]);

  const DEFAULT_REFRESH_INTERVAL_MS = 5000;


  const RANGE_PRESETS = Object.freeze([
    { id: '7d', days: 7 },
    { id: '30d', days: 30 },
    { id: '90d', days: 90 },
    { id: 'all', days: null },
  ]);

  const PROVIDER_SOURCE_LABELS = Object.freeze({
    'workbuddy-ai': 'WorkBuddy AI',
    'workbuddy': 'WorkBuddy',
    'opencode-go': 'OpenCode Go',
    'deepseek-official': 'DeepSeek Official',
    'deepseek': 'DeepSeek',
  });

  const SERIES_COLORS = Object.freeze([
    '#4f8ef7',
    '#39c07a',
    '#f2a33c',
    '#c471f5',
    '#f2557a',
    '#3cc8d6',
    '#9aa7ff',
    '#e0c341',
  ]);

  const TOKEN_BUCKETS = Object.freeze([
    'uncachedInputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'outputTokens',
  ]);

  function cacheHitRate(buckets) {
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

  function isUsageDocument(value) {
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
  function isRealtimeDocument(value) {
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

  function clampNumber(value, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }

  /** Minute-aligned start of the bucket containing `ms`. */
  function minuteStartOf(ms, bucketMs = MINUTE_MS) {
    return Math.floor(ms / bucketMs) * bucketMs;
  }

  /** Local `HH:MM` label for a bucket start. */
  function minuteLabel(ms) {
    const date = new Date(ms);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  /** Local `HH:MM:SS` label for an instant. */
  function clockLabel(ms) {
    const date = new Date(ms);
    return [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join(':');
  }

  function formatTokens(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
    if (value < 1000) return String(Math.round(value));
    if (value < 10000) return `${(value / 1000).toFixed(2)}K`;
    if (value < 1000000) return `${(value / 1000).toFixed(1)}K`;
    if (value < 100000000) return `${(value / 1000000).toFixed(1)}M`;
    return `${(value / 100000000).toFixed(2)}亿`;
  }

  function formatTokensZh(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
    if (value < 10000) return String(Math.round(value));
    if (value < 100000000) return `${(value / 10000).toFixed(1)}万`;
    return `${(value / 100000000).toFixed(1)}亿`;
  }

  function formatPercent(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${value.toFixed(2)}%`;
  }

  function dayKeyOf(ms) {
    const date = new Date(ms);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${String(date.getFullYear())}-${month}-${day}`;
  }
  return { USAGE_SCHEMA_VERSION, REALTIME_SCHEMA_VERSION, PANEL_ID, NS, USAGE_STATS_PATH, USAGE_REALTIME_PATH, MINUTE_MS, REALTIME_WINDOW_MINUTES, REALTIME_MIN_WINDOW_MINUTES, REALTIME_MAX_WINDOW_MINUTES, REFRESH_INTERVALS, DEFAULT_REFRESH_INTERVAL_MS, RANGE_PRESETS, PROVIDER_SOURCE_LABELS, SERIES_COLORS, TOKEN_BUCKETS, cacheHitRate, isUsageDocument, isRealtimeDocument, clampNumber, minuteStartOf, minuteLabel, clockLabel, formatTokens, formatTokensZh, formatPercent, dayKeyOf };
  })();

  // ---- src/client/charts.js ----
  const __m1 = (() => {
  const { createElement: h, useEffect: useEffect, useMemo: useMemo, useRef: useRef, useState: useState } = require("react");
  const { SERIES_COLORS: SERIES_COLORS, cacheHitRate: cacheHitRate, formatPercent: formatPercent, formatTokensZh: formatTokensZh } = __m0;

  const DAYS_PER_WEEK = 7;

  const HEATMAP_DAYS = 365;

  const FALLBACK_CHART_WIDTH = 920;

  function useMeasuredWidth(fallback = FALLBACK_CHART_WIDTH) {
    const [width, setWidth] = useState(fallback);
    const host = useRef(null);

    useEffect(() => {
      const node = host.current;
      if (node === null) return undefined;
      const measure = () => {
        const next = Math.round(node.clientWidth);
        if (next > 0) setWidth(next);
      };
      measure();
      if (typeof ResizeObserver !== 'function') {
        window.addEventListener('resize', measure);
        return () => {
          window.removeEventListener('resize', measure);
        };
      }
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => {
        observer.disconnect();
      };
    }, []);

    return { host, width };
  }

  function buildDayWindow(days, rangeDays) {
    const count = rangeDays === null ? Math.max(days.length, 2) : Math.max(rangeDays, 2);
    const byDay = new Map(days.map((entry) => [entry.day, entry]));

    const labels = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (count - 1));
    for (let index = 0; index < count; index += 1) {
      const key = `${String(cursor.getFullYear())}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      labels.push({ key, date: new Date(cursor), entry: byDay.get(key) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return labels;
  }

  function buildUsageBuckets(days, rangeDays, granularity) {
    const labels = buildDayWindow(days, rangeDays);
    if (granularity !== 'week') {
      return labels.map((label) => ({
        key: label.key,
        date: label.date,
        title: label.key,
        byModel: new Map(Object.entries(label.entry?.byModel ?? {})),
      }));
    }

    const weeks = new Map();
    for (const label of labels) {
      const date = label.date;
      const offset = (date.getDay() + 6) % 7;
      const start = new Date(date);
      start.setDate(start.getDate() - offset);
      const key = `${String(start.getFullYear())}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      let bucket = weeks.get(key);
      if (bucket === undefined) {
        bucket = {
          key,
          date: start,
          title: `${String(start.getMonth() + 1)}月${String(start.getDate())}日 当周`,
          byModel: new Map(),
        };
        weeks.set(key, bucket);
      }
      for (const [route, value] of Object.entries(label.entry?.byModel ?? {})) {
        bucket.byModel.set(route, (bucket.byModel.get(route) ?? 0) + value);
      }
    }
    return [...weeks.values()].sort((a, b) => a.date - b.date);
  }

  function pickDateTicks(labels, xOf, usableWidth, width) {
    const count = labels.length;
    const targetTicks = Math.max(2, Math.min(8, Math.floor(usableWidth / 64)));
    const step = Math.max(1, Math.ceil(count / targetTicks));
    const minGap = Math.max(46, Math.min(54, width * 0.055));
    const chosen = [];
    for (let index = 0; index < count; index += step) chosen.push(index);
    const lastIndex = count - 1;
    if (chosen[chosen.length - 1] !== lastIndex) {
      if (xOf(lastIndex) - xOf(chosen[chosen.length - 1] ?? 0) < minGap) chosen.pop();
      chosen.push(lastIndex);
    }
    return chosen.map((index) => ({
      label: labels[index],
      index,
      x: xOf(index),
      text: `${String(labels[index].date.getMonth() + 1)}月${String(labels[index].date.getDate())}日`,
    }));
  }

  function leadingBlanks(first) {
    return first.getDay();
  }

  function buildHeatGrid(days, rangeDays, now) {
    const byDay = new Map(days.map((entry) => [entry.day, entry]));
    const length = rangeDays === null ? 365 : rangeDays;

    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - (length - 1));

    const cells = [];
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() - leadingBlanks(start));
    const last = end.getTime();

    let guard = 0;
    while (cursor.getTime() <= last && guard < 800) {
      const key = `${String(cursor.getFullYear())}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      const entry = byDay.get(key);
      cells.push({
        key,
        date: new Date(cursor),
        total: entry?.total ?? 0,
        sessions: entry?.sessions ?? 0,
        turns: entry?.turns ?? 0,
        inRange: cursor.getTime() >= start.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }

    const columns = [];
    for (let index = 0; index < cells.length; index += DAYS_PER_WEEK) {
      columns.push(cells.slice(index, index + DAYS_PER_WEEK));
    }

    const monthLabels = [];
    let lastLabelled = Number.NEGATIVE_INFINITY;
    columns.forEach((column, index) => {
      const firstOfMonth = column.find((cell) => cell.inRange && cell.date.getDate() === 1);
      if (firstOfMonth === undefined || index - lastLabelled < 3) {
        monthLabels.push('');
        return;
      }
      monthLabels.push(`${String(firstOfMonth.date.getMonth() + 1)}月`);
      lastLabelled = index;
    });

    return { columns, monthLabels };
  }

  function levelOf(total, peak) {
    if (total <= 0 || peak <= 0) return 0;
    const ratio = total / peak;
    if (ratio <= 0.15) return 1;
    if (ratio <= 0.4) return 2;
    if (ratio <= 0.7) return 3;
    return 4;
  }

  function Tooltip({ anchor, title, rows }) {
    if (anchor === null) return null;
    const style = {
      left: `${String(Math.min(anchor.x + 14, window.innerWidth - 280))}px`,
      top: `${String(Math.max(anchor.y - 12, 8))}px`,
    };
    return h(
      'div',
      { className: 'dus-tip', style, role: 'tooltip' },
      h('div', { className: 'dus-tip-title' }, title),
      ...rows.map((row) => h('div', { className: 'dus-tip-row', key: row }, row)),
    );
  }

  function TokenHeatmap({ days, rangeDays, now }) {
    const [anchor, setAnchor] = useState(null);
    const [hovered, setHovered] = useState(null);
    const [available, setAvailable] = useState(0);
    const [scrollable, setScrollable] = useState(false);
    const host = useRef(null);
    const wrap = useRef(null);
    const scrollState = useRef({ overflowing: false, atRight: true });

    const grid = useMemo(() => buildHeatGrid(days, HEATMAP_DAYS, now), [days, now]);
    const peak = useMemo(() => days.reduce((max, day) => Math.max(max, day.total ?? 0), 0), [days]);

    useEffect(() => {
      const node = host.current;
      if (node === null) return undefined;
      const measure = () => {
        setAvailable(node.clientWidth);
      };
      measure();
      if (typeof ResizeObserver !== 'function') {
        window.addEventListener('resize', measure);
        return () => {
          window.removeEventListener('resize', measure);
        };
      }
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => {
        observer.disconnect();
      };
    }, []);

    const columnCount = Math.max(1, grid.columns.length);
    const gap = available > 0 ? 2 + Math.min(1, Math.max(0, (available - 300) / 780)) : 3;
    const fitted = available > 0 ? Math.floor((available - gap * (columnCount - 1)) / columnCount) : 11;
    const cell = Math.max(8, Math.min(22, fitted));

    useEffect(() => {
      if (available <= 0) return;
      const node = wrap.current;
      if (node === null) return;
      const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
      const overflowing = maxScroll > 1;
      const previous = scrollState.current;
      setScrollable(overflowing);
      if (overflowing && (!previous.overflowing || previous.atRight)) {
        node.scrollLeft = maxScroll;
      }
      scrollState.current = {
        overflowing,
        atRight: overflowing && Math.abs(node.scrollLeft - maxScroll) <= 2,
      };
    }, [available, cell, gap, grid]);

    const show = (day, event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
      setHovered(day);
    };

    return h(
      'div',
      { ref: host },
      h(
        'div',
        {
          className: 'dus-heat-wrap',
          ref: wrap,
          'data-overflow': scrollable ? '' : undefined,
          'data-cell': String(cell),
        },
        h(
          'div',
          { className: 'dus-heat-months', style: { gap: `${String(gap)}px` } },
          ...grid.monthLabels.map((label, index) =>
            h(
              'div',
              {
                className: 'dus-heat-month',
                key: `m-${String(index)}`,
                style: { width: `${String(cell)}px`, flex: `0 0 ${String(cell)}px` },
              },
              label.length === 0 ? null : h('span', null, label),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dus-heat' },
          ...grid.columns.map((column, columnIndex) =>
            h(
              'div',
              { className: 'dus-heat-col', key: `c-${String(columnIndex)}`, style: { gap: `${String(gap)}px` } },
              ...column.map((day) => {
                const level = day.inRange ? levelOf(day.total, peak) : 0;
                return h('div', {
                  key: day.key,
                  className: 'dus-heat-cell',
                  'data-level': String(level),
                  style: {
                    width: `${String(cell)}px`,
                    height: `${String(cell)}px`,
                    ...(day.inRange ? {} : { opacity: 0.35 }),
                  },
                  onMouseEnter: (event) => {
                    show(day, event);
                  },
                  onMouseLeave: () => {
                    setAnchor(null);
                    setHovered(null);
                  },
                  'aria-label': `${day.key}: ${formatTokensZh(day.total)} tokens`,
                });
              }),
            ),
          ),
        ),
      ),
      h(
        'div',
        { className: 'dus-heat-legend' },
        h('span', null, '少'),
        ...[0, 1, 2, 3, 4].map((level) =>
          h('div', { key: `l-${String(level)}`, className: 'dus-heat-cell', 'data-level': String(level), style: { width: '10px', height: '10px' } }),
        ),
        h('span', null, '多'),
      ),
      h(Tooltip, {
        anchor: hovered === null ? null : anchor,
        title: hovered?.key ?? '',
        rows:
          hovered === null
            ? []
            : [
                `${formatTokensZh(hovered.total)} tokens`,
                `${String(hovered.turns)}轮消息 · ${String(hovered.sessions)} 个会话`
              ],
      }),
    );
  }

  function TokenTrend({ days, series, rangeDays }) {
    const [hoverIndex, setHoverIndex] = useState(null);
    const [hoverAnchor, setHoverAnchor] = useState(null);
    const { host, width } = useMeasuredWidth();

    const height = Math.round(Math.max(190, Math.min(260, 150 + width * 0.11)));
    const padTop = Math.round(Math.max(12, Math.min(16, 6 + width * 0.01)));
    const padRight = Math.round(Math.max(26, Math.min(32, 10 + width * 0.02)));
    const padBottom = Math.round(Math.max(24, Math.min(30, 18 + width * 0.0115)));
    const padLeft = Math.round(Math.max(38, Math.min(56, width * 0.054)));
    const axisSize = Math.max(10, Math.min(11, 9.5 + width * 0.0015));

    const plot = useMemo(() => {
      const usableWidth = width - padLeft - padRight;
      const usableHeight = height - padTop - padBottom;

      const labels = buildDayWindow(days, rangeDays);
      const count = labels.length;

      const valueAt = (label, item) =>
        label.entry?.byModel?.[item.key] ?? label.entry?.byModel?.[item.model] ?? 0;

      let peak = 0;
      for (const label of labels) {
        for (const item of series) {
          peak = Math.max(peak, valueAt(label, item));
        }
      }
      if (peak <= 0) peak = 1;

      const xOf = (index) => padLeft + (count === 1 ? usableWidth / 2 : (index / (count - 1)) * usableWidth);
      const yOf = (value) => padTop + usableHeight - (value / peak) * usableHeight;

      const lines = series.map((item, seriesIndex) => {
        const points = labels.map((label, index) => ({
          x: xOf(index),
          y: yOf(valueAt(label, item)),
          value: valueAt(label, item),
        }));
        return {
          ...item,
          color: SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
          points,
          path: smoothPath(points),
          value: points.reduce((sum, point) => sum + point.value, 0),
        };
      });

      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
        y: padTop + usableHeight * ratio,
        label: formatTokensZh(peak * (1 - ratio)),
      }));

      const ticks = pickDateTicks(labels, xOf, usableWidth, width);

      return { count, labels, lines, gridLines, ticks, xOf, peak };
    }, [days, series, rangeDays, width, height, padTop, padRight, padBottom, padLeft]);

    const hover = hoverIndex === null ? null : (plot.labels[hoverIndex] ?? null);

    return h(
      'div',
      { className: 'dus-chart-host', ref: host, 'data-chart': 'tokens' },
      h(
        'div',
        { className: 'dus-legend' },
        ...plot.lines.map((line) =>
          h(
            'div',
            { className: 'dus-legend-item', key: line.key },
            h('span', { className: 'dus-legend-dot', style: { background: line.color } }),
            h('span', null, line.model),
            h('span', { className: 'dus-legend-src', title: `来源：${line.provider}` }, line.source),
            h('span', { className: 'dus-legend-val' }, `${formatTokensZh(line.value)} tokens`),
          ),
        ),
      ),
      h(
        'svg',
        {
          viewBox: `0 0 ${String(width)} ${String(height)}`,
          width: '100%',
          height: String(height),
          role: 'img',
          'aria-label': '每日 Token 趋势图',
          onMouseLeave: () => {
            setHoverIndex(null);
            setHoverAnchor(null);
          },
          onMouseMove: (event) => {
            const svg = event.currentTarget;
            const local = pointerToViewBox(svg, event.clientX, event.clientY);
            const usable = width - padLeft - padRight;
            if (usable <= 0) return;
            const index = Math.round(((local.x - padLeft) / usable) * (plot.count - 1));
            const clamped = Math.max(0, Math.min(plot.count - 1, index));
            setHoverIndex(clamped);
            const point = plot.lines[0]?.points[clamped];
            if (point !== undefined && point !== null) {
              const screen = viewBoxToClient(svg, point.x, point.y);
              setHoverAnchor({ x: screen.x, y: screen.y });
            } else {
              setHoverAnchor({ x: event.clientX, y: event.clientY });
            }
          },
        },
        ...plot.gridLines.map((line, index) =>
          h('line', {
            key: `g-${String(index)}`,
            x1: String(padLeft),
            x2: String(width - padRight),
            y1: String(line.y),
            y2: String(line.y),
            stroke: 'var(--dsw-alias-border-l2)',
            'stroke-width': '1',
            'stroke-dasharray': index === plot.gridLines.length - 1 ? undefined : '3 5',
          }),
        ),
        ...plot.gridLines.map((line, index) =>
          h(
            'text',
            {
              key: `gl-${String(index)}`,
              x: String(padLeft - 10),
              y: String(line.y + 4),
              'text-anchor': 'end',
              fill: 'var(--dsw-alias-label-secondary)',
              'font-size': String(axisSize),
            },
            line.label,
          ),
        ),
        ...plot.lines.map((line) =>
          h('path', {
            key: `p-${line.key}`,
            d: line.path,
            fill: 'none',
            stroke: line.color,
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        ),
        hoverIndex !== null &&
          h('line', {
            x1: String(plot.xOf(hoverIndex)),
            x2: String(plot.xOf(hoverIndex)),
            y1: String(padTop),
            y2: String(height - padBottom),
            stroke: 'var(--dsw-alias-border-l3)',
            'stroke-width': '1',
          }),
        hoverIndex !== null &&
          plot.lines.map((line) =>
            h('circle', {
              key: `d-${line.key}`,
              cx: String(line.points[hoverIndex]?.x ?? 0),
              cy: String(line.points[hoverIndex]?.y ?? 0),
              r: '3.5',
              fill: line.color,
              stroke: 'var(--dsw-alias-bg-layer-2)',
              'stroke-width': '1.5',
            }),
          ),
        ...plot.ticks.map((tick) =>
          h(
            'text',
            {
              key: `t-${String(tick.index)}`,
              x: String(tick.x),
              y: String(height - 8),
              'text-anchor': 'middle',
              fill: 'var(--dsw-alias-label-secondary)',
              'font-size': String(axisSize),
            },
            tick.text,
          ),
        ),
      ),
      hover !== undefined &&
        hover !== null &&
        h(Tooltip, {
          anchor: hoverAnchor,
          title: hover.key,
          rows: plot.lines.map(
            (line) => `${line.model}  ${formatTokensZh(line.points[hoverIndex]?.value ?? 0)} tokens`,
          ),
        }),
    );
  }

  function TokenCacheRate({ days, rangeDays }) {
    const [hoverIndex, setHoverIndex] = useState(null);
    const [hoverAnchor, setHoverAnchor] = useState(null);
    const { host, width } = useMeasuredWidth();

    const height = Math.round(Math.max(170, Math.min(220, 130 + width * 0.09)));
    const padTop = Math.round(Math.max(12, Math.min(16, 6 + width * 0.01)));
    const padRight = Math.round(Math.max(26, Math.min(32, 10 + width * 0.02)));
    const padBottom = Math.round(Math.max(24, Math.min(28, 18 + width * 0.01)));
    const padLeft = Math.round(Math.max(38, Math.min(50, width * 0.05)));
    const axisSize = Math.max(10, Math.min(11, 9.5 + width * 0.0015));

    const plot = useMemo(() => {
      const usableWidth = width - padLeft - padRight;
      const usableHeight = height - padTop - padBottom;
      const labels = buildDayWindow(days, rangeDays);
      const count = labels.length;

      const rates = labels.map((label) => cacheHitRate(label.entry?.totals));
      const values = rates.filter((rate) => rate !== null);

      const low =
        values.length === 0 ? 0 : Math.max(0, Math.min(95, Math.floor(Math.min(...values) / 5) * 5));
      const high = 100;

      const xOf = (index) => padLeft + (count === 1 ? usableWidth / 2 : (index / (count - 1)) * usableWidth);
      const yOf = (rate) => padTop + usableHeight - ((rate - low) / (high - low)) * usableHeight;

      const points = labels.map((label, index) => {
        const rate = rates[index];
        return rate === null ? null : { x: xOf(index), y: yOf(rate), value: rate };
      });

      const segments = [];
      let segment = [];
      for (const point of points) {
        if (point === null) {
          if (segment.length > 0) segments.push(segment);
          segment = [];
        } else {
          segment.push(point);
        }
      }
      if (segment.length > 0) segments.push(segment);

      const steps = 5;
      const gridLines = Array.from({ length: steps + 1 }, (_, index) => {
        const value = high - ((high - low) / steps) * index;
        return { y: yOf(value), label: `${String(Math.round(value))}%` };
      });

      const ticks = pickDateTicks(labels, xOf, usableWidth, width);

      return { count, labels, rates, points, segments, gridLines, ticks, xOf, yOf, low, high, values };
    }, [days, rangeDays, width, height, padTop, padRight, padBottom, padLeft]);

    const empty = plot.values.length === 0;

    const hover = hoverIndex === null ? null : (plot.labels[hoverIndex] ?? null);
    const hoverRate = hoverIndex === null ? null : (plot.rates[hoverIndex] ?? null);
    const hoverTotals = hover?.entry?.totals;
    const hoverRead = hoverTotals?.cacheReadTokens ?? 0;
    const hoverInput =
      (hoverTotals?.cacheReadTokens ?? 0) +
      (hoverTotals?.cacheWriteTokens ?? 0) +
      (hoverTotals?.uncachedInputTokens ?? 0);
    const color = 'var(--dus-cache-line, #39c07a)';

    return h(
      'div',
      { className: 'dus-chart-host', ref: host, 'data-chart': 'cache' },
      empty &&
        h(
          'div',
          { className: 'dus-state', style: { padding: '40px 0' } },
          h('div', { className: 'dus-state-desc' }, '这个时间范围内还没有输入 token 记录。'),
        ),
      !empty &&
        h(
          'svg',
          {
            key: 'chart',
            viewBox: `0 0 ${String(width)} ${String(height)}`,
            width: '100%',
            height: String(height),
            role: 'img',
            'aria-label': '每日平均缓存命中率',
            onMouseLeave: () => {
              setHoverIndex(null);
              setHoverAnchor(null);
            },
            onMouseMove: (event) => {
              const svg = event.currentTarget;
              const local = pointerToViewBox(svg, event.clientX, event.clientY);
              const usable = width - padLeft - padRight;
              if (usable <= 0) return;
              const index = Math.round(((local.x - padLeft) / usable) * (plot.count - 1));
              const clamped = Math.max(0, Math.min(plot.count - 1, index));
              setHoverIndex(clamped);
              const rate = plot.rates[clamped];
              if (rate !== null) {
                const screen = viewBoxToClient(svg, plot.xOf(clamped), plot.yOf(rate));
                setHoverAnchor({ x: screen.x, y: screen.y });
              } else {
                setHoverAnchor({ x: event.clientX, y: event.clientY });
              }
            },
          },
          ...plot.gridLines.map((line, index) =>
            h('line', {
              key: `g-${String(index)}`,
              x1: String(padLeft),
              x2: String(width - padRight),
              y1: String(line.y),
              y2: String(line.y),
              stroke: 'var(--dsw-alias-border-l2)',
              'stroke-width': '1',
              'stroke-dasharray': index === plot.gridLines.length - 1 ? undefined : '3 5',
            }),
          ),
          ...plot.gridLines.map((line, index) =>
            h(
              'text',
              {
                key: `gl-${String(index)}`,
                x: String(padLeft - 10),
                y: String(line.y + 4),
                'text-anchor': 'end',
                fill: 'var(--dsw-alias-label-secondary)',
                'font-size': String(axisSize),
              },
              line.label,
            ),
          ),
          ...plot.segments.map((segment, index) =>
            segment.length > 1
              ? h('path', {
                  key: `s-${String(index)}`,
                  d: smoothPath(segment),
                  fill: 'none',
                  stroke: color,
                  'stroke-width': '2',
                  'stroke-linecap': 'round',
                  'stroke-linejoin': 'round',
                })
              : h('circle', {
                  key: `s-${String(index)}`,
                  cx: String(segment[0].x),
                  cy: String(segment[0].y),
                  r: '2.5',
                  fill: color,
                }),
          ),
          plot.count <= 45 &&
            plot.points.map((point, index) =>
              point === null
                ? null
                : h('circle', {
                    key: `d-${String(index)}`,
                    cx: String(point.x),
                    cy: String(point.y),
                    r: '1.8',
                    fill: color,
                    opacity: '0.75',
                  }),
            ),
          hoverIndex !== null &&
            h('line', {
              x1: String(plot.xOf(hoverIndex)),
              x2: String(plot.xOf(hoverIndex)),
              y1: String(padTop),
              y2: String(height - padBottom),
              stroke: 'var(--dsw-alias-border-l3)',
              'stroke-width': '1',
            }),
          hoverIndex !== null &&
            hoverRate !== null &&
            h('circle', {
              cx: String(plot.xOf(hoverIndex)),
              cy: String(plot.yOf(hoverRate)),
              r: '3.5',
              fill: color,
              stroke: 'var(--dsw-alias-bg-layer-2)',
              'stroke-width': '1.5',
            }),
          ...plot.ticks.map((tick) =>
            h(
              'text',
              {
                key: `t-${String(tick.index)}`,
                x: String(tick.x),
                y: String(height - 8),
                'text-anchor': 'middle',
                fill: 'var(--dsw-alias-label-secondary)',
                'font-size': String(axisSize),
              },
              tick.text,
            ),
          ),
        ),
      hover !== null &&
        h(Tooltip, {
          anchor: hoverAnchor,
          title: hover.key,
          rows:
            hoverRate === null
              ? ['当天没有输入 token 记录']
              : [
                  `缓存命中率 ${formatPercent(hoverRate)}`,
                  `缓存读取 ${formatTokensZh(hoverRead)} · 输入合计 ${formatTokensZh(hoverInput)}`,
                ],
        }),
    );
  }

  function smoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midX = (current.x + next.x) / 2;
      path += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  }

  function pointerToViewBox(svg, clientX, clientY) {
    const ctm = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
    if (ctm !== null && typeof svg.createSVGPoint === 'function') {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    }

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (viewBox.width <= 0 || viewBox.height <= 0 || rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }
    const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
    const offsetX = rect.left + (rect.width - viewBox.width * scale) / 2;
    const offsetY = rect.top + (rect.height - viewBox.height * scale) / 2;
    return {
      x: viewBox.x + (clientX - offsetX) / scale,
      y: viewBox.y + (clientY - offsetY) / scale,
    };
  }

  function viewBoxToClient(svg, x, y) {
    const ctm = typeof svg.getScreenCTM === 'function' ? svg.getScreenCTM() : null;
    if (ctm !== null && typeof svg.createSVGPoint === 'function') {
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = y;
      const screen = point.matrixTransform(ctm);
      return { x: screen.x, y: screen.y };
    }

    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (viewBox.width <= 0 || viewBox.height <= 0) return { x: rect.left, y: rect.top };
    const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
    const offsetX = rect.left + (rect.width - viewBox.width * scale) / 2;
    const offsetY = rect.top + (rect.height - viewBox.height * scale) / 2;
    return {
      x: offsetX + (x - viewBox.x) * scale,
      y: offsetY + (y - viewBox.y) * scale,
    };
  }

  function ModelDonut({ models }) {
    const [activeKey, setActiveKey] = useState(null);
    const [tipAnchor, setTipAnchor] = useState(null);
    const size = 220;
    const stroke = 26;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    const total = models.reduce((sum, model) => sum + model.total, 0);

    const arcs = useMemo(() => {
      let offset = 0;
      return models.map((model, index) => {
        const fraction = total > 0 ? model.total / total : 0;
        const length = fraction * circumference;
        const arc = {
          ...model,
          key: `${model.provider}/${model.model}`,
          color: SERIES_COLORS[index % SERIES_COLORS.length],
          dash: `${String(length)} ${String(circumference - length)}`,
          offset: -offset,
          percent: total > 0 ? (model.total / total) * 100 : 0,
        };
        offset += length;
        return arc;
      });
    }, [models, total, circumference]);

    if (total <= 0) {
      return h(
        'div',
        { className: 'dus-state', style: { padding: '40px 0' } },
        h('div', { className: 'dus-state-desc' }, '这个时间范围内还没有模型用量。'),
      );
    }

    const active = arcs.find((arc) => arc.key === activeKey) ?? null;

    return h(
      'div',
      { className: 'dus-split' },
      h(
        'div',
        { className: 'dus-donut-wrap' },
        h(
          'svg',
          {
            width: String(size),
            height: String(size),
            viewBox: `0 0 ${String(size)} ${String(size)}`,
            role: 'img',
            'aria-label': '模型用量',
            onMouseLeave: () => {
              setActiveKey(null);
              setTipAnchor(null);
            },
          },
          h('circle', {
            cx: String(size / 2),
            cy: String(size / 2),
            r: String(radius),
            fill: 'none',
            stroke: 'var(--dus-subtle-fill)',
            'stroke-width': String(stroke),
          }),
          ...arcs.map((arc) =>
            h('circle', {
              key: arc.key,
              cx: String(size / 2),
              cy: String(size / 2),
              r: String(radius),
              fill: 'none',
              stroke: arc.color,
              'stroke-width': String(activeKey === null || activeKey === arc.key ? stroke : stroke - 8),
              'stroke-dasharray': arc.dash,
              'stroke-dashoffset': String(arc.offset),
              transform: `rotate(-90 ${String(size / 2)} ${String(size / 2)})`,
              'stroke-linecap': 'butt',
              opacity: activeKey === null || activeKey === arc.key ? '1' : '0.35',
              style: { transition: 'stroke-width 120ms ease, opacity 120ms ease', cursor: 'pointer' },
              onMouseEnter: (event) => {
                setActiveKey(arc.key);
                setTipAnchor({ x: event.clientX, y: event.clientY });
              },
              onMouseMove: (event) => {
                setTipAnchor({ x: event.clientX, y: event.clientY });
              },
            }),
          ),
        ),
        h(
          'div',
          { className: 'dus-donut-center' },
          h('div', { className: 'dus-donut-total' }, formatTokensZh(total)),
          h('div', { className: 'dus-donut-unit' }, 'tokens'),
        ),
      ),
      h(
        'div',
        { className: 'dus-model-list' },
        ...arcs.map((arc) =>
          h(
            'div',
            {
              className: 'dus-model-row',
              key: arc.key,
              'data-active': activeKey === arc.key ? '' : undefined,
              onMouseEnter: (event) => {
                setActiveKey(arc.key);
                setTipAnchor({ x: event.clientX, y: event.clientY });
              },
              onMouseMove: (event) => {
                setTipAnchor({ x: event.clientX, y: event.clientY });
              },
              onMouseLeave: () => {
                setActiveKey(null);
                setTipAnchor(null);
              },
            },
            h('span', { className: 'dus-model-dot', style: { background: arc.color } }),
            h(
              'div',
              { className: 'dus-model-main' },
              h(
                'div',
                { className: 'dus-model-name', title: arc.model },
                arc.model,
                h('span', { className: 'dus-model-src', title: `来源：${arc.provider}` }, arc.source),
              ),
              h(
                'div',
                { className: 'dus-model-meta' },
                `${String(arc.sessions)} 个会话 · ${String(arc.turns)} 轮`,
              ),
            ),
            h(
              'div',
              { className: 'dus-model-right' },
              h('div', { className: 'dus-model-tokens' }, `${formatTokensZh(arc.total)} tokens`),
              h('div', { className: 'dus-model-pct' }, formatPercent(arc.percent)),
            ),
          ),
        ),
      ),
      h(Tooltip, {
        anchor: active === null ? null : tipAnchor,
        title: active?.model ?? '',
        rows:
          active === null
            ? []
            : [
                `来源：${active.source}`,
                `${formatPercent(active.percent)} · ${formatTokensZh(active.total)} tokens`,
                `${String(active.sessions)} 个会话 · ${String(active.turns)} 轮`,
              ],
      }),
    );
  }

  function ModelUsageChart({ days, models, rangeDays }) {
    const [granularity, setGranularity] = useState('day');
    const [hoverIndex, setHoverIndex] = useState(null);
    const [hoverAnchor, setHoverAnchor] = useState(null);
    const { host, width } = useMeasuredWidth();

    const height = Math.round(Math.max(200, Math.min(300, 150 + width * 0.14)));
    const padTop = Math.round(Math.max(12, Math.min(16, 6 + width * 0.01)));
    const padRight = Math.round(Math.max(26, Math.min(32, 10 + width * 0.02)));
    const padBottom = Math.round(Math.max(24, Math.min(30, 18 + width * 0.0115)));
    const padLeft = Math.round(Math.max(40, Math.min(56, width * 0.054)));
    const axisSize = Math.max(10, Math.min(11, 9.5 + width * 0.0015));

    const plot = useMemo(() => {
      const series = models.map((model, index) => ({
        key: `${model.provider}/${model.model}`,
        model: model.model,
        provider: model.provider,
        source: model.source,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      }));
      const buckets = buildUsageBuckets(days, rangeDays, granularity);
      const count = buckets.length;
      const values = buckets.map((bucket) =>
        series.reduce((sum, item) => sum + (bucket.byModel.get(item.key) ?? 0), 0),
      );
      const peak = Math.max(1, ...values);
      const usableWidth = Math.max(1, width - padLeft - padRight);
      const usableHeight = Math.max(1, height - padTop - padBottom);
      const slot = usableWidth / Math.max(1, count);
      const barWidth = Math.max(3, Math.min(44, slot * 0.62));

      const xOf = (index) => padLeft + slot * index + slot / 2;
      const yOf = (value) => padTop + usableHeight - (value / peak) * usableHeight;

      const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
        y: padTop + usableHeight * ratio,
        label: formatTokensZh(peak * (1 - ratio)),
      }));

      const bars = buckets.map((bucket, index) => {
        let cumulative = 0;
        const segments = [];
        for (const item of series) {
          const value = bucket.byModel.get(item.key) ?? 0;
          if (value <= 0) continue;
          const bottom = yOf(cumulative);
          cumulative += value;
          const top = yOf(cumulative);
          segments.push({
            key: `${bucket.key}/${item.key}`,
            color: item.color,
            x: xOf(index) - barWidth / 2,
            y: top,
            width: barWidth,
            height: Math.max(0.8, bottom - top),
          });
        }
        return {
          index,
          key: bucket.key,
          title: bucket.title,
          total: cumulative,
          x: xOf(index),
          top: yOf(cumulative),
          segments,
        };
      });

      const ticks = pickDateTicks(buckets, xOf, usableWidth, width);

      return { buckets, series, values, peak, usableWidth, usableHeight, slot, bars, gridLines, ticks, xOf, yOf };
    }, [days, models, rangeDays, granularity, width, height, padTop, padRight, padBottom, padLeft]);

    const empty = models.length === 0 || plot.values.every((value) => value <= 0);
    const hover = hoverIndex === null ? null : (plot.bars[hoverIndex] ?? null);
    const hoverRows = [];
    if (hover !== null) {
      hoverRows.push(`总计 ${formatTokensZh(hover.total)} tokens`);
      for (const item of plot.series) {
        const value = plot.buckets[hover.index].byModel.get(item.key) ?? 0;
        if (value > 0) hoverRows.push(`${item.model}  ${formatTokensZh(value)} tokens`);
      }
    }

    const chooseGranularity = (next) => {
      setGranularity(next);
      setHoverIndex(null);
      setHoverAnchor(null);
    };

    return h(
      'div',
      { className: 'dus-model-trend' },
      models.length > 0 &&
        h(
          'div',
          { className: 'dus-bars-head' },
          h(
            'div',
            { className: 'dus-bars-heading' },
            h('h3', { className: 'dus-bars-title' }, '各模型用量趋势'),
          ),
          h(
            'div',
            {
              className: 'dus-seg dus-seg-sm dus-trend-toggle',
              role: 'tablist',
              'aria-label': '聚合粒度',
            },
            ...[
              ['day', '每日'],
              ['week', '每周'],
            ].map(([id, label]) =>
              h(
                'button',
                {
                  key: id,
                  type: 'button',
                  role: 'tab',
                  className: 'dus-seg-btn',
                  'data-active': granularity === id ? '' : undefined,
                  'aria-selected': granularity === id,
                  onClick: () => {
                    chooseGranularity(id);
                  },
                },
                label,
              ),
            ),
          ),
        ),
      h(
        'div',
        { className: 'dus-chart-host', ref: host, 'data-chart': 'models' },
        empty
          ? models.length > 0 &&
            h(
              'div',
              { className: 'dus-state', style: { padding: '40px 0' } },
              h('div', { className: 'dus-state-desc' }, '这个时间范围内还没有模型用量。'),
            )
          : [
              h(
                'svg',
                {
                  key: 'chart',
                  viewBox: `0 0 ${String(width)} ${String(height)}`,
                  width: '100%',
                  height: String(height),
                  role: 'img',
                  'aria-label': '各模型用量趋势',
                  onMouseLeave: () => {
                    setHoverIndex(null);
                    setHoverAnchor(null);
                  },
                  onMouseMove: (event) => {
                    const svg = event.currentTarget;
                    const local = pointerToViewBox(svg, event.clientX, event.clientY);
                    if (plot.bars.length === 0) return;
                    const index = Math.floor((local.x - padLeft) / plot.slot);
                    const clamped = Math.max(0, Math.min(plot.bars.length - 1, index));
                    setHoverIndex(clamped);
                    const bar = plot.bars[clamped];
                    if (bar.total > 0) {
                      const screen = viewBoxToClient(svg, bar.x, bar.top);
                      setHoverAnchor({ x: screen.x, y: screen.y });
                    } else {
                      setHoverAnchor({ x: event.clientX, y: event.clientY });
                    }
                  },
                },
                ...plot.gridLines.map((line, index) =>
                  h('line', {
                    key: `g-${String(index)}`,
                    x1: String(padLeft),
                    x2: String(width - padRight),
                    y1: String(line.y),
                    y2: String(line.y),
                    stroke: 'var(--dsw-alias-border-l2)',
                    'stroke-width': '1',
                    'stroke-dasharray': index === plot.gridLines.length - 1 ? undefined : '3 5',
                  }),
                ),
                ...plot.gridLines.map((line, index) =>
                  h(
                    'text',
                    {
                      key: `gl-${String(index)}`,
                      x: String(padLeft - 10),
                      y: String(line.y + 4),
                      'text-anchor': 'end',
                      fill: 'var(--dsw-alias-label-secondary)',
                      'font-size': String(axisSize),
                    },
                    line.label,
                  ),
                ),
                hoverIndex !== null &&
                  h('rect', {
                    x: String(padLeft + plot.slot * hoverIndex + 1),
                    y: String(padTop),
                    width: String(Math.max(0, plot.slot - 2)),
                    height: String(plot.usableHeight),
                    rx: '3',
                    fill: 'var(--dsw-alias-bg-layer-3)',
                    opacity: '0.35',
                  }),
                ...plot.bars.map((bar) =>
                  h(
                    'g',
                    { key: bar.key, className: 'dus-stack-bar', 'data-bucket': String(bar.index) },
                    ...bar.segments.map((segment) =>
                      h('rect', {
                        key: segment.key,
                        className: 'dus-stack-seg',
                        x: String(segment.x),
                        y: String(segment.y),
                        width: String(segment.width),
                        height: String(segment.height),
                        rx: '1',
                        fill: segment.color,
                      }),
                    ),
                  ),
                ),
                ...plot.ticks.map((tick) =>
                  h(
                    'text',
                    {
                      key: `t-${String(tick.index)}`,
                      x: String(tick.x),
                      y: String(height - 8),
                      'text-anchor': 'middle',
                      fill: 'var(--dsw-alias-label-secondary)',
                      'font-size': String(axisSize),
                    },
                    tick.text,
                  ),
                ),
              ),
              h(Tooltip, {
                key: 'tip',
                anchor: hover === null ? null : hoverAnchor,
                title: hover?.title ?? '',
                rows: hoverRows,
              }),
            ],
      ),
    );
  }
  return { useMeasuredWidth, Tooltip, TokenHeatmap, TokenTrend, TokenCacheRate, pointerToViewBox, viewBoxToClient, ModelDonut, ModelUsageChart };
  })();

  // ---- src/client/dashboard.js ----
  const __m2 = (() => {
  const { createElement: h, useCallback: useCallback, useEffect: useEffect, useMemo: useMemo, useRef: useRef, useState: useState } = require("react");
  const { DEFAULT_REFRESH_INTERVAL_MS: DEFAULT_REFRESH_INTERVAL_MS, MINUTE_MS: MINUTE_MS, RANGE_PRESETS: RANGE_PRESETS, REALTIME_WINDOW_MINUTES: REALTIME_WINDOW_MINUTES, REFRESH_INTERVALS: REFRESH_INTERVALS, USAGE_REALTIME_PATH: USAGE_REALTIME_PATH, USAGE_STATS_PATH: USAGE_STATS_PATH, dayKeyOf: dayKeyOf, formatPercent: formatPercent, formatTokensZh: formatTokensZh, isRealtimeDocument: isRealtimeDocument, isUsageDocument: isUsageDocument, minuteLabel: minuteLabel } = __m0;
  const { ModelDonut: ModelDonut, ModelUsageChart: ModelUsageChart, TokenCacheRate: TokenCacheRate, TokenHeatmap: TokenHeatmap, TokenTrend: TokenTrend, Tooltip: Tooltip, pointerToViewBox: pointerToViewBox, useMeasuredWidth: useMeasuredWidth, viewBoxToClient: viewBoxToClient } = __m1;

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

  function UsageDashboard() {
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
  return { UsageDashboard };
  })();

  // ---- src/client/styles.js ----
  const __m3 = (() => {


  const STYLE_ID = 'dsh-usage-overview/dashboard.css';

  const CSS = `.dus-root {
      --dus-accent: var(--dsw-alias-state-business-primary, var(--dsw-static-deepseek-450, #5686fe));
      --dus-subtle-fill: var(--dsw-alias-bg-overlay);
      --dus-subtle-fill: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
      --dus-cache-line: color-mix(in srgb, var(--dsw-alias-state-success-primary) 60%, var(--dsw-alias-label-primary));
      height: 100%;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: calc(var(--dsh-frame-top-clearance, 0px) + clamp(16px, 3vw, 28px)) clamp(14px, 4%, 40px) clamp(64px, 6.5vw, 76px);
      box-sizing: border-box;
      color: var(--dsw-alias-label-primary);
      font-family: var(--dsw-font-family);
      font-size: 14px;
      line-height: 1.5;
    }

    .dus-shell {
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      container-type: inline-size;
      container-name: dus;
    }
    .dus-inner {
      display: flex;
      flex-direction: column;
      gap: 16px;
      gap: clamp(12px, 1.5cqw, 16px);
    }

    .dus-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-bottom: 4px; }
    .dus-title {
      font-size: 28px;
      font-size: clamp(21px, 2.6cqw + 14px, 28px);
      font-weight: 700; letter-spacing: -0.01em; margin: 0;
      line-height: 1.2;
    }
    .dus-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px; border-radius: 999px;
      background: var(--dsw-alias-bg-layer-3);
      border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
      font-size: 12px; font-weight: 500;
      white-space: nowrap;
    }
    .dus-head-spacer { flex: 1 1 auto; min-width: 0; }
    .dus-live {
      display: inline-flex; align-items: center; gap: 6px;
      margin-left: auto; white-space: nowrap;
      font-size: 12px; color: var(--dsw-alias-label-secondary);
    }
    .dus-live-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--dsw-alias-state-success-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 20%, transparent);
    }

    .dus-cards {
      display: flex; flex-wrap: wrap; gap: 1px;
      background: var(--dsw-alias-border-l1);
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-lg);
      overflow: hidden;
    }
    .dus-card {
      flex: 1 1 150px;
      box-sizing: border-box;
      background: var(--dsw-alias-bg-layer-2);
      padding: 18px 16px;
      padding: clamp(12px, 2.6cqw, 18px) clamp(8px, 1.6cqw, 16px);
      text-align: center;
      display: flex; flex-direction: column; gap: 6px;
      justify-content: center;
      min-width: 0;
    }
    .dus-card-value {
      font-size: 24px;
      font-size: clamp(17px, 2.3cqw + 8px, 24px);
      font-weight: 650; letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .dus-card-label {
      font-size: 12px;
      font-size: clamp(10.5px, 1.05cqw, 12px);
      color: var(--dsw-alias-label-secondary);
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .dus-meter {
      height: 4px; border-radius: 2px; overflow: hidden;
      background: var(--dus-subtle-fill);
      margin-top: 2px;
    }
    .dus-meter-fill {
      height: 100%; border-radius: 2px;
      background: var(--dus-accent);
      transition: width 200ms ease;
    }

    .dus-panel {
      background: var(--dsw-alias-bg-layer-2);
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-lg);
      padding: 18px 20px 20px;
      padding: clamp(14px, 2cqw, 18px) clamp(12px, 2cqw, 20px) clamp(14px, 2.2cqw, 20px);
      min-width: 0;
    }
    .dus-panel-head {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px;
      margin-bottom: 16px; min-height: 28px;
    }
    .dus-panel-title { font-size: 15px; font-weight: 600; margin: 0; line-height: 1.3; }
    .dus-panel-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-left: auto; }

    .dus-range-row {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px;
      margin-top: 2px;
    }
    .dus-range-label {
      flex: none;
      font-size: 13px; font-weight: 550; color: var(--dsw-alias-label-secondary);
    }
    .dus-range-row .dus-seg {
      flex: 1 1 240px;
      max-width: 320px;
      margin-left: auto;
    }

    .dus-seg {
      display: flex; align-items: center; gap: 2px;
      padding: 2px; border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-bg-layer-3);
      border: 1px solid var(--dsw-alias-border-l1);
      box-sizing: border-box;
    }
    .dus-seg-btn {
      flex: 1 1 0; min-width: 0;
      appearance: none; border: none; cursor: pointer;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font-family: inherit; font-size: 12px; font-weight: 500;
      padding: 4px 12px;
      padding-inline: clamp(4px, 1cqw, 12px);
      border-radius: var(--dsw-radius-sm);
      transition: background 120ms ease, color 120ms ease;
      white-space: nowrap; text-align: center;
    }
    .dus-seg-btn:hover { color: var(--dsw-alias-label-primary); }
    .dus-seg-btn[data-active] {
      background: var(--dsw-alias-bg-layer-1);
      color: var(--dsw-alias-label-primary);
      box-shadow: var(--dsw-elevation-soft);
    }

    .dus-heat-wrap {
      position: relative; overflow-x: auto; padding-bottom: 6px;
      scrollbar-width: thin; overscroll-behavior-inline: contain;
      -webkit-overflow-scrolling: touch;
    }
    .dus-heat { display: flex; gap: 3px; min-width: min-content; }
    .dus-heat-col { display: flex; flex-direction: column; gap: 3px; }
    .dus-heat-cell {
      border-radius: 2px;
      background: var(--dus-subtle-fill);
      transition: transform 90ms ease;
    }
    .dus-heat-cell[data-level="1"] { background: color-mix(in srgb, var(--dus-accent) 26%, var(--dsw-alias-bg-layer-3)); }
    .dus-heat-cell[data-level="2"] { background: color-mix(in srgb, var(--dus-accent) 48%, var(--dsw-alias-bg-layer-3)); }
    .dus-heat-cell[data-level="3"] { background: color-mix(in srgb, var(--dus-accent) 72%, var(--dsw-alias-bg-layer-3)); }
    .dus-heat-cell[data-level="4"] { background: var(--dus-accent); }
    .dus-heat-cell:hover { transform: scale(1.35); }
    .dus-heat-months {
      display: flex; gap: 3px; margin-bottom: 6px; min-width: min-content;
    }

    .dus-heat-month {
      position: relative; height: 14px;
      font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-secondary);
      white-space: nowrap; overflow: visible;
    }
    .dus-heat-month > span { position: absolute; left: 0; top: 0; }
    .dus-heat-legend {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px; justify-content: flex-end;
      margin-top: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary);
    }
    .dus-heat-legend .dus-heat-cell { width: 10px; height: 10px; }

    .dus-tip {
      position: fixed; z-index: 60; pointer-events: none;
      background: var(--dsw-alias-tooltip-bg, #2c2c2e);
      color: var(--dsw-alias-tooltip-label, #ffffff);
      border: 1px solid var(--dsw-alias-tooltip-key-bg, color-mix(in srgb, #ffffff 18%, transparent));
      border-radius: var(--dsw-radius-md);
      padding: 8px 10px; font-size: 12px; line-height: 1.45;
      box-shadow: var(--dsw-elevation-prominent);
      max-width: min(260px, calc(100vw - 24px));
    }
    .dus-tip-title { color: inherit; font-weight: 600; margin-bottom: 2px; }
    .dus-tip-row { color: inherit; opacity: 0.8; font-variant-numeric: tabular-nums; }

    .dus-chart-host { position: relative; width: 100%; min-width: 0; }
    .dus-chart-host svg { display: block; max-width: 100%; }
    .dus-legend {
      display: flex; flex-wrap: wrap; gap: 8px 18px;
      gap: clamp(6px, 1cqw, 8px) clamp(10px, 1.6cqw, 18px);
      margin-bottom: 10px;
    }
    .dus-legend-item {
      display: inline-flex; align-items: center; gap: 7px;
      font-size: 12px; color: var(--dsw-alias-label-secondary);
      cursor: default; min-width: 0; max-width: 100%;
      flex-wrap: wrap; row-gap: 2px;
    }
    .dus-legend-item[data-dim] { opacity: 0.4; }
    .dus-legend-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    .dus-legend-src {
      padding: 0 5px; border-radius: var(--dsw-radius-xs);
      background: var(--dsw-alias-bg-layer-3);
      border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
      font-size: 10.5px; font-weight: 500;
    }
    .dus-legend-val { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

    .dus-split {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 28px;
      gap: clamp(16px, 2.6cqw, 28px);
    }
    .dus-donut-wrap {
      flex: 0 0 auto;
      position: relative; display: flex; justify-content: center;
      min-width: 0; max-width: 100%;
    }

    .dus-root .dus-donut-wrap svg {
      width: 220px;
      width: clamp(150px, 24cqw, 220px);
      height: auto;
    }
    .dus-donut-center {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      pointer-events: none; text-align: center;
    }
    .dus-donut-total {
      font-size: 22px;
      font-size: clamp(16px, 2.2cqw + 6px, 22px);
      font-weight: 650; letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .dus-donut-unit { font-size: 11px; color: var(--dsw-alias-label-secondary); }
    .dus-donut-hint {
      margin-top: 3px; max-width: 118px;
      font-size: 10.5px; line-height: 1.3;
      color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .dus-model-list {
      display: flex; flex-direction: column; gap: 2px;
      flex: 1 1 310px;
      min-width: 0;
    }
    .dus-model-row {
      display: grid; grid-template-columns: 10px minmax(0, 1fr) auto;
      align-items: center; gap: 10px;
      padding: 9px 8px; border-radius: var(--dsw-radius-md);
      padding: clamp(6px, 1cqw, 9px) clamp(4px, 0.8cqw, 8px);
      gap: clamp(6px, 1cqw, 10px);
      transition: background 120ms ease;
      min-width: 0;
    }
    .dus-model-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .dus-model-row[data-active] { background: var(--dsw-alias-interactive-bg-hover); }
    .dus-model-dot { width: 9px; height: 9px; border-radius: 50%; }
    .dus-model-main { min-width: 0; }

    .dus-model-name {
      font-weight: 550; font-size: 13px;
      font-size: clamp(12px, 1.3cqw, 13px);
      white-space: normal; overflow-wrap: anywhere;
      line-height: 1.35;
    }
    .dus-model-meta {
      font-size: 11.5px; color: var(--dsw-alias-label-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .dus-model-src {
      display: inline-flex; align-items: center;
      padding: 0 5px; margin-left: 4px;
      border-radius: var(--dsw-radius-xs);
      background: var(--dsw-alias-bg-layer-3);
      border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
      font-size: 10.5px; font-weight: 500;
      vertical-align: 1px;
    }
    .dus-model-right { text-align: right; white-space: nowrap; }
    .dus-model-tokens {
      font-weight: 600; font-size: 13px;
      font-size: clamp(12px, 1.3cqw, 13px);
      font-variant-numeric: tabular-nums;
    }
    .dus-model-pct { font-size: 11.5px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

    .dus-model-trend {
      margin-top: 16px;
      margin-top: clamp(14px, 2.2cqw, 22px);
      padding-top: 14px;
      padding-top: clamp(12px, 1.8cqw, 18px);
      border-top: 1px solid var(--dsw-alias-border-l1);
    }
    .dus-bars-head {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 8px 12px; margin-bottom: 10px;
    }
    .dus-bars-heading {
      display: flex; flex-wrap: wrap; align-items: baseline;
      gap: 4px 10px; min-width: 0; flex: 1 1 200px;
    }
    .dus-bars-title { font-size: 13.5px; font-weight: 600; margin: 0; line-height: 1.3; }
    .dus-trend-toggle { margin-left: auto; flex: none; }
    .dus-seg-sm .dus-seg-btn { padding: 3px 10px; font-size: 11px; }

    .dus-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; padding: 72px 24px; text-align: center;
      color: var(--dsw-alias-label-secondary);
    }
    .dus-state-icon {
      width: 34px; height: 34px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--dus-subtle-fill);
      color: var(--dsw-alias-label-secondary);
    }
    .dus-state-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
    .dus-state-desc { font-size: 13px; max-width: 420px; }
    .dus-btn {
      appearance: none; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500;
      display: inline-flex; align-items: center; gap: 7px;
      padding: 7px 14px; border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-bg-layer-3);
      color: var(--dsw-alias-label-primary);
      border: 1px solid var(--dsw-alias-border-l2);
      transition: background 120ms ease, border-color 120ms ease;
    }
    .dus-btn:hover { background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-interactive-bg-hover)); }
    .dus-btn[disabled] { opacity: 0.55; cursor: default; }
    .dus-btn-primary {
      background: var(--dsw-alias-brand-primary);
      color: var(--dsw-alias-bg-base);
      border-color: transparent;
    }
    .dus-btn-primary:hover { background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary)); }

    .dus-refresh {
      flex: none;
    }

    .dus-toolbar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
      padding: 8px 12px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-md);
      background: var(--dsw-alias-bg-layer-2);
    }
    .dus-toolbar-error {
      color: var(--dsw-alias-state-error-primary, #e5484d);
      min-width: 0; max-width: 100%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-size: 12px;
    }
    .dus-refresh-seg { flex: none; }
    .dus-toolbar-end {
      display: flex; align-items: center; gap: 8px;
      margin-left: auto; flex: none;
    }

    .dus-cards-picker { position: relative; display: flex; }
    .dus-cards-toggle {
      gap: 6px; padding: 6px 10px; font-size: 12.5px;
      white-space: nowrap;
    }
    .dus-cards-toggle[data-open] {
      background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-interactive-bg-hover));
      border-color: var(--dsw-alias-border-l2);
      box-shadow: var(--dsw-elevation-soft);
    }
    .dus-cards-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 26px; padding: 0 5px;
      border-radius: 999px;
      background: var(--dsw-alias-bg-layer-3);
      border: 1px solid var(--dsw-alias-border-l2);
      color: var(--dsw-alias-label-secondary);
      font-size: 10.5px; font-weight: 500; line-height: 15px;
      font-variant-numeric: tabular-nums;
    }

    .dus-cards-menu {
      position: absolute; top: calc(100% + 8px); right: 0; z-index: 40;
      display: flex; flex-direction: column; gap: 2px;
      width: 232px; max-width: calc(100vw - 24px);
      max-height: min(78vh, 560px);
      overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;
      padding: 6px; box-sizing: border-box;
      border-radius: var(--dsw-radius-lg);
      border: 1px solid var(--dsw-alias-border-l2);
      background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-layer-2));
      box-shadow: var(--dsw-elevation-prominent);
    }
    .dus-cards-group { display: flex; flex-direction: column; gap: 2px; }
    .dus-cards-group + .dus-cards-group {
      margin-top: 3px; padding-top: 3px;
      border-top: 1px solid var(--dsw-alias-border-l1);
    }
    .dus-cards-menu-head {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 6px 6px;
    }
    .dus-cards-menu-title {
      font-size: 12px; font-weight: 600;
      color: var(--dsw-alias-label-secondary);
    }
    .dus-cards-all {
      margin-left: auto;
      appearance: none; border: none; cursor: pointer; background: transparent;
      font-family: inherit; font-size: 11.5px; font-weight: 500;
      color: var(--dus-accent);
      padding: 2px 4px; border-radius: var(--dsw-radius-xs);
      transition: background 120ms ease;
    }
    .dus-cards-all:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .dus-cards-all[disabled] {
      background: transparent; color: var(--dsw-alias-label-secondary);
      opacity: 0.5; cursor: default;
    }
    .dus-cards-list { display: flex; flex-direction: column; gap: 1px; }
    .dus-cards-option {
      display: flex; align-items: center; gap: 8px;
      width: 100%; box-sizing: border-box;
      appearance: none; border: none; cursor: pointer; background: transparent;
      font-family: inherit; font-size: 12.5px; font-weight: 400;
      color: var(--dsw-alias-label-primary); text-align: left;
      padding: 6px; border-radius: var(--dsw-radius-sm);
      transition: background 120ms ease;
    }
    .dus-cards-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
    .dus-cards-box {
      flex: none;
      width: 15px; height: 15px; box-sizing: border-box;
      display: grid; place-items: center;
      border: 1px solid var(--dsw-alias-border-l2);
      border-radius: 4px;
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-bg-base);
    }
    .dus-cards-option[data-checked] .dus-cards-box {
      background: var(--dus-accent);
      border-color: transparent;
    }
    .dus-cards-option-label {
      min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .dus-cards-option[data-locked] { opacity: 0.55; cursor: default; }
    .dus-cards-option[data-locked]:hover { background: transparent; }
    .dus-cards-menu-foot {
      margin-top: 2px; padding: 7px 6px 2px;
      border-top: 1px solid var(--dsw-alias-border-l1);
      font-size: 11px; color: var(--dsw-alias-label-secondary);
    }

    .dus-cards-empty {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
      gap: 4px 10px;
      padding: 22px 16px;
      border: 1px solid var(--dsw-alias-border-l1);
      border-radius: var(--dsw-radius-lg);
      background: var(--dsw-alias-bg-layer-2);
      color: var(--dsw-alias-label-secondary);
      font-size: 13px;
    }
    .dus-cards-empty .dus-cards-all { margin-left: 0; font-size: 13px; }

    .dus-card-live .dus-live-value { color: var(--dsw-alias-label-primary); }
    .dus-live-value { display: inline-flex; align-items: baseline; justify-content: center; gap: 1px; }

    .dus-live-panel .dus-panel-head { margin-bottom: 4px; }
    .dus-live-head .dus-panel-title { font-weight: 600; }

    .dus-live-hero { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin-bottom: 2px; }
    .dus-live-hero-value {
      font-size: clamp(16px, 1.1cqw + 12px, 20px);
      font-weight: 650; letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
      color: var(--dsw-alias-label-primary); line-height: 1.25;
    }
    .dus-realtime-host { margin-top: 10px; }
    .dus-live-bar { transition: opacity 140ms ease; }
    .dus-spin { animation: dus-rotate 900ms linear infinite; }
    @keyframes dus-rotate { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .dus-spin { animation-duration: 2200ms; }
      .dus-heat-cell { transition: none; }
    }
    `;
  return { STYLE_ID, CSS };
  })();

  // ---- src/client/index.js ----
  const __m4 = (() => {
  const { createElement: h } = require("react");
  const { PANEL_ID: PANEL_ID, NS: NS } = __m0;
  const { UsageDashboard: UsageDashboard } = __m2;
  const { CSS: CSS, STYLE_ID: STYLE_ID } = __m3;

  const inject = ['slots', 'layout', 'locale'];

  const en = {
    'panel.label': 'Usage',
    'panel.tooltip': 'Usage statistics',
  };

  const zh = {
    'panel.label': '用量统计',
    'panel.tooltip': '使用统计',
  };

  function installStyles() {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
    const tag = document.createElement('style');
    tag.dataset.plugin = 'dsh-usage-overview';
    tag.dataset.pluginCss = STYLE_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }

  function UsagePanelIcon({ size = 16 } = {}) {
    return h(
      'svg',
      {
        width: String(size),
        height: String(size),
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'stroke-width': '1',
        'aria-hidden': 'true',
      },
      h('path', {
        d: 'M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096',
        stroke: 'currentColor',
      }),
      h('path', { d: 'M8 8.49994L11.6114 4.88855', stroke: 'currentColor' }),
      h('path', {
        d: 'M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z',
        fill: 'currentColor',
      }),
    );
  }

  function apply(ctx) {
    installStyles();

    ctx.effect(
      () =>
        ctx.locale.register(NS, {
          zh,
          en,
        }),
      'dsh-usage-overview: dictionaries',
    );

    const t = ctx.locale.bind(NS);

    ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        },
        UsageDashboard,
      ),
    );

    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('panel.label'),
          locale: NS,
        },
        UsagePanelIcon,
      ),
    );
  }
  return { inject, apply };
  })();
		module.exports.apply = __m4.apply;
		module.exports.inject = __m4.inject;
		return module.exports;
	}
});
