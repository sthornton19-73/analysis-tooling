#!/usr/bin/env node
// Builds { f: {relPath: source}, r: {nodeIdx: [startLine, endLine]} }.
//
//   node build-codedata.js <repo-root> [out-dir]
//
// graphify records where a symbol STARTS but not where it ENDS. Guessing the end
// (next blank line, next symbol, brace counting) is wrong often enough to be worse
// than useless in a document someone is relying on. So parse properly:
//   JS/JSX/MJS/TS  -> @babel/parser (already in node_modules of any Vite/React app)
//   Python         -> the stdlib `ast` module via py-ranges.py
//   PHP            -> token_get_all via php-ranges.php (needs a php binary; set PHP=... to
//                     point at one that is not on PATH)
// Anything we cannot parse gets NO range, and the UI must label it "approximate"
// rather than silently showing a wrong slice.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// String.fromCharCode(92) is a backslash, written this way so the file survives
// shells and heredocs that collapse escaped backslashes.
const BS = String.fromCharCode(92);
const slash = (s) => String(s || '').split(BS).join('/');

const ROOT = slash(process.argv[2] || process.cwd());
const OUT = process.argv[3] || __dirname;
const graph = JSON.parse(fs.readFileSync(path.join(OUT, 'graphdata.json'), 'utf8'));

// Resolve @babel/parser from the TARGET repo first, then from here.
let babel;
for (const p of [path.join(ROOT, 'node_modules/@babel/parser'), '@babel/parser']) {
  try { babel = require(p); break; } catch (e) {}
}
if (!babel) { console.error('@babel/parser not found - npm i -D @babel/parser'); process.exit(1); }

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'graphify-out', 'coverage', '__pycache__', '.vite', '.next', 'vendor']);
const JS = /\.(jsx?|mjs|cjs|tsx?)$/i;
const OTHER = /\.(py|php)$/i;   // languages with their own out-of-process extractor

// ── 1. walk the repo ───────────────────────────────────────────────────
const sources = {};
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(full); continue; }
    if (!JS.test(ent.name) && !OTHER.test(ent.name)) continue;
    const rel = slash(path.relative(ROOT, full));
    try { sources[rel] = fs.readFileSync(full, 'utf8'); } catch (e) {}
  }
})(ROOT);

// ── 2. JS/TS ranges ────────────────────────────────────────────────────
const ranges = {}; // rel -> [[name, startLine, endLine], ...]
const WANT = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'ClassDeclaration', 'ClassExpression', 'ClassMethod', 'ObjectMethod', 'ClassProperty',
  'TSDeclareMethod', 'TSInterfaceDeclaration']);

function nameOf(n, parent) {
  if (n.id && n.id.name) return n.id.name;
  if (n.key && (n.key.name || n.key.value)) return String(n.key.name || n.key.value);
  // `const foo = () => {}` - the name lives on the declarator, not the arrow.
  if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.name) return parent.id.name;
  return null;
}

let jsOk = 0, jsFail = 0;
for (const rel of Object.keys(sources)) {
  if (!JS.test(rel)) continue;
  let ast;
  try {
    ast = babel.parse(sources[rel], {
      sourceType: 'module',
      errorRecovery: true, // a parse error in one file must not lose the whole file
      plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining',
        'nullishCoalescingOperator', 'dynamicImport', 'topLevelAwait',
        ...(/\.tsx?$/i.test(rel) ? ['typescript'] : [])],
    });
    jsOk++;
  } catch (e) { jsFail++; continue; }

  const rows = [];
  (function visit(node, parent) {
    if (!node || typeof node.type !== 'string') return;
    if (WANT.has(node.type) && node.loc) rows.push([nameOf(node, parent), node.loc.start.line, node.loc.end.line]);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, node));
      else if (v && typeof v.type === 'string') visit(v, node);
    }
  })(ast.program, null);
  if (rows.length) ranges[rel] = rows;
}

// ── 3. Python ranges ───────────────────────────────────────────────────
let pyCount = 0;
const pyMarker = path.join(ROOT, 'graphify-out/.graphify_python');
const pyExe = fs.existsSync(pyMarker) ? fs.readFileSync(pyMarker, 'utf8').trim() : 'python';
try {
  const raw = cp.execFileSync(pyExe, [path.join(__dirname, 'py-ranges.py'), ROOT], { maxBuffer: 1 << 26 }).toString();
  const pyR = JSON.parse(raw);
  for (const rel of Object.keys(pyR)) { ranges[rel] = pyR[rel]; pyCount++; }
} catch (e) {
  console.error('python range extraction skipped:', e.message.split('\n')[0]);
}

// ── 3b. PHP ranges ─────────────────────────────────────────────────────
// Only look for a php binary if the repo actually contains PHP, so a JS-only repo does not
// get a spurious "not found" line. `-n` ignores php.ini: token_get_all is core, and a
// php.ini that references a missing extension otherwise prints a startup warning.
let phpCount = 0;
const phpFiles = Object.keys(sources).filter((rel) => /\.php$/i.test(rel));
if (phpFiles.length) {
  const phpExe = process.env.PHP || 'php';
  try {
    const raw = cp.execFileSync(phpExe, ['-n', path.join(__dirname, 'php-ranges.php'), ROOT], { maxBuffer: 1 << 26 }).toString();
    const phpR = JSON.parse(raw);
    for (const rel of Object.keys(phpR)) { ranges[rel] = phpR[rel]; phpCount++; }
  } catch (e) {
    console.error('php range extraction skipped (' + phpFiles.length + ' php files will be approximate):', e.message.split('\n')[0]);
  }
}

// ── 4. match graph nodes to ranges ─────────────────────────────────────
const nodeRange = {};
let matched = 0, unmatched = 0;
graph.n.forEach((n, i) => {
  if (!n.f || !n.ln || !sources[n.f]) return;
  const line = parseInt(String(n.ln).replace(/\D/g, ''), 10);
  if (!line) return;
  const rows = ranges[n.f];
  if (!rows) { unmatched++; return; }

  const at = rows.filter((r) => r[1] === line);
  let pick = null;
  // graphify labels callables "name()" - strip the parens before comparing, or the
  // name tiebreak never fires and every match silently falls back to widest-wins.
  const bare = String(n.l || '').replace(/\(\)$/, '').toLowerCase();
  if (at.length) {
    pick = at.find((r) => r[0] && r[0].toLowerCase() === bare)
        || at.sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]))[0];
  } else {
    // Start line sits inside a wrapper (decorated / assigned fn): take the tightest
    // range that contains it and begins within 2 lines.
    const near = rows.filter((r) => r[1] >= line - 2 && r[1] <= line && r[2] >= line);
    if (near.length) pick = near.sort((a, b) => (a[2] - a[1]) - (b[2] - b[1]))[0];
  }
  if (pick) { nodeRange[i] = [pick[1], pick[2]]; matched++; } else { unmatched++; }
});

// ── 5. emit only the files the graph actually references ───────────────
const used = new Set();
graph.n.forEach((n) => { if (n.f && sources[n.f]) used.add(n.f); });
const outFiles = {};
for (const rel of used) outFiles[rel] = sources[rel];

const outPath = path.join(OUT, 'codedata.json');
fs.writeFileSync(outPath, JSON.stringify({ f: outFiles, r: nodeRange }));

console.log('js parsed ok ', jsOk, '| failed', jsFail);
console.log('py files     ', pyCount);
console.log('php files    ', phpCount);
console.log('exact ranges ', matched, '| no range (label these "approximate")', unmatched);
console.log('files embedded', Object.keys(outFiles).length);
console.log('bytes        ', (fs.statSync(outPath).size / 1024).toFixed(0) + 'KB');
