import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { buildUsageDocument, collectSessions } from '../lib/usage.js';
import { CSS } from '../src/client/styles.js';
import { formatTokensZh, PROVIDER_SOURCE_LABELS } from '../lib/protocol.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadDashboardComponent(seedDocument) {
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8');
  let captured;
  const sandbox = {
    window: { __ModuleLoader__: { load: (definition) => { captured = definition; } } },
    document: { querySelector: () => null, createElement: () => ({ dataset: {}, style: {} }), head: { appendChild: () => {} } },
    console,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useMemo: (factory) => factory(),
    useState: (initial) => {
      const value = typeof initial === 'function' ? initial() : initial;
      if (typeof value === 'object' && value !== null && 'status' in value && 'document' in value) {
        return [{ status: 'ready', document: seedDocument, error: null }, () => {}];
      }
      return [value, () => {}];
    },
    useRef: (initial) => ({ current: initial }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  };

  const module_ = captured.factory((specifier) => {
    if (specifier === 'react') return react;
    if (specifier === 'react/jsx-runtime') return { jsx: react.createElement, jsxs: react.createElement };
    throw new Error(`unexpected external: ${specifier}`);
  });

  let main = null;
  module_.apply({
    effect: () => {},
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject: (slot, register) => { if (slot === 'main') main = register; },
      register: (options, component) => ({ options, component }),
    },
  });
  return main().component;
}

const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function attributeName(key) {
  if (key === 'className') return 'class';
  if (key === 'htmlFor') return 'for';
  if (/^(stroke|text|fill|font|marker|clip|dominant|stop|flood|baseline|letter|word|glyph|color|shape|vector)/.test(key)) {
    return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  }
  return key;
}

function render(node) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(render).join('');
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  if (typeof node.type === 'function') return render(node.type(node.props ?? {}));
  if (typeof node.type !== 'string') return '';

  const { type, props = {}, children = [] } = node;
  const attrs = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'children' || value === undefined || value === null) continue;
    if (key === 'style' && typeof value === 'object') {
      attrs.push(`style="${esc(Object.entries(value).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${String(v)}`).join(';'))}"`);
      continue;
    }
    if (key.startsWith('on') || key === 'ref') continue;
    attrs.push(`${attributeName(key)}="${esc(value)}"`);
  }
  const body = [render(children), props?.dangerouslySetInnerHTML?.__html ?? ''].join('');
  return `<${type}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${body}</${type}>`;
}

const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const sessions = await collectSessions(home);
const now = Date.now();
const doc = buildUsageDocument(sessions, {
  now,
  rangeDays: 30,
  providerLabels: PROVIDER_SOURCE_LABELS,
  liveIds: new Set(),
});

const UsageDashboard = await loadDashboardComponent(doc);
const page = UsageDashboard({});

const html = `<!doctype html>
<html lang="zh-CN" data-platform="win32"><head><meta charset="utf-8">
<title>用量统计 — 预览</title>
<style>${CSS}
html,body{margin:0;height:100%;background:var(--dsw-alias-bg-base,#0f1115)}

:root{--dsh-frame-top-clearance:0px;--dsw-alias-bg-base:#16181d;--dsw-alias-bg-layer-1:#1b1e24;--dsw-alias-bg-layer-2:#1f232a;--dsw-alias-bg-layer-3:#272c34;--dsw-alias-bg-layer-4:#2f353e;--dsw-alias-border-l1:#2c313a;--dsw-alias-border-l2:#383e49;--dsw-alias-border-l3:#464d59;--dsw-alias-label-primary:#e8eaed;--dsw-alias-label-secondary:#a8aeb8;--dsw-alias-label-tertiary:#7c838f;--dsw-alias-label-primary-foreground:#ffffff;--dsw-alias-brand-primary:#4f8ef7;--dsw-alias-interactive-bg-hover:#2a3038;--dsw-alias-state-success-primary:#39c07a;--dsw-alias-tooltip-bg:#2f353e;--dsw-radius-xs:3px;--dsw-radius-sm:5px;--dsw-radius-md:7px;--dsw-radius-lg:11px;--dsw-elevation-soft:0 1px 2px rgba(0,0,0,.3);--dsw-elevation-prominent:0 8px 26px rgba(0,0,0,.5);--dsw-font-family:-apple-system,'Segoe UI','Microsoft YaHei',system-ui,sans-serif}
</style></head><body>${render(page)}
<button class="dus-btn dus-refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg><span>刷新</span></button>
</body></html>`;

const out = join(root, 'preview', 'dashboard.html');
await writeFile(out, html, 'utf8');

const required = ['使用统计', '累计 Token 数', 'Token 活动', '每日 Token 趋势图', '每日平均缓存命中率', '模型用量', '各模型用量趋势'];
for (const model of doc.models) {
  if (model.total > 0 && typeof model.source === 'string' && model.source.length > 0) {
    required.push(model.source);
  }
}
const missing = [...new Set(required)].filter((text) => !html.includes(text));
console.log(`wrote ${out} (${String(html.length)} bytes)`);
console.log(missing.length === 0 ? 'preview contains every expected section' : `MISSING: ${missing.join(', ')}`);
if (missing.length > 0) process.exitCode = 1;
