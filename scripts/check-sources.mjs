import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = join(root, 'src', 'client');

const files = readdirSync(clientDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => join(clientDir, name));

let failures = 0;

for (const path of files) {
  const text = readFileSync(path, 'utf8');
  const name = path.slice(root.length + 1).replace(/\\/g, '/');

  if (name.endsWith('styles.js')) {
    const marker = 'export const CSS = `';
    const start = text.indexOf(marker);
    const end = text.lastIndexOf('`;');
    if (start !== -1 && end > start) {
      const inner = text.slice(start + marker.length, end);
      const strays = [...inner.matchAll(/`/g)];
      if (strays.length > 0) {
        failures += 1;
        console.log(`FAIL  ${name}: ${String(strays.length)} stray backtick(s) inside the CSS template`);
        for (const stray of strays) {
          const from = Math.max(0, stray.index - 60);
          console.log(`        ...${inner.slice(from, stray.index + 40).replace(/\n/g, ' | ')}`);
        }
      }
    }
  }

  const body = text
    .replace(/^[ \t]*import[\s\S]*?from\s+'[^']+';?[ \t]*$/gm, '')
    .replace(/^[ \t]*export\s+(?=[{])/gm, '')
    .replace(/^[ \t]*export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '');
  try {
    new vm.Script(body, { filename: name });
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}: ${String(error.message)}`);
    const line = /:(\d+)/.exec(error.stack ?? '');
    if (line !== null) {
      const lines = body.split('\n');
      const at = Number(line[1]);
      for (let n = Math.max(1, at - 2); n <= Math.min(lines.length, at + 2); n += 1) {
        console.log(`      ${n === at ? '>>' : '  '} ${lines[n - 1]}`);
      }
    }
  }
}

console.log('');
if (failures > 0) {
  console.log(`${String(failures)} SOURCE CHECK(S) FAILED`);
  process.exitCode = 1;
} else {
  console.log('ALL SOURCE CHECKS PASSED');
}
