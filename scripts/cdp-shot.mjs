import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
const out = process.argv[3] ?? 'preview/live-gui.png';
const label = process.argv[4] ?? '用量统计';

if (origin === undefined) {
  console.error('usage: node scripts/cdp-shot.mjs <origin-with-token> <out.png> [label]');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
if (browser === undefined) {
  console.error('no Chromium-based browser found');
  process.exit(1);
}

const port = 9222 + Math.floor(Math.random() * 400);
const profileDir = await mkdtemp(join(tmpdir(), 'dus-cdp-'));

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1400,1300',
    '--force-device-scale-factor=1.5',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

try {
  const version = await waitForDevTools();
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1300, deviceScaleFactor: 1.5, mobile: false }, sessionId);

  await cdp.send('Page.navigate', { url: origin }, sessionId);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const probe = await cdp.send(
      'Runtime.evaluate',
      { expression: `document.querySelector('[class*="panelRow"]') !== null`, returnByValue: true },
      sessionId,
    );
    if (probe.result?.value === true) break;
    await sleep(500);
  }

  const labels = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `JSON.stringify([...document.querySelectorAll('[class*="panelRow"]')].map((r) => r.getAttribute('aria-label') ?? r.textContent ?? ''))`,
      returnByValue: true,
    },
    sessionId,
  );
  console.log(`sidebar entries: ${String(labels.result?.value ?? '[]')}`);

  const clicked = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const rows = [...document.querySelectorAll('[class*="panelRow"]')];
        const target = rows.find((r) => (r.getAttribute('aria-label') ?? '').includes(${JSON.stringify(label)}));
        if (target === undefined) return false;
        target.click();
        return true;
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  console.log(`clicked the ${label} entry: ${String(clicked.result?.value)}`);
  await sleep(4000);

  const panel = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const root = document.querySelector('.dus-root');
        if (root === null) return JSON.stringify({ found: false, bodyText: document.body.innerText.slice(0, 600) });
        return JSON.stringify({
          found: true,
          cards: [...root.querySelectorAll('.dus-card-value')].map((n) => n.textContent),
          heatCells: root.querySelectorAll('.dus-heat-cell').length,
          legend: [...root.querySelectorAll('.dus-legend-item')].map((n) => n.textContent),
          models: [...root.querySelectorAll('.dus-model-row')].map((n) => n.innerText.replace(/\\n/g, ' | ')),
          panelSubs: [...root.querySelectorAll('.dus-panel-sub')].map((n) => n.textContent),
          state: root.querySelector('.dus-state-desc')?.textContent ?? null,
        });
      })()`,
      returnByValue: true,
    },
    sessionId,
  );
  console.log(`panel: ${String(panel.result?.value)}`);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
  await writeFile(out, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${out}`);

  cdp.close();
} finally {
  child.kill();
}
