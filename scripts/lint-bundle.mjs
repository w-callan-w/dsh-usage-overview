import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
const lines = source.split('\n');

try {
  new vm.Script(source, { filename: 'client.js' });
  console.log('bundle compiles cleanly');
} catch (error) {
  console.log(`error: ${error.message}`);
  const match = /client\.js:(\d+)/.exec(error.stack ?? '');
  if (match !== null) {
    const line = Number(match[1]);
    console.log(`reported line: ${String(line)}`);
    for (let n = Math.max(1, line - 3); n <= Math.min(lines.length, line + 3); n += 1) {
      console.log(`${n === line ? '>>' : '  '} ${String(n).padStart(5)}  ${lines[n - 1]}`);
    }
  } else {
    for (let end = 1; end <= lines.length; end += 1) {
      const candidate = lines.slice(0, end).join('\n');
      let depth = 0;
      let quote = null;
      let escaped = false;
      for (const char of candidate) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (quote !== null) { if (char === quote) quote = null; continue; }
        if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if ('{(['.includes(char)) depth += 1;
        if ('})]'.includes(char)) depth -= 1;
      }
      if (depth !== 0 || quote !== null) continue;
      try {
        new vm.Script(candidate, { filename: 'client.js' });
      } catch (inner) {
        if (/Invalid|Unexpected/.test(inner.message)) {
          console.log(`first bad line: ${String(end)}`);
          console.log(`  >> ${lines[end - 1]}`);
          break;
        }
      }
    }
  }
}
