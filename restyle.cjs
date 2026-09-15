#!/usr/bin/env node
// Push the current doc-shell.html look onto already-generated documents.
//
//   node restyle.cjs <repo-root> [--dry-run]
//
// A shell change (palette, type stack, a dropped font request) otherwise only
// reaches the two authored documents by re-running Phases 4 and 5, which is an
// hour of agent time to produce identical prose in different colours. This does
// the mechanical part in milliseconds.
//
// It rewrites three things and nothing else: the custom property blocks, the
// font-family declarations, and the external font <link> tags. It never touches
// markup, prose, figures or numbers, so the documents stay exactly as authored.
//
// It refuses symbol-index.html on purpose. That page carries the analysed repo's
// own source inside two JSON blocks, and the rule is that style changes go into
// symbol-index-template.html and the page is regenerated with run.cjs. Editing it
// here would mean rewriting a file around embedded source, which is the failure
// that rule exists to prevent.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || process.cwd());
const DRY = process.argv.includes('--dry-run');
const SHELL = path.join(__dirname, 'doc-shell.html');

if (!fs.existsSync(SHELL)) { console.error('no doc-shell.html next to this script'); process.exit(2); }
const DOCS = path.join(ROOT, 'docs');
if (!fs.existsSync(DOCS)) { console.error('no docs/ in ' + ROOT); process.exit(2); }

const shell = fs.readFileSync(SHELL, 'utf8');

// ── read the target look out of the shell, rather than hardcoding it here ──
// The shell stays the single source of truth; change it and this follows.

const blockOf = (text, startRe) => {
  const m = text.match(startRe);
  if (!m) return null;
  const i = m.index + m[0].length;
  const j = text.indexOf('}', i);
  return j < 0 ? null : text.slice(i, j);
};

const varsOf = (block) => {
  const out = {};
  if (!block) return out;
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

// --measure is a layout choice a document may legitimately override, so leave it.
const SKIP_VARS = new Set(['--measure']);

const LIGHT = varsOf(blockOf(shell, /:root\{/));
const DARK = varsOf(blockOf(shell, /:root\[data-theme="dark"\]\{/));
if (!Object.keys(LIGHT).length) { console.error('could not read :root from doc-shell.html'); process.exit(2); }

const fontsOf = (text) => {
  const seen = new Set();
  for (const m of text.matchAll(/font-family:\s*([^;}]+)[;}]/g)) seen.add(m[1].trim());
  return [...seen];
};
const shellFonts = fontsOf(shell);
// Longest stack wins as the body face, shortest containing "mono" as the code face.
const SANS = shellFonts.filter((f) => !/mono|consolas|courier/i.test(f)).sort((a, b) => b.length - a.length)[0];
const MONO = shellFonts.filter((f) => /mono|consolas|courier/i.test(f)).sort((a, b) => b.length - a.length)[0];
if (!SANS || !MONO) { console.error('could not read both font stacks from doc-shell.html'); process.exit(2); }

const isMono = (stack) => /mono|consolas|courier|menlo/i.test(stack);

// ── rewrite one document ───────────────────────────────────────────────

const restyle = (html) => {
  let out = html, changed = { vars: 0, fonts: 0, links: 0 };

  // External font requests. The shell may have dropped them entirely.
  const before = out.length;
  out = out.replace(/[ \t]*<link rel="(?:preconnect|stylesheet)"[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\r?\n?/g, () => {
    changed.links++; return '';
  });
  if (out.length === before && changed.links) changed.links = 0;

  // Custom properties, per theme block. A document may carry extra vars the shell
  // has no opinion about (the symbol index has --hover, --sel); leave those alone.
  const applyVars = (startRe, table) => {
    const m = out.match(startRe);
    if (!m || !Object.keys(table).length) return;
    const i = m.index + m[0].length;
    const j = out.indexOf('}', i);
    if (j < 0) return;
    let block = out.slice(i, j);
    for (const [k, v] of Object.entries(table)) {
      if (SKIP_VARS.has(k)) continue;
      const re = new RegExp('(' + k.replace(/-/g, '\\-') + '\\s*:\\s*)([^;]+)(;)');
      if (re.test(block)) {
        block = block.replace(re, (_, a, old, c) => { if (old.trim() !== v) changed.vars++; return a + v + c; });
      }
    }
    out = out.slice(0, i) + block + out.slice(j);
  };
  applyVars(/:root\{/, LIGHT);
  applyVars(/:root:not\(\[data-theme="light"\]\)\{/, DARK);
  applyVars(/:root\[data-theme="dark"\]\{/, DARK);

  // Font stacks. Map every declaration onto the shell's sans or mono by what it is,
  // so a document using three faces collapses onto the shell's two.
  out = out.replace(/font-family:\s*([^;}]+)([;}])/g, (whole, stack, tail) => {
    if (/\binherit\b/.test(stack)) return whole;
    const want = isMono(stack) ? MONO : SANS;
    if (stack.trim() === want) return whole;
    changed.fonts++;
    return 'font-family:' + want + tail;
  });

  // Variable-font axes are inert on a static stack and confusing left behind.
  out = out.replace(/[ \t]*font-variation-settings:[^;}]*;\r?\n?/g, '');

  return { out, changed };
};

// ── run ────────────────────────────────────────────────────────────────

const targets = fs.readdirSync(DOCS)
  .filter((f) => /\.html$/.test(f))
  .filter((f) => {
    if (/^symbol-index\.html$/.test(f)) {
      console.log('skip   ' + f + '  (regenerate with run.cjs; it embeds the repo source)');
      return false;
    }
    return true;
  });

if (!targets.length) { console.log('nothing to restyle in ' + DOCS); process.exit(0); }

let touched = 0;
for (const f of targets) {
  const p = path.join(DOCS, f);
  const src = fs.readFileSync(p, 'utf8');
  const { out, changed } = restyle(src);
  const summary = changed.vars + ' vars, ' + changed.fonts + ' font stacks, ' + changed.links + ' font links';
  if (out === src) { console.log('same   ' + f + '  (already current)'); continue; }
  if (DRY) { console.log('would  ' + f + '  ' + summary); touched++; continue; }
  fs.writeFileSync(p, out);
  console.log('ok     ' + f + '  ' + summary);
  touched++;
}

console.log('\n' + touched + (DRY ? ' would change' : ' restyled') + ', shell: ' + SHELL);
if (!DRY && touched) {
  console.log('Re-run the narrow-viewport gate before publishing: a type change moves widths.');
  console.log('  node ' + path.join(__dirname, 'gates.cjs') + ' ' + ROOT);
}
