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
  files, because graphify ignored the copied WordPress trees. **No longer blocked:** the
  PHP extractor landed 2026-09-12, and all 21 of its PHP functions now carry exact ranges.
  The other 17 PHP nodes are file-level module nodes pointing at line 1 (`<?php`), which
  correctly get none. Spot symbol: `porting/control-plane/lib/deploy.js finish`.
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

### Session of 2026-09-12

- **Added `php-ranges.php`**, a PHP range extractor using core `token_get_all`, wired into
  `build-codedata.cjs` as section 3b and into `bin/install.cjs`. Core only, deliberately:
  `nikic/php-parser` would give real AST end lines but needs a composer install into the
  repo being analysed, and this pipeline adds nothing to its target. It is invoked as
  `php -n` so a php.ini referencing a missing extension cannot put a startup warning where
  JSON is expected, and it runs only when the repo actually contains PHP, so a JS-only repo
  gets no spurious "not found" line. `PHP=/path/to/php` overrides the binary.
- It is a lexer, not a parser, so it **emits no row for anything it cannot close exactly**:
  arrow functions (`fn($x) => $x + 1`, which have no closing delimiter) and any declaration
  whose braces never balance. That is the CLAUDE.md rule applied rather than broken.
- Verified three ways: a trap fixture of 16 asserted ranges covering interpolated strings,
  heredoc and nowdoc braces, abstract and interface methods, closures, anonymous classes and
  the arrow-function skip; ServerlessWP, where 21 of 21 PHP functions matched and every range
  ends on a closing brace; and a RefCoach regression that reproduced the baseline exactly,
  1202 nodes, 2047 edges, 618 exact ranges, `quickSaveEvent L500-L586`.
- **Added a consolidated quick start** to `SESSION-RUNBOOK.md` and the full three-command
  sequence to `README.md`. The commands were always there, spread across Phases 0 to 2, but
  there was nowhere to copy the whole run from, and the README showed `run.cjs` without
  mentioning that `/graphify` has to come first.
- **Swept 11 em dashes** out of `verify.cjs`, `build-codedata.cjs`, `build-graphdata.cjs`,
  `py-ranges.py` and `inject.cjs`. All pre-existing, all in comments or printed output. The
  markdown was already clean, which is why this went unnoticed: the rule was being applied
  to the prose and not to the scripts.

## Failed attempts, do not repeat

- **Heuristic end-of-function detection.** Blank line, next symbol, brace counting. All
  wrong often enough to be worse than useless, because they return *a* function body.
- **`sed -i` and `node -e` for edits containing backslashes.** Escaping through the shell
  silently mangles them; the `</` escape in `inject.cjs` was neutered this way once and
  still passed `node --check`. Write a script to a file and run it. **A quoted bash heredoc
  is not a safe channel either**, which cost four separate failures in the 2026-09-12
  session: `'\\'` in PHP arrived as `'\'` and the parse error surfaced four lines later;
  `printf '\\n...'` in a markdown code block arrived as real newlines; and `Foo\\bar` in
  a prose table arrived as `Foo` plus a literal backspace byte, which greps as `Fooar` and
  is invisible in an editor. Use the Write tool, or `chr(92)` / `String.fromCharCode(92)`.
- **Assuming a wide container plus a 66ch reading measure looks good.** It renders as a page
  using half its width. `doc-shell.html` has the settled values.
- **Declaring breakout CSS before the rules it overrides.** `.tblwrap{margin:22px 0}` resets
  a `margin-left` set earlier. Width rules go last in the stylesheet.

## Next steps

Roughly in value order. Item 1 is done; nothing below it is started.

1. ~~**A PHP range extractor.**~~ **Done 2026-09-12**, see "Changes made getting here".
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
  repository and check the runbook's gates. To verify without writing into another repo,
  call `build-graphdata.cjs` and `build-codedata.cjs` with an out-dir in a scratch path:
  both take `(repo-root, out-dir)`, so only `run.cjs` writes to `<repo>/docs`.
- A `php` binary is needed only for repos containing PHP. This machine has PHP 7.4 at
  `C:/laragon/bin/php/php-7.4.20/php`, which is on `PATH`. Note 7.4 lexes `enum` as a plain
  identifier, so enum bodies need 8.1+.
