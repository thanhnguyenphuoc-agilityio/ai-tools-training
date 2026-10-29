# Split by attendance for recurring sessions

| Field | Value |
|---|---|
| ID | `TAL-1` |
| Labels | `type::feature`, `priority::medium`, `area::expenses` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

Some groups meet on a fixed schedule (for example twice a week), and attendance changes every session. Shared
costs for a session are split among the people present. Today each expense is entered separately and absent people
are unticked one by one. The owner should be able to take attendance and have the session's costs split
automatically.

## Notes from the reporter

- Some sessions end after midnight.

## Analysis

Today every expense picks its participants by hand (ExpenseForm defaults to all active members). `docs/design.md`
(attendance_split) plans the tables `group_sessions(id, group_code, day, starts_at, ends_at, note)` and
`attendance(session_id, member_id)`, plus `expenses.session_id`, with no change to money or settlement logic. Times
are `HH:mm` in group-local time, and sessions past midnight must be handled explicitly.

`edit_expense` exists. `shared/expenseEdit.ts` (`expenseFieldsChanged`) is the documented place to add a stored
expense field, so `sessionId` is added there. A session-only change sets `edited_at` and records `expense.edit`, but
does not recompute the stored shares.

The migrations end at `0010_expense_edits.sql`. This branch uses `0012_sessions.sql`; `0011` is reserved for
`receipt_photos`, which merges first. The migration runner applies files in sorted order, so the gap is harmless.

## Clarifying questions

1. Who takes attendance and who adds session costs?
2. How is a session that ends after midnight dated and shown?
3. If attendance changes after costs were entered, are the shares recomputed?
4. Is a recurring schedule (for example every Tuesday and Friday) stored?
5. Can a session with costs be deleted?

## Answers

From the product owner (human):

1. The owner creates sessions and edits attendance (`requireCanManageSessions`). Any member can add a cost to a session, and it is an ordinary expense with `session_id`. Its participants default to the members marked present, and the split is equal by default. All split modes stay available.
2. A session belongs to the day it starts. If `ends_at` is earlier than `starts_at`, it ends the next day (21:00-00:30 is 3 h 30 min). Equal start and end are rejected. Session costs default to the session day as `spentOn`, not the calendar day of the end time. The list shows `21:00 - 00:30 (+1 day)` via i18n.
3. No. Shares are computed once (split rule 4). Changing attendance never touches saved expenses. The session view flags a cost whose participants differ from the current attendance ("does not match attendance") with an edit action for its author or the owner.
4. No stored schedule. A new session form prefills the times and the attendance of the latest session, and the date defaults to today. A stored schedule can be a later ticket.
5. Only when it has no live (non-deleted) costs. Otherwise it answers 409 `SESSION_HAS_EXPENSES`. Removed members stay in old attendance and cannot be marked present on new or edited sessions.

## Acceptance criteria

- The owner can create, edit and delete sessions (day, start, end, optional note of 80 characters or less, present members). Non-owners get 403 `OWNER_ONLY`.
- Times must match `HH:mm` (00:00-23:59). Equal times or a bad format answer 400 `INVALID_SESSION_TIME`. Unknown or removed members answer 400 `PARTICIPANT_NOT_IN_GROUP`. An unknown session answers 404 `SESSION_NOT_FOUND`.
- Present ids are deduplicated before validation; non-string ids are refused with 400 `PARTICIPANT_NOT_IN_GROUP`.
- A removed member who is already present stays present when the session is edited without that member being resent. A removed member who was not present cannot be marked present (400 `PARTICIPANT_NOT_IN_GROUP`).
- A `PATCH` that repeats the stored values (day, times, note and attendance set) answers `{ ok: true, changed: false }`, writes nothing and records nothing. A real change answers `changed: true`, records `session.update` with `details { previous }`.
- `DELETE` is race-safe: it removes the session only while no live expense references it. Zero rows changed maps to `SESSION_NOT_FOUND` or `SESSION_HAS_EXPENSES` after a re-read.
- `POST`/`PATCH /expenses` accept optional `sessionId` (null, empty or absent means none). It must be a session of the same group, otherwise 400 `SESSION_NOT_FOUND`. A session removed between the check and the write also answers 400 `SESSION_NOT_FOUND`, never 500. `ExpenseDto.sessionId` is returned.
- A session-only change of an expense (`sessionId` only) sets `edited_at`, records `expense.edit`, and keeps the stored shares.
- Exact and weighted splits work for session costs with the same rules as without a session. Balances of such a cost equal the same expense without a session.
- Changing a session's attendance afterwards leaves the shares of its costs untouched.
- Adding a cost from a session opens ExpenseForm with present members ticked, the date set to the session day and the description prefilled with the note.
- A session ending after midnight shows a duration and a "+1 day" marker; its costs carry the session start day.
- Session add, update and delete are changes (`recordChange`: `session.add`, `session.update`, `session.delete`). A group purge removes sessions and attendance rows by cascade.
- Balances and settle-up behave exactly as before.

## Test matrix

| Case | Layer |
|---|---|
| `parseSessionTime`, `endsNextDay('21:00','00:30')` true, `sessionMinutes` 210, `'09:00','09:00'` rejected, `'24:00'`/`'9:00'` rejected | unit `tests/unit/sessions.test.ts` |
| `attendanceMatches`: exact match, differing participants, present removed member ignored, removed member who shares the cost compared | unit `tests/unit/sessions.test.ts` |
| `expenseFieldsChanged` with `sessionId` only; `splitChanged` unaffected by a session-only change | unit `tests/unit/expenseEdit.test.ts` |
| Owner creates a session with attendance. Member gets 403. Removed member in present list gets 400. Duplicate ids accepted once. Non-string id gets 400 | API `tests/api/sessions.test.ts` |
| Expense with a `sessionId` of another group: 400 `SESSION_NOT_FOUND`. Valid: stored and returned. Edit keeps or clears it | API |
| Session-only change of an expense keeps shares and sets `edited_at` | API |
| Exact-split session cost and weighted session cost: stored with `sessionId`, balances equal the same expense without a session | API |
| Attendance change does not alter stored shares of session costs | API |
| Editing a session cost (PATCH) keeps `sessionId` when the client resends it | API |
| PATCH that repeats the stored values: `changed: false`, no audit row | API |
| Past session edited by the owner keeps a removed member who was present; a removed member who was not present is refused | API |
| Delete a session with a live cost: 409. After deleting the cost: 200 | API |
| DELETE race: an expense inserted between the check and the delete keeps the session (direct SQL setup) | API |
| GET group returns sessions sorted by day, then start time, with attendance | API |
| Purge removes `group_sessions` and `attendance` rows | API |
| Owner takes attendance for 21:00-00:30, sees "+1 day", adds a cost from the session, and the shares go only to present members | e2e `e2e/attendance.spec.ts` |

## Plan

Branch `feat/attendance_split` off `develop`, in its own worktree under `.scratch/wt/`.

1. **Migration `migrations/0012_sessions.sql`**: table `group_sessions` (id, group_code with a foreign key to `groups` and cascade, day, starts_at, ends_at, note with a default of empty text, created_at) with an index on `(group_code, day)`; table `attendance` (session_id and member_id, both foreign keys with cascade, primary key on both); `ALTER TABLE expenses ADD COLUMN session_id` as a foreign key to `group_sessions` with `ON DELETE SET NULL`. Pushed migrations are not edited.
2. **`shared/sessions.ts`** (new): `TIME_RE`, `parseSessionTime`, `toMinutes`, `endsNextDay`, `sessionMinutes`, `isValidSessionTimes`, and `attendanceMatches(presentIds, shares, removedIds)`. No Date objects and no time zone: the times are group-local labels. `attendanceMatches` compares the member ids of the stored shares with the present members; a removed member who is present but takes no part in the cost is ignored.
3. **`shared/types.ts`**: `SessionDto` (id, day, startsAt, endsAt, note, presentIds), `NewSession`, `GroupDto.sessions`, `ExpenseDto.sessionId: string | null`, `NewExpense.sessionId?: string | null`. Unit fixtures in `tests/unit` get `sessionId: null`, and `sessions: []` where a `GroupDto` is built.
4. **`shared/errors.ts`** with `INVALID_SESSION_TIME`, `SESSION_NOT_FOUND`, `SESSION_HAS_EXPENSES`; translations in `src/i18n/locales/en.ts` first, then `vi.ts`.
5. **`worker/policy.ts`**: `requireCanManageSessions(me)` delegates to `requireOwner`. `docs/design.md` section 3 lists it. The owner check already covers accounts attached to the owner key and transferred ownership.
6. **`worker/routes/sessions.ts`** (new), mounted in `worker/app.ts` with one added line:
   - `POST /groups/:code/sessions`: validate day (`isoDate`), times (`isValidSessionTimes`), note, and present ids (deduplicated, string only, active members only). Insert the session and its attendance in one D1 batch. `recordChange` `session.add`.
   - `PATCH /groups/:code/sessions/:id`: loads the session with its group code; a missing session answers 404. Fields not sent keep their stored value. Removed members already present are kept. When the stored values repeat, the route answers `changed: false` and writes nothing. Otherwise the update and the attendance replacement run in one batch, guarded so a session that vanished in between answers 404. `recordChange` `session.update` with `details { previous }`.
   - `DELETE /groups/:code/sessions/:id`: one `DELETE ... WHERE id = ? AND group_code = ?` guarded by `NOT EXISTS` on live expenses with that `session_id`. Zero rows changed is re-read: a missing session answers 404 `SESSION_NOT_FOUND`, a session with live costs answers 409 `SESSION_HAS_EXPENSES`. `recordChange` `session.delete`.
7. **`worker/groupData.ts`**: `loadSessions(db, code)` sorted by day descending, then start time descending, with attendance as `presentIds`. `loadLedger` maps `sessionId` next to `editedAt`. `worker/routes/groups.ts` GET adds sessions to its `Promise.all` and to the DTO; the auto-link block is not touched.
8. **`worker/routes/expenses.ts`**: `parseExpense` reads an optional `sessionId` (text of at most 64 characters; null, empty or absent means none) and checks it with `SELECT 1 FROM group_sessions WHERE id = ? AND group_code = ?`. POST's INSERT and PATCH's guarded UPDATE store `session_id`. The PATCH previous read includes `session_id`. A foreign-key failure from D1 between the check and the write maps to 400 `SESSION_NOT_FOUND`. `shared/expenseEdit.ts` `ExpenseFields` and `expenseFieldsChanged` gain `sessionId`; a session-only change leaves `splitChanged` false, so stored shares are kept.
9. **Exact and weighted session costs**: no change to split logic. The API tests cover both modes and the attendance change.
10. **Client**:
    - `src/api.ts`: `createSession`, `updateSession`, `deleteSession`.
    - `src/components/SessionsPanel.tsx` and `.scss` (new): sessions newest first with day, range, "+1 day" marker, duration, present count and session costs with their total and a mismatch flag from `attendanceMatches`. Owner form and delete confirmation use `useDialog`; errors use `errorMessage`; notices use `useToast`; BEM classes and theme custom properties only. The edit action follows `involvesRemovedMember` (`src/expenseRow.ts`). Every label, separator and "+1 day" text comes from locales.
    - `src/components/ExpenseForm.tsx`: optional `session` prop. Initial participants are the present active members, initial date is the session day, initial description is the note. `sessionId` is sent as `editing.sessionId` when editing, otherwise `session?.id ?? null`. Cancel is shown for a session cost. The existing `onStale` prop is kept.
    - `src/pages/GroupPage.tsx`: a sessions tab between Expenses and Settle up, with a calendar icon (`src/components/Icon.tsx`), a `costSession` state, and the form key `editing?.id ?? (costSession ? session-id : 'new')`.
    - Locales: `group.tabs.sessions` and `sessions.*` in `en.ts` first, then `vi.ts`.
    - E2e tests that count tabs (`e2e/ui-redesign.spec.ts`) and `tests/api/delete-account.test.ts` (if it lists tables) are updated.
11. **Tests**: `tests/unit/sessions.test.ts`, `tests/unit/expenseEdit.test.ts` (session cases), `tests/api/sessions.test.ts` (matrix above), `e2e/attendance.spec.ts`. Synthetic names (Alex, Sam, Jamie) and fake bank accounts only; non-ASCII input as `\uXXXX`.
12. **Docs**: `docs/design.md` "### attendance_split" becomes "(built)" with tables, migration 0012, endpoints, the midnight rule, `requireCanManageSessions`, `attendanceMatches`, idempotent PATCH and the race guards; section 4 hard-delete line gets the session exception; "### edit_expense (built)" notes `sessionId` in `expenseFieldsChanged`. `docs/business-rules.md` gets the section "Sessions and attendance" before "Balances and settling up", and session add, update and delete in "Changes that count as activity". `README.md` "Not in the MVP" drops attendance-based splits.
13. **Checks before waiting-to-merge**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`, and `npx playwright test --config playwright.local.config.ts` (port 5194). The remote D1 migration `0012_sessions.sql` must be applied before the feature works on a deployed environment.

## Merge request

- Branch: `feat/attendance_split` into `develop`.
- The merge request is opened on GitLab from this branch; its link is added when it exists.
- The remote D1 migration `0012_sessions.sql` must be applied before the feature works on a deployed environment.
- What changed: the owner takes attendance for recurring sessions, and a cost added from a session is an ordinary
  expense shared among the members present. Sessions that end after midnight belong to the day they start. Changing
  attendance never changes saved shares. A session with live costs cannot be deleted.
- Commands run and results:
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 46 files, 547 tests, 545 passed on the first run. Two timed out under load (`TO-11` in
    `transfer-ownership.test.ts`, an existing test, and one new session test). Both passed on a rerun.
  - `npm run test:hooks`: passed.
  - `npx playwright test --config playwright.local.config.ts` (port 5194): 144 passed, 2 skipped.
