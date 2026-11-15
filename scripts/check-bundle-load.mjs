import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const appPackage = 'D:\\Programs\\DeepSeek Harness\\resources\\app.asar\\dsh\\package.json';
const profileDir = join(process.env.DSH_HOME ?? 'C:\\Users\\lzf\\.dsh', 'profiles', 'desktop');

function packageDirFromAnchor(anchor, packageName) {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return undefined;
}

function resolveBundleDir(packageName) {
  for (const anchor of [appPackage, join(profileDir, 'package.json')]) {
    const dir = packageDirFromAnchor(anchor, packageName);
    if (dir !== undefined) return dir;
  }
  return undefined;
}

function bundlePatchFiles(bundle) {
  const declared = typeof bundle.patch === 'string' ? [bundle.patch] : bundle.patch;
  if (!Array.isArray(declared) || !declared.every((file) => typeof file === 'string')) {
    throw new Error('dsh.bundle.patch must be a file path or a list of file paths');
  }
  return declared;
}

const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
const bundles = manifest.dsh?.profile?.bundles ?? [];

console.log(`profile: ${profileDir}`);
console.log(`bundles: ${bundles.join(', ')}`);
console.log('');

let failed = 0;

for (const packageName of bundles) {
  try {
    const dir = resolveBundleDir(packageName);
    if (dir === undefined) {
      throw new Error(`cannot resolve from the dsh installation or ${profileDir}`);
    }
    const bundleManifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const bundle = bundleManifest.dsh?.bundle;
    if (bundle === undefined) {
      throw new Error('declares no dsh.bundle in its package.json');
    }
    const patchPaths = bundlePatchFiles(bundle).map((file) => join(dir, file));
    for (const patchPath of patchPaths) {
      if (!existsSync(patchPath)) throw new Error(`patch file missing: ${patchPath}`);
    }

    let clientNote = '';
    if (bundleManifest.dsh?.client !== undefined) {
      const client = bundleManifest.dsh.client;
      if (typeof client.platform !== 'string') throw new Error('dsh.client.platform must be a string');
      const exported = bundleManifest.exports?.['./client'];
      if (exported === undefined) throw new Error('declares dsh.client but exports no "./client" bundle');
      if (typeof exported !== 'string') throw new Error('exports["./client"] must be a string');
      const clientPath = join(dirname(join(dir, 'package.json')), exported);
      if (!existsSync(clientPath)) throw new Error(`client bundle missing: ${clientPath}`);
      clientNote = ` | client: ${exported} (${String(statSync(clientPath).size)} bytes)`;
    }

    console.log(`OK    ${packageName}`);
    console.log(`        dir: ${dir}`);
    console.log(`        patches: ${patchPaths.map((p) => basename(p)).join(', ')}${clientNote}`);
  } catch (error) {
    failed += 1;
    console.log(`SKIP  ${packageName}`);
    console.log(`        reason: ${String(error.message ?? error)}`);
  }
}

console.log('');
console.log(failed === 0 ? 'RESULT: every bundle loads (dsh-usage-overview is loadable)' : `RESULT: ${String(failed)} bundle(s) would be skipped`);

const nodeModules = join(profileDir, 'node_modules');
if (existsSync(nodeModules)) {
  const dirs = readdirSync(nodeModules).filter((name) => name.startsWith('dsh-'));
  console.log(`installed plugin packages: ${dirs.join(', ')}`);
}
