# Analysis Tooling

A repo-agnostic documentation pipeline. Point it at any repository and it produces four
artefacts, two of them automatically and two with a Claude Code session doing the judgement
work.

| # | Artefact | Produced by | Effort |
| :- | :--- | :--- | :--- |
| 1 | `docs/symbol-index.html` | `run.cjs` | one command |
| 2 | `docs/architecture-diagrams.html` | Claude, guided | ~1 session |
| 3 | `docs/technical-assessment.html` | Claude, guided | ~1 session |
| 4 | README / CLAUDE.md truth pass | Claude, guided | ~20 min |

Everything is a single self-contained HTML file or a markdown file. No build step, no
server, no hosted viewer. Open it from disk and it works.

## Running it against a repository

Three commands, in this order. The middle one is a Claude Code command, not a shell
command, so the whole sequence belongs in a session started in the target repo:

```bash
cd /path/to/target-repo && claude                  # 1. start the session HERE, see runbook Phase 0
```
```
/graphify . --directed                             # 2. build the graph (--directed is required)
```
```bash
printf '\n# Generated analysis output\ngraphify-out/\ndocs/.analysis-cache/\n' >> .gitignore
git check-ignore -v graphify-out/graph.json        # must print a match
node ~/.claude/analysis-tools/run.cjs . "Project Name"
# in windows
node "$USERPROFILE/.claude/analysis-tools/run.cjs" . "Project Name"

# then pick a real file and symbol, and run the spot check
node ~/.claude/analysis-tools/pick-spot.cjs docs/symbol-index.html
node ~/.claude/analysis-tools/verify.cjs docs/symbol-index.html <file> <symbol>
```

`run.cjs` also takes the file and symbol as optional fifth and sixth arguments, both or
neither, but they have to match graphify's own labels exactly, so let `pick-spot.cjs`
name them rather than guessing from the filesystem. A run that prints `ALL GOOD` and
whose spot-checked symbol ends where that symbol really ends has produced a trustworthy
`docs/symbol-index.html`. That is artefact 1; artefacts 2 to 4 are the guided phases.

What "really ends" looks like depends on the language: a closing brace in JS, TS or PHP,
the last statement of the body in Python. Either way the test is the same, that the last
line belongs to the spot-checked symbol and not to whatever follows it.

The full operating order, with the gates that catch a bad run, is in
[`SESSION-RUNBOOK.md`](SESSION-RUNBOOK.md). The reference that explains why each step is
the way it is, plus every trap encountered building this, is in
[`ANALYSIS-PLAYBOOK.md`](ANALYSIS-PLAYBOOK.md).

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

```bash
cd ~/.claude/analysis-tools && npm install
```

## What is in here

| File | Role |
| :--- | :--- |
| `run.cjs` | The one-shot driver. Chains the four steps below and fails loudly. |
| `build-graphdata.cjs` | Compacts graphify's `graph.json` into an index-based form, roughly 3x smaller. |
| `build-codedata.cjs` | Exact source ranges: `@babel/parser` for JS/TS, plus the two extractors below. |
| `py-ranges.py` | The Python half of the above. Stdlib only, needs 3.8+ for `end_lineno`. |
| `php-ranges.php` | The PHP half. Core `token_get_all` only, no composer package needed. |
| `inject.cjs` | Fills the page template's two JSON blocks, escaping `</` so the script block survives. |
| `verify.cjs` | Re-parses both blocks and spot-checks a named symbol. Exits non-zero on failure. |
| `pick-spot.cjs` | Names a real file and symbol for that spot check, read back out of the built page. |
| `standalone.cjs` | Wraps a published-artifact body fragment into a real document for local use. |
| `symbol-index-template.html` | The three-pane symbol index page, with empty data blocks. |
| `doc-shell.html` | The shared stylesheet and skeleton for the two authored documents. |
| `bin/install.cjs` | Copies the toolkit into `~/.claude/analysis-tools`. |

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
