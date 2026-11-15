import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
if (origin === undefined) {
  console.error('usage: node scripts/probe-button.mjs <origin-with-token>');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9511;
const profileDir = await mkdtemp(join(tmpdir(), 'dus-btn-'));
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

  const report = await send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify((() => {
        const names = [
          '--dsw-alias-button-primary-fill',
          '--dsw-alias-button-primary-hover',
          '--dsw-alias-label-primary-foreground',
          '--dsw-alias-label-primary',
          '--dsw-alias-bg-layer-3',
          '--dsw-alias-brand-primary',
        ];
        const probe = document.createElement('div');
        document.body.appendChild(probe);
        const resolved = {};
        for (const name of names) {
          probe.style.backgroundColor = 'var(' + name + ')';
          resolved[name] = getComputedStyle(probe).backgroundColor;
        }
        probe.remove();

        const btn = document.querySelector('.dus-refresh');
        const out = { resolved, buttonFound: btn !== null };
        if (btn !== null) {
          const cs = getComputedStyle(btn);
          const r = btn.getBoundingClientRect();
          out.button = {
            background: cs.backgroundColor,
            color: cs.color,
            borderColor: cs.borderColor,
            position: cs.position,
            right: cs.right,
            bottom: cs.bottom,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            text: btn.innerText,
            innerHTML: btn.innerHTML.slice(0, 160),
            viewport: { w: window.innerWidth, h: window.innerHeight },
          };
        }
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
