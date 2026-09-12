# Session runbook - running the analysis pack on a new repo

How to execute the whole pipeline from **one Claude Code session started in the target
repo**. This is the operating order; `ANALYSIS-PLAYBOOK.md` next to it is the reference
that explains *why* each step is the way it is. Section numbers below point into it.

The output is four artefacts:

| # | Artefact | Produced by | Effort |
| :- | :--- | :--- | :--- |
| 1 | `docs/symbol-index.html` | one command | automated |
| 2 | `docs/architecture-diagrams.html` | Claude, guided | ~1 session |
| 3 | `docs/due-diligence.html` | Claude, guided | ~1 session |
| 4 | README/CLAUDE.md truth pass | Claude, guided | ~20 min |

**Before you start: no em dashes.** Every document this pipeline produces, in every
repository, is written without the em dash character or its HTML entity form. Use a spaced
hyphen for a break in a sentence, or recast with a comma, colon or parentheses. The rule is
easy to honour while writing and tedious to retrofit across four documents, so carry it
from the first sentence. Full rule in [House style](#house-style) below; it is also stated
inside the Phase 3, 4 and 5 prompts so the instruction travels with the work.

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
node ~/.claude/analysis-tools/run.cjs . "Project Name" src/some/real/file.js someFunction
```

The last two arguments are a spot check - **a real file and a real function in it**, both
or neither. They are placeholders, not literals.

**Gates, in order of what they catch:**

1. `ALL GOOD` printed and exit 0 - both embedded JSON blocks re-parse.
2. The spot-checked symbol's **last line is a closing brace**. If it is not, range
   matching is broken and nothing on the page can be trusted. (§5)
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

---

## Phase 3 - README truth pass (do this *before* the prose artefacts)

This is out of order compared to the playbook's numbering, and deliberately so. The
architecture and due-diligence documents are largely built on what the README and
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

## Phase 4 - architecture diagrams

Gather the structural facts first, so the diagram is drawn from the graph rather than
from an impression of the code. Aggregate the real cross-directory edges:

```bash
node -e "
const fs=require('fs');
const gd=JSON.parse(fs.readFileSync('docs/.analysis-cache/graphdata.json','utf8'));
const dirOf=f=>{const p=String(f||'').split('/');return p.length>2?p.slice(0,2).join('/'):(p[0]||'?');};
const agg={};
gd.e.forEach(([s,t,rel])=>{const a=gd.n[s],b=gd.n[t];if(!a||!b)return;
  if(rel!=='calls'&&rel!=='imports')return;
  const da=dirOf(a.f),db=dirOf(b.f); if(!da||!db||da===db)return;
  const k=da+' -> '+db+' ['+rel+']'; agg[k]=(agg[k]||0)+1;});
Object.entries(agg).sort((x,y)=>y[1]-x[1]).slice(0,40).forEach(([k,v])=>console.log(String(v).padStart(4),k));
"
```

**Start from the shared page shell, do not re-derive the CSS.**
`~/.claude/analysis-tools/doc-shell.html` is a blank document with the finished
stylesheet already in it: theme tokens for light and dark, the typographic scale,
the SVG element classes (`box`/`boxa`/`lnf`/`tm`/`tam`…), figures, tables, callouts,
the severity chips and the card grid. Copy it, replace the placeholders, write the
body. It carries the width settings that took three passes to get right - the prose
fills the column (`--measure: none`) and figures fill it with them.

Then paste:

> Run /graphify on this repo with --directed. Then trace the main end-to-end user flow
> from the entry point through to persistence, and tell me where the call graph cannot
> follow it and why. Build a layered call-path diagram plus sequence diagrams only for
> the flows that cross an async or process boundary, and state machines only where a
> genuine state machine exists. Hand-authored inline SVG, single self-contained HTML
> file, no CDN dependencies. Do not draw flowcharts of ordinary control flow.
> House style: no em dashes anywhere in the prose, the figure labels or the captions -
> use a spaced hyphen, comma, colon or parentheses instead.

**What makes this succeed or fail:** a diagram earns its place only when it shows
something the source cannot - usually because the relationship crosses a boundary the
call graph cannot follow (an HTTP hop, a process spawn, a file another program owns).
Every figure should be defensible on that test. Close the document with a short section
naming the diagram types you *rejected* and why; it is the fastest way to show the set
was chosen rather than generated. (§6, §7)

**Gate:** open the file from disk. Check it renders at ~400px wide and in both colour
schemes, and that every function name in it exists - verify with a single loop rather
than trusting recall:

```bash
for f in nameOne nameTwo nameThree; do printf '%-20s %s\n' "$f" "$(grep -rln "function $f\|$f =" src | head -2 | tr '\n' ' ')"; done
```

---

## Phase 5 - due diligence pack

Gather evidence first - every number in this document must come from something you ran
or read, never from an estimate:

```bash
npm test 2>&1 | tail -15          # or the repo's own runner; record pass/fail and duration
cat .github/workflows/*.yml       # what CI actually covers, and on what matrix
grep -n '"dependencies"' -A5 package.json
git log --oneline -5              # the commit the pack describes
```

Then paste:

> Produce a technical due diligence pack for a potential acquirer of this application.
> Read package.json, the infrastructure templates, the deploy script, any security docs,
> and run the test suite - every number must come from a file you read, not an estimate.
> Cover: what the system is, deployment topology, data model including what personal data
> is held, the core architectural bet, security posture with open findings stated,
> quality evidence with its scope limits, operations, a severity-rated risk register
> including key-person risk, and what transfers on sale. End with what the repo cannot
> tell a buyer.
> Be blunt about weaknesses; a disclosed issue is worth more than a discovered one.
> House style: no em dashes anywhere - use a spaced hyphen, comma, colon or parentheses.

**Gate - the risk register is the credibility test.** If it contains no finding that
would make the owner wince, it is marketing and a buyer will read it as such. It should
carry at least one structural risk that cannot be engineered away, one concrete security
finding with an honest severity (including the reasons it is *less* exploitable than it
sounds, if that is true), and key-person risk stated plainly. Grade severity on real
exploitability, not on how bad the category name sounds. (§8)

---

## Phase 6 - wire it up, and stop

Make the artefacts findable, or the next session rebuilds them from scratch:

1. **Cross-link the set so one page is the entry point.** The architecture document is
   that page. It needs a `.docnav` strip directly under the masthead linking the symbol
   index, the due-diligence pack, the playbook and the runbook; the due-diligence pack
   needs the same strip with the first card pointing back at the diagrams. Add contextual
   links too, where a reader would actually want them - the module-graph table should
   link to the symbol index, and the closing "what not to draw" section should hand the
   commercial and operational questions to the due-diligence pack. Finish with a footer
   line carrying all four as plain links. A nav strip alone is a table of contents; the
   contextual links are what make the set read as one document.
2. **Check every link resolves** before you call it done. From a served copy of `docs/`:

   ```js
   for (const h of [...new Set([...document.querySelectorAll('a[href$=".html"], a[href$=".md"]')]
        .map(a => a.getAttribute('href')))]) console.log(h, (await fetch(h, {method:'HEAD'})).status);
   ```

3. A short **Generated documentation** section in `README.md` - a table of the files,
   the regeneration command, and an explicit "do not hand-edit the symbol index".
4. Four lines in `CLAUDE.md` pointing at the same, so a future agent session finds them.
5. `git status --short` and a plain statement of what is left in the working tree.

**Do not commit unless the repo's CLAUDE.md says you may**, and do not deploy anything
as part of this work.

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

| Check | How |
| :--- | :--- |
| Generated output is ignored | `git check-ignore -v graphify-out/graph.json` prints a match |
| Ranges are real | spot-checked symbol's last line is a closing brace |
| Unmatched symbols explained | per-kind breakdown run; `fn/ast` at ~100% |
| Pages open from disk | `file://` in a browser, both colour schemes, ~400px wide |
| Every number is sourced | each figure traceable to a command that was run |
| Risk register is honest | contains at least one finding the owner would rather not publish |
| Names are real | every symbol named in prose verified to exist |
| Set is cross-linked | nav strip on both HTML docs, contextual links in place, every href returns 200 |
| No em dashes | a grep for U+2014 and for the HTML entity form both return 0 on every artefact (the character is deliberately not written here, so this file passes its own check) |
| Nothing committed | `git status --short` reported, working tree left intact |

---

## When it goes wrong

`ANALYSIS-PLAYBOOK.md` §10 collects every trap with its symptom. The three that cost the
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
