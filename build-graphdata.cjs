#!/usr/bin/env node
// Compacts graphify-out/graph.json into the small shape the symbol index needs.
//
//   node build-graphdata.js <repo-root> [out-dir]
//
// Output: <out-dir>/graphdata.json  ->  { n: [node...], e: [[srcIdx, tgtIdx, relation]...] }
//
// Keys are one letter on purpose: this JSON is embedded verbatim in a single-file
// HTML page, and the long form roughly triples the payload.
const fs = require('fs');
const path = require('path');

// Normalise Windows path separators. \ is a backslash, written as a unicode
// escape so this file survives shells and heredocs that eat literal backslashes.
const BS = String.fromCharCode(92);
const slash = (s) => String(s || '').split(BS).join('/');

const ROOT = slash(process.argv[2] || process.cwd());
const OUT = process.argv[3] || __dirname;
const GRAPH = path.join(ROOT, 'graphify-out/graph.json');

if (!fs.existsSync(GRAPH)) {
  console.error('No graph at ' + GRAPH + ' - run /graphify first.');
  process.exit(1);
}
const g = JSON.parse(fs.readFileSync(GRAPH, 'utf8'));

// A node whose label looks like a filename is a module, not a symbol.
const isMod = (l) => /\.(jsx?|mjs|tsx?|py|go|rb|cs|java|kt|rs|php|yml|yaml|json|html|md|sql)$/i.test(l || '');

const nodes = g.nodes.map((n) => ({
  i: n.id,                                        // graphify id
  l: n.label || n.id,                             // display label ("foo()" for callables)
  f: slash(n.source_file), // repo-relative, forward slashes
  ln: n.source_location || '',                    // usually "L123" or "123"
  c: n.community,                                 // Louvain community number
  cn: n.community_name || '',
  o: n._origin === 'ast' ? 1 : 0,                 // 1 = extracted from AST, 0 = LLM-inferred
  k: isMod(n.label) ? 'module'
    : n._callable_class ? 'class'
    : n._callable ? 'fn'
    : n.file_type === 'code' ? 'sym'
    : n.file_type || 'concept',
}));

// Edges reference nodes by array index, not id - smaller and faster to look up.
const idx = new Map(nodes.map((n, j) => [n.i, j]));
const edges = [];
let dropped = 0;
for (const e of g.links) {
  const s = idx.get(e.source);
  const t = idx.get(e.target);
  if (s === undefined || t === undefined) { dropped++; continue; }
  edges.push([s, t, e.relation]);
}

fs.mkdirSync(OUT, { recursive: true });
const out = path.join(OUT, 'graphdata.json');
fs.writeFileSync(out, JSON.stringify({ n: nodes, e: edges }));

const kinds = {};
nodes.forEach((n) => (kinds[n.k] = (kinds[n.k] || 0) + 1));
console.log('nodes        ', nodes.length);
console.log('edges kept   ', edges.length, '| dropped (dangling)', dropped);
console.log('kinds        ', kinds);
console.log('files         ', new Set(nodes.filter((n) => n.f).map((n) => n.f)).size);
console.log('bytes        ', (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
