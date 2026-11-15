import { buildUsageDocument, mergeLive } from '../lib/usage.js';
import { cacheHitRate, formatPercent } from '../lib/protocol.js';

const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
  if (!condition) failures.push(label);
};

const day = (routes, samples = 1) => ({
  totals: routes.reduce(
    (sum, route) => ({
      uncachedInputTokens: sum.uncachedInputTokens + route.uncachedInputTokens,
      cacheReadTokens: sum.cacheReadTokens + route.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + route.cacheWriteTokens,
      outputTokens: sum.outputTokens + route.outputTokens,
    }),
    { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
  ),
  samples,
  byRoute: new Map(
    routes.map((route) => [
      `${route.provider}\u0000${route.model}`,
      {
        provider: route.provider,
        model: route.model,
        total: route.uncachedInputTokens + route.cacheReadTokens + route.cacheWriteTokens + route.outputTokens,
        samples,
        totals: {
          uncachedInputTokens: route.uncachedInputTokens,
          cacheReadTokens: route.cacheReadTokens,
          cacheWriteTokens: route.cacheWriteTokens,
          outputTokens: route.outputTokens,
        },
        turns: new Set(route.turns ?? [1]),
      },
    ]),
  ),
});

const labels = { 'workbuddy-ai': 'WorkBuddy AI', 'opencode-go': 'OpenCode Go' };

{
  const now = Date.UTC(2026, 9, 20, 12);
  const sessions = [
    {
      id: 'recent',
      byDay: new Map([['2026-10-19', day([{ provider: 'workbuddy-ai', model: 'm', outputTokens: 100, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])]]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100 },
      wallMs: 1000,
    },
    {
      id: 'old',
      byDay: new Map([['2026-01-05', day([{ provider: 'workbuddy-ai', model: 'm', outputTokens: 900, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])]]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 900 },
      wallMs: 1000,
    },
  ];

  const week = buildUsageDocument(sessions, { now, rangeDays: 7, providerLabels: labels, liveIds: new Set() });
  const all = buildUsageDocument(sessions, { now, rangeDays: null, providerLabels: labels, liveIds: new Set() });
  check('7-day window excludes an older day', week.totals.total === 100, `got ${String(week.totals.total)}`);
  check('all-time window includes both days', all.totals.total === 1000, `got ${String(all.totals.total)}`);
  check('the two windows differ', week.totals.total !== all.totals.total);
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const sessions = [
    {
      id: 'spans',
      byDay: new Map([
        ['2026-10-18', day([{ provider: 'workbuddy-ai', model: 'm', outputTokens: 10, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])],
        ['2026-10-19', day([{ provider: 'workbuddy-ai', model: 'm', outputTokens: 20, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])],
      ]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 30 },
      wallMs: 5000,
    },
  ];
  const doc = buildUsageDocument(sessions, { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  check('a two-day session yields two day rows', doc.days.length === 2, `got ${String(doc.days.length)}`);
  check('day rows carry their own totals', doc.days[0].total === 10 && doc.days[1].total === 20);
  check('the session is counted once per day row', doc.days.every((d) => d.sessions === 1));
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const sessions = [
    {
      id: 'mixed',
      byDay: new Map([
        [
          '2026-10-19',
          day([
            { provider: 'workbuddy-ai', model: 'same', outputTokens: 5, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
            { provider: 'opencode-go', model: 'same', outputTokens: 7, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          ]),
        ],
      ]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 12 },
      wallMs: 1000,
    },
  ];
  const doc = buildUsageDocument(sessions, { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  check('one model on two providers is two rows', doc.models.length === 2, `got ${String(doc.models.length)}`);
  const sources = doc.models.map((m) => m.source).sort();
  check('each row names its own source', sources.join('|') === 'OpenCode Go|WorkBuddy AI', sources.join('|'));
  check('route totals sum to the session total', doc.models.reduce((s, m) => s + m.total, 0) === 12);
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const sessions = [
    {
      id: 'keyed',
      byDay: new Map([
        ['2026-10-19', day([{ provider: 'workbuddy-ai', model: 'm1', outputTokens: 42, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])],
      ]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 42 },
      wallMs: 1000,
    },
  ];
  const doc = buildUsageDocument(sessions, { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  const seriesKey = `${doc.models[0].provider}/${doc.models[0].model}`;
  check('day.byModel is keyed by provider/model', doc.days[0].byModel[seriesKey] === 42, JSON.stringify(doc.days[0].byModel));
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const sessions = [
    {
      id: 'two-days',
      byDay: new Map([
        ['2026-10-19', day([{ provider: 'p', model: 'm', outputTokens: 3, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])],
        ['2026-10-18', day([{ provider: 'p', model: 'm', outputTokens: 1, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])],
      ]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 4 },
      wallMs: 3600000,
    },
  ];
  const doc = buildUsageDocument(sessions, { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  check('active days counts the days that carry usage', doc.totals.activeDays === 2, `got ${String(doc.totals.activeDays)}`);
  check(
    'daily average spreads the total over active days',
    doc.totals.averageTokensPerActiveDay === 2,
    `got ${String(doc.totals.averageTokensPerActiveDay)}`,
  );
  check('no wall-clock duration metric is published', doc.totals.longestSessionMs === undefined);
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const doc = buildUsageDocument([], { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  check('an empty corpus reports no active days', doc.totals.activeDays === 0, `got ${String(doc.totals.activeDays)}`);
  check('an empty corpus reports a zero daily average', doc.totals.averageTokensPerActiveDay === 0);
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const make = (id, turn) => ({
    id,
    byDay: new Map([
      ['2026-10-19', day([{ provider: 'p', model: 'm', outputTokens: 1, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turns: [turn] }])],
    ]),
    byModel: new Map(),
    totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
    wallMs: 1,
  });
  const doc = buildUsageDocument([make('a', 1), make('b', 1)], { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  check('identical turn numbers in two sessions stay distinct', doc.models[0].turns === 2, `got ${String(doc.models[0].turns)}`);
}

{
  const doc = buildUsageDocument([], { now: Date.now(), rangeDays: null, providerLabels: labels, liveIds: new Set() });
  check('empty corpus yields zeros', doc.totals.total === 0 && doc.days.length === 0 && doc.models.length === 0);
}

{
  const base = [{ id: 'x', totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 50 }, byDay: new Map(), byModel: new Map() }];
  const merged = mergeLive(base, new Map([['x', { totals: { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, provider: 'p', model: 'm' }]]));
  check('a zero live report keeps the durable total', merged[0].totals.outputTokens === 50, `got ${String(merged[0].totals.outputTokens)}`);
  check('a live route still overrides the durable one', merged[0].provider === 'p');
}

{
  check(
    'hit rate is cache reads over input',
    cacheHitRate({ cacheReadTokens: 900, cacheWriteTokens: 0, uncachedInputTokens: 100, outputTokens: 5 }) === 90,
    String(cacheHitRate({ cacheReadTokens: 900, cacheWriteTokens: 0, uncachedInputTokens: 100, outputTokens: 5 })),
  );
  check(
    'output tokens are excluded from the rate',
    cacheHitRate({ cacheReadTokens: 900, cacheWriteTokens: 0, uncachedInputTokens: 100, outputTokens: 999999 }) === 90,
  );
  check(
    'a cache write counts as input',
    cacheHitRate({ cacheReadTokens: 500, cacheWriteTokens: 500, uncachedInputTokens: 0 }) === 50,
    String(cacheHitRate({ cacheReadTokens: 500, cacheWriteTokens: 500, uncachedInputTokens: 0 })),
  );
  check('no input yields null rather than 0%', cacheHitRate({ outputTokens: 100 }) === null);
  check('an absent bucket set yields null', cacheHitRate(undefined) === null);
  check('a fully cached prompt is 100%', cacheHitRate({ cacheReadTokens: 10, uncachedInputTokens: 0 }) === 100);
}

{
  check('a whole rate keeps two decimals', formatPercent(90) === '90.00%', formatPercent(90));
  check('a rate rounds to two decimals', formatPercent(4.2812) === '4.28%', formatPercent(4.2812));
  check('two nearby rates stay distinguishable', formatPercent(4.28) !== formatPercent(4.31));
  check('a rate below one keeps its leading zero', formatPercent(0.5) === '0.50%', formatPercent(0.5));
  check('zero prints as 0.00%', formatPercent(0) === '0.00%', formatPercent(0));
  check('a full share prints as 100.00%', formatPercent(100) === '100.00%', formatPercent(100));
  check('a trailing zero is kept', formatPercent(12.3) === '12.30%', formatPercent(12.3));
  check('an unusable rate prints an em dash', formatPercent(undefined) === '—');
  check('a non-finite rate prints an em dash', formatPercent(Number.NaN) === '—');
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const sessions = [
    {
      id: 'cached',
      byDay: new Map([
        ['2026-10-19', day([{ provider: 'p', model: 'm', outputTokens: 0, uncachedInputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0 }])],
      ]),
      byModel: new Map(),
      totals: { uncachedInputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0, outputTokens: 0 },
      wallMs: 1,
    },
  ];
  const doc = buildUsageDocument(sessions, { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });
  check('the document carries a cache hit rate', doc.totals.cacheHitRate === 90, String(doc.totals.cacheHitRate));
  check('the document carries the raw input buckets', doc.totals.cacheReadTokens === 900 && doc.totals.uncachedInputTokens === 100);
}

{
  const now = Date.UTC(2026, 9, 20, 12);
  const route = (outputTokens) => ({ provider: 'p', model: 'm', outputTokens, uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const sessions = [
    { id: 'a', byDay: new Map([['2026-10-19', day([route(300)])]]), byModel: new Map(), totals: route(300), wallMs: 1 },
    { id: 'b', byDay: new Map([['2026-10-19', day([route(200)])]]), byModel: new Map(), totals: route(200), wallMs: 1 },
    { id: 'c', byDay: new Map([['2026-10-19', day([route(100)])]]), byModel: new Map(), totals: route(100), wallMs: 1 },
    { id: 'd', byDay: new Map([['2026-10-18', day([route(400)])]]), byModel: new Map(), totals: route(400), wallMs: 1 },
  ];
  const doc = buildUsageDocument(sessions, { now, rangeDays: 30, providerLabels: labels, liveIds: new Set() });

  check('peak day is the busiest day total', doc.totals.peakDayTokens === 600, String(doc.totals.peakDayTokens));
  check('peak day names the day it came from', doc.totals.peakDay === '2026-10-19', String(doc.totals.peakDay));
  check('the busiest session is still reported separately', doc.totals.peakSessionTokens === 400, String(doc.totals.peakSessionTokens));
  check(
    'peak day differs from the busiest session',
    doc.totals.peakDayTokens !== doc.totals.peakSessionTokens,
  );
  check('peak day equals the largest entry in days', doc.totals.peakDayTokens === Math.max(...doc.days.map((d) => d.total)));
  check('peak day never exceeds the total', doc.totals.peakDayTokens <= doc.totals.total);
  check(
    'peak day is at least the busiest session',
    doc.totals.peakDayTokens >= doc.totals.peakSessionTokens,
  );
}

{
  const doc = buildUsageDocument([], { now: Date.UTC(2026, 9, 20), rangeDays: 7, providerLabels: labels, liveIds: new Set() });
  check('an empty document reports a zero peak day', doc.totals.peakDayTokens === 0, String(doc.totals.peakDayTokens));
  check('an empty document names no peak day', doc.totals.peakDay === null, String(doc.totals.peakDay));
}

console.log('');
if (failures.length > 0) {
  console.log(`${String(failures.length)} TEST(S) FAILED`);
  process.exitCode = 1;
} else {
  console.log('ALL AGGREGATION TESTS PASSED');
}
