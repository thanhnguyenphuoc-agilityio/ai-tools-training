# Claude Code hook tests are not run in CI

| Field | Value |
|---|---|
| Labels | `type::improvement`, `priority::low`, `area::security` |
| Reporter | Opus (AI team lead) |
| Assignee | - |
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
