import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { collectSessions, buildUsageDocument } from '../lib/usage.js';
import { PROVIDER_SOURCE_LABELS } from '../lib/protocol.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let seedDocument = null;

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useMemo: (factory) => factory(),
  useState: (initial) => {
    const value = typeof initial === 'function' ? initial() : initial;
    if (seedDocument !== null && typeof value === 'object' && value !== null && 'status' in value && 'document' in value) {
      return [{ status: 'ready', document: seedDocument, error: null }, () => {}];
    }
    return [value, () => {}];
  },
  useRef: (initial) => ({ current: initial ?? { clientWidth: 920 } }),
  useEffect: (effect) => {
    const cleanup = effect();
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  },
  useCallback: (fn) => fn,
};

const cleanups = [];

async function loadClientBundle() {
  const source = await readFile(join(root, 'lib', 'client.js'), 'utf8');
  let captured;
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (definition) => { captured = definition; } },
      setInterval: () => 0,
      clearInterval: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      innerWidth: 1400,
    },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, style: {} }),
      head: { appendChild: () => {} },
      visibilityState: 'visible',
    },
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    fetch: async () => ({ ok: true, status: 200, json: async () => seedDocument ?? {} }),
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([]);
      }
      disconnect() {}
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const requested = [];
  const fakeRequire = (specifier) => {
    requested.push(specifier);
    if (specifier === 'react') return reactStub;
    if (specifier === 'react/jsx-runtime') return { jsx: reactStub.createElement, jsxs: reactStub.createElement };
    throw new Error(`client bundle requested an external that is not in the platform table: ${specifier}`);
  };

  const module = captured.factory(fakeRequire);

  const registrations = { main: null, sidebar: null };
  const ctx = {
    effect: () => {},
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject: (slot, register) => {
        if (slot === 'main') registrations.main = register;
        if (slot === 'sidebar.panellist') registrations.sidebar = register;
      },
      register: (options, component) => ({ options, component }),
    },
  };
  module.apply(ctx);

  const mainEntry = registrations.main();
  const sidebarEntry = registrations.sidebar();

  return { module, requested, mainEntry, sidebarEntry };
}

function walk(node, out) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return;
  }
  if (typeof node.type === 'function') {
    walk(node.type(node.props ?? {}), out);
    return;
  }
  if (typeof node.type === 'string') out.push(node.type);
  for (const child of node.children ?? []) walk(child, out);
}

const home = process.env.DSH_HOME ?? 'C:\\Users\\lzf\\.dsh';
const sessions = await collectSessions(home);
const usage = buildUsageDocument(sessions, {
  now: Date.now(),
  rangeDays: 30,
  providerLabels: PROVIDER_SOURCE_LABELS,
  liveIds: new Set(),
});

const { module, requested, mainEntry, sidebarEntry } = await loadClientBundle();

console.log('externals requested:', JSON.stringify(requested));
console.log('exports:', Object.keys(module));
console.log('inject:', JSON.stringify(module.inject));
console.log('main slot key:', mainEntry.options.key, '| component:', mainEntry.component.name);
console.log('sidebar entry id:', sidebarEntry.options.id, '| order:', sidebarEntry.options.order);
console.log('sidebar label:', sidebarEntry.options.label());

seedDocument = usage;
const elements = [];
walk(mainEntry.component({}), elements);
const counts = elements.reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map());
console.log('dashboard rendered host elements:', elements.length);
console.log('element mix:', JSON.stringify(Object.fromEntries(counts)));

console.log('OK: browser half materializes, registers both slots, and renders');
