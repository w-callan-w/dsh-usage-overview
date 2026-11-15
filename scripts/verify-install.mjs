import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';

const installed = join(
  process.env.DSH_HOME ?? 'C:\\Users\\lzf\\.dsh',
  'profiles',
  'desktop',
  'node_modules',
  'dsh-usage-overview',
);

const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
  if (!condition) failures.push(label);
};

const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
check('manifest name', manifest.name === 'dsh-usage-overview', manifest.name);
check('dsh.bundle.patch declared', typeof manifest.dsh?.bundle?.patch === 'string', manifest.dsh?.bundle?.patch);
check('dsh.client.platform is web', manifest.dsh?.client?.platform === 'web');
check('exports["./client"] is a string path', typeof manifest.exports?.['./client'] === 'string', manifest.exports?.['./client']);

const hostEntry = join(installed, manifest.main);
const hostStat = await stat(hostEntry).catch(() => null);
check('host entry exists on disk', hostStat !== null, manifest.main);

const host = await import(`file://${hostEntry.replace(/\\/g, '/')}`);
check('host exports apply()', typeof host.apply === 'function');
check(
  'host requires exactly webServer',
  JSON.stringify(host.inject) === JSON.stringify(['webServer']),
  JSON.stringify(host.inject),
);

const mounted = [];
const fakeRes = {
  writeHead: (status) => { fakeRes.status = status; },
  end: (body) => { fakeRes.body = body; },
};
const fakeCtx = {
  logger: { warn: () => {} },
  get: (key) => (key === 'webServer' ? {
    register: ({ path }) => {
      mounted.push(path);
      return () => {};
    },
  } : undefined),
  effect: (fn) => { fn(); },
};
host.apply(fakeCtx);
check('host mounts the stats route', mounted.includes('/plugins/dsh-usage-overview/stats'), mounted.join(', '));
check('host mounts the session route', mounted.includes('/plugins/dsh-usage-overview/session'));

const clientPath = join(installed, manifest.exports['./client']);
const clientSource = await readFile(clientPath, 'utf8');
let captured;
const sandbox = {
  window: { __ModuleLoader__: { load: (definition) => { captured = definition; } } },
  document: {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {} }),
    head: { appendChild: () => {} },
  },
  console,
  setTimeout,
  clearTimeout,
};
vm.createContext(sandbox);
try {
  vm.runInContext(clientSource, sandbox);
  check('browser bundle executes and registers', captured?.id === 'dsh-usage-overview');
} catch (error) {
  check('browser bundle executes and registers', false, String(error));
}

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useMemo: (factory) => factory(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
  useCallback: (fn) => fn,
};

const externals = [];
const module_ = captured.factory((specifier) => {
  externals.push(specifier);
  if (specifier === 'react') return reactStub;
  if (specifier === 'react/jsx-runtime') return { jsx: reactStub.createElement, jsxs: reactStub.createElement };
  throw new Error(`not in the platform module table: ${specifier}`);
});

check('browser exports apply()', typeof module_.apply === 'function');
check('browser exports inject[]', Array.isArray(module_.inject), JSON.stringify(module_.inject));
check(
  'browser requests only platform modules',
  externals.every((specifier) => specifier === 'react' || specifier === 'react/jsx-runtime'),
  [...new Set(externals)].join(', '),
);

const registrations = new Map();
module_.apply({
  effect: () => {},
  locale: { register: () => {}, bind: () => (key) => key },
  slots: {
    inject: (slot, register) => { registrations.set(slot, register); },
    register: (options, component) => ({ options, component }),
  },
});

const main = registrations.get('main')?.();
const sidebar = registrations.get('sidebar.panellist')?.();
check('registers into the main slot', main?.options?.key === 'usage-overview', String(main?.options?.key));
check('registers into sidebar.panellist', sidebar?.options?.id === 'usage-overview', String(sidebar?.options?.id));
check(
  'main key and sidebar id agree',
  main?.options?.key === sidebar?.options?.id,
  'selection would break otherwise',
);

async function settle(response, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (response.status === undefined && Date.now() < deadline) {
    await new Promise((resolve) => { setTimeout(resolve, 25); });
  }
  return response.status;
}

const handlers = [];
host.apply({
  logger: { warn: () => {} },
  get: () => ({ register: ({ path, handler }) => { handlers.push({ path, handler }); return () => {}; } }),
  effect: (fn) => { fn(); },
});
const statsHandler = handlers.find((entry) => entry.path === '/plugins/dsh-usage-overview/stats');
if (statsHandler === undefined) {
  check('stats handler available', false);
} else {
  const res = {
    writeHead: (status, headers) => { res.status = status; res.headers = headers; },
    end: (body) => { res.body = body; },
  };
  statsHandler.handler({ method: 'GET', url: '/plugins/dsh-usage-overview/stats?range=30d', headers: { host: '127.0.0.1:19387' } }, res);
  const status = await settle(res);
  const body = JSON.parse(res.body ?? '{}');
  check('stats route answers 200', status === 200, `status ${String(status)}`);
  check('stats document is schema v1', body.schemaVersion === 1);
  check('stats document carries headline totals', typeof body.totals?.total === 'number', `total=${String(body.totals?.total)}`);
  check('stats document carries model sources', Array.isArray(body.models) && body.models.every((m) => typeof m.source === 'string'));

  const blocked = {
    writeHead: (status) => { blocked.status = status; },
    end: () => {},
  };
  statsHandler.handler({ method: 'GET', url: '/plugins/dsh-usage-overview/stats', headers: { host: 'evil.example.com' } }, blocked);
  await settle(blocked, 3000);
  check('non-loopback Host is refused', blocked.status === 403, `status ${String(blocked.status)}`);

  const RELAY_HOST = '203.0.113.10:8443';
  for (const cookie of [undefined, 'dsh-auth-probe=v1.forged.signature']) {
    const forged = {
      writeHead: (status) => { forged.status = status; },
      end: () => {},
    };
    const headers = { host: RELAY_HOST };
    if (cookie !== undefined) headers.cookie = cookie;
    statsHandler.handler({ method: 'GET', url: '/plugins/dsh-usage-overview/stats', headers }, forged);
    await settle(forged, 3000);
    check(
      `relay Host without a valid session is refused (${cookie === undefined ? 'no cookie' : 'forged cookie'})`,
      forged.status === 403,
      `status ${String(forged.status)}`,
    );
  }

  const vouched = [];
  host.apply({
    logger: { warn: () => {} },
    get: (name) =>
      name === 'connection'
        ? { requestRejection: () => undefined }
        : { register: ({ path, handler }) => { vouched.push({ path, handler }); return () => {}; } },
    effect: (fn) => { fn(); },
  });
  const vouchedHandler = vouched.find((entry) => entry.path === '/plugins/dsh-usage-overview/stats');
  if (vouchedHandler === undefined) {
    check('stats handler re-registered with a session service', false);
  } else {
    const res2 = {
      writeHead: (status) => { res2.status = status; },
      end: (body) => { res2.body = body; },
    };
    vouchedHandler.handler({ method: 'GET', url: '/plugins/dsh-usage-overview/stats?range=30d', headers: { host: RELAY_HOST } }, res2);
    await settle(res2);
    check('relay Host with a DSH-vouched session is answered', res2.status === 200, `status ${String(res2.status)}`);
  }

  const fictional = [];
  host.apply({
    logger: { warn: () => {} },
    get: (name) =>
      name === 'connection'
        ? { isAuthenticated: () => true }
        : { register: ({ path, handler }) => { fictional.push({ path, handler }); return () => {}; } },
    effect: (fn) => { fn(); },
  });
  const fictionalHandler = fictional.find((entry) => entry.path === '/plugins/dsh-usage-overview/stats');
  if (fictionalHandler === undefined) {
    check('stats handler re-registered with the fictional-API service', false);
  } else {
    const res3 = {
      writeHead: (status) => { res3.status = status; },
      end: () => {},
    };
    fictionalHandler.handler({ method: 'GET', url: '/plugins/dsh-usage-overview/stats', headers: { host: RELAY_HOST } }, res3);
    await settle(res3, 3000);
    check(
      'relay Host with only the fictional isAuthenticated is refused (fail closed)',
      res3.status === 403,
      `status ${String(res3.status)}`,
    );
  }
}

console.log('');
if (failures.length > 0) {
  console.log(`${String(failures.length)} CHECK(S) FAILED`);
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
}
