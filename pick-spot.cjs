#!/usr/bin/env node
// Lists spot-check candidates for verify.cjs, read out of a built symbol index.
//
//   node pick-spot.cjs <page.html> [count]
//
// run.cjs takes an optional file and symbol as its last two arguments and hands them
// to verify.cjs, which matches them as exact strings against graphify's own labels.
// Guessing that pair off the filesystem gets "no range found" for the wrong reason,
// so build the page once with no spot arguments, run this, and pass the two columns
// it prints back to verify.cjs.
//
// Output is longest-body-first because the gate is a human reading the symbol's last
// line. A three-line function satisfies any end-of-body check by accident.
const fs = require('fs');

const PAGE = process.argv[2];
const COUNT = parseInt(process.argv[3], 10) || 12;
if (!PAGE) { console.error('usage: node pick-spot.cjs <page.html> [count]'); process.exit(1); }
const html = fs.readFileSync(PAGE, 'utf8');

const grab = (id) => {
  const open = '<script id="' + id + '" type="application/json">';
  const i = html.indexOf(open);
  if (i < 0) { console.error(id + ' block not found in ' + PAGE); process.exit(1); }
  return JSON.parse(html.slice(i + open.length, html.indexOf('</script>', i)));
};

const gd = grab('gd'), cd = grab('cd');

const rows = Object.keys(cd.r)
  .map((k) => {
    const n = gd.n[k], [s, e] = cd.r[k];
    return { name: n.l.replace(/\(\)$/, ''), file: n.f, len: e - s + 1, ast: n.o, kind: n.k };
  })
  // fn and class only. A rationale node shares its symbol's exact range but its label
  // is a prose sentence, so it would list as a duplicate that can never be matched.
  .filter((x) => (x.kind === 'fn' || x.kind === 'class') && x.ast && x.len > 15)
  // verify.cjs reads the body out of cd.f, and not every file with a range is embedded.
  .filter((x) => cd.f[x.file])
  // A leading dot is graphify's form for a method. Its own class is the better check.
  .filter((x) => !x.name.startsWith('.'))
  .sort((a, b) => b.len - a.len);

if (!rows.length) { console.log('no candidates - every ranged symbol was filtered out'); process.exit(1); }

// Prefer something outside the test tree: a spot check is meant to prove the range
// extractor works on the code the document is actually about.
const src = rows.filter((x) => !/(^|\/)(tests?|spec)\//i.test(x.file));
for (const x of (src.length ? src : rows).slice(0, COUNT)) {
  console.log(String(x.len).padStart(5) + ' lines  ' + x.file + '  ' + x.name);
}

const best = (src.length ? src : rows)[0];
console.log('\nverify with:\n  node ' + __filename.replace(/pick-spot\.cjs$/, 'verify.cjs')
  + ' ' + PAGE + ' ' + best.file + ' ' + best.name);
