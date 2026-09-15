#!/usr/bin/env node
// Module boundaries: which parts of the tree depend on which, and how heavily.
//
//   node modules.cjs <repo-root> [--under src] [--big 25] [--min-child 8] [--top 20]
//
// Feeds section 4 of the architecture document. Print the module table AND the
// edge table into the document, and state the grouping rule next to them.
//
// There is no such thing as a module in a filesystem, so this groups by path
// prefix and the grouping rule is the whole story. A fixed depth does not work:
// depth 2 buried a 78-file subsystem inside src/workflow and showed it as one row
// beside a single-file directory, which made the section read as though the repo
// were laid out strangely when the real problem was the grouping. So the depth
// varies: a group over --big files is split one level deeper, but only children
// with at least --min-child files are promoted. Everything smaller stays with its
// parent rather than littering the table with three-file rows.
//
// Report the file counts in the document. Without them a reader cannot tell a
// subsystem from a leaf directory, and every row looks like a peer of every other.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = path.resolve(argv.find((a) => !a.startsWith('--') &&
  argv[argv.indexOf(a) - 1] !== '--under' &&
  !['--big', '--min-child', '--top'].includes(argv[argv.indexOf(a) - 1])) || process.cwd());

const UNDER = opt('--under', 'src');
const BIG = parseInt(opt('--big', '25'), 10);
const MIN_CHILD = parseInt(opt('--min-child', '8'), 10);
const TOP = parseInt(opt('--top', '20'), 10);
const MAX_DEPTH = 4;

const GD = path.join(ROOT, 'docs/.analysis-cache/graphdata.json');
if (!fs.existsSync(GD)) {
  console.error('no ' + GD + ' - run run.cjs first');
  process.exit(1);
}
const gd = JSON.parse(fs.readFileSync(GD, 'utf8'));

const seg = (f) => String(f || '').split('/').filter(Boolean);
const inScope = (f) => f && (UNDER === '.' || f.startsWith(UNDER + '/'));

const files = [...new Set(gd.n.map((n) => n.f).filter(inScope))];
if (!files.length) {
  console.error('no files under ' + UNDER + '/ in the graph');
  process.exit(1);
}

// Start everything at depth 2, then deepen only the groups that are too coarse.
const group = {};
files.forEach((f) => {
  const s = seg(f);
  group[f] = s.length > 2 ? s.slice(0, 2).join('/') : s[0];
});

for (let depth = 2; depth < MAX_DEPTH; depth++) {
  const size = {};
  files.forEach((f) => { size[group[f]] = (size[group[f]] || 0) + 1; });
  let moved = false;
  for (const [g, n] of Object.entries(size)) {
    if (n <= BIG || seg(g).length !== depth) continue;
    const kids = {};
    files.filter((f) => group[f] === g).forEach((f) => {
      const k = seg(f).slice(0, depth + 1).join('/');
      if (k !== g) (kids[k] = kids[k] || []).push(f);
    });
    for (const [k, members] of Object.entries(kids)) {
      if (members.length >= MIN_CHILD) { members.forEach((f) => { group[f] = k; }); moved = true; }
    }
  }
  if (!moved) break;
}

const count = {};
files.forEach((f) => { count[group[f]] = (count[group[f]] || 0) + 1; });

// Only calls and imports. Other relation types describe the graph rather than
// the code's dependency structure, and inflate the counts without adding meaning.
const agg = {};
let skippedOutOfScope = 0;
gd.e.forEach(([s, t, rel]) => {
  const a = gd.n[s], b = gd.n[t];
  if (!a || !b) return;
  if (rel !== 'calls' && rel !== 'imports') return;
  if (!inScope(a.f) || !inScope(b.f)) { skippedOutOfScope++; return; }
  const x = group[a.f], y = group[b.f];
  if (!x || !y || x === y) return;
  const k = x + ' -> ' + y;
  agg[k] = (agg[k] || 0) + 1;
});

const rule = 'grouped by path prefix under ' + UNDER + '/, starting at depth 2; a group over ' +
  BIG + ' files is split one level deeper, and only children with ' + MIN_CHILD +
  '+ files are promoted';

console.log('MODULES  (' + Object.keys(count).length + ' groups, ' + files.length + ' files)');
console.log('Rule: ' + rule + '.\n');
console.log('  files  module');
Object.entries(count).sort((a, b) => b[1] - a[1])
  .forEach(([g, n]) => console.log('  ' + String(n).padStart(5) + '  ' + g));

console.log('\nCROSS-MODULE EDGES  (calls and imports, both ends under ' + UNDER + '/)');
console.log('  ' + skippedOutOfScope + ' edges ignored with an end outside ' + UNDER +
  '/, which are mostly test-to-source and measure coverage rather than coupling.\n');
console.log('  count  edge');
const edges = Object.entries(agg).sort((x, y) => y[1] - x[1]);
edges.slice(0, TOP).forEach(([k, v]) => console.log('  ' + String(v).padStart(5) + '  ' + k));
if (edges.length > TOP) console.log('  ... ' + (edges.length - TOP) + ' more below the top ' + TOP);

// A cycle between two modules is worth saying out loud: it is the thing a layered
// diagram cannot show, and the thing a reader most wants flagged.
const back = edges.filter(([k]) => {
  const [x, y] = k.split(' -> ');
  return agg[y + ' -> ' + x];
});
if (back.length) {
  console.log('\nTWO-WAY PAIRS  (the dependency is not one-way; say so in the document)');
  const seen = new Set();
  back.forEach(([k, v]) => {
    const [x, y] = k.split(' -> ');
    const key = [x, y].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    console.log('  ' + x + ' <-> ' + y + '  (' + v + ' / ' + agg[y + ' -> ' + x] + ')');
  });
}
