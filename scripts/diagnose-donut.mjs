import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
if (origin === undefined) {
  console.error('usage: node scripts/diagnose-donut.mjs <origin-with-token>');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9711;
const profileDir = await mkdtemp(join(tmpdir(), 'dus-donut-'));
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
        const center = () => {
          const c = document.querySelector('.dus-donut-center');
          return c === null ? null : c.innerText.replace(/\\n/g, ' | ');
        };
        const out = { initial: center() };

        const svg = document.querySelector('svg[aria-label="模型用量"]');
        if (svg === null) return JSON.stringify({ error: 'donut svg not found' });
        const enter = (el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
        const leave = (el) => el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

        const seg = svg.querySelectorAll('circle')[1];
        out.segments = svg.querySelectorAll('circle').length - 1;
        enter(seg);
        await sleep(250);
        out.afterRingHover = center();
        out.segStrokeWidth = seg.getAttribute('stroke-width');
        out.segOpacity = seg.getAttribute('opacity');
        leave(seg);
        await sleep(250);
        out.afterLeave = center();
        out.segStrokeWidthAfterLeave = seg.getAttribute('stroke-width');
        const row = document.querySelector('.dus-model-row');
        if (row !== null) {
          enter(row);
          await sleep(250);
          out.afterRowHover = center();
          out.rowActive = row.hasAttribute('data-active');
          leave(row);
          await sleep(200);
          out.afterRowLeave = center();
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
