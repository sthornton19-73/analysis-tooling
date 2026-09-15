# Application Documentation Playbook

How to produce, for any repo you own, the four artefacts built for Rugby Ref Coach:

| # | Artefact | Audience | Answers |
|---|----------|----------|---------|
| 1 | **Call-path diagrams** | you, future you, a new dev | "what calls what, and where does it cross a boundary?" |
| 2 | **Symbol index** | you, a code reviewer | "where is `X` defined, what does it touch, show me the source" |
| 3 | **Technical assessment** | the owning team, a reviewer, an auditor | "what is this system's real state, and what is broken?" |
| 4 | **A truthful README + CLAUDE.md** | everyone | "how do I run, test and deploy this?" |

Everything is a **single self-contained HTML file** or a markdown file. No build step, no server,
no dependency on a hosted viewer. Double-click and it works, on any machine, forever.

The runnable tooling is installed once per machine at `$T/` and is
not part of any repo. Every script takes the repo root as an argument, so one copy serves
every project and nothing is vendored into the repos it analyses.

---

## Paths, on Windows and elsewhere

Set the toolkit path once per shell. Every command below then uses `$T`, which expands in
PowerShell and in bash alike:

```powershell
$T = "$env:USERPROFILE\.claude\analysis-tools"     # PowerShell, Windows
```
```bash
T=~/.claude/analysis-tools                          # bash, macOS and Linux
```

A bare `~` is **not** expanded by PowerShell inside a quoted path or a pasted prompt, which
is why it is set explicitly rather than written inline.

Any line that is just `node $T/something.cjs ...` runs unchanged in either shell. Only the
lines using shell built-ins differ, and those are given in PowerShell form; on macOS or
Linux substitute the obvious equivalent. The one block that genuinely needs a POSIX shell
is Phase 4's evidence gathering, which uses `grep` and `ls`: on Windows run it in Git Bash,
or let the Phase 4 session run it, which is what happens when you drive it with
`pipeline.cjs`.

---

## Quick start on a new repo

Artefact 2 (the symbol index) is fully automated. Artefacts 1, 3 and 4 are judgement work
and need Claude - the prompts are in §14.

The toolkit is installed **once per machine**, not once per repo, at
`$T/`. It carries its own `@babel/parser`, so it works against a
repo that has no `node_modules` at all, and every output path derives from the root
argument rather than from where the scripts sit.

```bash
# 1. nothing to install if $T already exists - check first:
ls $T/run.cjs

#    Moving to a NEW machine? The toolkit is the source of truth, not any repo.
#    On the old machine:  tar -czf analysis-tools.tgz -C ~/.claude --exclude node_modules analysis-tools
#    On the new one:      tar -xzf analysis-tools.tgz -C ~/.claude && cd $T && npm install

# 2. in the TARGET repo, ignore the generated output BEFORE running anything.
#    These patterns are relative to the file they live in - they must go in the
#    repo-root .gitignore, not in a subdirectory's.
cd /path/to/other-repo
Add-Content .gitignore "`ngraphify-out/`ncoverage/`ndocs/.analysis-cache/"
```

Then open **Claude Code in that repo** and run the graph build - `/graphify` is a Claude
Code command, not a shell command:

```
/graphify . --directed
```

Back in a shell, one command does the rest:

```bash
node $T/run.cjs . "Project Name" src/main.js someFunction
```

The last two arguments are optional: a file and a symbol you know, which `verify.cjs`
spot-checks and prints, so you can confirm the ranges are real before trusting the page.
Supply both or neither - `src/main.js someFunction` is a placeholder, not a literal. The
match is an exact string comparison against graphify's own labels, so rather than guessing
the pair, build the page with no spot arguments and let `pick-spot.cjs` name it:

```bash
node $T/pick-spot.cjs docs/symbol-index.html
node $T/verify.cjs docs/symbol-index.html <file> <symbol>
```

Output is `docs/symbol-index.html` - self-contained, open it directly. Expect:

```
nodes 1202  edges 2047                      <- sanity-check the kinds histogram
exact ranges 618 | no range 234             <- unmatched are labelled "approximate" in the UI
quickSaveEvent L500-L586                    <- last line should be the symbol's real end
ALL GOOD
```

After changing code, `/graphify . --update` then re-run `run.cjs`. That refreshes artefact
1 only; refreshing the three guided artefacts on a repo that already has them has its own
order and its own traps, in the runbook's **Updating an existing analysis**.

`run.cjs` chains steps 3–5 below. Run them individually when something needs debugging;
the sections that follow explain what each one is doing and why.

---

## 0. Before you start - the honesty rule

This is the part that actually determines whether the output is worth anything.

**Every number in these documents must come from a file you read, not from an estimate.**
Lambda counts come from the deploy script's function array. Table counts come from the
CloudFormation template. Test counts come from running the test runner. Line counts come
from `wc -l`. If you cannot source a number, the document says "not determined from the
repo" - it does not guess.

The corollary: **write down the bad findings**. One assessment opens its risk register
with a live WAF rule that weakens eight unrelated production apps and a database index
change running in production that is not in git. A disclosed-and-closed issue reads as
competence. The same issue found later by someone else reads as concealment, and costs
far more to fix once it has been relied on.

---

## 1. Prerequisites

| Need | Why | Check |
|---|---|---|
| **graphify** installed | builds the raw knowledge graph | `/graphify --help` |
| **Node 18+** | runs the tooling | `node -v` |
| **`@babel/parser`** | exact JS/TS function line ranges | already in `node_modules` of any Vite/React/Next app, else `npm i -D @babel/parser` |
| **Python 3.8+** | exact Python line ranges (`ast.end_lineno`) | skip if the repo has no Python |
| **A `php` binary** | exact PHP line ranges (`token_get_all`) | skip if the repo has no PHP; `php -v`, or set `PHP=/path/to/php` |
| **A clean-ish `git status`** | you will be creating files; you want to see what you added | `git status` |

A repo in a language with no extractor still gets artefacts 1, 3 and 4 in full: its symbols
simply carry no range and the page says so. Adding an extractor for a fourth language is
about an hour's work (see §12).

---

## 2. Step 1 - repo hygiene first (5 minutes, saves an hour)

Do this **before** generating anything, because the generators write into the repo.

```bash
git status                      # know your starting point
```

1. **Add the generated directories to `.gitignore` now:**

   ```gitignore
   # Generated analysis + test output
   graphify-out/
   coverage/
   ```

   graphify writes ~130 files into `graphify-out/`. If you run it first and gitignore
   second, those files are already staged and you need `git rm -r --cached graphify-out`
   to get them back out.

2. **Check for staged-but-deleted files** - `git status` showing `AD` (added to index,
   deleted from worktree) means content exists **only in the git index** and is one
   `git reset` away from being unrecoverable. On RefCoach this turned out to be an entire
   275-test suite that had gone invisible in the IDE. Recover with:

   ```bash
   git checkout -- <path>         # restores index content to the worktree
   ```

3. **Run the test suite, if there is one.** You need a real number for artefact 3, and you
   need to know whether it passes before you advertise it.

---

## 3. Step 2 - build the graph

```bash
cd <repo-root>
/graphify                        # full pipeline, current directory
```

Useful variants:

```bash
/graphify . --directed           # preserve edge direction (source -> target)
/graphify . --mode deep          # richer INFERRED edges, slower
/graphify . --update             # incremental re-extract after code changes
/graphify query "how does sync work?"     # ask the existing graph, no rebuild
/graphify path "TeamEntry" "sync.py"      # shortest path between two symbols
```

**Build directed if you can.** Call-path tracing is meaningless on an undirected graph -
you cannot distinguish "A calls B" from "B calls A", and every diagram derived from it is
guesswork.

Output lands in `graphify-out/graph.json` - nodes, links, Louvain communities, and an
`_origin` field per node recording whether it was `EXTRACTED` from the AST or `INFERRED`
by an LLM. Keep that distinction visible downstream; it is the difference between a fact
and an opinion.

### The single most useful finding

Run a path query across your language boundary:

```bash
/graphify path "<a frontend symbol>" "<a backend handler>"
```

On RefCoach: `No directed path found`. That is **correct** - a `calls` edge cannot cross
from JavaScript to Python, because there is no call; there is an HTTP request. That
absence is the whole justification for artefact 1 containing sequence diagrams: the call
graph is structurally incapable of expressing your most important flow.

Whatever your stack, find the equivalent gap (JS→SQL, app→queue, service→service) and
document it explicitly. It is the thing a static analyser cannot tell a reader.

---

## 4. Step 3 - compact the graph

```bash
node $T/build-graphdata.cjs <repo-root> <out-dir>
```

`graph.json` is verbose and gets embedded verbatim into a single HTML file, so it is
rewritten with one-letter keys and edges referencing nodes by array index:

```
{ n: [ {i,l,f,ln,c,cn,o,k}, ... ],
  e: [ [srcIdx, tgtIdx, relation], ... ] }
```

Roughly a 3× reduction. RefCoach: 1,202 nodes / 2,047 edges → **253 KB**.

Sanity-check the `kinds` histogram it prints. If almost everything is `concept` and almost
nothing is `fn`, graphify did not parse your source - usually a language it has no AST
extractor for, in which case artefact 2 will be thin and you should say so rather than
shipping a hollow explorer.

---

## 5. Step 4 - exact source ranges (the part everyone gets wrong)

```bash
node $T/build-codedata.cjs <repo-root> <out-dir>
```

graphify records where a symbol **starts**. It does not record where it **ends**. Every
tempting shortcut for the end line is wrong often enough to poison the document:

- *next blank line* - breaks on any function with internal spacing
- *next symbol's start* - swallows trailing comments and closing braces, and breaks on nesting
- *brace counting* - breaks on braces inside strings, regex literals, JSX and template literals

So parse properly, using parsers you already have:

- **JS / JSX / TS / TSX** → `@babel/parser` with `errorRecovery: true`, walking for
  `FunctionDeclaration`, `ArrowFunctionExpression`, `ClassMethod` and friends
- **Python** → the stdlib `ast` module, reading `node.end_lineno`
- **PHP** → core `token_get_all`, counting braces from the declaration. A lexer, not a
  parser, so it is the one extractor that has to reject work it cannot do exactly: see the
  three PHP lexer traps in §11.

Then match graph nodes to ranges by start line, with two refinements that matter:

- **Strip the parentheses before comparing names.** graphify labels callables `foo()`.
  Comparing `"foo()"` to the parser's `"foo"` never matches, the name tiebreak silently
  never fires, and every ambiguous line falls back to "widest range wins" - which
  frequently picks the enclosing component instead of the function you asked for. This bug
  is invisible: you get *a* function body, just the wrong one.
- **Allow a 2-line window.** A decorated or assigned function's recorded start can sit on
  the decorator or the `const`, not the `function` keyword.

**Anything without an exact range gets no range, and the UI labels it "approximate".**
RefCoach: 618 of 852 code nodes matched exactly; the other 234 say so on screen. A document
that quietly shows the wrong 40 lines is worse than one that admits it does not know.

Output: `codedata.json` = `{ f: {relPath: fullSource}, r: {nodeIdx: [start, end]} }`,
carrying only the files the graph actually references. RefCoach: 77 files, 1.2 MB.

---

## 6. Step 5 - the symbol index page

A **three-pane drill-down**, which is the answer to "the force-directed graph is
impressive but I cannot navigate it". A hairball shows you that structure exists; a table
lets you find things.

```
┌──────────────┬───────────────────┬────────────────────────┐
│ communities  │ symbols in scope  │ detail: callers /      │
│ + files      │ (sortable table,  │ callees / source code  │
│ (tree)       │  instant filter)  │                        │
└──────────────┴───────────────────┴────────────────────────┘
```

Non-negotiable features, in priority order:

1. **Instant text filter** across symbol name and file path - the single most-used control
2. **Callers and callees as clickable rows** - this is the drill-down
3. **The actual source**, line-numbered, with the exact range highlighted
4. **An EXTRACTED / INFERRED badge** on every edge
5. **Sort by fan-in** - highest fan-in symbols are your real architecture, whatever the
   folder names claim

### Injecting the data

`analysis-tools/symbol-index-template.html` is the 26 KB page shell - all the markup, CSS
and JS, with the data blocks empty and the project name as `{{PROJECT}}`. `run.cjs` fills
in the name and injects; to do it by hand:

```bash
sed 's/{{PROJECT}}/My App/g' $T/symbol-index-template.html > docs/symbol-index.html
node $T/inject.cjs   docs/symbol-index.html <data-dir>
node $T/verify.cjs   docs/symbol-index.html src/App.jsx quickSaveEvent
```

The template carries two empty placeholders:

```html
<script id="gd" type="application/json"></script>
<script id="cd" type="application/json"></script>
```

**The trap that will cost you an afternoon:** a literal `</` anywhere inside a `<script>`
block ends that block - including inside a JSON string. Embedded source code is full of
`</div>`, `</script>` and regex like `/<\/a>/`. RefCoach had 2,255 occurrences. The fix is
to escape the slash as a JSON string escape (a backslash before the `/`), which JSON
accepts and the HTML parser no longer recognises as a closing tag. `inject.cjs` does this;
note that the escape itself does not survive being retyped through a shell heredoc, which
is why the script builds it with `String.fromCharCode(92)`.

The failure mode is silent - a blank page, no console error, nothing in the network tab.
**Always run `verify.cjs` before publishing.** It re-parses both blocks and prints the
first and last line of a symbol you name, so you can eyeball that the range is real:

```
gd OK - nodes 1202 edges 2047
cd OK - files 77 | ranges 618
   quickSaveEvent L500-L586 (87 lines)
   first: "function quickSaveEvent(evt) {"
   last : "}"
ALL GOOD
```

If the last line is not the real end of that symbol, your range matching is broken. In a
brace language that reads as a closing brace, as above. Python has no closer, so the last
line is simply the last statement of the body:

```
   lodge_claims L68-L412 (345 lines)
   first: "async def lodge_claims("
   last : "return state"
```

Both pass. What fails is a last line that belongs to the next symbol, or a body reported
as one or two lines when the source is plainly longer.

---

## 7. Step 6 - the architecture document: what to cover, and what not to draw

Artefact 2 is the largest of the set. It documents how the system is **designed**:
structure, flows, and the cross-cutting and non-functional concerns. How well the design
holds up belongs in artefact 3. Keeping that line clean is what stops the two documents
drifting into disagreement, and it decides where each concern goes:

| Concern | Artefact 2 says | Artefact 3 says |
|---|---|---|
| Security | the trust boundaries, where authn and authz are enforced | which of them is weak, and how exploitable |
| Infrastructure | what exists, in which environment, and how a deploy reaches it | what it costs, what is fragile, what is undocumented |
| Data | every store, its keys, its access patterns, what personal data is held | the exposure that creates, and the compliance gap |
| Availability | the HA topology and where the single points of failure are | what an outage would actually cost, rated |
| Performance | the concurrency model, caching, the known limits | whether those limits are close, and the evidence |

The section list is in the runbook's Phase 4. Sections 1 to 7 are the structural spine,
8 to 15 the cross-cutting and non-functional concerns, 16 closes.

**Every section is required, including the empty ones.** Most repos have no HA story and
many have no authorisation layer. The document says so in one plain line and carries that
absence to artefact 3 as a finding. An omitted section and a missing capability look
identical to a reader, and only one of them is a problem you can fix.

### Draw

| Diagram | When | Why |
|---|---|---|
| **Layered call graph** | always - this is the backbone | the one view that generalises; derived from the graph, so it is cheap to regenerate |
| **Business process** | always | the domain-level flow is nowhere in the source, so this is the one diagram the code cannot replace |
| **Sequence** | only for flows crossing an async or process boundary | the call graph literally cannot express these (see §3) |
| **State machine** | only where a genuine state machine exists | if you cannot name the states, it is not one |
| **Deployment topology** | always | the first question any reviewer asks is "what is actually running, and what does it cost?" |
| **Data model** | always | the second is "what personal data is in there?" |
| **Trust boundaries** | wherever authn or authz is enforced | a boundary you cannot draw is one nobody is checking |

One analysed repo needed one call graph, **5** sequences (capture→sync, AI review with its
504-that-is-not-a-failure, PDF generation, share-token read, deploy) and **2** state
machines (match lifecycle, advantage→sanction linkage). Scale the sequence count to the
number of real boundaries, not to the size of the repo.

### Do not draw

- **Flowcharts of ordinary control flow.** The code is already the flowchart, and it is
  never out of date. This is **not** the same as a business process diagram: an `if/else`
  is in the source, whereas "a claim is lodged, then assessed, then paid or declined" is
  not in any file and has to be drawn. Draw the process, never the control flow.
- **A class diagram**, unless you have real inheritance. A React + Lambda app does not.
- **An ER diagram for a key-value store.** Draw the access patterns instead - for DynamoDB,
  each table with its partition/sort key and every GSI, annotated with the query each one
  exists to serve.
- **A diagram per module.** Nobody reads the 30th one, and all 30 rot together.
- **A non-functional concern you have no evidence for.** An HA diagram of a system with one
  instance is fiction. Write the one-line absence instead.
- **A module diagram of a repo with no modules.** Infrastructure and image-build repos have
  no call or import structure at all; `modules.cjs` detects that and says so. Drawing boxes
  for `platform/` and `hardening/` with no edges between them communicates nothing the
  directory listing did not. Half the sections of such a document are absences, and a
  document that is honestly short beats one padded to look complete.

### How to draw them

Hand-authored inline SVG, not a diagramming library. It is theme-aware with CSS variables,
has no CDN dependency (which matters under a strict CSP), stays legible on a phone, and
survives being opened from `file://` in ten years. A rendering library is a future
breakage for zero present benefit at these volumes.

Mermaid is a reasonable alternative if the page is markdown - artifacts render
` ```mermaid ` fences natively, with no library to load.

---

**Do not write the page CSS from scratch.** `$T/doc-shell.html`
is the shared shell for both authored documents - theme tokens, type scale, SVG element
classes, figures, tables, callouts, severity chips, card grid, responsive rules. Copy it
and fill in the body.

Two width settings in it are deliberate and were arrived at the hard way: `--measure` is
`none` so prose fills the column rather than being capped at a 66ch reading measure, and
`.wrap` is 1400px so figures and text share one left edge. A capped measure inside a wide
wrapper produces a page that uses about half its width, which is the first thing anyone
says when they open it. If you narrow the measure, narrow the wrapper to match.

### A narrow-viewport failure is a shell bug, every time

When a generated page overflows horizontally, the instinct is to fix that page. Don't. Both
authored documents inherit `doc-shell.html`, so a page that overflows means the shell
overflows, and fixing one document leaves the next one to rediscover it.

The failure is also badly disguised. One unbreakable token is enough to set a floor on the
page width, and once the document is wider than the viewport, *every paragraph on the page*
is clipped at the right edge. It reads as a prose or layout problem across the whole
document when the actual cause is a single long identifier inside an inline `code` span.
That is why `code` and `ol.trace li` carry `overflow-wrap:anywhere`: measured on a real
document, the page went from 567px wide against a 500px viewport to 485px.

Elements genuinely wider than the viewport are fine **if** they sit inside `.figscroll` or
`.tblwrap`. Those scroll internally on purpose, which is how a 640px diagram lives on a
phone. The gate is the *document* width, not the width of everything in it.

So the order is: measure with the Phase 4 gate, fix `doc-shell.html` here, `npm run
install-local`, regenerate. Never patch the symptom in the generated page, which the next
run overwrites anyway.

## 8. Step 7 - the technical assessment

Six sections. This ordering front-loads what a technical reviewer actually opens the
document to find. It is shorter than it used to be: deployment topology and the data model
moved to artefact 2, which describes them. This document assesses them.

| § | Section | Must contain |
|---|---------|--------------|
| 1 | **What the system is** | two lines, then a link to artefact 2. Do not restate it |
| 2 | **The architectural bet** | the one or two decisions that are hardest to replicate, and hardest to reverse, with what they cost |
| 3 | **Security posture** | every finding and its *real* status, open ones included, assessed against the trust boundaries artefact 2 drew |
| 4 | **Quality evidence** | test count, coverage, and the **scope limits stated plainly**, not buried |
| 5 | **Operations** | the deploy process, its prerequisites, and honestly whether it runs from a workstation |
| 6 | **Risk register** | severity-rated, key-person risk included, **and every absence artefact 2 listed** |

That last clause is the join between the two documents. Artefact 2 is required to state its
gaps plainly (no HA story, no authorisation layer, no retry strategy); each one arrives here
to be rated rather than repeated. An absence in one that is missing from the other means a
document was written without reading its pair.

### The risk register is the credibility test

Rate each item High / Medium / Low and be willing to write High. A real one:

> **High** - a temporary WAF allow rule added for a penetration test is still live on a
> shared ACL, weakening protection on eight other production apps.
> **High** - production is running a database index change that is not in git.
> **High** - key-person dependency: one author, no bus factor.
> **Medium** - no integration, component or Lambda test coverage.
> **Medium** - single-vendor dependency on one AI API.
> **Medium** - a 2,669-line file holding most application state.

None of that is flattering. All of it would be found within a day by any competent
reviewer, and them finding it first is what makes everything *else* the document claims
look unreliable.

### State what the repo cannot tell them

Close the document with the explicit limits: real usage numbers, actual hosting spend,
incident history, and any commercial or contractual context are **not** derivable from
source and have to come from a maintainer. Saying so prevents the reader from assuming
the silence is an answer.

---

## 9. Step 8 - publish and keep a local copy

If you publish to an artifact, **also save a standalone local copy**. A published artifact
is a **body fragment** - the platform supplies the doctype, `<head>` and `<body>` at
publish time. Saved to disk raw, it renders in quirks mode with no viewport meta.

```bash
node $T/standalone.cjs <fragment.html> docs/<name>.html
```

Publishing constraints worth knowing up front, because they shape how you build the page:

- **Scripts load only from** cdnjs, jsDelivr, the Tailwind play CDN and code.jquery.com.
  Stylesheets only from `fonts.googleapis.com`. Everything else is blocked silently -
  unpkg, esm.sh, all images, all `fetch`. So inline your CSS and JS and embed assets as
  `data:` URIs.
- **16 MB limit** including embedded data. RefCoach's symbol index is 1.5 MB; a repo ~10×
  larger would need to drop the embedded source and keep only ranges.
- **Downloads do not work** for viewers - `<a download>` and script-driven saves are inert
  in the sandbox. Do not offer a file through a link.
- **Must work at ~400 px wide** and in both light and dark themes.

Commit `docs/` so the artefacts travel with the repo. They are the version that still
works when the hosted one does not.

---

## 10. Step 9 - share copies, and why they carry no links

Sending the set outside the team is a different problem from publishing it, and the runbook
gives it its own phase because two things about it are counter-intuitive.

**The symbol index cannot go.** It embeds the analysed repository's entire source in two
JSON blocks, which is the whole point of it and the reason it is measured in megabytes. So
what travels is the two authored documents, and every reference to the third has to travel
with it or the recipient follows links to a page they do not have.

**A share copy has zero internal links, not zero broken ones.** This is the rule that gets
got wrong, because the obvious fix looks like retargeting the cross-links onto the
`.share.html` filenames so the pair still works as a set. That holds only while both files
sit in the same directory. The moment each becomes a Confluence page, a wiki page or an
email, a relative `href` resolves against a base that no longer exists and dies. Testing
the links in `docs/` proves nothing about where the page actually lands, so a link checker
that passes is actively misleading here. The `.docnav` strip and the footer link row come
out whole rather than being emptied or repointed: a nav strip with nothing in it is worse
than no nav strip.

What survives is the *fact*, not the link. Where prose treated the other document as
something the reader could open, it names it in plain text instead, and a closing line
says the copy is standalone, names its companion, and explains the symbol index's absence.
A reader should never be left wondering about a third document the pair keeps nearly
mentioning.

**Name them `*.share.html`, never `docs/share/`.** `.graphifyignore` carries `docs/*.html`,
and gitignore-style globs do not cross directory boundaries, so a subfolder slips past that
pattern and the share copies land in the next graph build. The suffix keeps them covered by
the rule that already exists.

**Read them before sending.** This is the only output that leaves the building, and both
documents are written to be blunt: open security findings with file and line, internal
system and environment names, a plain statement of what personal data accumulates where.
Correct for the owning team, potentially wrong for the recipient. No grep decides that.

---

## 11. Gotchas, collected

| Symptom | Cause | Fix |
|---|---|---|
| Blank page, no console error | a literal `</` inside embedded JSON closed the script tag | escape the slash; run `verify.cjs` before publishing |
| Source pane shows the wrong function | name tiebreak never fired - graphify's `foo()` vs the parser's `foo` | strip the trailing parens before comparing |
| `require is not defined in ES module scope` | repo `package.json` has `"type": "module"` | use the `.cjs` extension (the shipped tools already do) |
| graphify `BrokenProcessPool` on Windows | multiprocessing needs an `if __name__ == "__main__"` guard | none needed - it falls back to sequential and the result is correct, just slower |
| `node -e` scripts mangle regex or paths | shell escaping through PowerShell/bash | write the script to a file and run it; never inline anything containing a backslash |
| Escapes vanish when pasting a script | heredocs collapse a doubled backslash to one | build the character with `String.fromCharCode(92)` |
| 130 unexpected files in `git status` | `graphify-out/` was not gitignored before the run | `git rm -r --cached graphify-out` |
| Page renders unstyled from disk | saved a published artifact body fragment as-is | wrap with `standalone.cjs` |
| PHP function ends early, at the first interpolated string | `"{$x}"` lexes as T_CURLY_OPEN plus a plain `}`, so the brace count goes negative mid-body | count T_CURLY_OPEN and T_DOLLAR_OPEN_CURLY_BRACES as openers |
| Every PHP range off by a few lines | single-character tokens (`{`, `}`, `;`) carry no line number at all, only array tokens do | track a running line, resync it from each array token and advance it by the newlines in that token's text |
| A PHP `use function` import appears as a function | `function` is semi-reserved: it also follows `use`, `->` and `::` | skip a keyword whose previous significant token is one of those. `static::class` is the same bug with T_CLASS |
| An arrow function shows a wrong body | `fn($x) => $x + 1` has no closing delimiter, so any end line is a guess | emit no range; the page labels it approximate, which is the honest answer |
| PHP enum bodies missing | the extractor is only as new as the `php` binary; 7.4 lexes `enum` as a plain identifier | run it with PHP 8.1+, or accept approximate for enums |

---

## 12. Adapting to a different stack

Only **Step 4** (exact ranges) is language-specific. Everything else is stack-agnostic.

| Language | Range source |
|---|---|
| JS / TS / JSX | `@babel/parser` - as shipped |
| Python | stdlib `ast`, `end_lineno` - as shipped |
| Go | `go/ast` + `token.FileSet`, `fset.Position(decl.End())` |
| C# | Roslyn, `GetLocation().GetLineSpan()` |
| Java | JavaParser, `getRange()` |
| Ruby | `Prism` (3.3+) or `parser` gem |
| Rust | `syn` with the `span-locations` feature |
| PHP | core `token_get_all` - as shipped. `nikic/php-parser` gives real AST nodes and `getEndLine()`, but it is a composer install into the target repo, and this pipeline's whole premise is that it adds nothing to the repo it analyses |

The shape of the output never changes: `{relPath: [[name, startLine, endLine], ...]}`.
Write the equivalent of `py-ranges.py` for your language, emit that JSON on stdout, and
`build-codedata.cjs` consumes it unchanged.

Non-code adjustments by stack:

- **Monolith / single database** - drop the sequence diagrams for the HTTP hop; keep them
  for background jobs, queues and webhooks, which have the same "no call edge" problem.
- **Containers / Kubernetes** - the deployment topology diagram gets more important, not
  less, and should show what is stateful.
- **Multiple repos** - graphify can merge several paths or clone URLs into one
  cross-repo graph; do that rather than producing disconnected per-repo artefacts.

---

## 13. Checklist

```
[ ] toolkit present at $T (nothing is copied into the repo)
[ ] gitignore graphify-out/, coverage/, docs/.analysis-cache/ BEFORE running anything
[ ] git status clean; no AD-state files hiding recoverable work
[ ] test suite runs; record the real number
[ ] /graphify . --directed          (in Claude Code, from the repo root)
[ ] run a cross-boundary path query; record the gap it reveals
[ ] run.cjs . "Project Name"
      -> kinds histogram mostly fn/module
      -> matched vs unmatched recorded; unmatched labelled "approximate"
[ ] pick-spot.cjs docs/symbol-index.html, then verify.cjs with the pair it names
      -> verify prints ALL GOOD and the symbol's last line is that symbol's real end
[ ] architecture doc: all 16 sections, absences stated in one line each and listed at the end
[ ] diagrams: 1 call graph, business process, only the sequences that cross a boundary,
      only real state machines; every drawn edge checked against graphdata.json
[ ] assessment: every number sourced from a file; risk register includes the High items
[ ] assessment: every absence the architecture doc listed is rated, not restated
[ ] assessment: closing section on what the repo cannot tell you
[ ] standalone.cjs for every published artefact
[ ] README + CLAUDE.md corrected against what you just verified
[ ] commit docs/
```

---

## 14. Prompts that produce this

Paste these into Claude Code from the target repo root, in order.

**House style applies to all four: no em dashes**, neither the character nor the HTML
entity form. A spaced hyphen, comma, colon or parentheses instead.

**Architecture document**

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
> No em dashes anywhere in the prose, labels or captions.

**Symbol index**

> Build a three-pane symbol index from graphify-out/graph.json: communities and files on
> the left, a filterable sortable symbol table in the middle, and callers/callees plus the
> actual source on the right. Get exact function end lines from a real parser - babel for
> JS, python ast for .py - never by heuristic. Any symbol without an exact range must be
> labelled "approximate" in the UI. Escape `</` inside the embedded JSON and verify both
> blocks re-parse before publishing. No em dashes in any page copy you write.

**Technical assessment**

> Produce a technical assessment of this application for the team that owns and operates
> it. Read the architecture document first: it describes how the system is designed, and
> this document judges how well that design holds up. Do not restate its infrastructure,
> data model or security sections - reference them and assess them.
> Read the dependency manifest (package.json, pyproject.toml, go.mod, composer.json or
> whatever this repo uses), the infrastructure templates, the deploy script, any security
> docs, and run the repo's own test suite - every number must come from a file you read
> or a command you ran, not an estimate.
> Cover: what the system is in two lines, the core architectural bet and what it costs,
> security posture with open findings stated, quality evidence with its scope limits,
> operations, and a severity-rated risk register including key-person risk.
> Every absence the architecture document listed is an input to the risk register. Rate
> each one rather than repeating it.
> End with what the repo cannot tell you, and what someone would have to ask a maintainer.
> Be blunt about weaknesses; a problem named early is cheaper than one found late.
> Write it as a single self-contained HTML file at **docs/technical-assessment.html**,
> replacing that file if it exists. Do not write to any other path. If this repo still has
> a docs/due-diligence.html, that is the old name for this same artefact: delete it rather
> than updating it.
> No em dashes anywhere.

**README truth pass**

> Audit README.md and CLAUDE.md against what the repo actually contains. For every factual
> claim - counts of services, tables, endpoints, routes, commands - verify it against
> source and correct the drift. Tell me each thing that was wrong. Do not add anything you
> have not verified. Write corrections without em dashes.

The last one is the highest-value-per-minute of the four. On RefCoach it found the Lambda
count understated by ten, the table count by three, a documented endpoint that does not
exist, an email provider that had been replaced, and a flat statement that no test suite
existed - beside 275 passing tests.
