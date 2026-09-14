# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A repo-agnostic documentation pipeline. It turns a graphify knowledge graph of any
repository into a symbol index with exact source ranges, and guides a session through
producing an architecture document, a technical assessment and a README truth pass.

`README.md` is the overview. `SESSION-RUNBOOK.md` is the operating order for running the
pipeline against a target repository. `ANALYSIS-PLAYBOOK.md` is the reference that explains
why each step is the way it is and catalogues every trap encountered.

## This repo is the source of truth

The toolkit is installed per machine at `~/.claude/analysis-tools/`, and every analysed
repository's README points at that path. **Edit here, then `npm run install-local`.** Never
edit the installed copy: two editable copies drifting apart is the failure this repo exists
to prevent. The scripts used to be vendored into each analysed repository and the copies
diverged, which is why that arrangement was deleted.

Consumers today: `D:\Apps\RefCoachApp\docs` and `D:\apps\claude-session-dashboard\docs`.
Both hold generated artefacts plus copies of the two markdown references. If you change the
runbook or the playbook, sync those copies or they go stale.

## Commands

```bash
npm run install-local                                     # repo -> ~/.claude/analysis-tools
node run.cjs <repo-root> "<Name>" [spotFile] [spotSymbol]  # generate a symbol index
```

There is no test suite and no build step. Verification is empirical: run the pipeline
against a real repository and check the gates in the runbook's Phase 2.

## Hard-won rules, none of which are optional

- **Never guess a function's end line.** Ranges come from a real parser: `@babel/parser`
  for JS/JSX/TS, the Python `ast` module via `end_lineno` for `.py`, PHP's own `token_get_all`
  for `.php`. Heuristics (next blank line, next symbol, brace counting) are wrong often
  enough to poison the document. A symbol with no exact range is labelled **approximate** in
  the UI; it is never given a guessed body.
- **`php-ranges.php` skips what it cannot close.** It is a lexer, not a parser, so a body's
  end is found by counting braces. An arrow function (`fn($x) => $x + 1`) has no closing
  delimiter, so it gets no row at all rather than a guessed one, and the same goes for any
  declaration whose braces never balance. Emitting no range is the correct outcome: the UI
  labels it approximate. Do not "improve" this by inferring where the expression ends.
- **graphify labels callables `foo()`.** Comparing that to a parser's `foo` never matches,
  so the name tiebreak in `build-codedata.cjs` silently never fires and matching falls back
  to "widest range wins" - which still returns a function body, just the wrong one. The
  trailing `()` is stripped before comparison. Do not remove that.
- **A literal `</` inside embedded JSON ends the script block**, even inside a string. The
  page renders blank with no console error. `inject.cjs` escapes it as `<\/`, written with
  `String.fromCharCode(92)` because a literal backslash does not survive being pasted
  through a shell heredoc and the failure is silent.
- **`.cjs`, not `.js`.** A target repository with `"type": "module"` in package.json breaks
  `require`. The extension makes the scripts work regardless of the target's module type.
- **Every output path derives from the root argument**, never from where the scripts sit.
  That is what lets one install serve every repository.
- **Never rewrite embedded source.** The symbol index carries the analysed repository's own
  code inside two JSON blocks. Style rules apply to the template, and the page is then
  regenerated.

## House style

**No em dashes** anywhere: not the character, not the HTML entity form. Use a spaced hyphen
for a break in a sentence, or recast with a comma, colon or parentheses. This applies to
this repository's own files and to everything the pipeline produces. The rule is repeated
inside each authoring prompt in the runbook and the playbook so it travels with the work,
and it is in the acceptance checklist.

## Publishing

`ANALYSIS-PLAYBOOK.md` quotes real findings from analysed repositories as worked examples,
including a live production security exposure. Do not publish this repository, or that file,
without a scrub pass. The `.cjs` tooling itself carries nothing sensitive.
