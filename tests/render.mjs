// Viewer-facing checks for the realtime panel and the auto-refresh controls.
import assert from 'node:assert/strict';

import { bigRealtimeFixture, boot, text, waitFor } from './render-harness.mjs';

const LIVE_CARD_LABEL = '实时 Token / 分钟';
const CARDS_STORAGE_KEY = 'dsh-usage-overview/cards';
const PANELS_STORAGE_KEY = 'dsh-usage-overview/panels';
const ALL_CARD_LABELS = [
  '今日消耗',
  '累计 Token 数',
  '单日峰值 Token 数',
  '日均 Token 数',
  '实时 Token / 分钟',
  '当前连续天数',
  '最长连续天数',
  '缓存命中率',
];
const ALL_PANEL_LABELS = ['Token 活动', '每日 Token 趋势图', '每日平均缓存命中率', '模型用量', '实时 Token 消耗'];

function findButton(document, label) {
  return [...document.querySelectorAll('button')].find((node) => text(node) === label);
}

function cardLabels(document) {
  return [...document.querySelectorAll('.dus-cards .dus-card-label')].map(text);
}

function cardOptions(document) {
  return groupOptions(document, 'cards');
}

function groupOptions(document, group) {
  return [...document.querySelectorAll(`.dus-cards-group[data-group="${group}"] .dus-cards-option`)];
}

function groupShowAll(document, group) {
  return document.querySelector(`.dus-cards-group[data-group="${group}"] .dus-cards-all`);
}

function panelTitles(document) {
  return [...document.querySelectorAll('.dus-panel h2')].map(text);
}

function optionIn(document, group, label) {
  return groupOptions(document, group).find((node) => text(node) === label);
}

// ---- 1. First paint: realtime card, panel, controls --------------------------------
{
  const { document, window, root } = await boot();
  await waitFor(() => document.querySelector('.dus-live-hero-value'), { label: 'realtime panel' });
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: '60 minute bars' });

  const cards = [...document.querySelectorAll('.dus-card-label')].map(text);
  assert.deepEqual(cards, ALL_CARD_LABELS);

  // 今日消耗 leads the strip and carries today's bucket, two decimals like the rest.
  const todayCard = document.querySelector('.dus-cards .dus-card');
  assert.equal(text(todayCard), '1234.57万今日消耗');
  assert.match(todayCard.getAttribute('title'), /已消耗 12,345,678 tokens$/, 'the tooltip keeps the exact count');

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
  assert.equal(document.querySelectorAll('.dus-card').length, 8, 'statistics cards still render');
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

// ---- 9. The chooser hides cards and remembers the choice -----------------------
{
  const { document, window, root } = await boot();
  await waitFor(() => document.querySelectorAll('.dus-card').length === 8, { label: 'eight cards' });

  const toolbar = document.querySelector('.dus-toolbar');
  const toggle = toolbar.querySelector('.dus-cards-toggle');
  assert.ok(toggle !== null, 'card chooser sits in the toolbar');
  assert.equal(toggle.getAttribute('aria-label'), '选择要展示的卡片');
  assert.equal(toggle.getAttribute('aria-haspopup'), 'true');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false', 'menu starts closed');
  assert.equal(text(toggle), '卡片13/13', `counter counts cards and panels: ${text(toggle)}`);
  assert.equal(document.querySelector('.dus-cards-menu'), null, 'no menu before the button is used');

  toggle.click();
  await waitFor(() => document.querySelector('.dus-cards-menu') !== null, { label: 'card menu' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(cardOptions(document).map(text), ALL_CARD_LABELS);
  assert.deepEqual(
    cardOptions(document).map((node) => node.getAttribute('aria-checked')),
    ALL_CARD_LABELS.map(() => 'true'),
    'every card is on by default',
  );
  assert.ok(cardOptions(document).every((node) => node.getAttribute('data-locked') === null), 'nothing is locked');

  // Turning a card off takes it off the board and keeps the rest in place.
  optionIn(document, 'cards', '单日峰值 Token 数').click();
  await waitFor(() => document.querySelectorAll('.dus-card').length === 7, { label: 'seven cards' });
  assert.deepEqual(cardLabels(document), [
    '今日消耗',
    '累计 Token 数',
    '日均 Token 数',
    '实时 Token / 分钟',
    '当前连续天数',
    '最长连续天数',
    '缓存命中率',
  ]);
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片12/13');
  await waitFor(
    () =>
      window.localStorage.getItem(CARDS_STORAGE_KEY) ===
      '{"version":2,"visible":["today","total","daily-average","realtime","current-streak","longest-streak","cache-hit"]}',
    { label: 'persisted card selection' },
  );
  const option = optionIn(document, 'cards', '单日峰值 Token 数');
  assert.equal(option.getAttribute('aria-checked'), 'false', 'the option stays in the list, unchecked');

  // Turning one back on restores it at its catalog position, not at the end.
  option.click();
  await waitFor(() => document.querySelectorAll('.dus-card').length === 8, { label: 'eight cards again' });
  assert.deepEqual(cardLabels(document), ALL_CARD_LABELS);

  // The realtime card only hides the number card; the chart panel is not a card.
  optionIn(document, 'cards', '实时 Token / 分钟').click();
  await waitFor(() => document.querySelector('.dus-card-live') === null, { label: 'realtime card hidden' });
  assert.equal(document.querySelectorAll('.dus-card').length, 7);
  assert.ok(document.querySelector('.dus-live-panel') !== null, 'the realtime panel is unaffected');

  // 全选 puts every card back in one click.
  groupShowAll(document, 'cards').click();
  await waitFor(() => document.querySelectorAll('.dus-card').length === 8, { label: 'all cards restored' });
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片13/13');

  // Escape closes the menu.
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await waitFor(() => document.querySelector('.dus-cards-menu') === null, { label: 'menu closed by Escape' });

  // A click elsewhere on the page closes it too.
  document.querySelector('.dus-cards-toggle').click();
  await waitFor(() => document.querySelector('.dus-cards-menu') !== null, { label: 'card menu reopened' });
  document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  await waitFor(() => document.querySelector('.dus-cards-menu') === null, { label: 'menu closed by outside click' });

  root.unmount();
  window.close();
}

// ---- 10. The big panels under the cards are switched the same way ---------------
{
  const { document, window, root } = await boot();
  await waitFor(() => document.querySelectorAll('.dus-panel').length === 5, { label: 'five panels' });
  assert.deepEqual(panelTitles(document), ALL_PANEL_LABELS, 'every panel renders by default');

  document.querySelector('.dus-cards-toggle').click();
  await waitFor(() => document.querySelector('.dus-cards-menu') !== null, { label: 'card menu' });
  assert.deepEqual(groupOptions(document, 'panels').map(text), ALL_PANEL_LABELS);

  optionIn(document, 'panels', '每日 Token 趋势图').click();
  await waitFor(() => document.querySelectorAll('.dus-panel').length === 4, { label: 'four panels' });
  assert.deepEqual(panelTitles(document), ['Token 活动', '每日平均缓存命中率', '模型用量', '实时 Token 消耗']);
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片12/13');
  await waitFor(
    () =>
      window.localStorage.getItem(PANELS_STORAGE_KEY) ===
      '{"version":2,"visible":["heatmap","cache","models","realtime"]}',
    { label: 'persisted panel selection' },
  );

  // Compared with the cards, panels have no minimum: the whole stack can go.
  for (const label of ['Token 活动', '每日平均缓存命中率', '模型用量', '实时 Token 消耗']) {
    optionIn(document, 'panels', label).click();
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await waitFor(() => document.querySelectorAll('.dus-panel').length === 0, { label: 'no panels left' });
  assert.equal(document.querySelectorAll('.dus-card').length, 8, 'the card strip is untouched');
  assert.ok(document.querySelector('.dus-range-row') !== null, 'the range control survives');
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片8/13');
  assert.equal(document.querySelector('.dus-cards-menu-foot').textContent.includes('已展示 8 / 13 项'), true);

  // 全选 on the panel group brings all five back, in their original order.
  groupShowAll(document, 'panels').click();
  await waitFor(() => document.querySelectorAll('.dus-panel').length === 5, { label: 'panels restored' });
  assert.deepEqual(panelTitles(document), ALL_PANEL_LABELS);

  root.unmount();
  window.close();
}

// ---- 11. Stored selections are restored -----------------------------------------
{
  const { document, window, root } = await boot({ cards: ['cache-hit', 'total'] });
  await waitFor(() => document.querySelectorAll('.dus-card').length === 2, { label: 'two stored cards' });
  assert.deepEqual(cardLabels(document), ['累计 Token 数', '缓存命中率'], 'stored ids follow the catalog order');
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片7/13');
  await waitFor(
    () => window.localStorage.getItem(CARDS_STORAGE_KEY) === '{"version":2,"visible":["total","cache-hit"]}',
    { label: 'normalised stored selection' },
  );

  root.unmount();
  window.close();
}
{
  const { document, window, root } = await boot({ panels: ['heatmap'] });
  await waitFor(() => document.querySelectorAll('.dus-panel').length === 1, { label: 'one stored panel' });
  assert.deepEqual(panelTitles(document), ['Token 活动']);
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片9/13');
  await waitFor(
    () => window.localStorage.getItem(PANELS_STORAGE_KEY) === '{"version":2,"visible":["heatmap"]}',
    { label: 'normalised stored panels' },
  );

  root.unmount();
  window.close();
}

// ---- 12. Unknown ids are ignored and the last card is protected ----------------
{
  const { document, window, root } = await boot({ cards: ['total', 'retired-card', 'total'] });
  await waitFor(() => document.querySelectorAll('.dus-card').length === 1, { label: 'the one known card' });
  assert.deepEqual(cardLabels(document), ['累计 Token 数'], 'unknown and duplicated ids are dropped');
  await waitFor(() => window.localStorage.getItem(CARDS_STORAGE_KEY) === '{"version":2,"visible":["total"]}', {
    label: 'unknown ids dropped from storage',
  });

  document.querySelector('.dus-cards-toggle').click();
  await waitFor(() => document.querySelector('.dus-cards-menu') !== null, { label: 'card menu' });
  const only = cardOptions(document).find((node) => node.getAttribute('data-checked') !== null);
  assert.ok(only !== undefined, 'the remaining card is shown as on');
  assert.ok(only.getAttribute('data-locked') !== null, 'the last card is locked');
  assert.ok(text(document.querySelector('.dus-cards-menu-foot')).includes('指标卡至少保留一张'));

  only.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(document.querySelectorAll('.dus-card').length, 1, 'the last card cannot be removed');
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片6/13');

  root.unmount();
  window.close();
}
{
  const { document, window, root } = await boot({ cards: [] });
  await waitFor(() => document.querySelectorAll('.dus-card').length === 8, { label: 'empty selection falls back' });
  assert.deepEqual(cardLabels(document), ALL_CARD_LABELS, 'an empty stored selection shows every card');

  root.unmount();
  window.close();
}

// ---- 13. A selection saved before the board grew gains the new card ------------
const LEGACY_CARD_IDS = ['total', 'peak-day', 'daily-average', 'realtime', 'current-streak', 'longest-streak', 'cache-hit'];
{
  const { document, window, root } = await boot({ legacyCards: LEGACY_CARD_IDS });
  await waitFor(() => document.querySelectorAll('.dus-card').length === 8, { label: 'legacy selection plus the new card' });
  assert.deepEqual(cardLabels(document), ALL_CARD_LABELS, 'the new card joins an older selection');
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片13/13');
  await waitFor(
    () => window.localStorage.getItem(CARDS_STORAGE_KEY)?.startsWith('{"version":2'),
    { label: 'selection upgraded to the versioned format' },
  );

  root.unmount();
  window.close();
}
{
  // A card the viewer had already hidden stays hidden through the upgrade.
  const saved = LEGACY_CARD_IDS.filter((id) => id !== 'peak-day');
  const { document, window, root } = await boot({ legacyCards: saved });
  await waitFor(() => document.querySelectorAll('.dus-card').length === 7, { label: 'hidden card stays hidden' });
  assert.deepEqual(cardLabels(document), [
    '今日消耗',
    '累计 Token 数',
    '日均 Token 数',
    '实时 Token / 分钟',
    '当前连续天数',
    '最长连续天数',
    '缓存命中率',
  ]);
  assert.equal(text(document.querySelector('.dus-cards-toggle')), '卡片12/13');

  root.unmount();
  window.close();
}

// ---- 14. A phone-width panel keeps every Y-axis label inside the chart -------
// The labels are right-aligned in the left gutter; a fixed gutter used to clip
// `140.0万` away on mobile, so the axis looked empty.
function estimateLabelWidth(label, fontSize) {
  let width = 0;
  for (const char of String(label)) {
    width += char.codePointAt(0) > 0x2e80 ? fontSize : fontSize * 0.62;
  }
  return width;
}

{
  const { document, window, root } = await boot({ width: 300, realtime: bigRealtimeFixture() });
  await waitFor(() => document.querySelectorAll('.dus-live-bar').length === 60, { label: 'first paint' });

  const charts = [...document.querySelectorAll('.dus-chart-host')];
  assert.ok(charts.length >= 2, 'charts rendered');
  let checked = 0;
  for (const host of charts) {
    const svg = host.querySelector('svg');
    if (svg === null) continue;
    const labels = [...svg.querySelectorAll('text')].filter(
      (node) => node.getAttribute('text-anchor') === 'end',
    );
    for (const node of labels) {
      const x = Number(node.getAttribute('x'));
      const size = Number(node.getAttribute('font-size'));
      const width = estimateLabelWidth(node.textContent, size);
      assert.ok(
        x - width >= 0,
        `${host.dataset.chart} label "${node.textContent}" starts ${String(Math.round(x - width))}px left of the chart`,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 3, `axis labels were checked (${String(checked)})`);

  // The realtime axis carries the wide labels from the fixture.
  const realtimeTexts = [...document.querySelectorAll('.dus-realtime-host svg text')]
    .filter((node) => node.getAttribute('text-anchor') === 'end')
    .map(text);
  assert.ok(realtimeTexts.some((label) => label.includes('万')), `realtime labels: ${realtimeTexts.join(' ')}`);

  root.unmount();
  window.close();
}

console.log('render checks passed');