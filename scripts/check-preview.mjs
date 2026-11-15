import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'preview', 'dashboard.html'), 'utf8');

function textsFor(className) {
  const pattern = new RegExp(`class="${className}"[^>]*>([^<]*)<`, 'g');
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
  if (!condition) failures.push(label);
};

check('no className leaked into the HTML', !html.includes('className='));

const legend = textsFor('dus-legend-val').filter((text) => text.includes('tokens'));
check('trend legend reports a real total', legend.length > 0 && legend.every((t) => !t.includes('—')), legend.join(' | '));

const tokens = textsFor('dus-model-tokens');
check('donut rows report token counts', tokens.length > 0 && tokens.every((t) => t.includes('tokens')), tokens.join(' | '));

const sources = textsFor('dus-model-src');
check('donut rows carry a provider source', sources.length > 0, sources.join(' | '));

check(
  'model usage trend chart rendered',
  html.includes('aria-label="各模型用量趋势"') && html.includes('各模型用量趋势'),
);

const stackSegments = (html.match(/class="dus-stack-seg"/g) ?? []).length;
check('model usage trend has stacked segments', stackSegments > 0, `${String(stackSegments)} segments`);

const cards = textsFor('dus-card-value');
check('six headline cards rendered', cards.length === 6, cards.join(' | '));

const percents = textsFor('dus-model-pct');
check(
  'every donut share prints two decimals',
  percents.length > 0 && percents.every((t) => /^\d+\.\d{2}%$/.test(t)),
  percents.join(' | '),
);

const heat = (html.match(/class="dus-heat-cell"/g) ?? []).length;
check('heatmap rendered cells', heat > 20, `${String(heat)} cells`);

check(
  'daily cache-rate chart rendered',
  html.includes('aria-label="每日平均缓存命中率"') && html.includes('每日命中率'),
);

const paths = (html.match(/<path /g) ?? []).length;
check('trend chart drew a path', paths > 0, `${String(paths)} paths`);

console.log('');
if (failures.length > 0) {
  console.log(`${String(failures.length)} CHECK(S) FAILED`);
  process.exitCode = 1;
} else {
  console.log('ALL PREVIEW CHECKS PASSED');
}
