# Claude Code hook tests are not run in CI

| Field | Value |
|---|---|
| ID | `TAL-35` |
| Labels | `type::improvement`, `priority::low`, `area::security` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `answer_key_guard`, `claude_code_hooks` |

## Description

The hooks added on 22 October (`guard-answer-keys`, `format-on-edit`, `notify-on-finish`) come with 28
`node --test` tests in `.claude/hooks/*.test.mjs`. CI never runs them, so a change that breaks the answer key guard
can be merged with a green pipeline.

## Analysis

- Commits `be6faff`, `4c6f094` add the tests; the root `README.md` documents
  `node --test .claude/hooks/*.test.mjs`.
- `.github/workflows/ci.yml:29-32` runs only `typecheck`, `lint` and `npm test` inside `practice/tally`, and Vitest
  includes only `tests/**/*.test.ts`.
- All 28 tests pass today (`node --test .claude/hooks/*.test.mjs`).

## Plan

1. Add a step to the `test` job in `.github/workflows/ci.yml`, after `npm test`:
   `- run: node --test ../../.claude/hooks/*.test.mjs` (the job's working directory is `practice/tally`, where
   `npm ci` has installed Prettier for the format hook test).
2. Optionally add `"test:hooks": "node --test ../../.claude/hooks/*.test.mjs"` to `package.json` so local runs and
   CI use one command, and mention it in CLAUDE.md "Commands".
3. Failing-first check: temporarily break one assertion in a hook test and confirm the CI step fails.
4. Verify: the CI run on the merge request shows the new step with 28 passing tests.

## Merge request

Branch `feat/hook_tests_in_ci` into `develop`. The merge request is opened on GitLab from this branch; its link is
added when it exists.

What changed:

- `practice/tally/package.json`: added `"test:hooks": "node --test ../../.claude/hooks/*.test.mjs"` script.
- `.github/workflows/ci.yml`: added `npm run test:hooks` step in the `test` job after `npm test`.
- `CLAUDE.md`: documented `npm run test:hooks` in "Commands (run inside practice/tally)".
- `README.md`: documented `npm run test:hooks` in root README hooks table row.

How it was tested:

- Failing-first check: broke assertion in `.claude/hooks/format-on-edit.test.mjs`, verified `npm run test:hooks` failed with exit code 1, then reverted.
- `npm run typecheck`: clean.
- `npm run lint`: clean.
- `npm test`: 16 test files, 231 passed.
- `npm run test:hooks`: 28 tests, 28 passed.

## Review

Reviewed by Opus (AI team lead) with `review-checklist`.

- `npm run test:hooks` runs `node --test ../../.claude/hooks/*.test.mjs`; on Windows `cmd` does not expand the glob,
  and Node 22 (the CI version) expands it itself, so one command works on both. The CI `test` job runs it after
  `npm test`, where `npm ci` has installed Prettier for the format hook test.
- Failing-first check done locally: a broken assertion made the script exit 1 (1 failed, 27 passed).
- No findings. After a rebase on `develop`: `npm run test:hooks` 28 passed; typecheck, lint and 231 tests pass.

Released on 2026-10-23.
