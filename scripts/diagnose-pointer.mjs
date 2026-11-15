import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
if (origin === undefined) {
  console.error('usage: node scripts/diagnose-pointer.mjs <origin-with-token>');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9611;
const profileDir = await mkdtemp(join(tmpdir(), 'dus-ptr-'));
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
        const target = rows.find((r) => (r.getAttribute('aria-label') ?? '').includes('用量统计'));
        if (target !== undefined) target.click();
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  await sleep(3500);

  const geometry = await send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify((() => {
        const svg = document.querySelector('svg[aria-label="每日 Token 趋势图"]');
        if (svg === null) return { found: false };
        const r = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const ctm = svg.getScreenCTM();
        return {
          found: true,
          rendered: { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left) },
          viewBox: { w: vb.width, h: vb.height },
          preserveAspectRatio: svg.getAttribute('preserveAspectRatio') ?? '(default: xMidYMid meet)',
          ctm: { a: Number(ctm.a.toFixed(4)), d: Number(ctm.d.toFixed(4)), e: Number(ctm.e.toFixed(2)), f: Number(ctm.f.toFixed(2)) },
        };
      })())`,
      returnByValue: true,
    },
    sessionId,
  );
  console.log('geometry:', geometry.result?.value);

  const probe = await send(
    'Runtime.evaluate',
    {
      expression: `(async () => {
        const svg = document.querySelector('svg[aria-label="每日 Token 趋势图"]');
        if (svg === null) return JSON.stringify({ found: false });
        const r = svg.getBoundingClientRect();
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const out = [];
        for (const fraction of [0.06, 0.25, 0.5, 0.75, 0.94, 0.99]) {
          const clientX = r.left + r.width * fraction;
          const clientY = r.top + r.height / 2;
          svg.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
          await sleep(120);
          const title = document.querySelector('.dus-tip-title')?.textContent ?? null;
          const cross = svg.querySelector('line[stroke*="border"]');
          const dot = svg.querySelector('circle');
          out.push({
            fraction,
            clientX: Math.round(clientX),
            selectedDay: title,
            crosshairX: cross === null ? null : Number(Number(cross.getAttribute('x1')).toFixed(1)),
            dotX: dot === null ? null : Number(Number(dot.getAttribute('cx')).toFixed(1)),
          });
        }
        return JSON.stringify(out, null, 1);
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );
  console.log('hover probes:', probe.result?.value);
} finally {
  socket.close();
  child.kill();
}
