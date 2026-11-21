// Validate the stylesheet embedded in the client bundle parses and keeps its shape.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(process.env.USAGE_BUNDLE ?? new URL('../lib/client.js', import.meta.url), 'utf8');
const start = source.indexOf('const CSS = `');
const end = source.indexOf('`;\n  return { STYLE_ID');
if (start === -1 || end === -1) throw new Error('stylesheet block not found');
const css = source.slice(start + 'const CSS = `'.length, end);

const opens = (css.match(/\{/g) ?? []).length;
const closes = (css.match(/\}/g) ?? []).length;
console.log('css length:', css.length, 'braces:', opens, '/', closes);
if (opens !== closes) throw new Error('unbalanced braces in stylesheet');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
const style = dom.window.document.createElement('style');
style.textContent = css;
dom.window.document.head.appendChild(style);
const sheet = dom.window.document.styleSheets[0];
if (sheet === undefined) throw new Error('stylesheet did not attach');
console.log('parsed rules:', sheet.cssRules.length);

const needle = [
  '.dus-toolbar',
  '.dus-toolbar-error',
  '.dus-toolbar-end',
  '.dus-card-live',
  '.dus-live-value',
  '.dus-live-panel',
  '.dus-live-hero',
  '.dus-live-hero-value',
  '.dus-realtime-host',
  '.dus-live-bar',
  '.dus-refresh',
  '.dus-cards-picker',
  '.dus-cards-toggle',
  '.dus-cards-count',
  '.dus-cards-menu',
  '.dus-cards-group',
  '.dus-cards-option',
  '.dus-cards-box',
  '.dus-cards-all',
  '.dus-cards-empty',
];
const text = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
for (const selector of needle) {
  if (!text.includes(selector)) throw new Error(`missing rule: ${selector}`);
}
for (const gone of ['.dus-live-metric', '.dus-live-badge', '.dus-live-grid', '.dus-live-hero-sub', '.dus-live-foot', '.dus-card-unit', '.dus-card-foot', '.dus-live-models', '.dus-live-warn', '.dus-live-hero-unit', '.dus-toolbar-status', '.dus-toolbar-updated', '.dus-toolbar-sep', '.dus-toolbar-actions', '.dus-live-dot.is-idle']) {
  if (text.includes(gone)) throw new Error(`stale rule still present: ${gone}`);
}
const heroValue = [...sheet.cssRules].find((rule) => rule.selectorText === '.dus-live-hero-value');
const heroColor = heroValue?.style?.getPropertyValue('color') ?? '';
if (!heroColor.includes('--dsw-alias-label-primary')) {
  throw new Error(`live number must use the primary label token, got "${heroColor}"`);
}
if (heroColor.includes('--dus-accent')) throw new Error('live number must not use the accent colour');
const cardValue = [...sheet.cssRules].find((rule) => rule.selectorText === '.dus-card-live .dus-live-value');
const cardColor = cardValue?.style?.getPropertyValue('color') ?? '';
if (!cardColor.includes('--dsw-alias-label-primary')) {
  throw new Error(`headline live card must use the primary label token, got "${cardColor}"`);
}

const refresh = [...sheet.cssRules].find((rule) => rule.selectorText === '.dus-refresh');
if (refresh?.style?.position === 'fixed') throw new Error('.dus-refresh must not float any more');

// The chooser is an overlay: it must not push the cards around while open.
const menu = [...sheet.cssRules].find((rule) => rule.selectorText === '.dus-cards-menu');
if (menu?.style?.position !== 'absolute') throw new Error('.dus-cards-menu must be positioned over the page');
if (menu?.style?.zIndex === '') throw new Error('.dus-cards-menu needs a stacking level');
// Two groups of items live in the menu now, so it has to cap its height and scroll
// instead of running off the bottom of the panel.
if (menu?.style?.maxHeight === '') throw new Error('.dus-cards-menu must cap its height');
if (!String(menu?.style?.overflowY ?? '').includes('auto')) throw new Error('.dus-cards-menu must scroll its list');
const option = [...sheet.cssRules].find((rule) => rule.selectorText === '.dus-cards-option');
if (option?.style?.width !== '100%') throw new Error('.dus-cards-option must fill the menu width');


const heroSize = heroValue?.style?.getPropertyValue('font-size') ?? '';
const clamp = heroSize.match(/clamp\(\s*(\d+)px,[^,]+,\s*(\d+)px\s*\)/);
if (clamp === null) throw new Error(`unexpected hero font-size: ${heroSize}`);
const [, minPx, maxPx] = clamp.map(Number);
if (maxPx > 20) throw new Error(`hero number is too large (${String(maxPx)}px), expected at most 20px`);
if (minPx < 14) throw new Error(`hero number shrinks too far (${String(minPx)}px)`);
console.log('hero font size:', minPx + '-' + maxPx + 'px');
console.log('stylesheet checks passed');
