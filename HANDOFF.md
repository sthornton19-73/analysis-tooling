# Handoff: analysis-tooling

Written 2026-09-12. Start a Claude Code session in this directory and read this first.

## Goal

Own and improve the documentation pipeline that lives here. It was built incrementally
while analysing two real repositories, extracted into `~/.claude/analysis-tools` when it
proved repo-agnostic, and moved into this repository so it has history and one source of
truth. Everything works today; the value of a dedicated session is making it better rather
than rediscovering it.

## Current state

Working and verified. The last end-to-end run, from this repository against RefCoach:

```
gd OK - nodes 1202 edges 2047
cd OK - files 77 | ranges 618
   quickSaveEvent L500-L586 (87 lines)
   first: "function quickSaveEvent(evt) {"
   last : "}"
ALL GOOD
```

Two repositories are consumers today and both have a complete artefact set:

| Repository | Artefacts | Notes |
| :--- | :--- | :--- |
| `D:\Apps\RefCoachApp` | symbol index, architecture diagrams, DD pack, playbook, runbook, doc-shell | React 19 PWA + 26 Python Lambdas. 618 of 852 code nodes matched exactly. |
| `D:\apps\claude-session-dashboard` | the same set | Zero-dependency Node. 399 of 399 functions matched. Its `CLAUDE.md` forbids agent commits - honour that. |

Two more repositories have been scoped but not run:

- `D:\apps\ServerlessWP` - graph already built and directed. Mostly JS despite 10k PHP
  files, because graphify ignored the copied WordPress trees. 38 PHP nodes will be
  approximate; there is no PHP range extractor yet. Spot symbol:
  `porting/control-plane/lib/deploy.js finish`.
- `D:\apps\cloud-relationship-engine` - **existing graph is undirected and must be rebuilt
  with `/graphify . --directed`**. 1,438 Python nodes and 630 JS/JSX, so both extractors
  apply. No `.gitignore` rules yet. Spot symbol: `AWSTooling/registry.py role_arn_for`.

## Active files

Read in this order to come up to speed:

1. `CLAUDE.md` - the rules that are not optional, each one paid for by a real failure.
2. `SESSION-RUNBOOK.md` - the operating order, six phases with a gate on each.
3. `ANALYSIS-PLAYBOOK.md` - the reference and the trap catalogue.
4. `run.cjs` then `build-codedata.cjs` - the driver and the part that does the hard bit.

## Changes made getting here

- Extracted the toolkit from a single repository into a repo-agnostic form: every path
  derives from the root argument, scripts renamed `.cjs` so a target repo with
  `"type": "module"` cannot break them, and the parser resolved from the install rather
  than from the target.
- Deleted the vendored `docs/analysis-tools/` copies from both consumer repositories. Three
  editable copies with no source of truth was the drift problem this repo now fixes.
- Added `doc-shell.html` so the two authored documents stop re-deriving their stylesheet,
  and with it the page-width settings that took three passes to get right.
- Added `SESSION-RUNBOOK.md`, and moved the README truth pass ahead of the two prose
  artefacts. That ordering is load-bearing: both documents are built on what the README
  claims, and a stale claim propagates into two polished pages. It happened - a "15-second
  poll" in a README was actually 5 seconds, and it reached the architecture document before
  the truth pass caught it.
- Swept em dashes from every artefact and put the rule inside each authoring prompt.
- Cross-linked the artefact set so the architecture document is a single entry point.

## Failed attempts, do not repeat

- **Heuristic end-of-function detection.** Blank line, next symbol, brace counting. All
  wrong often enough to be worse than useless, because they return *a* function body.
- **`sed -i` and `node -e` for edits containing backslashes.** Escaping through the shell
  silently mangles them; the `</` escape in `inject.cjs` was neutered this way once and
  still passed `node --check`. Write a script to a file and run it.
- **Assuming a wide container plus a 66ch reading measure looks good.** It renders as a page
  using half its width. `doc-shell.html` has the settled values.
- **Declaring breakout CSS before the rules it overrides.** `.tblwrap{margin:22px 0}` resets
  a `margin-left` set earlier. Width rules go last in the stylesheet.

## Next steps

Roughly in value order. None is started.

1. **A PHP range extractor** alongside `py-ranges.py`, using `token_get_all`. Unblocks
   ServerlessWP and any WordPress or Laravel repository. Perhaps an hour.
2. **Make `run.cjs` own the `.gitignore` step.** It is currently a manual instruction in
   Phase 0 and it has already been got wrong once - the patterns were appended to a
   subdirectory's `.gitignore`, where they are relative to that directory and silently
   match nothing.
3. **Decide whether `symbol-index.html` should be committed.** It is 1.5 MB, embeds a second
   copy of the repository's source, and goes stale on the next push. Either commit it or
   ignore that one file and regenerate on demand; currently the runbook does not say.
4. **Fix the last-bucket off-by-one** in any bucketing helper that uses `a >= start && a < end`
   against a final boundary equal to the maximum value. Present in RefCoach's `ballInPlay.js`
   and worth a general note in the playbook.
5. **Consider a `--check` mode** that re-runs verification against an already-generated page,
   so staleness is detectable without a full rebuild.
6. **Scrub pass on `ANALYSIS-PLAYBOOK.md`** if this ever goes public. It quotes a live
   production security exposure verbatim as a risk-register example.

## Conventions

- No em dashes, anywhere. See `CLAUDE.md`.
- Do not commit in `claude-session-dashboard`; its `CLAUDE.md` forbids it.
- Verification is empirical. There is no test suite: run the pipeline against a real
  repository and check the runbook's gates.
