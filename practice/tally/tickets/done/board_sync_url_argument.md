# board:sync ignores the project URL when --repo is not given

| Field | Value |
|---|---|
| ID | `TAL-43` |
| Labels | `type::bug`, `priority::low`, `area::data` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `board_sync` |

## Description

The usage documented in `scripts/sync-board.mjs`, `tickets/README.md` and `/sync-board` is
`npm run board:sync -- <project url> [--repo <owner>/<name>] [--apply]`. Without `--repo`, the project URL on the
command line is dropped and the script stops with "Pass the project URL ... or set TALLY_BOARD_URL", so the draft-item
mode cannot be used from the command line. The unit tests cover only `board-sync/tickets.mjs`, not the argument
parsing, so they pass.

## Analysis

- Commit `5479eee`, `practice/tally/scripts/sync-board.mjs:19`:
  `const url = args.find((a, i) => !a.startsWith('--') && i !== repoFlag + 1) ?? process.env.TALLY_BOARD_URL;`
- When `--repo` is absent, `repoFlag` is `-1`, so `repoFlag + 1` is `0` and the argument at index 0 (the URL in the
  documented order) is skipped.
- Reproduce in `practice/tally` without `GITHUB_TOKEN` and `TALLY_BOARD_URL`:
  - `node scripts/sync-board.mjs https://github.com/users/alex/projects/1` fails with "Pass the project URL".
  - `... projects/1 --repo a/b` and `--apply https://github.com/users/alex/projects/1` reach the next check
    ("Set GITHUB_TOKEN"), so only the plain form is broken.
- It goes unnoticed when `TALLY_BOARD_URL` is set, because the fallback then supplies the URL.

## Plan

1. Move argument parsing into a pure function in `scripts/board-sync/tickets.mjs` (or a new `args.mjs`), for example
   `parseArgs(argv, env) -> { url, repo, apply }`, and declare it in `tickets.d.mts`.
2. Skip the `--repo` value only when the flag is present:
   `const repoValueIndex = repoFlag >= 0 ? repoFlag + 1 : -1;` and
   `args.find((a, i) => !a.startsWith('--') && i !== repoValueIndex)`. Also reject `--repo` with no value.
3. Use the function in `sync-board.mjs`; keep the error messages.
4. Tests in `tests/unit/board-sync.test.ts` that fail before the fix: `[url]` gives that URL; plus passing cases for
   `[url, '--repo', 'a/b']`, `['--repo', 'a/b', url]`, `['--apply', url]`, the `TALLY_BOARD_URL` /
   `TALLY_BOARD_REPO` fallback, and `['--repo']` with no value as an error.
5. Verify: `npm run typecheck`, `npm run lint`, `npm test`, then
   `node scripts/sync-board.mjs https://github.com/users/alex/projects/1` without a token reports the missing token,
   not the missing URL.

## Review

Reviewed by Opus (AI team lead).

- `parseArgs(argv, env)` in `scripts/board-sync/tickets.mjs` now owns the command line; `sync-board.mjs` calls it
  and keeps its error messages. The `--repo` value is skipped only when the flag is present, and `--repo` with no
  value (or followed by another flag) is rejected.
- Four new unit tests in `tests/unit/board-sync.test.ts`; the URL-only case fails on the old expression.
- Checks: `npm run lint` passes, `npm test` 303 passed. `npm run typecheck` reports only the existing missing
  `jsqr`/`pngjs` types in `e2e/settle-up.spec.ts`. Without a token, the URL-only command now stops at the missing
  token instead of the missing URL. No e2e run: the change is limited to a Node script.

Confirmed by the human on the Cloudflare deploy of `develop`. Released in release/2026-10-28.
