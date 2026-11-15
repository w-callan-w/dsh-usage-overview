import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
const label = process.argv[3] ?? '用量统计';
if (origin === undefined) {
  console.error('usage: node scripts/diagnose-live.mjs <origin-with-token> [label]');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9700 + Math.floor(Math.random() * 200);
const profileDir = await mkdtemp(join(tmpdir(), 'dus-diag-'));
const child = spawn(
  browser,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${String(port)}`, `--user-data-dir=${profileDir}`, '--window-size=1400,1300', 'about:blank'],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const version = await (async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`);
      if (response.ok) return await response.json();
    } catch {
    }
    await sleep(250);
  }
  throw new Error('DevTools never became ready');
})();

const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (waiter === undefined) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
  });

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1300, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: origin }, sessionId);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const probe = await send('Runtime.evaluate', { expression: `document.querySelector('[class*="panelRow"]') !== null`, returnByValue: true }, sessionId);
    if (probe.result?.value === true) break;
    await sleep(500);
  }

  await send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const buttons = [...document.querySelectorAll('button')];
        const go = buttons.find((b) => (b.textContent ?? '').trim() === '继续');
        if (go !== undefined) { go.click(); return true; }
        return false;
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  await sleep(800);

  await send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const rows = [...document.querySelectorAll('[class*="panelRow"]')];
        const target = rows.find((r) => (r.getAttribute('aria-label') ?? '').includes(${JSON.stringify(label)}));
        if (target !== undefined) target.click();
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  await sleep(3500);

  const report = await send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const out = {};
        const root = document.querySelector('.dus-root');
        if (root === null) return JSON.stringify({ found: false });
        const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };

        out.root = box(root);
        out.accentVar = getComputedStyle(root).getPropertyValue('--dus-accent').trim();
        out.brandVar = getComputedStyle(root).getPropertyValue('--dsw-alias-brand-primary').trim();

        const wrap = root.querySelector('.dus-heat-wrap');
        const heat = root.querySelector('.dus-heat');
        out.heatWrap = wrap ? box(wrap) : null;
        out.heat = heat ? box(heat) : null;
        out.heatColumns = root.querySelectorAll('.dus-heat-col').length;
        out.heatCells = root.querySelectorAll('.dus-heat-cell').length;
        const cells = [...root.querySelectorAll('.dus-heat-cell')];
        out.cellSize = cells.length > 0 ? box(cells[0]) : null;
        const byLevel = {};
        for (const c of cells) {
          const lvl = c.dataset.level ?? '?';
          byLevel[lvl] = (byLevel[lvl] ?? 0) + 1;
        }
        out.cellsByLevel = byLevel;
        out.levelColors = {};
        for (const lvl of ['0','1','2','3','4']) {
          const sample = cells.find((c) => c.dataset.level === lvl);
          if (sample) out.levelColors[lvl] = getComputedStyle(sample).backgroundColor;
        }
        out.monthLabels = [...root.querySelectorAll('.dus-heat-month')].map((n) => n.textContent).filter((t) => t.length > 0);

        const svg = root.querySelector('svg[aria-label="每日 Token 趋势图"]');
        out.trend = svg ? box(svg) : null;
        const ticks = svg ? [...svg.querySelectorAll('text')].map((t) => ({ x: Math.round(Number(t.getAttribute('x'))), text: t.textContent })) : [];
        out.trendTicks = ticks.slice(-8);
        out.trendPaths = svg ? svg.querySelectorAll('path').length : 0;

        const panel = root.querySelectorAll('.dus-panel');
        out.panels = [...panel].map((p) => box(p));
        out.rangeActive = [...root.querySelectorAll('.dus-seg-btn')].filter((b) => b.dataset.active !== undefined).map((b) => b.textContent);
        return JSON.stringify(out, null, 1);
      })()`,
      returnByValue: true,
    },
    sessionId,
  );

  console.log(report.result?.value ?? '(no report)');
} finally {
  socket.close();
  child.kill();
}
