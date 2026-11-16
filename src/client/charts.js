import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';

import { SERIES_COLORS, cacheHitRate, formatPercent, formatTokensZh } from '../protocol.js';

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

export function TokenHeatmap({ days, rangeDays, now }) {
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

export function TokenTrend({ days, series, rangeDays }) {
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

export function TokenCacheRate({ days, rangeDays }) {
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
        'div',
        { className: 'dus-legend' },
        h(
          'div',
          { className: 'dus-legend-item' },
          h('span', { className: 'dus-legend-dot', style: { background: color } }),
          h('span', null, '每日命中率'),
          h('span', { className: 'dus-legend-val' }, `纵轴 ${String(plot.low)}–100%`),
        ),
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

export function ModelDonut({ models }) {
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

export function ModelUsageChart({ days, models, rangeDays }) {
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
