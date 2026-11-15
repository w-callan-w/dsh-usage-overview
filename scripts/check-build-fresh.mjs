import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const committed = new Map();
for (const name of readdirSync(join(root, 'lib'))) {
  committed.set(name, readFileSync(join(root, 'lib', name), 'utf8'));
}

await run(process.execPath, [join(root, 'scripts', 'build.mjs')], { cwd: root });

let differences = 0;
for (const [name, before] of committed) {
  const after = readFileSync(join(root, 'lib', name), 'utf8');
  if (after === before) {
    console.log(`PASS  lib/${name} matches a fresh build`);
  } else {
    differences += 1;
    console.log(`FAIL  lib/${name} was stale (${String(before.length)} -> ${String(after.length)} bytes)`);
  }
}

console.log('');
if (differences > 0) {
  console.log(`${String(differences)} FILE(S) WERE STALE — rebuild and commit lib/`);
  process.exitCode = 1;
} else {
  console.log('lib/ is in sync with src/');
}
