#!/usr/bin/env node
// Drives the whole runbook as one command: shell phases directly, guided phases
// as separate `claude -p` processes, gates.cjs between every one.
//
//   node pipeline.cjs <repo-root> "<Project Name>" [options]
//
//     --from N --to N     run a range (default 2 to 6)
//     --resume            skip phases whose gates already pass
//     --dry-run           print the plan and exit
//     --yes               do not ask before spawning agent sessions
//     --allow-share       permit phase 7, whose output leaves the building
//     --model <alias>     model for the agent phases
//
// Why a process per phase rather than one long session: a session reuses what it
// has already read, so one that has just executed a phase tends to re-execute its
// remembered version of the next one. That failure looks like success - correct
// shape, wrong spec. A separate `claude -p` per phase makes it structurally
// impossible rather than something a prompt has to warn against.
//
// Phases 0 and 1 are asserted, not performed. The graph build is a slash command
// needing a model, so it cannot be driven from a shell; this reports what is wrong
// and what to run.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const readline = require('readline');

const TOOLS = __dirname;
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && ['--from', '--to', '--model'].includes(argv[i - 1])));

const ROOT = path.resolve(positional[0] || process.cwd());
const NAME = positional[1] || path.basename(ROOT);
const FROM = parseInt(opt('--from', '2'), 10);
const TO = parseInt(opt('--to', '6'), 10);
const DRY = flag('--dry-run');
const RESUME = flag('--resume');
const YES = flag('--yes');
const ALLOW_SHARE = flag('--allow-share');
const MODEL = opt('--model', null);

// acceptEdits lets a phase write its artefact without prompting, but a phase that
// shells out (Phase 5 runs the test suite) can still stall waiting on approval.
// bypassPermissions is what unattended automation actually needs, and it is not a
// default worth choosing on someone's behalf: it lets a spawned agent do anything.
// Set it explicitly when you have decided that is acceptable.
const PERM = process.env.PIPELINE_PERMISSION_MODE || 'acceptEdits';

const RUNBOOK = path.join(TOOLS, 'SESSION-RUNBOOK.md');

// ── phase definitions ──────────────────────────────────────────────────

// Each guided phase names something the current spec contains, so a session
// running from a stale reading stops instead of producing a plausible wrong shape.
// The mechanical gates run here, after the phase, via gates.cjs. Saying so stops a
// phase burning time on checks it cannot complete anyway: the headless browser the
// width gate needs sits outside the directories this session is granted.
const agentPrompt = (n, extra) =>
  'Read ' + RUNBOOK + ' and execute Phase ' + n + ' against this repo. ' +
  'Re-read that file now rather than relying on anything you already know about it. ' +
  extra +
  ' A pipeline runs the mechanical gates after you (section counts, em dashes, links, ' +
  'narrow viewport), so do not run those yourself; spend the effort on the content gates ' +
  'that only you can judge. Do not commit.';

const PHASES = {
  0: { label: 'preflight', kind: 'assert' },
  1: { label: 'graph', kind: 'assert' },
  2: {
    label: 'symbol index', kind: 'shell',
    run: () => {
      sh(process.execPath, [path.join(TOOLS, 'run.cjs'), ROOT, NAME]);
      const picked = cp.execFileSync(process.execPath,
        [path.join(TOOLS, 'pick-spot.cjs'), path.join(ROOT, 'docs/symbol-index.html')],
        { encoding: 'utf8' });
      process.stdout.write(picked);
      // pick-spot prints the finished verify command as its last line. Reusing it
      // is the point: a pair chosen any other way risks a spelling graphify does
      // not use, and fails the gate for a reason unrelated to what it tests.
      //
      // NO CANDIDATES is not a failure. A repo of Dockerfiles, YAML and CI config
      // has no function bodies to spot-check, and the symbol index is still a valid
      // artefact with its symbols labelled approximate. Run verify without the pair
      // so the embedded JSON is still proved to re-parse, which is the half of the
      // check that always applies.
      if (/^NO CANDIDATES$/m.test(picked)) {
        console.log('no spot-check pair available; verifying the embedded blocks only');
        sh(process.execPath, [path.join(TOOLS, 'verify.cjs'), path.join(ROOT, 'docs/symbol-index.html')]);
        return;
      }
      const last = picked.trim().split('\n').pop().trim();
      const m = last.match(/verify\.cjs\s+(\S+)\s+(\S+)\s+(\S+)$/);
      if (!m) throw new Error('could not read a spot-check pair from pick-spot.cjs output');
      sh(process.execPath, [path.join(TOOLS, 'verify.cjs'), m[1], m[2], m[3]]);
    },
  },
  3: {
    label: 'README truth pass', kind: 'agent',
    // A truth pass legitimately changes nothing when nothing has drifted.
    writes: ['README.md', 'CLAUDE.md'], mustWrite: false,
    prompt: () => agentPrompt(3, 'Use its paste-block prompt verbatim and hold to its gate.'),
  },
  4: {
    label: 'architecture document', kind: 'agent',
    writes: ['docs/architecture-diagrams.html'],
    prompt: () => agentPrompt(4,
      'Run its evidence-gathering commands first and start from ' +
      path.join(TOOLS, 'doc-shell.html') + '. Phase 4 specifies sixteen required sections. ' +
      'If your reading has fewer than sixteen, you have stale content: stop and say so.'),
  },
  5: {
    label: 'technical assessment', kind: 'agent',
    writes: ['docs/technical-assessment.html'],
    prompt: () => agentPrompt(5,
      'Gather its evidence commands first; every number must trace to something you ran. ' +
      'Read docs/architecture-diagrams.html first and rate every absence it lists. ' +
      'Phase 5 has six sections plus a closing. If your reading has nine sections, or ' +
      'mentions a buyer or a sale, you have stale content: stop and say so.'),
  },
  6: {
    label: 'wire it up', kind: 'agent',
    writes: ['docs/architecture-diagrams.html', 'docs/technical-assessment.html', 'README.md'],
    prompt: () => agentPrompt(6,
      'Run its filesystem link check and the narrow-viewport gate on every generated page.'),
  },
  7: {
    label: 'share copies', kind: 'agent', guarded: true,
    writes: ['docs/architecture-diagrams.share.html', 'docs/technical-assessment.share.html'],
    prompt: () => agentPrompt(7,
      'Review the content that is about to leave the building before doing the mechanics.'),
  },
};

// ── running ────────────────────────────────────────────────────────────

const sh = (cmd, args, opts = {}) =>
  cp.execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });

const gates = (phase) => {
  const args = [path.join(TOOLS, 'gates.cjs'), ROOT];
  if (phase !== undefined) args.push(String(phase));
  const r = cp.spawnSync(process.execPath, args, { stdio: 'inherit' });
  return r.status === 0;
};

// Never spawn this with shell:true. With an args array the shell concatenates
// without escaping (node DEP0190), so a prompt containing spaces is shattered into
// tokens and the session receives fragments. It then does something plausible with
// whatever arrived, the artefact is never written, and the gates still pass because
// the previous run's file is untouched and good. `claude` is a real executable on
// every platform, so no shell is needed.
// TOOLS must be added too, not just ROOT. Every phase prompt begins "Read
// <TOOLS>/SESSION-RUNBOOK.md", and without it that read is denied by the permission
// layer. A non-interactive session cannot prompt for approval, so it proceeds with
// whatever it can see in the working directory and produces something unrelated
// that looks like a considered answer.
const runAgent = (n) => {
  const args = ['-p', PHASES[n].prompt(), '--permission-mode', PERM,
    '--add-dir', ROOT, '--add-dir', TOOLS,
    // The phases are told to run modules.cjs and friends. A target repo's own
    // settings rarely allow node, and a denied toolkit script means the phase
    // either skips required output or reimplements it by hand.
    '--allowedTools', 'Bash(node *)'];
  if (MODEL) args.push('--model', MODEL);
  const r = cp.spawnSync('claude', args, { stdio: 'inherit', cwd: ROOT });
  if (r.error) throw new Error('could not spawn claude: ' + r.error.message);
  if (r.status !== 0) throw new Error('claude exited ' + r.status);
};

// Gates check an artefact's state, never that the phase ran. An unchanged, still
// valid document passes every one of them, so a phase that silently did nothing
// reports success. Snapshot what the phase is supposed to write and insist it moved.
const snapshot = (globs) => {
  const out = {};
  for (const g of globs) {
    const p = path.join(ROOT, g);
    out[g] = fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0;
  }
  return out;
};

const assertWrote = (n, before) => {
  const p = PHASES[n];
  if (!p.writes) return;
  const after = snapshot(p.writes);
  const changed = p.writes.filter((g) => after[g] !== before[g]);
  if (changed.length) return;
  const msg = 'Phase ' + n + ' wrote nothing. Expected ' + p.writes.join(' or ') +
    ' to change.\nThe gates below will still pass if a previous run left a valid file there,\n' +
    'so treat this as the failure, not them. Usually the session did something other\n' +
    'than the phase: read its output above.';
  if (p.mustWrite === false) console.warn('\nwarn  ' + msg);
  else throw new Error(msg);
};

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); res(/^y(es)?$/i.test(a.trim())); });
});

// ── main ───────────────────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(ROOT)) { console.error('no such directory: ' + ROOT); process.exit(2); }
  if (!fs.existsSync(RUNBOOK)) { console.error('no runbook at ' + RUNBOOK + ' - run npm run install-local'); process.exit(2); }

  const selected = Object.keys(PHASES).map(Number)
    .filter((n) => n >= FROM && n <= TO)
    .sort((a, b) => a - b);

  if (selected.includes(7) && !ALLOW_SHARE) {
    console.error('Phase 7 writes share copies, whose output leaves the building, and it\n' +
                  'requires reading both documents in full before sending. It is not run\n' +
                  'unattended. Pass --allow-share if you have decided otherwise.');
    process.exit(2);
  }

  const agentCount = selected.filter((n) => PHASES[n].kind === 'agent').length;

  console.log('pipeline  ' + ROOT + '  "' + NAME + '"');
  console.log('phases    ' + selected.map((n) => n + ' ' + PHASES[n].label).join('  |  '));
  console.log('agents    ' + agentCount + ' separate claude sessions, permission-mode ' + PERM);
  if (RESUME) console.log('resume    skipping phases whose gates already pass');
  // State the exclusion rather than leaving it to be noticed as an absence from the
  // phase list. --to defaults to 6, so no --from value ever reaches 7 on its own.
  if (!selected.includes(7)) {
    console.log('note      phase 7 (share copies) excluded. It is opt-in twice: --to 7 and');
    console.log('          --allow-share, because its output leaves the building.');
  }
  console.log('');

  if (DRY) { console.log('dry run, nothing executed'); process.exit(0); }

  if (agentCount && !YES) {
    if (!process.stdin.isTTY) {
      console.error('refusing to spawn ' + agentCount + ' agent sessions without --yes on a non-interactive stdin');
      process.exit(2);
    }
    if (!await ask(agentCount + ' agent sessions will run and each does real work. Continue? [y/N] ')) {
      console.log('stopped'); process.exit(0);
    }
    console.log('');
  }

  for (const n of selected) {
    const p = PHASES[n];
    const head = '== Phase ' + n + ' - ' + p.label + ' ==';

    if (RESUME && gatesQuietlyPass(n)) {
      console.log(head + ' already passing, skipped\n');
      continue;
    }

    console.log(head);
    const t0 = Date.now();
    const before = p.writes ? snapshot(p.writes) : null;
    try {
      if (p.kind === 'shell') p.run();
      else if (p.kind === 'agent') runAgent(n);
      // 'assert' phases perform nothing; their gates are the whole check.
      if (before) assertWrote(n, before);
    } catch (e) {
      console.error('\nPhase ' + n + ' failed: ' + e.message);
      process.exit(1);
    }
    console.log('(' + ((Date.now() - t0) / 1000).toFixed(0) + 's)\n');

    if (!gates(n)) {
      console.error('\nPhase ' + n + ' gates failed. Stopping rather than feeding a bad\n' +
                    'artefact to the phase that reads it. Fix, then rerun with --from ' + n + '.');
      process.exit(1);
    }
    console.log('');
  }

  // Informational only. Every selected phase already passed its own gates in the loop
  // above, or the run stopped there. This sweep covers phases that were never in scope,
  // so a partial run must not be failed by gates for work it was not asked to do:
  // --from 2 --to 2 would otherwise exit non-zero on Phase 6's wiring checks.
  console.log('== full sweep (informational; out-of-scope phases included) ==');
  gates();
  const ranName = selected.map(String).join(', ');
  console.log('\nPhases ' + ranName + ' ran and passed their own gates.');
  console.log('Anything failing above belongs to a phase outside --from/--to.');
  console.log('\nRemember what the gates cannot decide: whether the risk register contains a\n' +
              'finding the owner would rather not publish, whether every number traces to a\n' +
              'command that was run, whether each diagram earns its place. Read the documents.');
  process.exit(0);
})();

function gatesQuietlyPass(phase) {
  const r = cp.spawnSync(process.execPath,
    [path.join(TOOLS, 'gates.cjs'), ROOT, String(phase)], { encoding: 'utf8' });
  return r.status === 0 && !/\bskip\b/.test(r.stdout || '');
}
