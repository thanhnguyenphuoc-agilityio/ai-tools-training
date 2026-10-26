# Oxlint rule tests time out in CI because npx downloads oxlint

| Field | Value |
|---|---|
| ID | `TAL-36` |
| Labels | `type::bug`, `priority::high`, `area::ui` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `lint_conventions` |

## Description

The GitHub Actions run for `develop` at `48c4fcc` fails in `npm test`: the first test of
`tests/unit/lintRules.test.ts` ("reports literal text in JSX children") times out after 5000 ms. The `e2e` job is
skipped as a result. The test passes on a machine that has already run it once, so it looks fine locally.

## Analysis

- Introduced in `7b3a1c5` (`test(lint): add tests for oxlint and stylelint conventions`), merged with
  `feat/lint_conventions` (`f46170a`).
- `tests/unit/lintRules.test.ts:39` runs `spawnSync('npx', ['oxlint', filename], { cwd: tmpDir, shell: true })`.
  `tmpDir` is under `os.tmpdir()`, outside `practice/tally`, so `npx` does not find the installed
  `node_modules/.bin/oxlint` and downloads `oxlint@^1.89.0` from the npm registry into `~/.npm/_npx`.
- On a fresh runner (empty `~/.npm/_npx`) the first call takes about 7.5 to 9 s, which is more than the Vitest default
  `testTimeout` of 5 s. Later calls reuse the cache, so only the first test fails.
- Reproduce: `mv ~/.npm/_npx ~/.npm/_npx.bak && npx vitest run tests/unit/lintRules.test.ts` gives
  `1 failed | 9 passed`, "Test timed out in 5000ms".
- Side effects: the tests need network access, and they can run a newer oxlint than the one locked in
  `package-lock.json`, so they may not test the linter that `npm run lint` uses.

## Plan

1. In `tests/unit/lintRules.test.ts`, resolve the installed binary once:
   `const oxlintBin = path.resolve(__dirname, '../../node_modules/oxlint/bin/oxlint');`
2. Run it with the current Node and no shell: `spawnSync(process.execPath, [oxlintBin, filename], { cwd: tmpDir,
   encoding: 'utf8', timeout: 30000 })`. This works the same on Windows and Linux and needs no network.
3. Do not raise the test timeout instead: it hides the download and the version drift.
4. Failing-first check: with `~/.npm/_npx` moved away, the current test fails (timeout); after the change it passes
   and no `~/.npm/_npx` folder is created.
5. Verify: `npm run typecheck`, `npm run lint`, `npm test` in `practice/tally`; then the CI run on the merge request
   is green, including the `e2e` job.

## Merge request

Branch `fix/lint_rules_test_npx_timeout` into `develop`.

What changed:

- `practice/tally/tests/unit/lintRules.test.ts`: resolve the locally installed `oxlint` CLI script path from `node_modules/oxlint/bin/oxlint` and execute it directly via `process.execPath` without shell or network, preventing `npx` fallback downloads and timeout failures in fresh runner environments.

How it was tested:

- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors.
- `npm test`: 16 test files passed, 231 passed (unit tests for Oxlint plugin now execute in <2 s).


## Review

Reviewed by Opus (AI team lead) with `review-checklist`.

- The test now runs `node_modules/oxlint/bin/oxlint` (the `bin` entry of the locked `oxlint` package) with
  `process.execPath` and no shell, so it needs no network and tests the same oxlint version as `npm run lint`.
- No findings. `npm run typecheck`, `npm run lint` and `npm test` (231 tests) pass; the 10 rule tests take about 2 s.

Released on 2026-10-23.
