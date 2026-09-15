# Analysis Tooling

A repo-agnostic documentation pipeline. Point it at any repository and it produces four
artefacts: one generated deterministically from a parser, three authored by a Claude Code
session doing the judgement work against a runbook of prompts and gates.

| # | Artefact | Produced by | Effort |
| :- | :--- | :--- | :--- |
| 1 | `docs/symbol-index.html` | `run.cjs` | one command |
| 2 | `docs/architecture-diagrams.html` | Claude, guided | ~1 session |
| 3 | `docs/technical-assessment.html` | Claude, guided | ~1 session |
| 4 | README / CLAUDE.md truth pass | Claude, guided | ~20 min |

Everything is a single self-contained HTML file or a markdown file. No build step, no
server, no hosted viewer. Open it from disk and it works.

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

## Running it against a repository

Lines starting with `/` are typed inside a Claude Code session. Everything else is a shell.

### A repo that has never been analysed

**1. In a shell.** Ignore the generated output before any of it exists:

```powershell
cd C:\repos\target-repo
Add-Content .gitignore "`n# Generated analysis output`ngraphify-out/`ndocs/.analysis-cache/"
Add-Content .graphifyignore "docs/*.html"
git check-ignore -v graphify-out/graph.json    # must print a match, not nothing
```

**2. Start the session from that same directory.** The one step that cannot be fixed
afterwards: a session is filed under the directory it started in, and that folder is never
renamed.

```powershell
claude
```

**3. Inside the session**, build the graph. This is a Claude Code command, not a shell one:

```
/graphify . --directed                     # minutes, costs tokens. --directed is required
```

**4. Back in a shell**, drive the rest. The session is occupying its terminal, so either use
a second terminal, or run these from inside the session by prefixing each with `!`:

```powershell
node $T/pipeline.cjs . "Project Name" --from 0 --dry-run
node $T/pipeline.cjs . "Project Name" --from 0
```

`.graphifyignore` does nothing on a fresh repo, because `docs/` does not exist yet. Add it
anyway: it is what stops the *second* build indexing the first build's output and feeding
this pipeline its own prose back as graph nodes.

### A repo that already has the set

**Start with the gates.** A repo analysed under an older spec looks finished either way, so
do not judge it by reading it. The failures name the era and the fix, and the runbook's
**Triage first** table maps each one:

```powershell
node $T/gates.cjs .
```

**If only the look changed, do not re-run the phases.** A `doc-shell.html` change reaches
every document mechanically, in seconds, instead of an hour of agent time per repo producing
identical prose in different colours:

```powershell
node $T/restyle.cjs .               # the two authored documents
node $T/run.cjs . "Project Name"    # the symbol index, from the template
node $T/gates.cjs .                 # a type change moves widths
```

For a content refresh, the difference is entirely at the front. **Refresh the graph before
the authoring phases, never after**, or both authored documents are written from a graph you
then replace, and both have to be written again.

```powershell
node $T/gates.cjs .  # read the Phase 0 and 1 rows first
```
```
/graphify . --update                       # code has changed
/graphify . --force                        # clearing stale nodes, or recovering from a bad run
```
```powershell
Get-Item graphify-out/graph.json | Select-Object LastWriteTime   # MUST have moved
git rm docs/due-diligence.html             # only if a renamed orphan is still there
node $T/pipeline.cjs . "Project Name" --from 2 --resume
```

That timestamp check is not ceremony. `run.cjs` compacts the graph rather than building it,
so pointed at an unchanged or half-written `graph.json` every downstream number is identical
*by construction*, and `verify.cjs` still prints `ALL GOOD` because it only checks that the
embedded JSON re-parses. Identical counts after a rebuild are the symptom, not the reassurance.

### Either way

`pipeline.cjs` runs the shell phases directly, spawns a separate `claude -p` session per
guided phase, and runs `gates.cjs` between each, stopping rather than feeding a bad artefact
to the phase that reads it. A process per phase is the point: a session reuses what it has
already read, so one that has just executed a phase tends to re-execute its remembered
version of the next one, which fails as a *plausible success* with the correct shape and the
wrong spec.

Phases 0 and 1 are asserted rather than performed, because the graph build is a slash
command needing a model.

**Phase 7 is separate and opt-in**, and refuses to run without `--allow-share`. It writes
`*.share.html` copies of the two authored documents for sending outside the team: the symbol
index cannot go, because it embeds the repository's entire source. Those copies carry **zero
internal links**, not merely working ones. They are pasted into Confluence or a wiki as
standalone pages, where a relative href resolves against a base that no longer exists, so
the nav strip and footer links come out whole rather than being retargeted. It is also the
only output that leaves the building, so the phase leads with reading both documents in full
before it touches the mechanics.

To drive a phase by hand instead, or to see what each gate means, use
[`SESSION-RUNBOOK.md`](SESSION-RUNBOOK.md).

**A green run means not-obviously-broken, never good.** The gates decide shape. Whether the
risk register contains a finding the owner would rather not publish, whether every number
traces to a command that was run, whether each diagram earns its place: none of that is
assertable, and it is what decides whether the set is worth anything. Read the documents.

The reference that explains why each step is the way it is, plus every trap encountered
building this, is in [`ANALYSIS-PLAYBOOK.md`](ANALYSIS-PLAYBOOK.md).

## This repo versus the installed copy

The toolkit is installed once per machine at `~/.claude/analysis-tools/`, and every other
repository's documentation points at that path. **This repo is the source of truth; that
directory is a working copy.** Develop here, then:

```bash
npm run install-local      # copies the toolkit files into ~/.claude/analysis-tools
```

Never edit the installed copy directly. Two editable copies drifting apart is the exact
failure this repo exists to prevent - the scripts were previously vendored into every
analysed repository and the copies diverged.

The parser is installed at the destination rather than copied, because it is a
platform-specific dependency:

```powershell
cd $T; npm install
```

## What is in here

| File | Role |
| :--- | :--- |
| `pipeline.cjs` | Drives the whole runbook: shell phases directly, guided phases as separate `claude -p` sessions, gates between each. |
| `run.cjs` | The one-shot driver for artefact 1. Chains the four steps below and fails loudly. |
| `build-graphdata.cjs` | Compacts graphify's `graph.json` into an index-based form, roughly 3x smaller. |
| `build-codedata.cjs` | Exact source ranges: `@babel/parser` for JS/TS, plus the two extractors below. |
| `py-ranges.py` | The Python half of the above. Stdlib only, needs 3.8+ for `end_lineno`. |
| `php-ranges.php` | The PHP half. Core `token_get_all` only, no composer package needed. |
| `inject.cjs` | Fills the page template's two JSON blocks, escaping `</` so the script block survives. |
| `verify.cjs` | Re-parses both blocks and spot-checks a named symbol. Exits non-zero on failure. |
| `pick-spot.cjs` | Names a real file and symbol for that spot check, read back out of the built page. |
| `gates.cjs` | Every machine-checkable gate in the runbook, in one runnable place. Exits non-zero on failure. |
| `restyle.cjs` | Pushes the current `doc-shell.html` palette and type onto already-generated documents, without re-running a phase. |
| `modules.cjs` | Module boundaries for the architecture document: adaptive path-prefix grouping, file counts, cross-module edges, two-way pairs. |
| `standalone.cjs` | Wraps a published-artifact body fragment into a real document for local use. |
| `symbol-index-template.html` | The three-pane symbol index page, with empty data blocks. |
| `doc-shell.html` | The shared stylesheet and skeleton for the two authored documents. |
| `bin/install.cjs` | Copies the toolkit into `$T`. |

## Requirements

- Node 18+
- `graphify` (a Claude Code skill, invoked as `/graphify` inside a session)
- Python 3.8+ if the target repository contains Python
- A `php` binary if it contains PHP. Any 7.0+ will do; 8.1+ is needed for enum bodies.
  Set `PHP=/path/to/php` if it is not on `PATH`.
- `@babel/parser`, which this package declares

A language with no extractor is not a failure: its symbols simply carry no range and the
page labels them approximate. The repo still gets all four artefacts.

## House style

**No em dashes**, neither the character nor the HTML entity form, in anything this pipeline
produces or in this repository's own documentation. A spaced hyphen, comma, colon or
parentheses instead. The rule is stated in the runbook, repeated inside each authoring
prompt so it travels with the work, and checked in the acceptance list.

The one exception is the symbol index, which embeds the analysed repository's own source
code. That source is never rewritten to satisfy a style rule - a style sweep runs on the
template and the page is regenerated.

## Before making this public

`ANALYSIS-PLAYBOOK.md` uses real findings from analysed repositories as worked examples,
including a live production security exposure quoted verbatim as a risk-register sample.
That content is the reason the honesty rule lands, and it cannot be published as-is. The
`.cjs` tooling is publishable today; the playbook needs a scrub pass first.
