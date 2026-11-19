// Viewer-facing checks for the realtime panel and the auto-refresh controls.
import assert from 'node:assert/strict';

import { boot, text, waitFor } from './render-harness.mjs';

const LIVE_CARD_LABEL = '实时 Token / 分钟';

function findButton(document, label) {
  return [...document.querySelectorAll('button')].find((node) => text(node) === label);
}

// ---- 1. First paint: realtime card, panel, controls --------------------------------
{
  const { document, window, root } = await boot();
  await waitFor(() => document.querySelector('.dus-live-hero-value'), { label: 'realtime panel' });
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: '60 minute bars' });

  const cards = [...document.querySelectorAll('.dus-card-label')].map(text);
  assert.deepEqual(cards, [
    '累计 Token 数',
    '单日峰值 Token 数',
    '日均 Token 数',
    '实时 Token / 分钟',
    '当前连续天数',
    '最长连续天数',
    '缓存命中率',
  ]);

  // The headline live card shows the number and its label only, in the primary
  // text colour, and sits right after the daily average card.
  const liveCard = document.querySelector('.dus-card-live');
  assert.ok(liveCard !== null, 'headline live card exists');
  assert.equal(text(liveCard), '12.00万实时 Token / 分钟');
  assert.equal(liveCard.querySelector('.dus-card-unit'), null, 'no /分 unit on the card');
  assert.equal(liveCard.querySelector('.dus-card-foot'), null, 'no extra foot line on the card');
  assert.equal(liveCard.nextElementSibling?.textContent?.includes('当前连续天数'), true, 'card follows the daily average');

  const hero = document.querySelector('.dus-live-hero-value');
  assert.equal(text(hero), '12.00万', 'hero shows the per-minute number without a unit');
  assert.equal(document.querySelector('.dus-live-hero-unit'), null, 'no /分 next to the number');

  // The cache-rate chart no longer carries its own legend line.
  assert.equal(document.body.textContent.includes('每日命中率'), false, 'cache legend label removed');
  assert.equal(document.body.textContent.includes('纵轴'), false, 'cache axis caption removed');

  // The realtime panel above the chart keeps only the title and the number.
  const panel = document.querySelector('.dus-live-panel');
  assert.deepEqual([...panel.querySelectorAll('h2')].map(text), ['实时 Token 消耗']);
  for (const stale of ['.dus-live-hero-label', '.dus-live-hero-sub', '.dus-live-metric', '.dus-live-badge', '.dus-live-metrics', '.dus-live-foot']) {
    assert.equal(panel.querySelector(stale), null, `${stale} is gone`);
  }
  assert.equal(panel.textContent.includes('近 60 分钟累计'), false, 'no footer summary under the chart');
  assert.equal(text(panel).startsWith('实时 Token 消耗'), true);

  // The chart exists, is announced, and has one bar per minute.
  const svg = document.querySelector('.dus-realtime-host svg');
  assert.ok(svg !== null, 'realtime chart rendered');
  assert.equal(svg.getAttribute('aria-label'), '每分钟 Token 消耗');
  assert.equal(document.querySelectorAll('rect.dus-live-bar').length, 60);

  // The realtime panel is the last panel on the page, after every other chart.
  const panels = [...document.querySelectorAll('.dus-panel')];
  assert.ok(panels.at(-1).classList.contains('dus-live-panel'), 'realtime panel is last');
  const titles = panels.map((node) => text(node.querySelector('h2')));
  assert.deepEqual(titles, ['Token 活动', '每日 Token 趋势图', '每日平均缓存命中率', '模型用量', '实时 Token 消耗']);

  // Toolbar: only the cadence control and the manual refresh button remain, both
  // starting from the left edge.
  const buttons = [...document.querySelectorAll('.dus-refresh-seg .dus-seg-btn')].map(text);
  assert.deepEqual(buttons, ['关闭', '5秒', '10秒', '30秒', '60秒']);
  assert.ok(document.querySelector('.dus-refresh') !== null, 'manual refresh button present');
  const toolbar = document.querySelector('.dus-toolbar');
  assert.equal(text(toolbar).includes('最后更新'), false, 'no last-update status line');
  assert.equal(toolbar.querySelector('.dus-toolbar-status'), null, 'no status block');
  assert.equal(toolbar.querySelector('.dus-toolbar-sep'), null, 'no separator');
  const seg = document.querySelector('.dus-refresh-seg');
  assert.equal(seg.parentElement, toolbar, 'cadence control sits in the toolbar');
  assert.equal(toolbar.firstElementChild, seg, 'cadence control is the first item, i.e. on the left');
  const active = [...document.querySelectorAll('.dus-refresh-seg .dus-seg-btn')].filter(
    (node) => node.getAttribute('data-active') !== null,
  );
  assert.deepEqual(active.map(text), ['5秒'], '5s is the default cadence');

  assert.equal([...document.querySelectorAll('style[data-plugin-css]')].length, 1, 'styles installed once');

  root.unmount();
  window.close();
}

// ---- 2. Auto refresh actually polls while the panel is open ------------------------
{
  const { document, window, calls, root } = await boot();
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });
  const initialRealtime = calls.filter((call) => call.url.includes('/realtime')).length;
  const initialStats = calls.filter((call) => call.url.includes('/stats')).length;
  assert.equal(initialRealtime, 1, 'one realtime read on mount');
  assert.equal(initialStats, 1, 'one statistics read on mount');

  await new Promise((resolve) => setTimeout(resolve, 6200));
  const laterRealtime = calls.filter((call) => call.url.includes('/realtime')).length;
  const laterStats = calls.filter((call) => call.url.includes('/stats')).length;
  assert.ok(laterRealtime >= 2, `realtime polled again automatically: ${String(laterRealtime)}`);
  assert.ok(laterStats >= 1, 'statistics read at least once');
  assert.ok(laterStats <= 2, `statistics are not re-read on every tick: ${String(laterStats)}`);

  // Manual refresh still works and updates both endpoints.
  const beforeManual = calls.length;
  findButton(document, '刷新')?.click();
  await waitFor(() => calls.length >= beforeManual + 1, { label: 'manual refresh request' });
  assert.ok(calls.slice(beforeManual).some((call) => call.url.includes('/realtime')));
  assert.ok(calls.slice(beforeManual).some((call) => call.url.includes('/stats')));

  root.unmount();
  window.close();
}

// ---- 3. Turning auto refresh off stops the polling ---------------------------------
{
  const { document, window, calls, root } = await boot();
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });
  findButton(document, '关闭').click();
  await waitFor(
    () =>
      [...document.querySelectorAll('.dus-refresh-seg .dus-seg-btn')]
        .filter((node) => node.getAttribute('data-active') !== null)
        .map(text)
        .join() === '关闭',
    { label: '关闭 becomes the active cadence' },
  );
  assert.equal(document.querySelector('.dus-live-badge'), null, 'no badge above the chart');

  const afterOff = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 6200));
  assert.equal(calls.length, afterOff, 'no requests while auto refresh is off');
  assert.equal(window.localStorage.getItem('dsh-usage-overview/auto-refresh'), '{"enabled":false,"intervalMs":5000}');

  root.unmount();
  window.close();
}

// ---- 4. A saved cadence is restored and used ---------------------------------------
{
  const { document, window, calls, root } = await boot({ storage: { enabled: true, intervalMs: 5000 } });
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });
  const active = [...document.querySelectorAll('.dus-refresh-seg .dus-seg-btn')].filter(
    (node) => node.getAttribute('data-active') !== null,
  );
  assert.deepEqual(active.map(text), ['5秒'], 'stored cadence is selected');

  findButton(document, '10秒').click();
  await waitFor(
    () => window.localStorage.getItem('dsh-usage-overview/auto-refresh') === '{"enabled":true,"intervalMs":10000}',
    { label: 'stored 10s cadence' },
  );
  const afterSwitch = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 3200));
  assert.equal(calls.length, afterSwitch, 'a 10s cadence does not poll within 3s');

  findButton(document, '5秒').click();
  await waitFor(
    () => window.localStorage.getItem('dsh-usage-overview/auto-refresh') === '{"enabled":true,"intervalMs":5000}',
    { label: 'stored 5s cadence' },
  );
  await new Promise((resolve) => setTimeout(resolve, 6200));
  assert.ok(calls.length > afterSwitch, 'polling continues on the new cadence');

  root.unmount();
  window.close();
}

// ---- 5. Old host (no realtime route): panel explains itself, page still renders -----
{
  const { document, window, root } = await boot({ realtimeStatus: 404 });
  await waitFor(() => document.querySelector('.dus-toolbar-error'), { label: 'realtime failure' });
  assert.equal(text(document.querySelector('.dus-live-hero-value')), '—');
  assert.ok(text(document.querySelector('.dus-realtime-empty')).includes('没有实时用量数据'));
  assert.equal(document.querySelectorAll('.dus-card').length, 7, 'statistics cards still render');
  assert.ok(text(document.querySelector('.dus-toolbar-error')).includes('404'), 'toolbar reports the failure');

  root.unmount();
  window.close();
}

// ---- 6. Statistics failure keeps the realtime view alive ---------------------------
{
  const { document, window, root } = await boot({ statsStatus: 500 });
  await waitFor(() => document.querySelector('.dus-state-title'), { label: 'error state' });
  assert.equal(text(document.querySelector('.dus-state-title')), '无法读取用量统计');
  assert.ok(text(document.querySelector('.dus-state-desc')).includes('500'));
  await waitFor(() => document.querySelector('.dus-live-panel'), { label: 'realtime panel beside the error' });
  assert.ok(text(document.querySelector('.dus-live-hero-value')).length > 0);

  root.unmount();
  window.close();
}

// ---- 7. A hidden page pauses; a host without visibility still polls ---------------
{
  const { document, window, calls, root } = await boot({ visibility: 'hidden' });
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });
  const afterMount = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 6200));
  assert.equal(calls.length, afterMount, 'a hidden page does not poll');
  root.unmount();
  window.close();
}
{
  const { document, window, calls, root } = await boot({ visibility: undefined });
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });
  const afterMount = calls.length;
  await new Promise((resolve) => setTimeout(resolve, 6200));
  assert.ok(calls.length > afterMount, 'an unknown visibility state keeps polling');
  root.unmount();
  window.close();
}

// ---- 8. Hovering a minute bar raises a tooltip with that minute's figures --------
{
  const { document, window, root } = await boot();
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });

  const svg = document.querySelector('.dus-realtime-host svg');
  const rect = svg.getBoundingClientRect();
  const localX = 960 - 20;
  const event = new window.MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + localX * (rect.width / 960),
    clientY: rect.top + 40,
  });
  svg.dispatchEvent(event);
  await waitFor(() => document.querySelector('.dus-tip'), { label: 'tooltip' });

  const tip = document.querySelector('.dus-tip');
  assert.ok(document.querySelector('.dus-realtime-host svg .dus-tip') === null, 'tooltip is not nested inside the SVG');
  assert.match(text(document.querySelector('.dus-tip-title')), /^\d{2}:\d{2} – \d{2}:\d{2}$/);
  const rows = [...tip.querySelectorAll('.dus-tip-row')].map(text);
  assert.ok(rows.some((row) => row.startsWith('合计')), `tooltip lists the minute total: ${rows.join(' | ')}`);
  assert.ok(rows.some((row) => row.includes('deepseek-v4.1-flash')), 'tooltip lists the model split');

  root.unmount();
  window.close();
}

console.log('render checks passed');