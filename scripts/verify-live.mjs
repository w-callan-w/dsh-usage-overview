const origin = process.argv[2] ?? 'http://127.0.0.1:19387';

const failures = [];
const pass = (label, detail = '') => {
  console.log(`PASS  ${label}${detail === '' ? '' : `  (${detail})`}`);
};
const fail = (label, detail = '') => {
  console.log(`FAIL  ${label}${detail === '' ? '' : `  (${detail})`}`);
  failures.push(label);
};

async function get(path) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: 'manual' });
    const text = await response.text();
    return { status: response.status, text, type: response.headers.get('content-type') ?? '' };
  } catch (error) {
    return { status: 0, text: '', type: '', error: error instanceof Error ? error.message : String(error) };
  }
}

console.log(`verifying the live host at ${origin}`);
console.log('');

const stats = await get('/plugins/dsh-usage-overview/stats?range=30d');
if (stats.status !== 200) {
  fail('stats route answers 200', stats.status === 0 ? `unreachable: ${stats.error ?? ''}` : `status ${String(stats.status)}`);
} else {
  pass('stats route answers 200', `${String(stats.text.length)} bytes`);
  let document;
  try {
    document = JSON.parse(stats.text);
  } catch {
    fail('stats body is JSON');
  }
  if (document !== undefined) {
    if (document.schemaVersion !== 1) fail('stats document is schema v1', String(document.schemaVersion));
    else pass('stats document is schema v1');

    const total = document.totals?.total;
    if (typeof total !== 'number' || !Number.isFinite(total)) fail('totals.total is a finite number', String(total));
    else pass('totals.total is a finite number', `${total.toLocaleString('en-US')} tokens`);

    const models = Array.isArray(document.models) ? document.models : [];
    const attributed = models.filter((model) => model.total > 0);
    if (attributed.length === 0) {
      fail('at least one model carries usage');
    } else {
      pass('at least one model carries usage', `${String(attributed.length)} route(s)`);
      const unnamed = attributed.filter((model) => typeof model.source !== 'string' || model.source === '' || model.source === 'unknown');
      if (unnamed.length > 0) fail('every used model names its provider source', unnamed.map((m) => m.model).join(', '));
      else {
        pass(
          'every used model names its provider source',
          attributed.map((m) => `${m.model} ← ${m.source}`).join('; '),
        );
      }
    }
    if (!Array.isArray(document.days)) fail('days array present');
    else pass('days array present', `${String(document.days.length)} day(s)`);
  }
}

const index = await get('/');
if (index.status === 401) {
  console.log('SKIP  boot graph — the index needs the browser cookie (open the app URL to mint it)');
} else if (index.status !== 200) {
  fail('index reachable', `status ${String(index.status)}`);
} else {
  const row = /\{"id":"dsh-usage-overview","url":"([^"]+)"/.exec(index.text);
  if (row === null) {
    fail('boot graph advertises dsh-usage-overview');
  } else {
    pass('boot graph advertises dsh-usage-overview');
    const bundle = await get(`/${row[1]}`);
    if (bundle.status !== 200) fail('client bundle is served', `status ${String(bundle.status)}`);
    else if (!bundle.text.includes('__ModuleLoader__')) fail('client bundle is a module-loader script');
    else pass('client bundle is served', `${String(bundle.text.length)} bytes, ${bundle.type}`);
  }
}

console.log('');
if (failures.length > 0) {
  console.log(`${String(failures.length)} CHECK(S) FAILED — the running GUI has not loaded the plugin`);
  process.exitCode = 1;
} else {
  console.log('ALL LIVE CHECKS PASSED — the plugin is loaded in the running Web GUI');
}
