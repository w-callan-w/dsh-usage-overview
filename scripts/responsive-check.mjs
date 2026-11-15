import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const previewDir = join(root, 'preview');
const vendorDir = join(previewDir, 'vendor');
const origin = process.argv[2] ?? 'http://127.0.0.1:50494';

const WIDTHS = process.env.DUS_WIDTHS === undefined
  ? [1440, 1080, 820, 640, 480, 390, 320]
  : process.env.DUS_WIDTHS.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));

const VIEWPORT_HEIGHT = 1800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function vendorScript(name, url) {
  const path = join(vendorDir, name);
  if (existsSync(path)) return path;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not download ${url}: HTTP ${String(response.status)}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

async function loadDocument() {
  const snapshot = join(previewDir, 'stats.json');
  if (existsSync(snapshot)) {
    return JSON.parse(await readFile(snapshot, 'utf8'));
  }
  const response = await fetch(`${origin}/plugins/dsh-usage-overview/stats?range=30d`);
  if (!response.ok) throw new Error(`stats route answered HTTP ${String(response.status)}`);
  const text = await response.text();
  await writeFile(snapshot, text, 'utf8');
  return JSON.parse(text);
}

function stressDocument(document) {
  const stress = structuredClone(document);
  const base = stress.models.find((model) => model.total > 0);
  if (base === undefined) return stress;

  const routes = [
    { model: base.model, provider: base.provider, source: base.source, share: 0.55 },
    { model: 'deepseek-reasoner', provider: 'deepseek', source: 'DeepSeek Official', share: 0.21 },
    { model: 'claude-sonnet-4.5-20250929', provider: 'workbuddy-ai', source: 'WorkBuddy AI', share: 0.12 },
    { model: 'gemini-2.5-pro', provider: 'opencode-go', source: 'OpenCode Go', share: 0.08 },
    { model: 'qwen3-coder-plus', provider: 'workbuddy', source: 'WorkBuddy', share: 0.04 },
  ];

  stress.models = routes.map((route) => ({
    ...base,
    model: route.model,
    provider: route.provider,
    source: route.source,
    total: Math.round(base.total * route.share),
    sessions: Math.max(1, Math.round((base.sessions ?? 1) * route.share)),
    turns: Math.max(1, Math.round((base.turns ?? 1) * route.share)),
    calls: Math.max(1, Math.round((base.calls ?? 1) * route.share)),
  }));

  const baseKey = `${base.provider}/${base.model}`;
  for (const day of stress.days) {
    const value = day.byModel?.[baseKey] ?? day.total ?? 0;
    const next = {};
    for (const route of routes) {
      next[`${route.provider}/${route.model}`] = Math.round(value * route.share);
    }
    day.byModel = next;
  }

  return stress;
}

const THEME_DARK = `:root{--dsh-frame-top-clearance:0px;--dsw-alias-bg-base:#151517;--dsw-alias-bg-layer-1:#232324;--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-bg-layer-3:#353638;--dsw-alias-bg-overlay:#61666b;--dsw-alias-border-l1:rgba(255,255,255,.06);--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-border-l3:rgba(255,255,255,.16);--dsw-alias-label-primary:#fafafa;--dsw-alias-label-secondary:#d4d4d4;--dsw-alias-label-tertiary:#a2a4a6;--dsw-alias-label-primary-foreground:#f5f5f5;--dsw-alias-brand-primary:#f9fafb;--dsw-alias-interactive-bg-hover:#3a3a3c;--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-business-primary:#4f8ef7;--dsw-alias-tooltip-bg:#43454a;--dsw-alias-tooltip-label:#ffffff;--dsw-alias-tooltip-key-bg:#5f6066;--dsw-radius-xs:3px;--dsw-radius-sm:5px;--dsw-radius-md:7px;--dsw-radius-lg:11px;--dsw-elevation-soft:0 1px 2px rgba(0,0,0,.3);--dsw-elevation-prominent:0 8px 26px rgba(0,0,0,.5);--dsw-font-family:-apple-system,'Segoe UI','Microsoft YaHei',system-ui,sans-serif}`;

const THEME_LIGHT = `:root{--dsh-frame-top-clearance:0px;--dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#ffffff;--dsw-alias-bg-layer-3:#ffffff;--dsw-alias-bg-overlay:#e9ecf2;--dsw-alias-border-l1:rgba(0,0,0,.04);--dsw-alias-border-l2:rgba(0,0,0,.1);--dsw-alias-border-l3:rgba(0,0,0,.12);--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#81858c;--dsw-alias-label-primary-foreground:#ffffff;--dsw-alias-brand-primary:#0f1115;--dsw-alias-interactive-bg-hover:#f5f5f5;--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-business-primary:#3b82f6;--dsw-alias-tooltip-bg:#2c2c2e;--dsw-alias-tooltip-label:#ffffff;--dsw-alias-tooltip-key-bg:#57575a;--dsw-radius-xs:3px;--dsw-radius-sm:5px;--dsw-radius-md:7px;--dsw-radius-lg:11px;--dsw-elevation-soft:0 1px 2px rgba(0,0,0,.08);--dsw-elevation-prominent:0 8px 26px rgba(0,0,0,.18);--dsw-font-family:-apple-system,'Segoe UI','Microsoft YaHei',system-ui,sans-serif}`;

async function writeHarness(documentText, name = 'responsive-harness.html', theme = THEME_DARK) {
  await mkdir(vendorDir, { recursive: true });
  await Promise.all([
    vendorScript('react.production.min.js', 'https://unpkg.com/react@18.3.1/umd/react.production.min.js'),
    vendorScript('react-dom.production.min.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js'),
    copyFile(join(root, 'lib', 'client.js'), join(previewDir, 'client.js')),
  ]);

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>用量统计 — 自适应检查</title>
<style>
${theme}
html, body, #root { height: 100%; margin: 0; }
body { background: var(--dsw-alias-bg-base); overflow-x: hidden; }
</style></head>
<body><div id="root"></div>
<script>window.__USAGE_DOCUMENT__ = ${documentText};</script>
<script>window.__pluginDefinition__ = null;
window.__ModuleLoader__ = { load: (definition) => { window.__pluginDefinition__ = definition; } };</script>
<script src="./client.js"></script>
<script src="./vendor/react.production.min.js"></script>
<script src="./vendor/react-dom.production.min.js"></script>
<script>
(() => {
  const definition = window.__pluginDefinition__;
  if (definition === null) throw new Error('the plugin bundle did not register');
  const React = window.React;
  if (React === undefined) throw new Error('React did not load');
  const module = definition.factory((name) => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement };
    throw new Error('unexpected external: ' + name);
  });
  let component = null;
  module.apply({
    effect: (fn) => { fn(); },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (slot, register) => { if (slot === 'main') register(); },
      register: (options, next) => {
        if (options.key === 'usage-overview') component = next;
        return { options, component: next };
      },
    },
  });
  if (component === null) throw new Error('the dashboard component did not register');
  window.fetch = async (url) => {
    if (String(url).includes('/plugins/dsh-usage-overview/stats')) {
      return { ok: true, status: 200, json: async () => window.__USAGE_DOCUMENT__ };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.__dashboardRoot__ = ReactDOM.createRoot(document.getElementById('root'));
  window.__dashboardRoot__.render(React.createElement(component, {}));
})();
</script>
</body></html>`;

  const path = join(previewDir, name);
  await writeFile(path, html, 'utf8');
  return path;
}

class Cdp {
  #socket;
  #nextId = 1;
  #pending = new Map();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const waiter = this.#pending.get(message.id);
      if (waiter === undefined) return;
      this.#pending.delete(message.id);
      if (message.error !== undefined) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
    });
  }

  close() {
    this.#socket.close();
  }
}

function measureExpression() {
  return `(() => {
    const root = document.querySelector('.dus-root');
    if (root === null) return { ok: false, error: 'dashboard root missing' };
    const cards = [...root.querySelectorAll('.dus-card')];
    const rows = new Map();
    const rowWidths = new Map();
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const top = Math.round(rect.top);
      rows.set(top, (rows.get(top) ?? 0) + 1);
      rowWidths.set(top, (rowWidths.get(top) ?? 0) + rect.width);
    }
    const cardRows = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
    const cardRowWidths = [...rowWidths.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([top, width]) => Math.round(width + (rows.get(top) - 1)));
    const cardsBox = root.querySelector('.dus-cards');
    const cardContentWidth = cardsBox.clientWidth;
    const chartOf = (kind) => {
      const chartHost = root.querySelector('.dus-chart-host[data-chart="' + kind + '"]');
      if (chartHost === null) return null;
      const chartSvg = chartHost.querySelector('svg');
      if (chartSvg === null) return null;
      const box = chartSvg.getAttribute('viewBox').split(/\\s+/).map(Number);
      return {
        hostWidth: chartHost.clientWidth,
        viewBoxWidth: box[2],
        viewBoxHeight: box[3],
        viewBoxRaw: chartSvg.getAttribute('viewBox'),
        svgWidth: chartSvg.getAttribute('width'),
        svgHeight: chartSvg.getAttribute('height'),
        renderedWidth: Math.round(chartSvg.getBoundingClientRect().width),
        renderedHeight: Math.round(chartSvg.getBoundingClientRect().height),
      };
    };
    const chart = chartOf('tokens');
    const cacheChart = chartOf('cache');
    const modelChart = chartOf('models');
    const heat = root.querySelector('.dus-heat-wrap');
    const split = root.querySelector('.dus-split');
    const donut = root.querySelector('.dus-donut-wrap svg');
    const donutWrap = root.querySelector('.dus-donut-wrap');
    const modelList = root.querySelector('.dus-model-list');
    const refresh = root.querySelector('.dus-refresh');
    const panelOverflow = [...root.querySelectorAll('.dus-panel')].map((panel) => panel.scrollWidth - panel.clientWidth);
    const visible = (node) => node !== null && getComputedStyle(node).display !== 'none';
    return {
      ok: true,
      viewport: window.innerWidth,
      root: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      shellWidth: root.querySelector('.dus-shell').clientWidth,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      cardRows,
      cardRowWidths,
      cardContentWidth,
      titleSize: parseFloat(getComputedStyle(root.querySelector('.dus-title')).fontSize),
      panelPadding: getComputedStyle(root.querySelector('.dus-panel')).padding,
      chart,
      cacheChart,
      modelChart,
      heat: heat === null ? null : {
        clientWidth: heat.clientWidth,
        scrollWidth: heat.scrollWidth,
        scrollLeft: Math.round(heat.scrollLeft),
        cell: Number(heat.getAttribute('data-cell')),
        overflowing: heat.hasAttribute('data-overflow'),
        hintVisible: visible(root.querySelector('.dus-heat-hint')),
      },
      split: split === null ? null : {
        wrapped: donutWrap !== null && modelList !== null &&
          modelList.getBoundingClientRect().left <= donutWrap.getBoundingClientRect().left + 2,
      },
      modelRows: [...root.querySelectorAll('.dus-model-row')].length,
      stackBars: [...root.querySelectorAll('.dus-stack-bar')].length,
      stackSegments: [...root.querySelectorAll('.dus-stack-seg')].length,
      donutWidth: donut === null ? 0 : Math.round(donut.getBoundingClientRect().width),
      refresh: refresh === null ? null : (() => {
        const rect = refresh.getBoundingClientRect();
        return {
          left: Math.round(rect.left), right: Math.round(rect.right),
          width: Math.round(rect.width), labelVisible: visible(refresh.querySelector('span')),
        };
      })(),
      panelOverflow,
    };
  })()`;
}

function contrastExpression() {
  return `(() => {
    const parse = (value) => {
      const match = String(value).match(/rgba?\\(([^)]+)\\)/);
      if (match === null) return null;
      const parts = match[1].split(',').map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
    };
    const luminance = (color) => {
      const channel = (value) => {
        const unit = value / 255;
        return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const contrast = (a, b) => {
      const high = Math.max(luminance(a), luminance(b));
      const low = Math.min(luminance(a), luminance(b));
      return (high + 0.05) / (low + 0.05);
    };
    const composite = (fg, bg, alpha) => ({
      r: fg.r * alpha + bg.r * (1 - alpha),
      g: fg.g * alpha + bg.g * (1 - alpha),
      b: fg.b * alpha + bg.b * (1 - alpha),
      a: 1,
    });
    const backgroundOf = (node) => {
      let current = node;
      while (current !== null) {
        const color = parse(getComputedStyle(current).backgroundColor);
        if (color !== null && color.a > 0) return color;
        current = current.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
    };
    const inspect = (name, node, background, opacity = 1) => {
      if (node === null) return { name, missing: true };
      const style = getComputedStyle(node);
      const source = node instanceof SVGTextElement ? style.fill : style.color;
      const fg = parse(source);
      if (fg === null) return { name, missing: true };
      const bg = background ?? backgroundOf(node);
      const effective = composite(fg, bg, opacity);
      return {
        name,
        foreground: source,
        background: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
        ratio: Number(contrast(effective, bg).toFixed(2)),
      };
    };

    const items = [];
    const tooltip = document.querySelector('.dus-tip');
    if (tooltip !== null) {
      const surface = parse(getComputedStyle(tooltip).backgroundColor);
      const title = tooltip.querySelector('.dus-tip-title');
      const row = tooltip.querySelector('.dus-tip-row');
      if (surface !== null) {
        items.push(inspect('tooltip title', title, surface));
        if (row !== null) {
          items.push(inspect('tooltip row', row, surface, Number(getComputedStyle(row).opacity) || 1));
        }
      }
    }
    for (const [name, selector] of [
      ['card label', '.dus-card-label'],
      ['panel subtitle', '.dus-panel-sub'],
      ['model meta', '.dus-model-meta'],
      ['model percent', '.dus-model-pct'],
      ['legend value', '.dus-legend-val'],
      ['model trend note', '.dus-bars-note'],
      ['heatmap month', '.dus-heat-month span'],
      ['chart axis', '.dus-chart-host[data-chart="tokens"] text'],
    ]) {
      items.push(inspect(name, document.querySelector(selector)));
    }
    return { body: getComputedStyle(document.body).backgroundColor, items };
  })()`;
}

async function waitForDashboard(cdp, sessionId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const probe = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `document.querySelector('.dus-cards') !== null && document.querySelector('.dus-chart-host[data-chart="tokens"] svg') !== null && document.querySelector('.dus-chart-host[data-chart="cache"] svg') !== null`,
        returnByValue: true,
      },
      sessionId,
    );
    if (probe.result?.value === true) return true;
    await sleep(200);
  }
  return false;
}

async function measureLayout(cdp, sessionId) {
  const measured = await cdp.send(
    'Runtime.evaluate',
    { expression: measureExpression(), returnByValue: true },
    sessionId,
  );
  return measured.result?.value;
}

const CARD_BASIS = 150;

const CARD_GAP = 1;

function expectedCardRows(contentWidth) {
  const perRow = Math.min(6, Math.max(1, Math.floor((contentWidth + CARD_GAP) / (CARD_BASIS + CARD_GAP))));
  const rows = [];
  for (let remaining = 6; remaining > 0; remaining -= perRow) rows.push(Math.min(perRow, remaining));
  return rows;
}

const browser = browsers.find((path) => existsSync(path));
if (browser === undefined) {
  console.error('no Chromium-based browser found');
  process.exit(1);
}

await mkdir(previewDir, { recursive: true });
const usageDocument = await loadDocument();
const harness = await writeHarness(JSON.stringify(usageDocument));
const stressHarness = await writeHarness(
  JSON.stringify(stressDocument(usageDocument)),
  'responsive-harness-stress.html',
);
const lightHarness = await writeHarness(
  JSON.stringify(usageDocument),
  'responsive-harness-light.html',
  THEME_LIGHT,
);
const port = 9300 + Math.floor(Math.random() * 300);
const profileDir = await mkdtemp(join(tmpdir(), 'dus-responsive-'));

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${String(port)}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevTools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`);
      if (response.ok) return await response.json();
    } catch {
    }
    await sleep(250);
  }
  throw new Error('DevTools endpoint never became ready');
}

const failures = [];
const fail = (label, detail) => {
  failures.push(`${label}: ${detail}`);
  console.log(`FAIL  ${label}  (${detail})`);
};
const pass = (label, detail) => {
  console.log(`PASS  ${label}${detail === undefined ? '' : `  (${detail})`}`);
};

try {
  const version = await waitForDevTools();
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  const report = [];
  for (const width of WIDTHS) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: width <= 640 },
      sessionId,
    );
    await cdp.send('Page.navigate', { url: `file:///${harness.replace(/\\/g, '/')}` }, sessionId);

    if (!(await waitForDashboard(cdp, sessionId))) {
      fail(`w=${String(width)} harness settles`, 'dashboard or chart never rendered');
      continue;
    }
    await sleep(700);

    const result = await measureLayout(cdp, sessionId);
    if (result?.ok !== true) {
      fail(`w=${String(width)} measurement`, JSON.stringify(result));
      continue;
    }
    report.push({ width, ...result });

    console.log(
      `\nw=${String(width)}  cards=${result.cardRows.join('+')}  charts=${String(result.chart?.viewBoxWidth)}x${String(result.chart?.viewBoxHeight)}/${String(result.cacheChart?.viewBoxWidth)}x${String(result.cacheChart?.viewBoxHeight)}/${String(result.modelChart?.viewBoxWidth)}x${String(result.modelChart?.viewBoxHeight)}  ` +
        `heat=${result.heat.cell}px/${result.heat.overflowing ? 'scroll' : 'fit'}  donut=${String(result.donutWidth)}px  title=${String(result.titleSize)}px`,
    );

    const expectedRows = expectedCardRows(result.cardContentWidth);
    const rowsMatch = JSON.stringify(result.cardRows) === JSON.stringify(expectedRows);
    const rowsFilled = result.cardRowWidths.every(
      (rowWidth) => Math.abs(rowWidth - result.cardContentWidth) <= 2,
    );
    if (!rowsMatch || !rowsFilled) {
      fail(
        `w=${String(width)} stat cards flow`,
        `content ${String(result.cardContentWidth)}px -> rows ${result.cardRows.join('+')} widths ${result.cardRowWidths.join('/')}, want ${expectedRows.join('+')} each ${String(result.cardContentWidth)}`,
      );
    } else {
      pass(`w=${String(width)} stat cards flow`, `${result.cardRows.join('+')} (${String(result.cardContentWidth)}px lines)`);
    }

    if (width <= 480 && result.split !== null && !result.split.wrapped) {
      fail(`w=${String(width)} model panel wraps when it cannot share a line`, 'still side by side');
    } else if (width >= 820 && result.split?.wrapped) {
      fail(`w=${String(width)} model panel keeps the donut beside the list`, 'wrapped early');
    } else pass(`w=${String(width)} model panel wrap follows content`);

    if (result.modelRows < 1 || result.stackBars < 1 || result.stackSegments < 1) {
      fail(
        `w=${String(width)} model usage trend rendered`,
        `${String(result.modelRows)} rows / ${String(result.stackBars)} bars / ${String(result.stackSegments)} segments`,
      );
    } else {
      pass(`w=${String(width)} model usage trend rendered`, `${String(result.stackBars)} bars / ${String(result.stackSegments)} segments`);
    }

    if (result.documentOverflow > 0) fail(`w=${String(width)} page has no horizontal overflow`, `${String(result.documentOverflow)}px`);
    else pass(`w=${String(width)} page has no horizontal overflow`);
    if (result.root.scrollWidth > result.root.clientWidth) fail(`w=${String(width)} root has no horizontal overflow`, `${String(result.root.scrollWidth - result.root.clientWidth)}px`);
    else pass(`w=${String(width)} root has no horizontal overflow`);
    if (result.panelOverflow.some((value) => value > 0)) fail(`w=${String(width)} panels have no horizontal overflow`, result.panelOverflow.join(','));
    else pass(`w=${String(width)} panels have no horizontal overflow`);

    for (const [kind, chart] of [
      ['trend', result.chart],
      ['cache', result.cacheChart],
      ['models', result.modelChart],
    ]) {
      if (chart === null) {
        fail(`w=${String(width)} ${kind} chart rendered`, 'no svg');
        continue;
      }
      if (Math.abs(chart.viewBoxWidth - chart.hostWidth) > 2) {
        fail(`w=${String(width)} ${kind} chart follows its container`, `viewBox ${String(chart.viewBoxWidth)}, host ${String(chart.hostWidth)}`);
      } else pass(`w=${String(width)} ${kind} chart follows its container`, `${String(chart.viewBoxWidth)}px`);
      if (Math.round(chart.renderedWidth) !== chart.hostWidth) {
        fail(`w=${String(width)} ${kind} chart paints at measured width`, `${String(chart.renderedWidth)} vs ${String(chart.hostWidth)}`);
      } else pass(`w=${String(width)} ${kind} chart paints at measured width`);
    }

    if (width <= 480) {
      if (!result.heat.overflowing) fail(`w=${String(width)} heatmap reports overflow`, 'no data-overflow');
      else pass(`w=${String(width)} heatmap reports overflow`);
      const maxScroll = result.heat.scrollWidth - result.heat.clientWidth;
      if (maxScroll > 0 && Math.abs(result.heat.scrollLeft - maxScroll) > 3) {
        fail(`w=${String(width)} heatmap opens at newest weeks`, `scrollLeft ${String(result.heat.scrollLeft)} of ${String(maxScroll)}`);
      } else pass(`w=${String(width)} heatmap opens at newest weeks`);
      if (!result.heat.hintVisible) fail(`w=${String(width)} heatmap scroll hint visible`, 'hidden');
      else pass(`w=${String(width)} heatmap scroll hint visible`);
    }

    if (result.refresh !== null && !result.refresh.labelVisible) {
      fail(`w=${String(width)} refresh keeps its label`, 'hidden');
    } else pass(`w=${String(width)} refresh keeps its label`);

    if (result.refresh !== null && (result.refresh.left < 0 || result.refresh.right > width)) {
      fail(`w=${String(width)} refresh stays inside the viewport`, `${String(result.refresh.left)}..${String(result.refresh.right)}`);
    } else pass(`w=${String(width)} refresh stays inside the viewport`);

    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          document.documentElement.style.height = 'auto';
          document.body.style.height = 'auto';
          document.getElementById('root').style.height = 'auto';
          const root = document.querySelector('.dus-root');
          root.style.height = 'auto';
          root.style.overflow = 'visible';
          const refresh = document.querySelector('.dus-refresh');
          if (refresh !== null) refresh.style.display = 'none';
        })()`,
      },
      sessionId,
    );
    await sleep(250);
    const scrollHeight = await cdp.send(
      'Runtime.evaluate',
      { expression: 'document.documentElement.scrollHeight', returnByValue: true },
      sessionId,
    );
    const shot = await cdp.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.max(400, scrollHeight.result?.value ?? VIEWPORT_HEIGHT), scale: 1 },
      },
      sessionId,
    );
    await writeFile(join(previewDir, `responsive-${String(width)}.png`), Buffer.from(shot.data, 'base64'));

    if (width === 1080) {
      const bounds = await cdp.send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const node = document.querySelector('.dus-chart-host[data-chart="cache"]');
            if (node === null) return null;
            const rect = node.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          })()`,
          returnByValue: true,
        },
        sessionId,
      );
      const rect = bounds.result?.value;
      if (rect === null || rect === undefined) {
        fail('cache chart tooltip', 'chart host missing');
      } else {
        await cdp.send(
          'Input.dispatchMouseEvent',
          {
            type: 'mouseMoved',
            x: Math.round(rect.x + rect.width * 0.82),
            y: Math.round(rect.y + rect.height / 2),
          },
          sessionId,
        );
        await sleep(250);
        const tip = await cdp.send(
          'Runtime.evaluate',
          { expression: `document.querySelector('.dus-tip')?.innerText ?? ''`, returnByValue: true },
          sessionId,
        );
        const text = tip.result?.value ?? '';
        if (/缓存命中率 \d+\.\d{2}%/.test(text) && text.includes('输入合计')) {
          pass('cache chart tooltip', text.replace(/\n/g, ' / '));
        } else {
          fail('cache chart tooltip', JSON.stringify(text));
        }
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }, sessionId);
      }

      const modelBounds = await cdp.send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const node = document.querySelector('.dus-chart-host[data-chart="models"]');
            if (node === null) return null;
            const rect = node.getBoundingClientRect();
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          })()`,
          returnByValue: true,
        },
        sessionId,
      );
      const modelRect = modelBounds.result?.value;
      if (modelRect === null || modelRect === undefined) {
        fail('model usage trend tooltip', 'chart host missing');
      } else {
        const hoverY = Math.round(Math.min(modelRect.y + modelRect.height / 2, VIEWPORT_HEIGHT - 30));
        await cdp.send(
          'Input.dispatchMouseEvent',
          {
            type: 'mouseMoved',
            x: Math.round(modelRect.x + modelRect.width * 0.9),
            y: hoverY,
          },
          sessionId,
        );
        await sleep(250);
        const tip = await cdp.send(
          'Runtime.evaluate',
          { expression: `document.querySelector('.dus-tip')?.innerText ?? ''`, returnByValue: true },
          sessionId,
        );
        const text = tip.result?.value ?? '';
        if (text.includes('总计') && text.includes('tokens')) {
          pass('model usage trend tooltip', text.replace(/\n/g, ' / ').slice(0, 160));
        } else {
          fail('model usage trend tooltip', JSON.stringify(text));
        }
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }, sessionId);
      }
    }
  }

  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1440, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  await cdp.send('Page.navigate', { url: `file:///${harness.replace(/\\/g, '/')}` }, sessionId);
  if (!(await waitForDashboard(cdp, sessionId))) {
    fail('resize harness settles', 'dashboard never rendered');
  } else {
    await sleep(700);
    console.log('\n--- live resize, no reload ---');
    for (const step of [{ width: 640 }, { width: 390 }, { width: 1024 }]) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: step.width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: step.width <= 640 },
        sessionId,
      );
      await sleep(900);
      const next = await measureLayout(cdp, sessionId);
      if (next?.ok !== true) {
        fail(`resize to ${String(step.width)} measures`, JSON.stringify(next));
        continue;
      }
      report.push({ width: `resize-${String(step.width)}`, ...next });
      console.log(
        `resize -> ${String(step.width)}  cards=${next.cardRows.join('+')}  charts=${String(next.chart?.viewBoxWidth)}x${String(next.chart?.viewBoxHeight)}/${String(next.cacheChart?.viewBoxWidth)}x${String(next.cacheChart?.viewBoxHeight)}/${String(next.modelChart?.viewBoxWidth)}x${String(next.modelChart?.viewBoxHeight)}`,
      );
      const expectedRows = expectedCardRows(next.cardContentWidth);
      const rowsMatch = JSON.stringify(next.cardRows) === JSON.stringify(expectedRows);
      const rowsFilled = next.cardRowWidths.every(
        (rowWidth) => Math.abs(rowWidth - next.cardContentWidth) <= 2,
      );
      if (!rowsMatch || !rowsFilled) {
        fail(
          `resize to ${String(step.width)} flows cards`,
          `rows ${next.cardRows.join('+')} widths ${next.cardRowWidths.join('/')}, want ${expectedRows.join('+')}`,
        );
      } else pass(`resize to ${String(step.width)} flows cards`, next.cardRows.join('+'));
      for (const [kind, chart] of [
        ['trend', next.chart],
        ['cache', next.cacheChart],
        ['models', next.modelChart],
      ]) {
        if (chart === null) {
          fail(`resize to ${String(step.width)} ${kind} chart present`, 'no svg');
          continue;
        }
        if (Math.abs(chart.viewBoxWidth - chart.hostWidth) > 2) {
          fail(`resize to ${String(step.width)} ${kind} chart remeasures`, `viewBox ${String(chart.viewBoxWidth)}, host ${String(chart.hostWidth)}`);
        } else pass(`resize to ${String(step.width)} ${kind} chart remeasures`, `${String(chart.viewBoxWidth)}px`);
      }
      const expectWrapped = step.width <= 480;
      if (next.split !== null && next.split.wrapped !== expectWrapped) {
        fail(
          `resize to ${String(step.width)} model panel follows its width`,
          expectWrapped ? 'still side by side' : 'wrapped early',
        );
      } else {
        pass(`resize to ${String(step.width)} model panel follows its width`, expectWrapped ? 'wrapped' : 'side by side');
      }
      if (next.modelRows < 1 || next.stackBars < 1 || next.stackSegments < 1) {
        fail(
          `resize to ${String(step.width)} model usage trend rendered`,
          `${String(next.modelRows)} rows / ${String(next.stackBars)} bars / ${String(next.stackSegments)} segments`,
        );
      } else pass(`resize to ${String(step.width)} model usage trend rendered`, `${String(next.stackBars)} bars`);
      if (next.root.scrollWidth > next.root.clientWidth) {
        fail(`resize to ${String(step.width)} has no horizontal overflow`, `${String(next.root.scrollWidth - next.root.clientWidth)}px`);
      } else pass(`resize to ${String(step.width)} has no horizontal overflow`);
      if (next.heat.overflowing) {
        const maxScroll = next.heat.scrollWidth - next.heat.clientWidth;
        if (maxScroll > 0 && Math.abs(next.heat.scrollLeft - maxScroll) > 3) {
          fail(`resize to ${String(step.width)} keeps newest weeks in view`, `scrollLeft ${String(next.heat.scrollLeft)} of ${String(maxScroll)}`);
        } else pass(`resize to ${String(step.width)} keeps newest weeks in view`);
        if (!next.heat.hintVisible) fail(`resize to ${String(step.width)} shows heatmap hint`, 'hidden');
        else pass(`resize to ${String(step.width)} shows heatmap hint`);
      }
    }
  }

  console.log('\n--- multi-model trend ---');
  for (const width of [1080, 390, 320]) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: width <= 640 },
      sessionId,
    );
    await cdp.send('Page.navigate', { url: `file:///${stressHarness.replace(/\\/g, '/')}` }, sessionId);
    if (!(await waitForDashboard(cdp, sessionId))) {
      fail(`stress w=${String(width)} harness settles`, 'dashboard never rendered');
      continue;
    }
    await sleep(700);
    const next = await measureLayout(cdp, sessionId);
    if (next?.ok !== true) {
      fail(`stress w=${String(width)} measures`, JSON.stringify(next));
      continue;
    }
    report.push({ width: `stress-${String(width)}`, ...next });
    console.log(
      `stress w=${String(width)}  modelRows=${String(next.modelRows)}  stack=${String(next.stackBars)} bars/${String(next.stackSegments)} segs  donut=${String(next.donutWidth)}px`,
    );
    if (next.modelRows !== 5) {
      fail(`stress w=${String(width)} renders five model rows`, `${String(next.modelRows)} rows`);
    } else pass(`stress w=${String(width)} renders five model rows`);
    if (next.stackBars < 1 || next.stackSegments < 5) {
      fail(`stress w=${String(width)} stacks every model`, `${String(next.stackBars)} bars / ${String(next.stackSegments)} segments`);
    } else pass(`stress w=${String(width)} stacks every model`, `${String(next.stackBars)} bars / ${String(next.stackSegments)} segments`);
    if (next.modelChart === null || Math.abs(next.modelChart.viewBoxWidth - next.modelChart.hostWidth) > 2) {
      fail(`stress w=${String(width)} model chart follows its container`, JSON.stringify(next.modelChart));
    } else pass(`stress w=${String(width)} model chart follows its container`, `${String(next.modelChart.viewBoxWidth)}px`);
    if (next.panelOverflow.some((value) => value > 0) || next.root.scrollWidth > next.root.clientWidth) {
      fail(`stress w=${String(width)} has no overflow`, `panels=${next.panelOverflow.join(',')}`);
    } else pass(`stress w=${String(width)} has no overflow`);

    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          document.documentElement.style.height = 'auto';
          document.body.style.height = 'auto';
          document.getElementById('root').style.height = 'auto';
          const root = document.querySelector('.dus-root');
          root.style.height = 'auto';
          root.style.overflow = 'visible';
          const refresh = document.querySelector('.dus-refresh');
          if (refresh !== null) refresh.style.display = 'none';
        })()`,
      },
      sessionId,
    );
    await sleep(250);
    const scrollHeight = await cdp.send(
      'Runtime.evaluate',
      { expression: 'document.documentElement.scrollHeight', returnByValue: true },
      sessionId,
    );
    const shot = await cdp.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.max(400, scrollHeight.result?.value ?? VIEWPORT_HEIGHT), scale: 1 },
      },
      sessionId,
    );
    await writeFile(join(previewDir, `responsive-stress-${String(width)}.png`), Buffer.from(shot.data, 'base64'));

    if (width === 1080) {
      const clicked = await cdp.send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const button = [...document.querySelectorAll('.dus-trend-toggle .dus-seg-btn')]
              .find((node) => node.textContent.trim() === '每周');
            if (button === undefined) return false;
            button.click();
            return true;
          })()`,
          returnByValue: true,
        },
        sessionId,
      );
      if (clicked.result?.value !== true) {
        fail('model trend weekly toggle', 'button missing');
      } else {
        await sleep(450);
        const weekly = await measureLayout(cdp, sessionId);
        if (weekly?.ok !== true) {
          fail('model trend weekly toggle', JSON.stringify(weekly));
        } else {
          report.push({ width: 'stress-weekly-1080', ...weekly });
          console.log(
            `stress weekly 1080  stack=${String(weekly.stackBars)} bars/${String(weekly.stackSegments)} segs`,
          );
          if (weekly.stackBars >= next.stackBars || weekly.stackBars < 3) {
            fail(
              'model trend weekly toggle folds days into weeks',
              `${String(next.stackBars)} daily -> ${String(weekly.stackBars)} weekly`,
            );
          } else pass('model trend weekly toggle folds days into weeks', `${String(weekly.stackBars)} weeks`);
          if (weekly.stackSegments < 1) {
            fail('model trend weekly toggle keeps model segments', 'none');
          } else pass('model trend weekly toggle keeps model segments', `${String(weekly.stackSegments)} segments`);
        }
      }
    }
  }

  console.log('\n--- light/dark contrast ---');
  for (const themeRun of [
    { name: 'dark', url: harness },
    { name: 'light', url: lightHarness },
  ]) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1080, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await cdp.send('Page.navigate', { url: `file:///${themeRun.url.replace(/\\/g, '/')}` }, sessionId);
    if (!(await waitForDashboard(cdp, sessionId))) {
      fail(`${themeRun.name} theme harness settles`, 'dashboard never rendered');
      continue;
    }
    await sleep(700);

    const bounds = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const node = document.querySelector('.dus-chart-host[data-chart="cache"]');
          if (node === null) return null;
          const rect = node.getBoundingClientRect();
          return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
        })()`,
        returnByValue: true,
      },
      sessionId,
    );
    const rect = bounds.result?.value;
    if (rect === null || rect === undefined) {
      fail(`${themeRun.name} theme tooltip`, 'cache chart host missing');
      continue;
    }
    await cdp.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseMoved',
        x: Math.round(rect.x + rect.width * 0.82),
        y: Math.round(rect.y + rect.height / 2),
      },
      sessionId,
    );
    await sleep(250);

    const contrast = await cdp.send(
      'Runtime.evaluate',
      { expression: contrastExpression(), returnByValue: true },
      sessionId,
    );
    const info = contrast.result?.value;
    const items = Array.isArray(info?.items) ? info.items : [];
    const title = items.find((item) => item.name === 'tooltip title');
    if (title === undefined || title.missing === true) {
      fail(`${themeRun.name} theme tooltip present`, 'not found');
    }
    const failures = items.filter((item) => item.missing === true || item.ratio < 4.5);
    if (failures.length > 0) {
      for (const item of failures) {
        fail(
          `${themeRun.name} theme contrast: ${item.name}`,
          item.missing === true ? 'missing' : `${String(item.ratio)}:1 (${item.foreground} on ${item.background})`,
        );
      }
    } else {
      const minimum = Math.min(...items.map((item) => item.ratio));
      pass(`${themeRun.name} theme contrast`, `min ${minimum.toFixed(2)}:1 over ${String(items.length)} samples`);
    }

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(previewDir, `theme-${themeRun.name}.png`), Buffer.from(shot.data, 'base64'));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 }, sessionId);
  }

  await writeFile(join(previewDir, 'responsive-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  cdp.close();
} finally {
  child.kill();
}

console.log('');
if (failures.length > 0) {
  console.log(`${String(failures.length)} RESPONSIVE CHECK(S) FAILED`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`ALL RESPONSIVE CHECKS PASSED — ${String(WIDTHS.length)} widths, screenshots in preview/`);
}
