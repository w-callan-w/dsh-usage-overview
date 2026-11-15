import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
if (origin === undefined) {
  console.error('usage: node scripts/verify-tooltips.mjs <origin-with-token>');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9613;
const profileDir = await mkdtemp(join(tmpdir(), 'dus-tip-'));
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
        const rows = [...document.querySelectorAll('[class*="panelRow"]')];
        const t = rows.find((r) => (r.getAttribute('aria-label') ?? '').includes('用量统计'));
        if (t !== undefined) t.click();
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  await sleep(3500);

  const result = await send(
    'Runtime.evaluate',
    {
      expression: `(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = {};
        const svg = document.querySelector('svg[aria-label="每日 Token 趋势图"]');
        if (svg === null) return JSON.stringify({ error: 'trend svg not found' });
        const r = svg.getBoundingClientRect();
        const before = document.querySelectorAll('.dus-tip').length;
        svg.dispatchEvent(new MouseEvent('mousemove', {
          clientX: r.left + r.width * 0.85,
          clientY: r.top + r.height / 2,
          bubbles: true,
        }));
        await sleep(300);
        const tips = [...document.querySelectorAll('.dus-tip')];
        out.trend = { tipsBefore: before, tipsAfter: tips.length };
        if (tips.length > 0) {
          const tip = tips[tips.length - 1];
          const cs = getComputedStyle(tip);
          const tr = tip.getBoundingClientRect();
          out.trend.position = cs.position;
          out.trend.text = tip.innerText.replace(/\\n/g, ' | ');
          out.trend.rect = { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) };
          out.trend.chartRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          out.trend.overlapsChart =
            tr.y < r.bottom && tr.bottom > r.top && tr.x < r.right && tr.right > r.left;
          out.trend.verticalGap = Math.round(tr.y - r.top);
        }
        const donut = document.querySelector('svg[aria-label="模型用量"]');
        if (donut !== null) {
          const seg = donut.querySelectorAll('circle')[1];
          if (seg !== undefined) {
            const sr = seg.getBoundingClientRect();
            seg.dispatchEvent(new MouseEvent('mouseover', {
              bubbles: true,
              clientX: sr.left + sr.width / 2,
              clientY: sr.top + sr.height / 2,
              relatedTarget: document.body,
            }));
            await sleep(300);
            const dtips = [...document.querySelectorAll('.dus-tip')];
            out.donut = { tipCount: dtips.length };
            const last = dtips[dtips.length - 1];
            if (last !== undefined) {
              const dcs = getComputedStyle(last);
              const dr = last.getBoundingClientRect();
              out.donut.position = dcs.position;
              out.donut.text = last.innerText.replace(/\\n/g, ' | ');
              out.donut.rect = { x: Math.round(dr.x), y: Math.round(dr.y), w: Math.round(dr.width), h: Math.round(dr.height) };
              const donutRect = donut.getBoundingClientRect();
              out.donut.overlapsDonut =
                dr.y < donutRect.bottom && dr.bottom > donutRect.top && dr.x < donutRect.right && dr.right > donutRect.left;
            }
          }
        }
        return JSON.stringify(out, null, 1);
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );
  console.log(result.result?.value ?? JSON.stringify(result));
} finally {
  socket.close();
  child.kill();
}
