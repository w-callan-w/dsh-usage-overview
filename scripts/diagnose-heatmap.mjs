import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2];
if (origin === undefined) {
  console.error('usage: node scripts/diagnose-heatmap.mjs <origin-with-token>');
  process.exit(1);
}

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = browsers.find((path) => existsSync(path));
const port = 9615;
const profileDir = await mkdtemp(join(tmpdir(), 'dus-heat-'));
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
        const out = {};
        const months = document.querySelector('.dus-heat-months');
        const grid = document.querySelector('.dus-heat');
        const cols = [...document.querySelectorAll('.dus-heat-col')];
        if (months === null || grid === null) return { error: 'heatmap not found' };

        const mcs = getComputedStyle(months);
        const gcs = getComputedStyle(grid);
        out.monthRow = { gap: mcs.gap, columnGap: mcs.columnGap, width: Math.round(months.getBoundingClientRect().width) };
        out.grid = { gap: gcs.gap, columnGap: gcs.columnGap, width: Math.round(grid.getBoundingClientRect().width), columns: cols.length };
        const monthEls = [...months.children];
        out.monthAdvance = monthEls.length > 1
          ? Math.round((monthEls[1].offsetLeft - monthEls[0].offsetLeft) * 100) / 100
          : null;
        out.columnAdvance = cols.length > 1 ? cols[1].offsetLeft - cols[0].offsetLeft : null;
        const sample = monthEls.find((el) => (el.textContent ?? '').length > 0);
        if (sample !== undefined) {
          const scs = getComputedStyle(sample);
          out.monthBox = {
            width: Math.round(sample.getBoundingClientRect().width),
            marginRight: scs.marginRight,
            flex: scs.flex,
          };
        }
        out.labels = monthEls
          .map((el, index) => ({ text: (el.textContent ?? '').trim(), index, offsetLeft: el.offsetLeft }))
          .filter((entry) => entry.text.length > 0)
          .map((entry) => {
            const col = cols[entry.index];
            const firstCell = col?.querySelector('.dus-heat-cell');
            return {
              text: entry.text,
              column: entry.index,
              labelOffset: entry.offsetLeft,
              columnOffset: col?.offsetLeft ?? null,
              driftPx: col === undefined ? null : entry.offsetLeft - col.offsetLeft,
              firstCellDate: firstCell?.getAttribute('aria-label')?.split(':')[0] ?? null,
            };
          });
        const now = new Date();
        const todayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        out.browserToday = todayKey;
        out.browserWeekday = now.getDay();
        const allCells = [...document.querySelectorAll('.dus-heat-cell')];
        const todayCell = allCells.find((c) => (c.getAttribute('aria-label') ?? '').startsWith(todayKey + ':'));
        out.todayCellFound = todayCell !== undefined;
        if (todayCell !== undefined) {
          const col = todayCell.closest('.dus-heat-col');
          const colIndex = cols.indexOf(col);
          const rowIndex = [...col.querySelectorAll('.dus-heat-cell')].indexOf(todayCell);
          out.todayCell = {
            column: colIndex,
            row: rowIndex,
            offsetLeft: todayCell.offsetLeft,
            isLastColumn: colIndex === cols.length - 1,
            columnOffset: col.offsetLeft,
            gridWidth: Math.round(grid.getBoundingClientRect().width),
          };
          const over = out.labels.filter((entry) => entry.column <= colIndex).pop();
          out.labelOverToday = over?.text ?? null;
          out.columnsFromLabelToToday = over === undefined ? null : colIndex - over.column;
        }
        const lastCell = allCells[allCells.length - 1];
        out.lastCellDate = lastCell?.getAttribute('aria-label')?.split(':')[0] ?? null;
        out.lastColumnIndex = cols.length - 1;
        out.lastColumnOffset = cols[cols.length - 1].offsetLeft;
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
