# Delete inactive groups

| Field | Value |
|---|---|
| ID | `TAL-12` |
| Labels | `type::feature`, `priority::low`, `area::data` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

Groups are rarely opened after everyone has settled, but they keep members' bank details on the server. A group
should be deleted when nobody has used it for about 10 days.

## Analysis

`groups.last_activity_at` already exists and is updated by every change and, today, by a member viewing the group
(`docs/business-rules.md`, open question for this ticket). "Used" and "about 10 days" need exact meanings, and
deletion is irreversible, so people need to see it coming. Open balances are a risk: a group can be deleted while
someone still owes money.

## Clarifying questions

1. Does viewing the group count as use, or only changes?
2. What exactly is "about 10 days", and when does the deletion run?
3. Is a group with open balances deleted too?
4. Do members see when the group will be deleted?
5. What is deleted, and what does a link to a deleted group show?
6. What happens to the group in the "recent groups" list of a device?

## Answers

From the product owner (human):

1. Only changes: expenses, transfers, members, settings. Opening the group to look at it does not keep it, for
   members and guests alike. This closes the open question in `docs/business-rules.md`.
2. A group is deleted when its last change is more than 10 days old. The check runs once a day at 02:00 Vietnam
   time, so a group goes 10 to 11 days after its last change.
3. Yes. Privacy comes first; the date is shown so that people can settle or make a change in time.
4. Yes. The group page shows the deletion date; during the last 3 days it is highlighted.
5. Everything of the group: members, bank details, expenses, transfers and its audit log. A link to it shows the
   usual "group not found" message.
6. When a device opens a group that no longer exists, the group is removed from that device's list.

## Clarifying questions (round 2, from the zero-questions test)

1. Today `last_activity_at` also moves when a member views a group. Would the first run delete groups that people
   kept alive only by viewing, without any warning?
2. Which actions exactly are changes? Opening a recovery link, claiming a name, saving settings with no
   difference, linking and locking are unclear.
3. What exactly is shown as the deletion date (date or time, which time zone), and when do "the last 3 days"
   start?
4. Where is the date shown, and with which wording?
5. Who deletes expired sign-in sessions?

## Answers (round 2)

From the product owner (human), with the details agreed with the developer:

1. No group may disappear by surprise. The migration that ships this rule sets `last_activity_at` of every existing
   group to the time of the migration, so every group gets its full 10 days after the release.
2. Changes: adding or deleting an expense, recording or confirming a transfer, adding, editing, claiming or removing
   a member, saving group settings that differ from the current ones, and (later tickets) linking and locking. Not
   changes: viewing (anyone), opening a recovery link, signing in. They stay in the audit log where they are today,
   but only changes move `last_activity_at`.
3. The group DTO gains `expiresAt` = last change plus exactly 10 days. The page shows the date only, in the
   viewer's time zone and language: "Deleted if nothing changes by {date}". The highlight starts 72 hours before
   `expiresAt`. The actual deletion happens at the first daily run after `expiresAt`.
4. One line in the group header, under the summary row, muted; highlighted with the warning colors and the extra
   sentence "Add an expense or a transfer to keep it." during the last 72 hours.
5. `google_sign_in`. This ticket only provides the scheduled handler that later jobs join.

Boundary: a group whose last change is exactly 10 days before the run is kept; one minute more and it is deleted.

## Answers (round 3)

From the product owner (human), after a second zero-questions test:

1. Saving group settings that are identical to the current ones changes nothing: no audit entry and no activity.
2. Every other audited action keeps its audit entry; `audit()` and the activity update become two separate steps,
   and `docs/business-rules.md` stops saying that every audited action counts as activity.
3. PG-9 needs a test helper that applies the migrations up to `0002`, inserts groups, then applies `0003`.

## Answers (round 4)

From the product owner (human), after the review of the ticket pack against the current `develop`:

1. "Under the summary row" means directly below the group summary bar (`ui_redesign`), above the owner key banner
   and the tabs, on every width.

## Acceptance criteria

- Given a group whose last change is more than 10 days before the daily run, when the run happens, then the group
  and all its data are deleted.
- Given a group with a change less than 10 days before the run, then it is kept.
- Given a member or a guest who only opens a group, then its last change date does not move.
- Given any group, when its page is open, then it shows the deletion date (last change plus 10 days); within the
  last 72 hours the date is highlighted.
- Given a deleted group, when its link or recovery link is opened, then "group not found" is shown and the group is
  removed from the recent groups of that device.
- The rule (10 days, changes only) is in one place in the code and in `docs/business-rules.md`; the open question
  on viewing is closed there and in `docs/design.md`.
- Given existing groups, when the migration of this ticket runs, then each of them has 10 days from that moment.
- Given a recovery link opened or a sign-in, then the last change date does not move.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| PG-1 | Purge with a fake `now`: exactly 10 days kept, 10 days and 1 minute deleted, 9 days 23 hours kept | API |
| PG-2 | Child rows (members, expenses, shares, transfers, audit) gone after the purge | API |
| PG-3 | Viewing as member and as guest does not change `last_activity_at` | API |
| PG-4 | Each change in answer 2 (round 2) moves `last_activity_at`; recovery link, sign-in and unchanged settings do not | API |
| PG-9 | Migration gives existing groups 10 days from the migration time | API |
| PG-5 | `expiresAt` in the group DTO equals last change plus 10 days | unit, API |
| PG-6 | Deletion date shown; highlighted from 72 hours before `expiresAt` (fake clock) | e2e |
| PG-7 | Deleted group: not found, removed from recent groups | e2e |
| PG-8 | The scheduled handler calls the purge (worker export) | unit |

## Plan

Branch `feat/purge_inactive_groups` off `develop`. Migration `0003_activity_reset.sql`: 0003 is the next free number on `develop` (planned as `0003` in `docs/design.md`). Accounts (`google_sign_in`, built in parallel) take `0004`, `lock_groups` `0005`, `receipt_photos` `0006`. This branch updates `docs/design.md` with those numbers.

### Rules: `shared/rules.ts` (new)

- Constants: `INACTIVE_DAYS = 10`, `INACTIVE_MS = INACTIVE_DAYS * 24 * 60 * 60 * 1000`, `EXPIRY_WARNING_HOURS = 72`.
- `expiresAt(lastActivityAt: string): string`: ISO string, `lastActivityAt` plus exactly 10 days.
- `inactiveBefore(now: Date): string`: ISO cutoff, `now` minus 10 days. A group is deleted when `last_activity_at < cutoff` (strictly less, so exactly 10 days is kept).
- `isExpiringSoon(expiresAt: string, now: Date): boolean`: true when `now >= expiresAt - 72h`.

### Migration `migrations/0003_activity_reset.sql`

- Statement: `UPDATE groups SET last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`
- Format matches `new Date().toISOString()`, keeping string comparison valid.
- Keep `;` out of comments so migration runners splitting on `;` do not break.

### Purge: `worker/cleanup.ts` (new)

- `purgeInactiveGroups(db: D1Database, now: Date): Promise<number>`: runs `DELETE FROM groups WHERE last_activity_at < ? RETURNING code` with `inactiveBefore(now)` and returns the count of deleted groups. Child rows cascade automatically via foreign keys declared in `0001_init.sql`.
- `runDailyJobs(env: Env, now: Date): Promise<{ groups: number }>`: calls `purgeInactiveGroups` and logs deleted count with `console.log`. Future daily jobs join here.
- `worker/index.ts`: export default gains `scheduled: (controller, env, ctx) => runDailyJobs(env, new Date(controller.scheduledTime))`, satisfying `ExportedHandler<Env>`.
- `wrangler.jsonc`: add `"triggers": { "crons": ["0 19 * * *"] }` (02:00 Vietnam time / 19:00 UTC).

### Activity: only changes (`worker/groupData.ts`)

- `audit()` only inserts `audit_log` row; remove the `UPDATE groups` from its batch.
- Remove obsolete `touch()` if unused.
- New `recordChange(db, code, me, action, target, details?)`: runs single `db.batch` with audit insert and `UPDATE groups SET last_activity_at = ?`.
- `worker/routes/expenses.ts`: use `recordChange` for `expense.add` and `expense.delete`.
- `worker/routes/transfers.ts`: use `recordChange` for `transfer.add` and `transfer.confirm`.
- `worker/routes/members.ts`: use `recordChange` for `member.add` (join and by name), `member.claim`, `member.update`, `member.remove`, and `member.release`.
- `worker/routes/groups.ts`:
  - GET: remove `touch` call.
  - Group DTO: add `expiresAt: expiresAt(group.last_activity_at)`.
  - PATCH `/groups/:code`: check stored name, code, rounding against body. If all unchanged, return `{ ok: true, changed: false }` without DB update or audit. If changed, update DB and `recordChange('group.update')`, returning `{ ok: true, changed: true }`.
  - POST `/groups/:code/owner/claim`: read body first, then call `loadGroup`. Use `audit()` only (not a change). Return 404 `GROUP_NOT_FOUND` if deleted.
- `shared/types.ts`: add `expiresAt: string` to `GroupDto`. Update test fixtures in `tests/unit/groupCsv.test.ts` and `tests/unit/groupSummary.test.ts`.
- `src/api.ts`: `updateGroup` return type becomes `Promise<{ ok: true; changed: boolean }>`.

### UI

- `src/i18n/index.tsx`: add `localDate(iso: string)` formatting helper using `Intl.DateTimeFormat(bundle.intl, { day: '2-digit', month: '2-digit', year: 'numeric' })` in viewer's time zone.
- `src/components/GroupExpiry.tsx` and `GroupExpiry.scss`:
  - Block `group-expiry`. Base: muted text, small font.
  - Modifier `group-expiry--soon`: warning background/border/text, extra sentence.
  - Uses `t('group.expiry.date', { date: localDate(group.expiresAt) })` and `t('group.expiry.soon')`.
- `src/pages/GroupPage.tsx`:
  - Place `<GroupExpiry group={group} />` below `<GroupSummaryBar>`.
  - In `reload()` catch on 404 `ApiError`, call `forgetGroup(code)` before setting `notFound: true`.
  - On claim 404, forget group and show not found.
- i18n locales: add `group.expiry.date` and `group.expiry.soon` in `en.ts` and `vi.ts`.

### Tests

- `tests/unit/rules.test.ts`: test `expiresAt`, `inactiveBefore`, and `isExpiringSoon`.
- `tests/api/purge.test.ts`: PG-1, PG-2, PG-3, PG-4, PG-5, PG-8.
- `tests/api/activity-reset.test.ts`: PG-9 (migration sets `last_activity_at` for existing groups).
- `tests/api/helpers.ts`: support `beforeMigration` and `seed` options in `createTestEnv`.
- `e2e/purge.spec.ts`: PG-6 (deletion date and 72h warning), PG-7 (deleted group 404 and removal from recent groups).
- Update existing tests (`tests/unit/groupCsv.test.ts`, `tests/unit/groupSummary.test.ts`, `tests/api/expenses.test.ts`, `tests/api/members.test.ts`, `tests/api/groups.test.ts`) where fixtures or expectations need adaptation.

### Docs

- `docs/business-rules.md`: document automatic deletion rules (10-day rule, 02:00 VN cron, changes vs non-changes, complete deletion, deletion date line, recent groups cleanup, migration reset).
- `docs/design.md`: document `purge_inactive_groups` architecture, scheduled cron, `recordChange`, `GroupExpiry`, updated migration numbering (0003 activity reset, 0004 accounts, 0005 lock, 0006 attachments).
- `README.md`: update privacy section to state groups are deleted automatically after 10 days.

## Merge request

- Branch: `feat/purge_inactive_groups` into `develop`.
- Implements automatic deletion of inactive groups after 10 days without changes (TAL-12).
- How tested:
  - `npm run typecheck`: clean (excluding pre-existing jsqr/pngjs missing types in settle-up.spec.ts).
  - `npm run lint`: clean (0 errors, 0 warnings across oxlint and stylelint).
  - `npm test`: 28 files, 316 unit + API tests passed.
  - Playwright: 6 passed in `e2e/purge.spec.ts` (desktop and mobile).
- Adapted from draft (`dd7a3bb` + `8062ddb`):
  - Numbered migration as `0003_activity_reset.sql` instead of draft's `0004_activity_reset.sql`, matching develop baseline (0001, 0002) and `docs/design.md`.
  - Maintained roadmap numbering: `0004_accounts.sql`, `0005_group_lock.sql`, `0006_attachments.sql`.
  - Excluded all changes belonging to `edit_expense` (such as `expenses.edited_at`, `audit_log.details`, `expense.edit` route handler) and `google_sign_in` (account links, sessions).
  - `recordChange` in `worker/groupData.ts` omits `details` column update since `0003_expense_edits` is not on develop.
  - Used pure state initialization for `now` in `GroupExpiry` to satisfy oxlint purity rule.

## Review

Reviewed by Sonnet (QA tester) against `develop` with the `review-checklist` skill.

No defects found. Every acceptance criterion is covered by a test that fails without the code:

- PG-1 keeps a group exactly 10 days old and deletes one 10 days and 1 minute old (`tests/api/purge.test.ts`).
- PG-2 checks that members, expenses, shares, transfers and the audit log are gone while another group stays.
- PG-3 checks that a member and a guest opening the group leave `last_activity_at` unchanged.
- PG-4 checks each change from the answers (join, add by name, claim, edit, expense add and delete, transfer add and
  confirm, remove, changed settings) and the non-changes (identical settings with no audit row, recovery link with an
  `owner.claim` audit row). Releasing a member is not covered: that action is not built yet.
- PG-5 checks `expiresAt` in the group DTO, and `tests/unit/rules.test.ts` checks the 72 hour boundary.
- PG-6 and PG-7 run in `e2e/purge.spec.ts` on desktop and mobile.
- PG-8 calls the exported `scheduled` handler, and PG-9 applies `0003_activity_reset.sql` between two seeded groups.

Notes, none of them a change:

- The cron `0 19 * * *` is 02:00 in Vietnam only while Vietnam stays at UTC+7, which it does all year.

Checks on this branch:

- `npm run typecheck`: the only errors are the pre-existing missing `jsqr` and `pngjs` types in `e2e/settle-up.spec.ts`.
- `npm run lint`: clean, oxlint and stylelint.
- `npm test`: 28 files, 316 tests passed.
- Playwright, full suite on port 5183: 62 tests passed (desktop and mobile).



Follow-up by Opus (AI team lead), before the merge:

- `README.md` "Not in the MVP" no longer lists automatic deletion, since the feature lands with this branch.
- The Vietnamese expiry line uses the spelling "xoá", like every other message in `vi.ts`.
