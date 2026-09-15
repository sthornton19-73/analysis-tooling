#!/usr/bin/env node
// Every machine-checkable gate in SESSION-RUNBOOK.md, in one place.
//
//   node gates.cjs <repo-root> [phase]
//
// With no phase, runs every gate whose artefact exists. Exits non-zero if any
// gate fails, so it drops straight into a pipeline or a pre-commit hook.
//
// Three results, not two. `fail` is a broken artefact. `warn` is a heuristic
// that cannot be certain and wants a human to look. `skip` is an artefact that
// does not exist yet, which is not a failure when you are halfway through.
//
// What this deliberately does NOT check: whether the risk register contains a
// finding the owner would rather not publish, whether every number traces to a
// command that was run, whether a diagram earns its place. Those are the most
// valuable gates in the runbook and none of them is assertable. A gate runner
// enforces shape, never honesty - do not read a green run as the document being
// good, only as it not being obviously broken.
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const ROOT = path.resolve(process.argv[2] || process.cwd());
const ONLY = process.argv[3] ? parseInt(process.argv[3], 10) : null;

// The em dash is written as a code point so this file does not fail its own check.
const EMDASH = String.fromCharCode(0x2014);

const rel = (...p) => path.join(ROOT, ...p);
const exists = (p) => fs.existsSync(rel(p));
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const mtime = (p) => fs.statSync(rel(p)).mtimeMs;

const PASS = (detail) => ({ status: 'pass', detail });
const FAIL = (detail) => ({ status: 'fail', detail });
const WARN = (detail) => ({ status: 'warn', detail });
const SKIP = (detail) => ({ status: 'skip', detail });

const ARCH = 'docs/architecture-diagrams.html';
const ASSESS = 'docs/technical-assessment.html';
const INDEX = 'docs/symbol-index.html';
const GRAPH = 'graphify-out/graph.json';
const GD = 'docs/.analysis-cache/graphdata.json';
const CD = 'docs/.analysis-cache/codedata.json';

// ── helpers ────────────────────────────────────────────────────────────

// Headings are authored across multiple lines with nested spans, so a
// single-line regex silently reports zero and looks like a missing section.
const h2s = (html) =>
  [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

const hrefs = (html) =>
  [...new Set([...html.matchAll(/href=["']([^"'#?]+\.(?:html|md))/g)].map((m) => m[1]))];

const chrome = () => {
  if (process.env.CHROME && fs.existsSync(process.env.CHROME)) return process.env.CHROME;
  const guesses = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  return guesses.find((g) => fs.existsSync(g)) || null;
};

// Measures the document against the viewport. Headless Chrome clamps the
// viewport to 500px, so a smaller --window-size silently gives you 500 anyway.
// 500 is below the shell's 640px breakpoint, so it does exercise the narrow layout.
const measureWidth = (file) => {
  const ch = chrome();
  if (!ch) return null;
  const probe = path.join(os.tmpdir(), 'gates-probe-' + path.basename(file));
  const html = read(file).replace(
    '</body>',
    '<script>document.title="VP="+innerWidth+" DOCW="+document.documentElement.scrollWidth;</script></body>'
  );
  fs.writeFileSync(probe, html);
  try {
    const out = cp.execFileSync(ch, [
      '--headless=new', '--disable-gpu', '--virtual-time-budget=2500',
      '--dump-dom', '--window-size=500,1200', 'file:///' + probe.split(path.sep).join('/'),
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
    const m = out.match(/VP=(\d+) DOCW=(\d+)/);
    return m ? { vp: +m[1], docw: +m[2] } : null;
  } catch { return null; } finally { try { fs.unlinkSync(probe); } catch {} }
};

const widthGate = (file) => () => {
  if (!exists(file)) return SKIP('not generated yet');
  const m = measureWidth(file);
  if (!m) return SKIP('no chrome binary found (set CHROME=/path/to/chrome)');
  return m.docw <= m.vp
    ? PASS('VP=' + m.vp + ' DOCW=' + m.docw)
    : FAIL('VP=' + m.vp + ' DOCW=' + m.docw + ' - overflows by ' + (m.docw - m.vp) +
           'px. Fix doc-shell.html, not this page (playbook section 7)');
};

const emDashGate = (file) => () => {
  if (!exists(file)) return SKIP('not generated yet');
  const html = read(file);
  const n = (html.match(new RegExp(EMDASH, 'g')) || []).length +
            (html.match(/&mdash;|&#8212;|&#x2014;/gi) || []).length;
  return n === 0 ? PASS('none') : FAIL(n + ' found');
};

const sectionGate = (file, want) => () => {
  if (!exists(file)) return SKIP('not generated yet');
  const got = h2s(read(file));
  return got.length === want
    ? PASS(got.length + ' sections')
    : FAIL('expected ' + want + ', found ' + got.length +
           (got.length ? ' (' + got.slice(0, 3).join(' / ') + ' ...)' : '') +
           '. A short count usually means the phase ran from a stale spec');
};

// ── gates ──────────────────────────────────────────────────────────────

const GATES = {
  0: ['preflight', {
    'generated output ignored': () => {
      try {
        cp.execFileSync('git', ['check-ignore', '-q', 'graphify-out/graph.json'],
          { cwd: ROOT, stdio: 'ignore' });
        return PASS('graphify-out/ matched');
      } catch { return FAIL('graphify-out/ is not gitignored - add it to the REPO-ROOT .gitignore'); }
    },
    'generated docs not graphed': () => {
      if (!exists('.graphifyignore')) return FAIL('.graphifyignore missing - graphify will index docs/*.html and feed this pipeline its own output');
      return /docs\/\*\.html/.test(read('.graphifyignore'))
        ? PASS('docs/*.html excluded')
        : FAIL('.graphifyignore does not carry docs/*.html');
    },
  }],

  1: ['graph', {
    'graph exists': () => exists(GRAPH) ? PASS(GRAPH) : FAIL('no ' + GRAPH + ' - run /graphify . --directed inside a session'),
    'no generated docs in the graph': () => {
      if (!exists(GRAPH)) return SKIP('no graph');
      const g = JSON.parse(read(GRAPH));
      const hit = (g.nodes || []).filter((n) => /\.html$/i.test(String(n.source_file || '')));
      if (!hit.length) return PASS('0 html-sourced nodes');
      const by = {};
      hit.forEach((n) => { by[n.source_file] = (by[n.source_file] || 0) + 1; });
      return FAIL(hit.length + ' nodes from ' + Object.keys(by).join(', ') +
                  ' - .graphifyignore only stops future builds, clear these with /graphify . --force');
    },
    'compacted graph is current': () => {
      if (!exists(GRAPH) || !exists(GD)) return SKIP('nothing to compare');
      return mtime(GD) >= mtime(GRAPH)
        ? PASS('graphdata.json is not older than graph.json')
        : FAIL('graph.json is newer than graphdata.json - run.cjs has not run since the graph changed. ' +
               'Identical node counts after a rebuild are the symptom of exactly this');
    },
  }],

  2: ['symbol index', {
    'embedded blocks parse': () => {
      if (!exists(INDEX)) return SKIP('not generated yet');
      const html = read(INDEX);
      for (const id of ['gd', 'cd']) {
        const open = '<script id="' + id + '" type="application/json">';
        const i = html.indexOf(open);
        if (i < 0) return FAIL(id + ' block not found');
        try { JSON.parse(html.slice(i + open.length, html.indexOf('</script>', i))); }
        catch (e) { return FAIL(id + ' does not parse: ' + e.message.slice(0, 80)); }
      }
      return PASS('gd and cd both re-parse');
    },
    'parsed symbols all have ranges': () => {
      if (!exists(GD) || !exists(CD)) return SKIP('no cache');
      const gd = JSON.parse(read(GD)), cd = JSON.parse(read(CD));
      let tot = 0, wr = 0;
      gd.n.forEach((n, i) => {
        if ((n.k === 'fn' || n.k === 'class') && n.o) { tot++; if (cd.r[i]) wr++; }
      });
      if (!tot) return WARN('no ast-derived fn/class nodes at all');
      const pct = (wr / tot) * 100;
      return pct >= 99
        ? PASS(wr + '/' + tot + ' (' + pct.toFixed(1) + '%)')
        : FAIL(wr + '/' + tot + ' (' + pct.toFixed(1) + '%) - range matching is broken, nothing on the page can be trusted');
    },
  }],

  4: ['architecture document', {
    'sixteen sections': sectionGate(ARCH, 16),
    'absences are listed': () => {
      if (!exists(ARCH)) return SKIP('not generated yet');
      return /absence|absent|no HA|not present in this repo/i.test(read(ARCH))
        ? PASS('absence language present')
        : WARN('found no absence language. Every section is required, and a repo with ' +
               'no HA story should say so in one line. Read the empty sections yourself');
    },
    'named symbols exist': () => {
      if (!exists(ARCH) || !exists(GD)) return SKIP('need the document and the graph');
      const gd = JSON.parse(read(GD));
      const known = new Set(gd.n.map((n) => String(n.l).replace(/\(\)$/, '')));
      gd.n.forEach((n) => { if (n.f) known.add(path.basename(n.f)); });
      // Only check things shaped like a function or class name. ALL_CAPS is an
      // enum value, a constant or an env var, and graph vocabulary (calls, imports)
      // describes edges rather than naming nodes. Neither is ever a node label, so
      // including them buries a real invented name under dozens of false positives.
      const VOCAB = new Set(['calls', 'imports', 'contains', 'defines', 'references', 'uses', 'extends']);
      const cands = [...new Set([...read(ARCH).matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter((s) => /^[A-Za-z_][A-Za-z0-9_]{3,}$/.test(s))
        .filter((s) => /[a-z]/.test(s) && s !== s.toUpperCase())
        .filter((s) => !VOCAB.has(s.toLowerCase())))];
      // Graph labels alone are far too strict. Sections 9 to 12 legitimately name
      // env vars, columns, tables and dataset ids, none of which are ever nodes, and
      // checking labels only reported two thirds of them as suspect. codedata.json
      // already carries the full source of every embedded file, so use it as the
      // corpus: a token that appears anywhere in the source was not invented, even
      // when it is not a symbol. What survives both checks is worth a human look.
      let corpus = '';
      if (exists(CD)) {
        try { corpus = Object.values(JSON.parse(read(CD)).f || {}).join('\n'); } catch {}
      }
      const missing = cands.filter((c) => !known.has(c) && !corpus.includes(c));
      if (!cands.length) return WARN('no identifier-shaped code spans to check');
      if (!missing.length) return PASS(cands.length + ' identifiers, all in the graph or the source');
      // Expect a high miss rate: sections 9 to 12 name env vars, tables, indexes
      // and dataset ids in code spans, none of which are code symbols. Triage the
      // list rather than chasing the ratio. Only a name claimed to be a function
      // or class in this repo, and absent here, is a real finding.
      return WARN(missing.length + '/' + cands.length + ' in neither the graph nor the source: ' +
                  missing.slice(0, 8).join(', ') +
                  '. These are the candidates for an invented name; check each one');
    },
    'no horizontal overflow': widthGate(ARCH),
    'no em dashes': emDashGate(ARCH),
  }],

  5: ['technical assessment', {
    'seven sections': sectionGate(ASSESS, 7),
    'no sale framing': () => {
      if (!exists(ASSESS)) return SKIP('not generated yet');
      const hits = (read(ASSESS).match(/\b(buyer|acquirer|acquiring|transfers on sale|due diligence)\b/gi) || []);
      return hits.length === 0
        ? PASS('none')
        : FAIL(hits.length + ' hits (' + [...new Set(hits.map((h) => h.toLowerCase()))].join(', ') +
               ') - this document was renamed but not regenerated');
    },
    'reads the architecture document': () => {
      if (!exists(ASSESS)) return SKIP('not generated yet');
      return /architecture-diagrams\.html/.test(read(ASSESS))
        ? PASS('references artefact 2')
        : FAIL('no reference to architecture-diagrams.html - phase 5 must read and reference it, not restate it');
    },
    'risk register is severity-rated': () => {
      if (!exists(ASSESS)) return SKIP('not generated yet');
      const n = (read(ASSESS).match(/class="sev/g) || []).length;
      return n > 0 ? PASS(n + ' severity chips')
                   : WARN('no severity chips found. The register is the credibility test and it must be rated');
    },
    'no horizontal overflow': widthGate(ASSESS),
    'no em dashes': emDashGate(ASSESS),
  }],

  6: ['wiring', {
    'every link resolves': () => {
      if (!exists('docs')) return SKIP('no docs/');
      const bad = [];
      let n = 0;
      for (const f of fs.readdirSync(rel('docs')).filter((f) => /\.html$/.test(f))) {
        for (const h of hrefs(read(path.join('docs', f)))) {
          n++;
          if (!fs.existsSync(path.resolve(rel('docs'), h))) bad.push(f + ' -> ' + h);
        }
      }
      if (!n) return WARN('no internal links at all - the set is not cross-linked');
      return bad.length ? FAIL(bad.length + ' broken: ' + bad.slice(0, 4).join(', '))
                        : PASS(n + ' links, all resolve');
    },
    'nav strips present': () => {
      const missing = [ARCH, ASSESS].filter((f) => exists(f) && !/docnav/.test(read(f)));
      if (![ARCH, ASSESS].some(exists)) return SKIP('nothing authored yet');
      return missing.length ? FAIL('no .docnav in ' + missing.join(', ') +
                                   ' - phases 4 and 5 overwrite these, so phase 6 runs after them')
                            : PASS('both authored documents carry one');
    },
    'README points at the artefacts': () => {
      if (!exists('README.md')) return WARN('no README.md in the target repo');
      return /generated documentation/i.test(read('README.md'))
        ? PASS('Generated documentation section present')
        : FAIL('no Generated documentation section');
    },
    'CLAUDE.md points at the artefacts': () => {
      if (!exists('CLAUDE.md')) return WARN('no CLAUDE.md in the target repo');
      return /symbol-index|architecture-diagrams|technical-assessment/.test(read('CLAUDE.md'))
        ? PASS('references the set')
        : FAIL('does not mention the artefacts, so the next session will not find them');
    },
  }],

  7: ['share copies', {
    'originals untouched': () => {
      const shares = ['docs/architecture-diagrams.share.html', 'docs/technical-assessment.share.html'];
      if (!shares.some(exists)) return SKIP('no share copies');
      const stripped = [ARCH, ASSESS].filter((f) => exists(f) && !/symbol-index/.test(read(f)));
      return stripped.length
        ? FAIL('symbol-index references removed from the ORIGINAL ' + stripped.join(', ') +
               ' - phase 7 must not modify the originals')
        : PASS('originals still reference the symbol index');
    },
    'share copies are standalone': () => {
      const shares = ['docs/architecture-diagrams.share.html', 'docs/technical-assessment.share.html'].filter(exists);
      if (!shares.length) return SKIP('no share copies');
      const bad = [];
      for (const f of shares) {
        const html = read(f);
        const base = path.basename(f);
        if (/symbol-index/.test(html)) bad.push(base + ' still names the symbol index');
        if (/<script/i.test(html)) bad.push(base + ' contains a script tag');
        // The element, not the string. doc-shell.html's stylesheet defines .docnav
        // rules and every copy inherits them; unused CSS is harmless, and stripping
        // it would mean editing the shared shell inside a derived file.
        if (/class\s*=\s*["'][^"']*\bdocnav\b/.test(html)) bad.push(base + ' still has a nav strip');
        // Not "links that resolve": none at all. These are pasted into Confluence as
        // separate pages, where a relative href resolves against the wrong base and
        // breaks. A link that works in docs/ proves nothing about where it lands.
        const links = hrefs(html);
        if (links.length) bad.push(base + ' has ' + links.length + ' internal link(s): ' + links.slice(0, 3).join(', '));
      }
      return bad.length ? FAIL(bad.join('; ')) : PASS(shares.length + ' share copies, zero internal links');
    },
    'share copies are not committed': () => {
      const shares = ['docs/architecture-diagrams.share.html', 'docs/technical-assessment.share.html'].filter(exists);
      if (!shares.length) return SKIP('no share copies');
      try {
        const out = cp.execFileSync('git', ['ls-files', '--', 'docs/*.share.html'],
          { cwd: ROOT, encoding: 'utf8' }).trim();
        return out
          ? FAIL('tracked in git: ' + out.split('\n').join(', ') +
                 ' - a document written for an outside reader is now in the history permanently')
          : PASS('untracked');
      } catch { return SKIP('git unavailable'); }
    },
  }],
};

// ── run ────────────────────────────────────────────────────────────────

if (!fs.existsSync(ROOT)) { console.error('no such directory: ' + ROOT); process.exit(2); }

const ICON = { pass: 'pass', fail: 'FAIL', warn: 'warn', skip: 'skip' };
const tally = { pass: 0, fail: 0, warn: 0, skip: 0 };

console.log('gates for ' + ROOT + '\n');

for (const phase of Object.keys(GATES).map(Number).sort((a, b) => a - b)) {
  if (ONLY !== null && phase !== ONLY) continue;
  const [label, checks] = GATES[phase];
  console.log('Phase ' + phase + '  ' + label);
  for (const [name, fn] of Object.entries(checks)) {
    let r;
    try { r = fn(); } catch (e) { r = FAIL('gate threw: ' + e.message.slice(0, 100)); }
    tally[r.status]++;
    console.log('  ' + ICON[r.status].padEnd(5) + name.padEnd(34) + r.detail);
  }
  console.log('');
}

console.log(tally.pass + ' pass, ' + tally.fail + ' fail, ' + tally.warn + ' warn, ' + tally.skip + ' skip');
if (tally.warn) console.log('warn means a heuristic could not be certain. Read those yourself.');
if (tally.fail) console.log('\nPROBLEM - do not publish or move to the next phase.');
process.exit(tally.fail ? 1 : 0);
