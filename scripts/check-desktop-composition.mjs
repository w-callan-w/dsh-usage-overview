import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const runtimeDir = 'D:\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh';
const projectDir = join(process.env.DSH_HOME ?? 'C:\\Users\\lzf\\.dsh', 'profiles', 'desktop');
const extractedRuntime = 'D:\\Programs\\DeepSeek Harness\\.dsh-analysis\\asar\\extracted\\dsh';
const probeRuntime = existsSync(join(runtimeDir, 'node_modules')) ? runtimeDir : extractedRuntime;
const installAnchor = join(probeRuntime, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');

const appBootEntry = join(probeRuntime, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');

console.log(`project dir:     ${projectDir}`);
console.log(`install anchor:  ${installAnchor}`);
console.log(`app-boot:        ${appBootEntry}`);
console.log('');

if (!existsSync(appBootEntry)) {
  console.error('app-boot entry not found; cannot reproduce the composition');
  process.exit(1);
}

function packageDirFromAnchor(anchor, packageName) {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return undefined;
}

const manifest = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'));
const declared = manifest.dsh?.profile?.bundles ?? [];

console.log('declared bundles, in composition order:');
let pluginLayer = -1;
for (const [index, packageName] of declared.entries()) {
  const dir = packageDirFromAnchor(installAnchor, packageName) ?? packageDirFromAnchor(join(projectDir, 'package.json'), packageName);

  const inBox = dir === undefined && packageName.startsWith('@deepseek-ai/dsh-');
  const mark = inBox ? 'in-box' : dir === undefined ? 'UNRESOLVED' : 'loaded';
  if (packageName === 'dsh-usage-overview') pluginLayer = index;
  console.log(`  ${String(index)}. ${mark.padEnd(11)} ${packageName}${dir === undefined ? '' : `\n       ${dir}`}`);
}

console.log('');
if (pluginLayer < 0) {
  console.log('RESULT: dsh-usage-overview is NOT in the desktop profile bundles');
  process.exitCode = 1;
} else {
  console.log(`RESULT: dsh-usage-overview is bundle #${String(pluginLayer)} — the next desktop launch composes it`);
}

const userPatch = join(projectDir, 'cordis.patch.yml');
if (existsSync(userPatch)) {
  const text = readFileSync(userPatch, 'utf8');
  const disablesPlugin = /usage-overview/.test(text) && /disabled:\s*true/.test(text);
  console.log(`user patch mentions usage-overview with disabled:true => ${String(disablesPlugin)}`);
}
