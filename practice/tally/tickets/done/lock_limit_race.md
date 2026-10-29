# Two simultaneous "keep group" requests can exceed the 10 kept groups limit

| Field | Value |
|---|---|
| ID | `TAL-45` |
| Labels | `type::bug`, `priority::low`, `area::data` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `lock_groups` |

## Description

Found in the daily review of 2026-10-28. `docs/business-rules.md` allows at most `MAX_LOCKED_GROUPS` (10) kept
groups per account. `POST /api/groups/:code/lock` counts the kept groups in one query and locks in a second one, so
two requests for two different groups sent while the account holds 9 both see 9 and both lock: the account ends with
11 kept groups, which are never purged. Every other limit or guard in the worker repeats its check inside the write
("The guard is repeated in the UPDATE so that two simultaneous ... cannot both win", `routes/members.ts`), and the
tests in `tests/api/lock-groups.test.ts` only send requests one after another, so they pass.

## Analysis

- `worker/routes/groups.ts`, lock route: `SELECT COUNT(*) ... WHERE owner_user_id = ? AND locked_at IS NOT NULL`,
  then `UPDATE groups SET locked_at = ? WHERE code = ? AND locked_at IS NULL`. The UPDATE has no count guard.
- Same shape: `DELETE /:code/lock` updates without `AND locked_at IS NOT NULL`, so two simultaneous unlocks both
  write a `group.unlock` audit row and both move `last_activity_at`.

## Plan

1. Fold the limit into the UPDATE:
   `UPDATE groups SET locked_at = ?1 WHERE code = ?2 AND locked_at IS NULL AND owner_user_id = ?3
 AND (SELECT COUNT(*) FROM groups WHERE owner_user_id = ?3 AND locked_at IS NOT NULL) < ?4`.
   When `meta.changes` is 0, read the group again: already locked gives `{ changed: false }`, otherwise
   `409 LOCK_LIMIT_REACHED` with `{ max }`. Keep the early count only if it keeps the error path simple.
2. Unlock: add `AND locked_at IS NOT NULL` and return `{ changed: false }` without auditing when no row changed.
3. Tests in `tests/api/lock-groups.test.ts`: with 9 kept groups, two `Promise.all` lock requests on two other groups
   give one success and one `LOCK_LIMIT_REACHED`, and the count stays 10; two simultaneous unlocks write one
   `group.unlock` row.
4. Update the `lock_groups` notes in `docs/design.md` if they describe the two-step check. Verify with
   `npm run typecheck`, `npm run lint`, `npm test`.

## Review

Reviewed by Opus (AI team lead).

- `POST /groups/:code/lock` repeats the `MAX_LOCKED_GROUPS` count inside the `UPDATE`. When no row changes, the
  route reads the group again: already locked answers `changed: false`, otherwise `409 LOCK_LIMIT_REACHED`. The
  early count stays for the common path.
- `DELETE /groups/:code/lock` updates only `WHERE locked_at IS NOT NULL` and writes no audit row when nothing
  changed.
- Tests LG-13 and LG-14 in `tests/api/lock-groups.test.ts` use `interleave` to commit a second request between the
  check and the write; both fail on the old route. `docs/design.md` no longer lists the race as a known limit.
- Checks: `npm run typecheck` and `npm run lint` pass, `npm test` 389 passed. No e2e run: the change is limited
  to the API and its responses are unchanged.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
