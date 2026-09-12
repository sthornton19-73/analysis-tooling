#!/usr/bin/env node
// Wraps published-artifact HTML (a body FRAGMENT) into a real standalone document.
//
//   node standalone.js <src.html> <dest.html>
//
// The artifact platform supplies doctype/head/body at publish time. Saved to disk
// as-is the file renders in quirks mode with no viewport meta, so wrap it and lift
// <title> and any <link> up into a real <head>.
const fs = require('fs');
const path = require('path');

const [, , SRC, DEST] = process.argv;
if (!SRC || !DEST) { console.error('usage: node standalone.js <src.html> <dest.html>'); process.exit(1); }

const HEAD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:14px system-ui,-apple-system,sans-serif}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
`;

let html = fs.readFileSync(SRC, 'utf8');
const head = [];
html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, (m) => { head.push(m.trim()); return ''; });
html = html.replace(/<link\b[^>]*>\s*/gi, (m) => { head.push(m.trim()); return ''; });

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, HEAD + head.join('\n') + '\n</head>\n<body>\n' + html.trim() + '\n</body>\n</html>\n');
console.log(path.basename(DEST), (fs.statSync(DEST).size / 1024 / 1024).toFixed(2) + 'MB');
