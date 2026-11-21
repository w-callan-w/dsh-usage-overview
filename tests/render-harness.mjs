// Render the dashboard with React inside jsdom, drive the refresh controls, and
// assert what a viewer would see. No real browser is available in this sandbox,
// so layout is not measured here; structure, text, and refresh behaviour are.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { buildRealtimeDocument } from '../lib/usage.js';

const BUNDLE = readFileSync(
  process.env.USAGE_BUNDLE ?? new URL('../lib/client.js', import.meta.url),
  'utf8',
);
const STORAGE_KEY = 'dsh-usage-overview/auto-refresh';

const now = Date.now();

function realtimeFixture() {
  const minute = 60000;
  // Keep the generated document inside the same minute as the newest sample so the
  // newest bar always carries data.
  const current = Math.floor(now / minute) * minute;
  const generatedAt = current + 45000;
  const sessions = [
    {
      id: 'session-live',
      recent: [
        { at: current + 20000, total: 120000, provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
        { at: current - 30000, total: 80000, provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
        { at: current - 3 * minute, total: 40000, provider: 'deepseek', model: 'deepseek-v3.2' },
      ],
    },
  ];
  return buildRealtimeDocument(sessions, { now: generatedAt, windowMinutes: 60 });
}

const TODAY_TOKENS = 12345678;

function todayKeyOf(ms) {
  const date = new Date(ms);
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statsFixture() {
  const today = todayKeyOf(now);
  return {
    schemaVersion: 1,
    generatedAt: now,
    panelId: 'usage-overview',
    scope: { rangeDays: 30, windowStart: now - 30 * 86400000, sessionCount: 12, totalSessionCount: 20, liveSessionCount: 2 },
    totals: {
      uncachedInputTokens: 1000,
      cacheReadTokens: 9000,
      cacheWriteTokens: 0,
      outputTokens: 500,
      total: 10500,
      peakDayTokens: 4000,
      peakDay: '2026-11-18',
      peakSessionTokens: 3000,
      activeDays: 5,
      averageTokensPerActiveDay: 2100,
      turns: 12,
      steps: 40,
      currentStreak: 3,
      longestStreak: 5,
      cacheHitRate: 90,
    },
    days: [
      { day: '2026-11-18', total: 4000, totals: { uncachedInputTokens: 400, cacheReadTokens: 3200, cacheWriteTokens: 0, outputTokens: 400 }, sessions: 2, byModel: { 'opencode-go/deepseek-v4.1-flash': 4000 } },
      { day: today, total: TODAY_TOKENS, totals: { uncachedInputTokens: 1000, cacheReadTokens: 11000000, cacheWriteTokens: 0, outputTokens: 345678 }, sessions: 1, byModel: { 'opencode-go/deepseek-v4.1-flash': TODAY_TOKENS } },
    ],
    models: [{ model: 'deepseek-v4.1-flash', provider: 'opencode-go', source: 'OpenCode Go', totals: { uncachedInputTokens: 400, cacheReadTokens: 3200, cacheWriteTokens: 0, outputTokens: 400 }, sessions: 2, calls: 4, turns: 2, total: 4000 }],
  };
}

export async function boot(options = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:9999/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;

  // react-dom runs in Node's module scope, so it reads the DOM from globals.
  globalThis.window = window;
  globalThis.document = document;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => window.navigator });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => options.visibility ?? 'visible',
  });
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 960; } });
  Object.defineProperty(window.Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return { x: 0, y: 0, top: 0, left: 0, right: 960, bottom: 220, width: 960, height: 220, toJSON() {} };
    },
  });
  window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(node) {
      this.node = node;
      this.timer = window.setTimeout(() => this.callback([{ target: node }]), 0);
    }
    unobserve() {}
    disconnect() {
      window.clearTimeout(this.timer);
    }
  };

  if (options.storage !== undefined) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options.storage));
  }

  if (options.legacyCards !== undefined) {
    window.localStorage.setItem('dsh-usage-overview/cards', JSON.stringify(options.legacyCards));
  }

  if (options.legacyPanels !== undefined) {
    window.localStorage.setItem('dsh-usage-overview/panels', JSON.stringify(options.legacyPanels));
  }

  if (options.cards !== undefined) {
    window.localStorage.setItem(
      'dsh-usage-overview/cards',
      JSON.stringify({ version: 2, visible: options.cards }),
    );
  }

  if (options.panels !== undefined) {
    window.localStorage.setItem(
      'dsh-usage-overview/panels',
      JSON.stringify({ version: 2, visible: options.panels }),
    );
  }

  const realtime = options.realtime === undefined ? realtimeFixture() : options.realtime;
  const stats = options.stats === undefined ? statsFixture() : options.stats;
  const calls = [];

  window.fetch = async (input) => {
    const url = String(input);
    calls.push({ url, at: Date.now() });
    if (url.includes('/realtime')) {
      const status = options.realtimeStatus ?? 200;
      if (status !== 200) return { ok: false, status, json: async () => ({ error: 'boom' }) };
      return { ok: true, status, json: async () => realtime };
    }
    const status = options.statsStatus ?? 200;
    if (status !== 200) return { ok: false, status, json: async () => ({ error: 'boom' }) };
    return { ok: true, status, json: async () => stats };
  };

  let registration;
  window.__ModuleLoader__ = { load(reg) { registration = reg; } };
  window.eval(BUNDLE);

  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');

  const plugin = registration.factory((specifier) => {
    if (specifier === 'react') return React;
    throw new Error(`unexpected require: ${specifier}`);
  });

  const disposers = [];
  const slots = new Map();
  const ctx = {
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    logger: { warn: (message) => console.log('[client warn]', message) },
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: {
      inject: (name, fn) => {
        fn();
      },
      register: (slotOptions, component) => {
        slots.set(`${slotOptions.name}:${slotOptions.key ?? slotOptions.id ?? ''}`, { options: slotOptions, component });
      },
    },
  };
  plugin.apply(ctx);

  const dashboard = slots.get('main:usage-overview')?.component;
  assert.ok(typeof dashboard === 'function', 'dashboard component registered into the main slot');
  assert.ok(slots.has('sidebar.panellist:usage-overview'), 'sidebar entry registered');

  const root = createRoot(document.getElementById('root'));
  root.render(React.createElement(dashboard));

  return { dom, window, document, calls, root, React };
}

export async function waitFor(predicate, { timeout = 5000, label = 'condition' } = {}) {
  const started = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function text(node) {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
