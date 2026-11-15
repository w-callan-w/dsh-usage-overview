import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');
const outDir = join(root, 'lib');

const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]);

function parseModule(source, file) {
  const imports = [];
  const body = source.replace(
    /^[ \t]*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm,
    (match, clause, specifier) => {
      if (typeof clause !== 'string') throw new Error(`unparsable import in ${file}`);
      imports.push({ clause: clause.trim(), specifier });
      return '';
    },
  );
  return { imports, body: body.trim() };
}

function bindingFor(clause, binding, file) {
  if (clause.startsWith('*')) {
    const name = clause.replace(/^\*\s*as\s*/, '').trim();
    return `const ${name} = ${binding};`;
  }
  if (clause.startsWith('{')) {
    const inner = clause.replace(/^\{([\s\S]*)\}$/, '$1');
    const pairs = inner
      .split(',')
      .map((piece) => piece.trim())
      .filter((piece) => piece.length > 0 && !piece.startsWith('type '))
      .map((piece) => {
        const parts = piece.split(/\s+as\s+/);
        const source = (parts[0] ?? '').trim();
        const local = (parts[1] ?? parts[0] ?? '').trim();
        return `${source}: ${local}`;
      });
    return `const { ${pairs.join(', ')} } = ${binding};`;
  }
  const commaIndex = clause.indexOf(',');
  if (commaIndex !== -1) {
    const defaultName = clause.slice(0, commaIndex).trim();
    const rest = clause.slice(commaIndex + 1).trim();
    const restBinding = rest.startsWith('*')
      ? `const ${rest.replace(/^\*\s*as\s*/, '').trim()} = ${binding};`
      : `const ${rest} = ${binding};`;
    return `const ${defaultName} = (${binding}.default ?? ${binding});\n${restBinding}`;
  }
  if (clause.startsWith('type ')) return '';
  return `const ${clause} = (${binding}.default ?? ${binding});`;
}

function resolveSpecifier(specifier, fromFile) {
  if (!specifier.startsWith('.')) return specifier;
  return resolve(dirname(fromFile), specifier);
}

async function collectGraph() {
  const entry = join(srcDir, 'client', 'index.js');
  const ordered = [];
  const seen = new Set();
  const visiting = new Set();

  async function visit(file) {
    if (seen.has(file)) return;
    if (visiting.has(file)) throw new Error(`import cycle through ${relative(root, file)}`);
    visiting.add(file);

    const source = await readFile(file, 'utf8');
    const { imports, body } = parseModule(source, file);

    const deps = [];
    for (const item of imports) {
      const target = resolveSpecifier(item.specifier, file);
      if (typeof target === 'string' && (target.startsWith('/') || /^[A-Za-z]:/.test(target))) {
        await visit(target);
        deps.push({ ...item, resolved: target });
      } else {
        deps.push({ ...item, resolved: null });
      }
    }

    visiting.delete(file);
    seen.add(file);
    ordered.push({ file, body, deps, exported: exportNamesOf(body) });
  }

  await visit(entry);
  return ordered;
}

function renderClientBundle(graph) {
  const idFor = new Map();
  graph.forEach((module, index) => {
    idFor.set(module.file, `__m${String(index)}`);
  });

  const parts = [];
  graph.forEach((module, index) => {
    const bindings = module.deps
      .map((dep) => {
        if (dep.resolved === null) {
          return bindingFor(dep.clause, `require(${JSON.stringify(dep.specifier)})`, module.file);
        }
        return bindingFor(dep.clause, idFor.get(dep.resolved), module.file);
      })
      .filter((line) => line.length > 0)
      .join('\n');

    const exported = module.exported;
    const body = stripExports(module.body);
    parts.push(
      `// ---- ${relative(root, module.file).replace(/\\/g, '/')} ----\n` +
        `const __m${String(index)} = (() => {\n${bindings}\n\n${body}\nreturn { ${exported.join(', ')} };\n})();`,
    );
  });

  return `window.__ModuleLoader__.load({
\tid: "dsh-usage-overview",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${indent(parts.join('\n\n'), 2)}
\t\tmodule.exports.apply = __m${String(graph.length - 1)}.apply;
\t\tmodule.exports.inject = __m${String(graph.length - 1)}.inject;
\t\treturn module.exports;
\t}
});
`;
}

function exportNamesOf(body) {
  const names = new Set();
  for (const match of body.matchAll(/^[ \t]*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) {
    if (typeof match[1] === 'string') names.add(match[1]);
  }
  for (const match of body.matchAll(/^[ \t]*export\s*\{([^}]*)\}/gm)) {
    const list = match[1];
    if (typeof list !== 'string') continue;
    for (const piece of list.split(',')) {
      const trimmed = piece.trim();
      if (trimmed.length === 0) continue;
      const alias = trimmed.split(/\s+as\s+/);
      const exported = (alias[1] ?? alias[0]).trim();
      if (exported.length > 0) names.add(exported);
    }
  }
  return [...names];
}

function stripExports(body) {
  return body
    .replace(/^([ \t]*)export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/gm, '$1')
    .replace(/^[ \t]*export\s*\{[^}]*\};?[ \t]*$/gm, '');
}

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n');
}

async function build() {
  await mkdir(outDir, { recursive: true });

  const hostModules = ['protocol.js', 'log-fold.js', 'usage.js', 'index.js'];
  for (const name of hostModules) {
    const source = await readFile(join(srcDir, name), 'utf8');
    await writeFile(join(outDir, name), source, 'utf8');
  }

  const graph = await collectGraph();

  await writeFile(join(outDir, 'client.js'), renderClientBundle(graph), 'utf8');

  console.log(`built host half: ${hostModules.map((name) => `lib/${name}`).join(', ')}`);
  console.log(`built lib/client.js from ${String(graph.length)} browser modules`);
}

await build();
