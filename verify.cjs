#!/usr/bin/env node
// Proves the embedded blocks still parse and that a known symbol's range is real.
// Run this BEFORE publishing - a broken </script> escape produces a blank page
// with no error anywhere obvious.
//
//   node verify.js <page.html> [file.js] [symbolName]
const fs = require('fs');

const PAGE = process.argv[2];
const SPOT_FILE = process.argv[3];   // e.g. src/App.jsx
const SPOT_NAME = process.argv[4];   // e.g. quickSaveEvent
if (!PAGE) { console.error('usage: node verify.js <page.html> [file] [symbol]'); process.exit(1); }
const html = fs.readFileSync(PAGE, 'utf8');

const grab = (id) => {
  const open = '<script id="' + id + '" type="application/json">';
  const i = html.indexOf(open);
  if (i < 0) return null;
  return html.slice(i + open.length, html.indexOf('</script>', i));
};

let ok = true, gd = null;
for (const id of ['gd', 'cd']) {
  const raw = grab(id);
  if (!raw) { console.log(id, 'NOT FOUND'); ok = false; continue; }
  let o;
  try { o = JSON.parse(raw); } catch (e) { ok = false; console.log(id, 'JSON PARSE FAILED:', e.message.slice(0, 140)); continue; }

  if (id === 'gd') { gd = o; console.log('gd OK - nodes', o.n.length, 'edges', o.e.length); }
  if (id === 'cd') {
    console.log('cd OK - files', Object.keys(o.f).length, '| ranges', Object.keys(o.r).length);
    if (SPOT_FILE && SPOT_NAME && gd) {
      const qi = gd.n.findIndex((n) => n.l.replace(/\(\)$/, '') === SPOT_NAME && n.f === SPOT_FILE);
      if (qi >= 0 && o.r[qi]) {
        const [s, e] = o.r[qi];
        const lines = o.f[SPOT_FILE].split(/\r?\n/);
        console.log('   ' + SPOT_NAME + ' L' + s + '-L' + e + ' (' + (e - s + 1) + ' lines)');
        console.log('   first:', JSON.stringify(lines[s - 1].trim().slice(0, 70)));
        console.log('   last :', JSON.stringify(lines[e - 1].trim().slice(0, 70)));
      } else { console.log('   ' + SPOT_NAME + ': no range found'); ok = false; }
    }
  }
}
console.log(ok ? 'ALL GOOD' : 'PROBLEM - do not publish');
process.exit(ok ? 0 : 1);
