# Session runbook - running the analysis pack on a new repo

How to execute the whole pipeline from **one Claude Code session started in the target
repo**. This is the operating order; `ANALYSIS-PLAYBOOK.md` next to it is the reference
that explains *why* each step is the way it is. Section numbers below point into it.

The output is four artefacts:

| # | Artefact | Produced by | Effort |
| :- | :--- | :--- | :--- |
| 1 | `docs/symbol-index.html` | one command | automated |
| 2 | `docs/architecture-diagrams.html` | Claude, guided | ~1 session |
| 3 | `docs/technical-assessment.html` | Claude, guided | ~1 session |
| 4 | README/CLAUDE.md truth pass | Claude, guided | ~20 min |

---

## Quick start - the whole sequence in one place

If you have run this before, this is the lot. Every line is explained in the phase it
belongs to; the phases exist because each one has a gate worth stopping at.

```bash
cd /path/to/target-repo && claude          # Phase 0: the session MUST start here
```

Then, inside that session:

```
/graphify . --directed                     # Phase 1: minutes, costs tokens
```

Back in the shell, still inside the session:

```bash
# Phase 0: ignore generated output, in the REPO-ROOT .gitignore
printf '\n# Generated analysis output\ngraphify-out/\ndocs/.analysis-cache/\n' >> .gitignore
git check-ignore -v graphify-out/graph.json         # must print a match, not nothing

# Phase 2: the symbol index.
node ~/.claude/analysis-tools/run.cjs . "Project Name"

# Phase 2: the spot check. pick-spot.cjs names a REAL file and symbol; do not guess one.
node ~/.claude/analysis-tools/pick-spot.cjs docs/symbol-index.html
node ~/.claude/analysis-tools/verify.cjs docs/symbol-index.html <file> <symbol>
```

That is artefact 1, and `ALL GOOD` plus a spot-checked symbol whose last line really is the
end of that symbol is the gate. Phases 3 to 6 are the guided work: README truth pass first,
then the two prose documents, then wire the set together. Drive them with the lines in
[Driving the phases](#driving-the-phases) below.

**Before you start: no em dashes.** Every document this pipeline produces, in every
repository, is written without the em dash character or its HTML entity form. Use a spaced
hyphen for a break in a sentence, or recast with a comma, colon or parentheses. The rule is
easy to honour while writing and tedious to retrofit across four documents, so carry it
from the first sentence. Full rule in [House style](#house-style) below; it is also stated
inside the Phase 3, 4 and 5 prompts so the instruction travels with the work.

---

## Driving the phases

Phases 0 to 2 are shell commands, above. Phases 3 to 6 are guided work, so each one is a
line you paste into the session. Run them in order, **one per fresh session**, and stop at
each phase's gate rather than chaining them. A session reuses what it has already read, so
one that has just executed a phase will tend to re-execute its remembered version of the
next one:

```
Read ~/.claude/analysis-tools/SESSION-RUNBOOK.md and execute Phase 3 against this repo.
Use its paste-block prompt verbatim and hold to its gate.
```
```
Read ~/.claude/analysis-tools/SESSION-RUNBOOK.md and execute Phase 4 against this repo.
Run its cross-directory edge aggregation first, start from ~/.claude/analysis-tools/doc-shell.html,
and hold to its gate.
```
```
Read ~/.claude/analysis-tools/SESSION-RUNBOOK.md and execute Phase 5 against this repo.
Gather its evidence commands first. Every number must trace to something you ran.
```
```
Read ~/.claude/analysis-tools/SESSION-RUNBOOK.md and execute Phase 6 against this repo.
Do not commit.
```

**Or drive the lot with one command.** `pipeline.cjs` runs the shell phases directly, spawns
a separate `claude -p` session per guided phase, and runs `gates.cjs` between each, stopping
rather than feeding a bad artefact to the phase that reads it:

```bash
node ~/.claude/analysis-tools/pipeline.cjs . "Project Name" --dry-run   # see the plan
node ~/.claude/analysis-tools/pipeline.cjs . "Project Name"             # phases 2 to 6
node ~/.claude/analysis-tools/pipeline.cjs . "Project Name" --from 4 --resume
```

A process per phase is the point: it is what makes the stale-spec failure structurally
impossible rather than something the prompt above has to warn against. Phases 0 and 1 are
asserted rather than performed, because the graph build is a slash command needing a model
and cannot be driven from a shell. Phase 7 refuses to run without `--allow-share`.

Phase 7 is optional, and runs only when the set is going to someone outside the team:

```
Read ~/.claude/analysis-tools/SESSION-RUNBOOK.md and execute Phase 7 against this repo.
Review the content that is about to leave the building before doing the mechanics.
```

On Windows, `~` in a pasted prompt is not reliably expanded; use the full
`C:\Users\<you>\.claude\analysis-tools\SESSION-RUNBOOK.md`.

**Phase 3 runs first on purpose**, before 4 and 5. Both prose documents build on what
README.md and CLAUDE.md claim, so stale facts there propagate into two polished artefacts
and get much harder to spot.

Each line names the phase rather than restating its prompt, so the prompt stays in one
place. If you paste a phase's prompt directly instead, take it from that phase verbatim -
the house-style clause at the end of each is load-bearing.

Coming back to a repo that already has the set, rather than running it for the first time:
[Updating an existing analysis](#updating-an-existing-analysis).

---

## Phase 0 - preflight (2 minutes)

**Start the session from the target repo.** Not from anywhere else:

```bash
cd /path/to/target-repo
claude
```

A Claude Code session is filed under the directory it *started* in, and that folder is
never renamed. Start it elsewhere and the whole transcript - the reasoning, the rejected
approaches, the numbers - is filed under the wrong repo forever. This is the one step
that cannot be fixed afterwards.

Check the toolkit is installed (once per machine, not per repo):

```bash
ls ~/.claude/analysis-tools/run.cjs || echo "see ANALYSIS-PLAYBOOK.md Quick start"
```

**Ignore the generated output before generating any of it.** These patterns are relative
to the file they live in, so they must go in the **repo-root** `.gitignore` - putting
them in a subdirectory's silently matches nothing:

```bash
printf '\n# Generated analysis output\ngraphify-out/\ndocs/.analysis-cache/\n' >> .gitignore
git check-ignore -v graphify-out/graph.json    # must print a match, not nothing
```

**Then stop graphify indexing this pipeline's own output.** `docs/*.html` is deliberately
*not* gitignored, because the artefacts are meant to be committed. graphify honours
`.gitignore`, so it indexes them: the architecture document and the assessment come back
in the next graph as `concept` and `rationale` nodes derived from prose Claude wrote, not
from the codebase. Each run feeds the previous run's output into the next one:

```bash
printf 'docs/*.html\n' >> .graphifyignore
```

Do this before Phase 1. On a repo that has already been analysed without it, the stale
nodes are already in the graph and only a `--force` rebuild clears them, because an
incremental update never revisits a file the manifest has dropped:

```bash
# only needed if a previous run already indexed docs/*.html
node -e "const g=require('./graphify-out/graph.json');console.log(g.nodes.filter(n=>/^docs\/.*\.html$/.test(n.source_file||'')).length,'nodes from generated docs')"
/graphify . --force
```

Then read the house rules before touching anything: `cat CLAUDE.md` in the target repo.
Some repos forbid agent commits outright. Honour that - leave everything in the working
tree and report `git status --short` at the end.

---

## Phase 1 - build the graph

`/graphify` is a Claude Code command, not a shell command. From inside the session:

```
/graphify . --directed
```

It costs tokens and takes minutes on a large tree. `--directed` is not optional here:
the whole pipeline reads edge direction. Later runs use `/graphify . --update`.

**Gate:** `graphify-out/graph.json` exists and `graphify-out/GRAPH_REPORT.md` reports a
sane node/edge count and an EXTRACTED percentage. Below ~70% extracted, the graph is
mostly the model's inference and the symbol index will be thin - say so in the write-up
rather than hiding it. (§3)

---

## Phase 2 - symbol index (one command)

```bash
node ~/.claude/analysis-tools/run.cjs . "Project Name"
node ~/.claude/analysis-tools/pick-spot.cjs docs/symbol-index.html
node ~/.claude/analysis-tools/verify.cjs docs/symbol-index.html <file> <symbol>
```

The spot check is **a real file and a real symbol in it**. `run.cjs` accepts the pair as
its last two arguments too, both or neither, but `verify.cjs` matches them as exact
strings against graphify's own labels, so a pair read off the filesystem prints
`no range found` for the wrong reason. Let `pick-spot.cjs` name the pair: it reads the
built page, keeps only `fn` and `class` nodes that resolved to a real range, drops the
test tree, and sorts longest body first.

**Gates, in order of what they catch:**

1. `ALL GOOD` printed and exit 0 - both embedded JSON blocks re-parse.
2. The spot-checked symbol's **last line is the real end of that symbol**: a closing brace
   in JS, TS or PHP, the last statement of the body in Python. What fails this gate is a
   last line that belongs to the *next* symbol, or a body one line long. If it fails,
   range matching is broken and nothing on the page can be trusted. (§5)
3. The matched/unmatched split is *explained*, not just reported. Run this to break it
   down by node kind before you quote any ratio:

```bash
node -e "
const fs=require('fs');
const gd=JSON.parse(fs.readFileSync('docs/.analysis-cache/graphdata.json','utf8'));
const cd=JSON.parse(fs.readFileSync('docs/.analysis-cache/codedata.json','utf8'));
const by={};
gd.n.forEach((n,i)=>{const k=(n.k||'?')+'/'+(n.o?'ast':'inf');by[k]=by[k]||[0,0];by[k][0]++;if(cd.r[i])by[k][1]++;});
Object.entries(by).sort().forEach(([k,v])=>console.log(k.padEnd(14),'total',String(v[0]).padStart(4),'withRange',String(v[1]).padStart(4)));
"
```

What you want to see is `fn/ast` matched at or near 100%. A big unmatched total is
normal and not a failure: import bindings (`sym`), file-level nodes (`module`) and
LLM-inferred nodes (`concept`, `rationale`) have no code span by nature. On one repo the
headline read "403 exact / 581 no range", which looked alarming until the breakdown
showed every one of 399 functions matched.

4. **The language-coverage lines add up.** `build-codedata.cjs` prints `js parsed ok`,
   `py files` and `php files`. A zero against a language the repo plainly contains means
   that extractor did not run, not that there was nothing to find: Python needs `python` on
   `PATH`, PHP needs a `php` binary (`PHP=/path/to/php` overrides). Both degrade quietly to
   "approximate" instead of failing the run, which is correct behaviour and also easy to
   miss, so read the line rather than assuming. ServerlessWP is the worked example: 21 of
   its 21 PHP functions carry exact ranges, and its 17 PHP *module* nodes carry none,
   because a module node points at line 1, which is `<?php`.

---

## Phase 3 - README truth pass (do this *before* the prose artefacts)

This is out of order compared to the playbook's numbering, and deliberately so. The
architecture and technical-assessment documents are largely built on what the README and
CLAUDE.md claim. If those are stale, the stale facts propagate into two polished
documents and become much harder to spot.

Paste:

> Audit README.md and CLAUDE.md against what the repo actually contains. For every
> factual claim - counts of services, tables, endpoints, routes, commands - verify it
> against source and correct the drift. Tell me each thing that was wrong. Do not add
> anything you have not verified. Write any corrected text without em dashes - use a
> spaced hyphen, comma, colon or parentheses instead.

**Gate:** a list of corrections, each traceable to a file. This is the highest
value-per-minute step of the four; on one repo it found the service count understated by
ten, a documented endpoint that did not exist, and a flat claim that no test suite
existed beside 275 passing tests.

---

## Phase 4 - architecture document

**Writes:** `docs/architecture-diagrams.html` (replacing it if present). No other path.

This is the largest artefact. It covers how the system is **designed**: its structure, its
flows, and the cross-cutting and non-functional concerns. How well that design actually
holds up is Phase 5's job, not this one. The split matters, because writing the same
concern twice is how the two documents start disagreeing with each other.

### Gather the structural facts first

So the document is drawn from the graph rather than from an impression of the code.
Aggregate the real cross-directory edges:

```bash
node ~/.claude/analysis-tools/modules.cjs .          # --under src by default
```

Both tables it prints are **required output**, not just evidence: §4 below is where they
land, and so does the grouping rule it states on its second line.

A filesystem has no modules, so this groups by path prefix, and **the grouping rule is the
whole story**. A fixed depth does not work. At depth 2 a 78-file subsystem sat inside
`src/workflow` as one row next to a single-file directory, which made the section read as
though the repo were laid out strangely when the real problem was the grouping. So depth
varies: a group over 25 files splits one level deeper, and only children of 8 or more files
are promoted, which keeps three-file directories with their parent instead of littering the
table. Tune with `--big` and `--min-child` if a repo needs it, and say what you used.

Report the **file counts** alongside the edges. Without them a reader cannot tell a
subsystem from a leaf directory and every row looks like a peer of every other, which is
the single thing most likely to make this section confusing to someone who does not know
the codebase.

It also prints two-way pairs. A cycle is what a layered diagram cannot show and what a
reader most wants flagged, so name them in the prose rather than leaving the reader to spot
them in the table.

### When the repo is not an application

Infrastructure, image-build, config and IaC repos go through this phase unchanged, and
about half the sections come out as absences. **That is the correct output, not a failed
run.** `modules.cjs` detects it and says so instead of tabulating a dependency graph that
does not exist:

```
  NONE. This repo has no call or import structure between its directories,
  which is normal for infrastructure, config and image-build repos ...
```

It also picks its own root: `src/` when the graph has one, the repo root otherwise, so a
repo of Dockerfiles and workflows does not fail on a missing `src/`.

What to expect, so you can tell a thin document from a broken one:

| Lands properly | Usually a one-line absence |
| :--- | :--- |
| §1 what the system is, §2 business process | §4 module boundaries |
| §3 entry points (CI triggers, not HTTP routes) | §5 layered call graph |
| §9 configuration and secrets | §7 state machines |
| §10 infrastructure, which here is the main event | §11 data and persistence |
| §12 external integrations (registries, mirrors) | §13 and §14, often |
| §15 performance, as image size and build time | |

Two things follow. **Do not pad an absent section**: "this repo holds no application state"
is information, and inventing a diagram to fill the space is the failure mode §16 exists to
name. And **the technical assessment is usually the more valuable artefact** for these
repos: base image provenance, hardening, what CVE scanning exists, who can push to the
registry, how secrets reach a build. Those questions all land in Phase 5's risk register.

Phase 2 behaves the same way. A repo with no extractable function bodies produces a valid
symbol index with its symbols labelled approximate, `pick-spot.cjs` reports `NO CANDIDATES`
and exits 0, and the spot check is skipped while the embedded blocks are still verified.

Then the facts the graph cannot give you. These are starting points, not a complete
search - adapt the patterns to the repo's stack and say what you actually ran:

```bash
# entry points: every way work enters the system
grep -rn "@app\.\|@router\.\|app\.get(\|app\.post(\|addEventListener\|def main\|if __name__\|@task\|@schedule\|handler(" --include=* . | head -40
ls -la serverless.yml Procfile Makefile *.tf *.yaml k8s/ .github/workflows/ 2>/dev/null

# configuration and secrets: every variable, and where it is read
grep -rn "process\.env\.\|os\.environ\|getenv\|ConfigMap\|Secret\b" . | head -40
ls -la .env.example .env.sample config/ 2>/dev/null

# infrastructure
ls -la Dockerfile docker-compose.yml *.tf template.yml cdk.json 2>/dev/null

# error handling and resilience
grep -rn "try:\|catch (\|except \|retry\|backoff\|timeout\|circuit\|DLQ\|dead.letter" . | head -30

# external integrations
grep -rn "http[s]\?://\|boto3\|requests\.\|fetch(\|axios\|SDK\|client(" . | head -30
```

### Start from the shared page shell, do not re-derive the CSS

`~/.claude/analysis-tools/doc-shell.html` is a blank document with the finished
stylesheet already in it: theme tokens for light and dark, the typographic scale,
the SVG element classes (`box`/`boxa`/`lnf`/`tm`/`tam`…), figures, tables, callouts,
the severity chips and the card grid. Copy it, replace the placeholders, write the
body. It carries the width settings that took three passes to get right - the prose
fills the column (`--measure: none`) and figures fill it with them.

### Sixteen sections

Sections 1 to 7 are the structural spine, 8 to 15 the cross-cutting and non-functional
concerns, 16 closes. **Every section is required.** Where the repo has no answer, the
section says so plainly and in one line, and that absence is carried into Phase 5 as a
finding. A missing capability and an omitted section must never look the same to a reader.

| § | Section | Must contain |
|---|---------|--------------|
| 1 | **What the system is** | one paragraph a non-engineer can read; the actors; what the system is for |
| 2 | **Business process** | the domain-level flow the system exists to serve, in business language, with the steps a person would recognise. Not control flow |
| 3 | **Entry points** | *every* way work enters: HTTP routes, CLI commands, queue consumers, schedulers, webhooks, event handlers. An inventory, not an example |
| 4 | **Module boundaries** | both tables from `modules.cjs`: the module list **with its file counts**, and the cross-module edges. State the grouping rule verbatim, name the two-way pairs, and give one line per module saying what it owns |
| 5 | **Layered call graph** | the backbone diagram, derived from the graph |
| 6 | **Boundary-crossing flows** | sequence diagrams *only* where a flow crosses an async or process boundary, with the boundary named |
| 7 | **State machines** | only where a genuine state machine exists; if you cannot name the states, it is not one |
| 8 | **Security model** | trust boundaries; authentication (identity source, token lifetime); authorisation (where it is enforced, and what happens when it is not); what is deliberately public |
| 9 | **Configuration and secrets** | every variable, where it is read, where its value comes from per environment, and **what happens when it is absent**; how secrets are stored and rotated |
| 10 | **Infrastructure and deployment topology** | every environment, what is shared between them and what is isolated, how a deploy reaches each, with the diagram |
| 11 | **Data and persistence** | every store, its keys and indexes, the access pattern each index serves, and **an explicit statement of what personal data is held** |
| 12 | **External integrations** | every third-party API, queue, scheduler and object store; what breaks when each is down |
| 13 | **Error handling and resilience** | the exception strategy; retries, timeouts, idempotency, dead letters; what is swallowed and what surfaces to a user |
| 14 | **Availability and recovery** | the HA topology, single points of failure named plainly, backup and restore, RTO/RPO where stated |
| 15 | **Performance and scale** | the hot paths, the concurrency model, caching, known limits and the load level at which they bite |
| 16 | **What was deliberately not drawn** | the diagram types rejected and why |

Sections 10 and 11 live here, not in Phase 5. Phase 5 references them rather than
restating them.

### Then paste

> Produce an architecture document for this repo from the graph and the evidence commands
> already run. Cover, as numbered sections: what the system is; the business process in
> domain language; a complete inventory of entry points; module boundaries carrying both
> tables from modules.cjs, their file counts, the grouping rule stated verbatim and the
> two-way pairs named; a layered call graph; sequence diagrams only for flows that
> cross an async or process boundary; state machines only where genuine; the security model
> with trust boundaries, authentication and authorisation; configuration and secrets
> including what happens when a variable is absent; infrastructure and deployment topology;
> data and persistence including what personal data is held; external integrations and what
> breaks when each is down; error handling and resilience; availability and recovery with
> single points of failure named; performance and scale with known limits; and a closing
> section on what you deliberately did not draw.
> Every section is required. Where this repo has no answer - no HA story, no authorisation
> layer, no retry strategy - say so in one plain line rather than omitting the section, and
> list those absences at the end so they can be carried into the assessment.
> Describe how the system is designed, not how well it works; the judgement belongs in the
> technical assessment.
> Every claim must trace to a file you read or a command you ran. Hand-authored inline SVG,
> no CDN dependencies. Do not draw flowcharts of ordinary control flow; the code is already
> that flowchart.
> Write it as a single self-contained HTML file at **docs/architecture-diagrams.html**,
> replacing that file if it exists. Do not write to any other path.
> House style: no em dashes anywhere in the prose, the figure labels or the captions -
> use a spaced hyphen, comma, colon or parentheses instead.

**What makes this succeed or fail:** a diagram earns its place only when it shows
something the source cannot - usually because the relationship crosses a boundary the
call graph cannot follow (an HTTP hop, a process spawn, a file another program owns).
Every figure should be defensible on that test. §2 and §16 are what stop the document
becoming a pile of generated figures: the business process is the one view that no amount
of source reading produces, and naming the rejected diagram types is the fastest way to
show the set was chosen. (§6, §7)

**Gates:**

1. Every one of the sixteen sections is present, including the ones that say "this repo
   has no X". The absences are listed together at the end.
2. Every function name in the document exists:

```bash
for f in nameOne nameTwo nameThree; do printf '%-20s %s\n' "$f" "$(grep -rln "function $f\|$f =" src | head -2 | tr '\n' ' ')"; done
```

3. Every *edge* drawn in the call graph exists in the graph, not just every name. Names
   that exist wired together in a way that does not is the failure the name check misses:

```bash
node -e "
const fs=require('fs');
const gd=JSON.parse(fs.readFileSync('docs/.analysis-cache/graphdata.json','utf8'));
const pairs=[['caller','callee'],['other','target']];   // the edges your diagram draws
const lbl=i=>gd.n[i].l.replace(/\(\)$/,'');
const has=(a,b)=>gd.e.some(([s,t])=>lbl(s)===a&&lbl(t)===b);
pairs.forEach(([a,b])=>console.log((has(a,b)?'ok   ':'MISSING ')+a+' -> '+b));
"
```

4. **It does not overflow horizontally at a narrow viewport.** Measure this, do not eyeball
   it. A single unbreakable token - one long identifier in inline `code` - sets a floor on
   the page width and clips *every paragraph on the page*, which looks like a prose bug and
   is not one:

```bash
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"   # or your chrome path
cp docs/architecture-diagrams.html /tmp/probe.html
python - <<'PY'
p='/tmp/probe.html'; s=open(p,encoding='utf-8').read()
s=s.replace('</body>','<script>document.title="VP="+innerWidth+" DOCW="+document.documentElement.scrollWidth;</script></body>',1)
open(p,'w',encoding='utf-8').write(s)
PY
"$CH" --headless=new --disable-gpu --virtual-time-budget=2000 --dump-dom \
  --window-size=500,1200 "file:///tmp/probe.html" 2>/dev/null | grep -o "<title>[^<]*</title>"
```

   **`DOCW` must be less than or equal to `VP`.** Elements wider than the viewport are fine
   *if* they sit inside `.figscroll` or `.tblwrap`, which scroll internally by design; what
   fails the gate is the document itself being wider than the window.

   Two things about this command. `--window-size=500` is the floor: headless Chrome clamps
   the viewport to 500px, so a smaller number silently gives you 500 anyway and
   `--force-device-scale-factor` does not move it. 500px is below the shell's 640px
   breakpoint, so it does exercise the narrow layout. And a screenshot is for *looking* at
   the page, not for gating it - a PNG rendered at `--window-size=400` is a 500px viewport
   cropped to 400px, so it shows clipping whether or not any exists:

```bash
"$CH" --headless=new --disable-gpu --hide-scrollbars \
  --screenshot=narrow.png --window-size=500,2000 "file://$PWD/docs/architecture-diagrams.html"
```

   **A failure here is almost always a `doc-shell.html` bug, not a bug in this document.**
   Fix it in the shell in the analysis-tooling repo, `npm run install-local`, and regenerate;
   otherwise every future document inherits it. Browser automation is not an alternative
   route to this check: the Chrome extension rejects `file://` outright, and on a proxied
   workstation it may never reach a local server either.

---

## Phase 5 - technical assessment

**Writes:** `docs/technical-assessment.html` (replacing it if present). No other path. A
`docs/due-diligence.html` is the old name for this same artefact: delete it, do not update it.

Gather evidence first - every number in this document must come from something you ran
or read, never from an estimate:

Two of these depend on the target's language. Run the pair that matches its manifest, not
the JS pair by reflex - quoting `package.json` for a Python repo is the kind of error the
assessment is supposed to be immune to.

```bash
cat .github/workflows/*.yml       # what CI actually covers, and on what matrix
git log --oneline -5              # the commit the assessment describes

# tests and dependencies, by ecosystem. Record pass/fail AND duration.
npm test 2>&1 | tail -15                 ; grep -n '"dependencies"' -A5 package.json
pytest -q 2>&1 | tail -15                ; cat pyproject.toml requirements*.txt
composer test 2>&1 | tail -15            ; grep -n '"require"' -A10 composer.json
go test ./... 2>&1 | tail -15            ; cat go.mod
cargo test 2>&1 | tail -15               ; grep -n '^\[dependencies\]' -A15 Cargo.toml
dotnet test 2>&1 | tail -15              ; cat *.csproj
```

If the repo has its own runner or a Makefile target, that is the authority over any of the
above. A test command that does not exist is itself a finding: record "no runnable suite"
rather than quietly omitting the quality section.

Then paste:

> Produce a technical assessment of this application for the team that owns and operates
> it. Read docs/architecture-diagrams.html first: it documents how the system is designed,
> and this document judges how well that design holds up. Do not restate its infrastructure,
> data model or security sections - reference them and assess them.
> Read the dependency manifest (package.json, pyproject.toml, go.mod, composer.json or
> whatever this repo uses), the infrastructure templates, the deploy script, any security
> docs, and run the repo's own test suite - every number must come from a file you read
> or a command you ran, not an estimate.
> Cover: what the system is in two lines, the core architectural bet and what it costs,
> security posture with open findings stated, quality evidence with its scope limits,
> operations, and a severity-rated risk register including key-person risk.
> Every absence the architecture document listed - no HA story, no authorisation layer, no
> retry strategy - is an input to the risk register. Rate each one rather than repeating it.
> End with what the repo cannot tell you, and what someone would have to ask a maintainer.
> Be blunt about weaknesses; a problem named early is cheaper than one found late.
> Write it as a single self-contained HTML file at **docs/technical-assessment.html**,
> replacing that file if it exists. Do not write to any other path. If this repo still has
> a docs/due-diligence.html, that is the old name for this same artefact: delete it rather
> than updating it.
> House style: no em dashes anywhere - use a spaced hyphen, comma, colon or parentheses.

**Gate - the risk register is the credibility test.** If it contains no finding that
would make the owner wince, it is marketing and will be read as such. It should carry at
least one structural risk that cannot be engineered away, one concrete security finding
with an honest severity (including the reasons it is *less* exploitable than it sounds, if
that is true), and key-person risk stated plainly. Grade severity on real exploitability,
not on how bad the category name sounds. (§8)

**Second gate:** every absence Phase 4 listed appears in the risk register with a severity.
An architecture document that says "no retry strategy" and an assessment whose register
does not mention it means one of the two was written without reading the other.

---

## Phase 6 - wire it up, and stop

Make the artefacts findable, or the next session rebuilds them from scratch:

1. **Cross-link the set so one page is the entry point.** The architecture document is
   that page. It needs a `.docnav` strip directly under the masthead linking the symbol
   index, the technical assessment, the playbook and the runbook; the technical assessment
   needs the same strip with the first card pointing back at the diagrams. Add contextual
   links too, where a reader would actually want them - the module-graph table should
   link to the symbol index, and the closing "what not to draw" section should hand the
   risk and operational questions to the technical assessment. Finish with a footer
   line carrying all four as plain links. A nav strip alone is a table of contents; the
   contextual links are what make the set read as one document.
2. **Check every link resolves** before you call it done. These are relative links between
   files on disk, so check them on disk - no browser and no server, both of which may be
   unavailable on a locked-down workstation:

   ```bash
   node -e "
   const fs=require('fs'),path=require('path');
   let bad=0;
   for (const f of fs.readdirSync('docs').filter(f=>/\.html$/.test(f))) {
     const html=fs.readFileSync(path.join('docs',f),'utf8');
     const hrefs=[...new Set([...html.matchAll(/href=[\"']([^\"'#?]+\.(?:html|md))/g)].map(m=>m[1]))];
     for (const h of hrefs) {
       const target=path.resolve('docs',h);
       const ok=fs.existsSync(target);
       if(!ok) bad++;
       console.log((ok?'ok   ':'BROKEN ')+f+'  ->  '+h);
     }
   }
   process.exit(bad?1:0);
   "
   ```

   Exit 0 and no `BROKEN` lines. This is the check that catches a renamed artefact: every
   nav strip written before a rename still points at the old filename.

3. **Run the narrow-viewport gate on every generated page**, not just the architecture
   document. The command is in Phase 4, gate 4. A shell fix regenerates into all of them,
   so they pass or fail together.

4. A short **Generated documentation** section in `README.md` - a table of the files,
   the regeneration command, and an explicit "do not hand-edit the symbol index".
5. Four lines in `CLAUDE.md` pointing at the same, so a future agent session finds them.
6. `git status --short` and a plain statement of what is left in the working tree.

**Do not commit unless the repo's CLAUDE.md says you may**, and do not deploy anything
as part of this work.

---

## Phase 7 - share copies (only when sending the set outside the team)

**Writes:** `docs/architecture-diagrams.share.html` and
`docs/technical-assessment.share.html`. The originals are never modified.

The symbol index cannot be shared. It embeds the analysed repository's entire source,
hundreds of files, in two JSON blocks; that is the point of it and the reason it is 9MB.
So a set sent to anyone who should not have the source is the two authored documents only,
and every reference to the third has to go with it, or the recipient is left following
links to a page they do not have.

**A share copy has no internal links at all, not even to its pair.** These are pasted into
Confluence, or a wiki, or an email, as separate standalone pages. A relative `href` to
`technical-assessment.share.html` resolves against whatever URL the page ends up at and
breaks, so the only safe number of internal links is zero. That means the `.docnav` strip
and the footer link row come out entirely rather than being retargeted: a nav strip with
nothing in it is worse than no nav strip. Each copy has to stand completely alone.

**This is the one phase whose output leaves the building. Review the content before the
mechanics.** Both documents are written to be blunt: the assessment carries open security
findings with their file and line, the architecture document names internal systems,
environments and data stores, and both may state plainly what personal data accumulates
where. That candour is correct for the owning team and may be entirely wrong for the
recipient. Read both in full and decide per finding, per name. Nothing below substitutes
for that read.

```bash
# what you are about to send, before you send it
grep -rn "password\|secret\|token\|api[_-]key\|\.internal\|10\.\|192\.168\." docs/*.share.html | head -40
```

Then paste:

> Produce share copies of docs/architecture-diagrams.html and
> docs/technical-assessment.html as docs/architecture-diagrams.share.html and
> docs/technical-assessment.share.html. Do not modify the originals.
> Each copy must be completely standalone, because they are pasted into Confluence as
> separate pages where any relative link breaks. Remove **every** internal link, not just
> the broken ones: delete the .docnav strip and the footer link row outright rather than
> emptying or retargeting them, drop every link to the symbol index, and drop every link
> between the two documents. The result must contain zero hrefs to a .html or .md file.
> Where prose treated another document as something the reader can open, reword it to name
> the document in plain text instead, so the fact survives without the link. Do not leave a
> dangling sentence.
> Add one closing line to each saying this is a standalone share copy, that the browsable
> symbol index is omitted because it embeds the repository's source, and naming the
> companion document in plain text so a reader knows it exists.
> Change nothing else. Same sections, same findings, same numbers.
> House style: no em dashes - use a spaced hyphen, comma, colon or parentheses.

**Why `.share.html` and not `docs/share/`.** `.graphifyignore` carries `docs/*.html`, and
gitignore-style globs do not cross directory boundaries, so a subfolder slips straight past
that pattern and the share copies end up in the next graph build. The suffix keeps them
covered by the rule that already exists.

**Gates:**

1. **Originals untouched.** Their symbol-index references and nav strips are all still present.
2. **Zero internal links.** No href to any `.html` or `.md` file, and no `.docnav` strip.
   Not "links that resolve": none at all. A relative link that works in `docs/` still breaks
   once the page is a Confluence page.
3. **No dangling references.** Zero mentions of the symbol index by filename in either copy.
4. **Still self-contained.** No scripts, no local images; the fonts stylesheet is the only
   outbound request. A share copy that needs a file the recipient does not have is broken
   in a way that only shows up on their machine.
5. **Content intact.** Same section counts as the originals, same findings, zero em dashes.
6. **Narrow viewport**, as Phase 4 gate 4.

```bash
grep -c "symbol-index\|docnav" docs/architecture-diagrams.html   # unchanged, originals keep theirs
grep -o 'href="[^"]*\.\(html\|md\)"' docs/*.share.html           # must print nothing
grep -c "docnav\|<script" docs/*.share.html                      # 0
```

**They are not gitignored.** Share copies show as untracked and a `git add .` commits them,
which puts a document written for an outside reader into the repository permanently. Decide
deliberately: add `docs/*.share.html` to `.gitignore`, or write them somewhere outside the
repo entirely.

---

## Updating an existing analysis

Coming back to a repo that already has the artefact set. The phases re-run in the same
order; what changes is how much you need to run.

**First, decide whether you need the phases at all.** A change to `doc-shell.html` (palette,
type stack, a dropped font request) does not change a single word of either document, and
re-running Phases 4 and 5 to pick it up costs over an hour of agent time per repo to produce
identical prose in different colours. Restyle instead:

```bash
node ~/.claude/analysis-tools/restyle.cjs . --dry-run
node ~/.claude/analysis-tools/restyle.cjs .
node ~/.claude/analysis-tools/run.cjs . "Project Name"    # the symbol index, from the template
node ~/.claude/analysis-tools/gates.cjs .                 # a type change moves widths
```

`restyle.cjs` reads the target look out of `doc-shell.html` rather than carrying its own
copy, so the shell stays the single source of truth. It rewrites custom properties, font
stacks and the external font `<link>` tags, and nothing else: prose, markup, figures and
numbers come through byte-identical. It refuses `symbol-index.html` on purpose, because that
page embeds the analysed repo's own source and the rule is that style changes go into
`symbol-index-template.html` and the page is regenerated by `run.cjs`.

Re-run the narrow-viewport gate afterwards. A type change moves widths, and the shell is the
one place a regression reaches every document at once.

The rest of this section is for when the *content* needs refreshing.

**If the code has moved, refresh 1 and 2 first.** Phases 4 and 5 read
`docs/.analysis-cache/graphdata.json`. Re-run them against a stale cache and they author a
confident document about code that no longer exists, with nothing erroring to tell you.
`--update` is incremental and much cheaper than the first build:

```bash
/graphify . --update
node ~/.claude/analysis-tools/run.cjs . "Project Name"
node ~/.claude/analysis-tools/pick-spot.cjs docs/symbol-index.html
node ~/.claude/analysis-tools/verify.cjs docs/symbol-index.html <file> <symbol>
```

Re-run the Phase 2 gates too. A refresh can break range matching that worked before, and
the spot-check pair you used last time may no longer be the best one, or may be gone.

**A graph rebuild must come before the authoring phases, never after.** The rule above is
usually read as "only if the code changed", but any reason to rebuild is the same reason:
cleaning stale nodes out, adding a `.graphifyignore`, recovering from a bad run. Rebuild
afterwards and both authored documents were written from a graph that no longer exists, so
both have to be written again. Do it first and they are written once.

**Identical numbers after a rebuild are a symptom, not reassurance.** `run.cjs` does not
build the graph; it compacts `graphify-out/graph.json` into `graphdata.json`. Point it at a
graph that did not actually change and every downstream figure is unchanged *by
construction*, while `verify.cjs` still prints `ALL GOOD` because it only checks that the
embedded JSON re-parses and that one named symbol has a real range. Neither knows the graph
is stale. Check the timestamp, which is the only thing that tells you:

```bash
ls -l graphify-out/graph.json        # must be newer than the rebuild you just ran
```

Two ways this happens. `/graphify . --force` is a **slash command**: pasted at a shell
prompt it does nothing visible, and the next command runs against the old graph. And a
`--force` rebuild on a large repo takes minutes, so starting `run.cjs` too early reads a
`graph.json` that is still being written.

**Phases 4 and 5 are coupled.** Phase 5 reads artefact 2 and rates every absence it lists,
so you cannot refresh one without the other. Re-run Phase 4 alone and you get an
architecture document naming gaps that the untouched assessment's risk register never
mentions, which is precisely the state Phase 5's second gate exists to fail. Always 4 then
5 then 6.

**A phase whose spec has changed needs a fresh session, not a re-prompt.** Sessions reuse
what they have already read. If a phase is re-run in a session that read an older version
of this file, it will re-execute the older version and the output will look like a
plausible success: correct shape, wrong spec. Re-prompting the same session reproduces it.
Start a new session, and make the invocation self-checking by naming something the current
spec contains:

```
Read ~/.claude/analysis-tools/SESSION-RUNBOOK.md and execute Phase 4 against this repo.
Re-read the file now rather than relying on anything you already know about it. Phase 4
specifies sixteen required sections. If your reading has fewer, you have stale content:
stop and say so.
```

**Phases 4 and 5 rewrite, they do not update.** Neither has an incremental mode: each
regenerates its whole HTML file from the graph and the evidence commands. Any hand edit
made to `architecture-diagrams.html` or `technical-assessment.html` since the last run is
lost. If someone has tweaked either by hand, copy it aside first, and treat the need to do
so as a signal that the edit belongs in the prompt rather than in the output.

**Phase 3 still goes first, and is the cheap one.** It edits README.md and CLAUDE.md in
place and is genuinely idempotent: on a re-run it simply finds whatever drifted since last
time. Phases 4 and 5 build on what those two files claim, so the ordering reason from the
first pass has not changed.

**Phase 6 is idempotent** but re-check it, because a rename or a new artefact leaves the
nav strips pointing at the old set. Run its link check every time.

So a full refresh is 1, 2, 3, 4, 5, 6. A prose-only refresh, where the code has not
changed, is 3, 4, 5, 6.

**Renamed or removed artefacts leave orphans.** Regenerating does not delete the previous
file: the old one stays on disk, unreferenced by the new nav strips but looking current to
anyone who opens it. Delete it as part of the re-run. Artefact 3 was named
`docs/due-diligence.html` before it became `docs/technical-assessment.html`, so any repo
analysed before that rename needs:

```bash
git rm docs/due-diligence.html
```

---

## House style

Two rules that apply to every document the pipeline produces, and to the README and
CLAUDE.md edits that go with them:

- **No em dashes.** Neither the character nor its HTML entity form. Use a spaced hyphen for a break in
  a sentence, or recast it as a comma, colon or parentheses. This applies to the page
  templates as well, so a regenerated symbol index does not reintroduce them.
- **Never rewrite embedded source to satisfy a style rule.** The symbol index carries the
  repository's own code inside two JSON blocks. Style sweeps run on the *template*, and
  the page is then regenerated - editing the generated page directly would make the
  displayed source disagree with the file it claims to show.

## Acceptance checklist

Most of this is runnable. `gates.cjs` carries every row below that a machine can decide:

```bash
node ~/.claude/analysis-tools/gates.cjs .        # all phases, exits non-zero on failure
node ~/.claude/analysis-tools/gates.cjs . 4      # one phase
```

It reports `pass`, `fail`, `warn` and `skip`. `warn` is a heuristic that cannot be certain
and wants a human; `skip` is an artefact that does not exist yet, which is not a failure
mid-run. Run it after every phase rather than once at the end, so a bad artefact never
reaches the phase that reads it.

**A green run is not the document being good.** The rows it cannot check are the ones that
decide whether the set is worth anything: whether the risk register contains a finding the
owner would rather not publish, whether every number traces to a command that was run,
whether each diagram earns its place. A gate runner enforces shape, never honesty.

| Check | How |
| :--- | :--- |
| Generated output is ignored | `git check-ignore -v graphify-out/graph.json` prints a match |
| Generated docs are not graphed | `.graphifyignore` carries `docs/*.html`; no graph node has a `docs/*.html` source |
| Ranges are real | spot-checked symbol's last line is that symbol's real end, not the next symbol's start |
| Unmatched symbols explained | per-kind breakdown run; `fn/ast` at ~100% |
| Pages do not overflow | headless measure at 500px: `DOCW` <= `VP` on every generated page |
| Both colour schemes render | headless screenshot with and without `prefers-color-scheme: dark` |
| Every number is sourced | each figure traceable to a command that was run |
| All 16 sections present | including the ones stating an absence; absences listed together at the end |
| Absences reach the register | every gap artefact 2 names is rated in artefact 3, not repeated |
| Risk register is honest | contains at least one finding the owner would rather not publish |
| Names are real | every symbol named in prose verified to exist |
| Edges are real | every call drawn in a diagram exists in `graphdata.json`, not just the names |
| Set is cross-linked | nav strip on both HTML docs, contextual links in place, every href returns 200 |
| No em dashes | a grep for U+2014 and for the HTML entity form both return 0 on every artefact (the character is deliberately not written here, so this file passes its own check) |
| Nothing committed | `git status --short` reported, working tree left intact |
| Share copies reviewed | if Phase 7 ran: read in full before sending; no symbol-index references; not accidentally committed |

---

## When it goes wrong

`ANALYSIS-PLAYBOOK.md` §11 collects every trap with its symptom. The three that cost the
most time, because all three fail *silently*:

- **A literal `</` inside embedded JSON** ends the `<script>` block. Result is a blank
  page and no console error. `inject.cjs` escapes it; never hand-edit around that.
- **Backslashes collapse through shell heredocs.** `\\` becomes `\`. Any script written
  that way is subtly wrong. The toolkit uses `String.fromCharCode(92)` for exactly this.
- **`.gitignore` patterns are relative to the file they are in.** Appended to a
  subdirectory's `.gitignore`, they match nothing and you will not be told.

And the two that produce *plausible* wrong output, which is worse than a crash:

- **Heuristic end-of-function detection** gives you a function body - just the wrong
  one. Only a real parser is acceptable. (§5)
- **A name tiebreak that never fires.** graphify labels callables `foo()`; comparing
  that to a parser's `foo` never matches, so matching silently falls back to
  "widest range wins".
