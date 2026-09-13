#!/usr/bin/env node
// Injects graphdata.json / codedata.json into the <script type="application/json">
// placeholders of a symbol-index page, escaping the sequence that would break it.
//
//   node inject.js <page.html> [data-dir]
//
// THE TRAP: any literal "</" inside a <script> block ends the block, even inside a
// JSON string. Source code is full of "</div>", "</script>", regex like /<\/a>/.
// "<\/" is a valid JSON escape for "/", so the JSON still parses and the tag survives.
const fs = require('fs');
const path = require('path');

const PAGE = process.argv[2];
const DIR = process.argv[3] || __dirname;
if (!PAGE) { console.error('usage: node inject.js <page.html> [data-dir]'); process.exit(1); }

let html = fs.readFileSync(PAGE, 'utf8');

for (const [id, file] of [['gd', 'graphdata.json'], ['cd', 'codedata.json']]) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) { console.log('skip (missing):', file); continue; }
  // Note: '<' + backslash + '/'. Written with fromCharCode because a literal
  // '<\\/' does not survive being pasted through a shell heredoc, and the failure
  // is silent - you get a blank page, not an error.
  const safe = fs.readFileSync(p, 'utf8').split('</').join('<' + String.fromCharCode(92) + '/');

  const open = '<script id="' + id + '" type="application/json">';
  const i = html.indexOf(open);
  if (i < 0) { console.error('placeholder #' + id + ' not found in page'); process.exit(1); }
  const j = html.indexOf('</script>', i);
  html = html.slice(0, i + open.length) + safe + html.slice(j);
  console.log('injected', id, '<-', file);
}

fs.writeFileSync(PAGE, html);
console.log('page', (fs.statSync(PAGE).size / 1024 / 1024).toFixed(2) + 'MB');
