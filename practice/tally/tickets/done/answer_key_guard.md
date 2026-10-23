# Block access to the exercise answer keys

| Field | Value |
|---|---|
| Labels | `type::improvement`, `priority::medium`, `area::security` |
| Reporter | Opus (product owner) |
| Assignee | Developer (trainee) |
| Depends on | - |
| Related | - |

## Description

The answer keys for the review exercises (`tally-*-answers.md`) are written to the folder that holds the repository,
so they are never committed. `CLAUDE.md` tells Claude Code never to read them, but that rule only works while the
model remembers and applies it. A hook should enforce the rule, so that common accidental reads of a key are blocked.

## Analysis

Claude Code runs `PreToolUse` hooks before every matching tool call. A command hook receives the tool name and its
input as JSON on stdin; exit code 2 blocks the call and sends stderr back to the model, any other exit code lets the
call run.

A key can be reached in three ways:

- A file tool names it: `Read`, `Edit` or `NotebookEdit` with the key path, `Grep` or `Glob` with a path or glob
  that can match it (`../tally-*.md`, `../*.md`, `*answers*`).
- A search reaches the keys folder: `Grep` or `Glob` rooted at the folder above the repository (or higher), or a
  recursive shell search (`grep -r`, `rg`, `find`, `Get-ChildItem -Recurse`) of that folder.
- A shell command (`Bash` or `PowerShell`) names the key or such a glob (`cat ../tally-seeded-answers.md`,
  `Get-Content ..\tally-*`).

The keys folder is the parent of the main checkout. In a git worktree, `.git` is a file that points into the main
repository's `.git/worktrees/`, so the hook follows it to find the main checkout.

A hook can only inspect the text of a call. Names built at run time (variables, string concatenation, interpreter
scripts) cannot be recognised without running the command. The hook guards against mistakes, not deliberate
evasion, and the `CLAUDE.md` rule stays in place.

Writing a key is not blocked: the seeding prompts in `practice/tally/PRACTICE.md` create the keys with the `Write`
tool, which the hook does not match.

## Plan

Branch: `feat/answer_key_guard` from `develop`.

Files:

- `.claude/hooks/guard-answer-keys.mjs` (new): a Node script with no dependencies. It reads the hook payload, finds
  the keys folder, and checks the path fields of the file tools and the words of shell commands. Text-only words
  (`git commit -m` messages, `echo` arguments, heredoc bodies) are skipped. Unparsable input is allowed (exit 0).
  The header comment lists what is checked and the known limits.
- `.claude/settings.json` (new): a `PreToolUse` entry with the matcher
  `Read|Edit|NotebookEdit|Grep|Glob|Bash|PowerShell` and the command
  `node "$CLAUDE_PROJECT_DIR/.claude/hooks/guard-answer-keys.mjs"`.

Tests:

- `.claude/hooks/guard-answer-keys.test.mjs` (new, `node:test`): each case pipes a synthetic payload to the hook and
  checks the exit code. Paths are made up (`/guard-test/...`); no test touches the real folder above the repository.
  Blocked cases: key paths, key globs and searches of the keys folder for each tool, shell commands in Bash and
  PowerShell syntax, a worktree layout. Allowed cases: normal repository work (reading `README.md`, `Grep` in
  `practice/tally`, `npm test`, a `git commit -m` message that mentions answers) and unparsable input.
- Run with `node --test .claude/hooks/guard-answer-keys.test.mjs`.

Docs: a row in the contents table of the repository `README.md` (with the test command) and one sentence in
`CLAUDE.md` stating that the hook exists and the rule still applies.

## Merge request

Branch `feat/answer_key_guard` into `develop`. The merge request is opened on GitLab from this branch; its link is
added when it exists.

What changed:

- `.claude/hooks/guard-answer-keys.mjs` (new): a `PreToolUse` hook that exits with code 2 when a `Read`, `Edit`,
  `NotebookEdit`, `Grep` or `Glob` call, or a `Bash` or `PowerShell` command, names an answer key, uses a glob that
  could match one, or searches the folder that holds the keys. It finds the keys folder from a git worktree too,
  and allows input it cannot parse. The header comment lists the known limits.
- `.claude/settings.json` (new): registers the hook for those tools.
- `.claude/hooks/guard-answer-keys.test.mjs` (new): `node:test` cases with synthetic paths only.
- `README.md`: a contents-table row with the test command. `CLAUDE.md`: one sentence stating that the hook exists
  and the rule still applies.

How it was tested:

- `node --test .claude/hooks/guard-answer-keys.test.mjs`: 16 tests, 16 passed. They cover blocked file tool, glob,
  search, Bash and PowerShell cases, a worktree layout, normal repository work (reading `README.md`, `Grep` in
  `practice/tally`, `npm test`, a `git commit -m` message that mentions answers) and unparsable input.
- The app code is unchanged, so typecheck, unit/API tests and e2e are not affected.

Review round 1 (AI team lead): the hook now checks the first word of each shell segment and `VAR=value` prefixes,
nested `$(...)` substitutions, a quoted heredoc fed to a shell, option values glued to the option (`-Path:x`,
`-fx`), the PowerShell backtick escape, and every operand of `grep` / `rg` when the pattern comes from `-e`,
`--regexp`, `-f` or `--file`. Bash `ls` counts only `-R` as recursive, so `ls -ltr ..` is allowed. Each case has a
test that failed before the fix; the `echo` substitution test uses the quoted form. The branch name is
`feat/answer_key_guard`, and the README row and the Description no longer claim that every read is blocked.

## Review

Approved by the AI team lead after one round: `node --test .claude/hooks/guard-answer-keys.test.mjs` passes 16 of
16 tests, and `npm run typecheck` in `practice/tally` passes (the app code is unchanged, so unit/API tests and e2e
are not affected). Review comments addressed: every word of a shell segment is checked (command name and
`VAR=value` prefixes included), nested substitutions, quoted heredocs fed to a shell, glued option values, the
PowerShell backtick escape, `-e` / `--regexp` patterns of a recursive search, `ls -ltr ..` no longer blocked, the
branch named `feat/answer_key_guard`, and the README row and Description no longer overclaiming.

Released on 2026-10-23.
