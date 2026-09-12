#!/usr/bin/env node
// Copy this repo's toolkit into the per-machine install at ~/.claude/analysis-tools.
//
//     node bin/install.cjs            # copy, then report what changed
//     npm run install-local           # same thing
//
// The repo is the source of truth; ~/.claude/analysis-tools is a working copy that
// every other repository's documentation points at. Keeping two editable copies is
// what caused the drift this repo exists to stop, so develop here and install from
// here - never edit the installed copy directly.
const fs = require('fs');
const path = require('path');
const os = require('os');

const HERE = path.join(__dirname, '..');
const DEST = path.join(os.homedir(), '.claude', 'analysis-tools');

// node_modules is installed at the destination, not copied: the parser is a
// platform-specific dependency and a copied tree goes stale against package.json.
const FILES = [
    'run.cjs', 'build-graphdata.cjs', 'build-codedata.cjs', 'inject.cjs',
    'verify.cjs', 'standalone.cjs', 'py-ranges.py',
    'symbol-index-template.html', 'doc-shell.html',
    'ANALYSIS-PLAYBOOK.md', 'SESSION-RUNBOOK.md',
    'package.json', 'package-lock.json',
];

fs.mkdirSync(DEST, { recursive: true });

let changed = 0, same = 0;
for (const f of FILES) {
    const src = path.join(HERE, f);
    if (!fs.existsSync(src)) { console.log('  missing in repo:', f); continue; }
    const dst = path.join(DEST, f);
    const a = fs.readFileSync(src);
    const b = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
    if (b && a.equals(b)) { same++; continue; }
    fs.writeFileSync(dst, a);
    console.log('  updated', f);
    changed++;
}

console.log('\n' + changed + ' updated, ' + same + ' already current');
console.log('installed to ' + DEST);
if (!fs.existsSync(path.join(DEST, 'node_modules', '@babel', 'parser'))) {
    console.log('\nThe parser is not installed there yet. Run:');
    console.log('  cd ' + DEST + ' && npm install');
}
