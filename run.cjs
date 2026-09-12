#!/usr/bin/env node
// One-shot: graph -> ranges -> page -> verify. Run from anywhere.
//
//   node run.cjs <repo-root> "<Project Name>" [spotFile] [spotSymbol]
//
// Assumes /graphify has already been run in <repo-root> (needs graphify-out/graph.json).
// Writes <repo-root>/docs/symbol-index.html and leaves the intermediate JSON in
// <repo-root>/docs/.analysis-cache/ so a rebuild after --update is fast.
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(process.argv[2] || process.cwd());
const NAME = process.argv[3] || path.basename(ROOT);
const SPOT_FILE = process.argv[4];
const SPOT_SYM = process.argv[5];

const CACHE = path.join(ROOT, 'docs/.analysis-cache');
const PAGE = path.join(ROOT, 'docs/symbol-index.html');

if (!fs.existsSync(path.join(ROOT, 'graphify-out/graph.json'))) {
  console.error('No graphify-out/graph.json in ' + ROOT);
  console.error('Open Claude Code in that repo and run:  /graphify . --directed');
  process.exit(1);
}

const run = (script, args) => {
  console.log('\n== ' + script + ' ==');
  cp.execFileSync(process.execPath, [path.join(HERE, script), ...args], { stdio: 'inherit' });
};

fs.mkdirSync(CACHE, { recursive: true });
run('build-graphdata.cjs', [ROOT, CACHE]);
run('build-codedata.cjs', [ROOT, CACHE]);

console.log('\n== page ==');
const tpl = fs.readFileSync(path.join(HERE, 'symbol-index-template.html'), 'utf8');
fs.mkdirSync(path.dirname(PAGE), { recursive: true });
fs.writeFileSync(PAGE, tpl.split('{{PROJECT}}').join(NAME));
console.log('template -> ' + PAGE);

run('inject.cjs', [PAGE, CACHE]);
run('verify.cjs', [PAGE, ...(SPOT_FILE && SPOT_SYM ? [SPOT_FILE, SPOT_SYM] : [])]);

console.log('\nOpen: ' + PAGE);
