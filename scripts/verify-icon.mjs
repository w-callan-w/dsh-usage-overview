import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
if (origin === undefined) {
  console.error('usage: node scripts/verify-icon.mjs <origin-with-token>');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9617;
const profileDir = await mkdtemp(join(tmpdir(), 'dus-icon-'));
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

  const report = await send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify((() => {
        const rows = [...document.querySelectorAll('[class*="panelRow"]')];
        const target = rows.find((r) => (r.getAttribute('aria-label') ?? '').includes('用量统计'));
        if (target === undefined) return { error: 'usage row not found', rows: rows.map((r) => r.getAttribute('aria-label')) };
        const glyph = target.querySelector('.dus-panel-glyph') ?? target.querySelector('span[aria-hidden]') ?? target;
        const svg = glyph.querySelector('svg');
        const out = { rowFound: true };
        if (svg === null) {
          out.svgFound = false;
          out.glyphHTML = glyph.innerHTML.slice(0, 200);
          return out;
        }
        const paths = [...svg.querySelectorAll('path')];
        const box = svg.getBoundingClientRect();
        out.svgFound = true;
        out.viewBox = svg.getAttribute('viewBox');
        out.strokeWidth = svg.getAttribute('stroke-width');
        out.renderedSize = { w: Math.round(box.width), h: Math.round(box.height) };
        out.pathCount = paths.length;
        out.dialStartsCorrectly = paths.some((p) => (p.getAttribute('d') ?? '').startsWith('M3.4041 13.096'));
        out.hasNeedle = paths.some((p) => (p.getAttribute('d') ?? '').startsWith('M8 8.49994'));
        out.hasFilledHub = paths.some((p) => p.getAttribute('fill') === 'currentColor');
        out.anyPathEmpty = paths.some((p) => (p.getAttribute('d') ?? '') === '');
        return out;
      })(), null, 1)`,
      returnByValue: true,
    },
    sessionId,
  );
  console.log(report.result?.value ?? JSON.stringify(report));
} finally {
  socket.close();
  child.kill();
}
