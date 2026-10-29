# Attach a receipt photo

| Field | Value |
|---|---|
| ID | `TAL-13` |
| Labels | `type::feature`, `priority::medium`, `area::expenses` |
| Reporter | Gemini (end user, group treasurer) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

Members sometimes question an expense, and the receipt then has to be found in a chat history. Each expense should
accept an optional receipt photo.

## Notes from the reporter

- Photos taken on recent phones are large.

## Analysis

The app has no file storage today. `Env` in `worker/http.ts` has only `DB` and optional vars. The global `bodyLimit`
in `worker/app.ts` caps every request at 16 KB, so an upload route needs an exemption. Purging a group is one
`DELETE FROM groups ... RETURNING code` in `worker/cleanup.ts`; D1 cascades do not reach R2, so the purge must delete
the group's R2 prefix itself. The real migrations end at `0010_expense_edits.sql`, so this branch uses
`0011_attachments.sql`. design.md (receipt_photos) plans an R2 binding `RECEIPTS`, a client-side resize to WebP at
1600 px or less, a 1 MB upload limit, and downloads only through the Worker.

## Clarifying questions

1. How many photos can one expense have?
2. Who may add, replace or remove a photo? Who may view it?
3. What happens to the photo when the expense is deleted?
4. Which formats and sizes are accepted?

## Answers

From the product owner (human):

1. One optional photo per expense. Uploading again replaces the old photo, and the old object is deleted.
2. Add, replace and remove follow the edit rule: the author or the owner (`requireCanEditExpense`), and never on an expense involving a removed member (`EXPENSE_HAS_REMOVED_MEMBER`). Viewing works like the rest of the group: anyone with the link.
3. Deleting an expense deletes its photo too (row and R2 object). A deleted expense is no longer shown, and keeping a receipt image would only hold personal data. This changes the earlier design.md line "keeps its photos until the group is purged"; update that line. A purged group deletes all of its objects.
4. The client re-encodes every photo to WebP (JPEG fallback when the browser cannot encode WebP), longest side at most 1600 px, 1 MB or less. Re-encoding strips EXIF/GPS. The server accepts only `image/webp`, `image/jpeg` and `image/png`, and checks magic bytes, not just the header.

## Acceptance criteria

- A member who can edit an expense can attach, replace or remove one photo. Others get 403.
- An upload over 1 MB answers 413 `RECEIPT_TOO_LARGE`. A wrong type or wrong magic bytes answers 415 `RECEIPT_TYPE_NOT_ALLOWED`. JSON routes still reject bodies over 16 KB.
- `GET /api/groups/:code/expenses/:id/attachments/:aid` streams the object only when the attachment belongs to an expense of that group that is not deleted. Otherwise it answers 404 `ATTACHMENT_NOT_FOUND`. Headers: stored `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: private, max-age=3600`.
- `ExpenseDto.receipt` is `{ id, contentType, size } | null`. The expense list shows a receipt icon that opens the photo.
- Deleting the expense removes the row and the R2 object. Purging a group removes every object under its prefix. Deleting the account leaves group data, including receipts, in place.
- Attaching, replacing and removing are changes (`recordChange`: `expense.receipt.add` and `expense.receipt.remove`).
- A large phone photo (for example 4000x3000) is downscaled in the browser before upload. No new npm dependency.

## Test matrix

| Case | Layer |
|---|---|
| Upload PNG/JPEG/WebP under 1 MB as author: 201, then GET returns the same bytes and Content-Type | API |
| Owner can upload. Another member gets 403. A guest gets 403/401 per requireMember | API |
| 1 MB + 1 byte: 413. Text body labelled image/png: 415. Second upload replaces the first (old key gone from R2) | API |
| GET with an aid from another group, or after the expense is deleted: 404 | API |
| DELETE expense removes the R2 object. DELETE attachment removes the row and object | API |
| Expense involving a removed member: upload, replace and delete answer 409 `EXPENSE_HAS_REMOVED_MEMBER` | API |
| purgeInactiveGroups deletes R2 objects of purged groups and keeps locked groups' objects | API (tests/api/receipts.test.ts) |
| DELETE /api/me leaves the attachment row and the R2 object | API |
| JSON body of 17 KB still answers 413 BODY_TOO_LARGE | API |
| Magic-byte sniffer, target-size calculation | unit |
| Attach a generated PNG in the form, see the icon, open the photo (200 image/*) | e2e |

## Plan

Branch `feat/receipt_photos` off `develop`, in its own worktree. Ticket: backlog to in-progress (assignee set), then
waiting-to-merge with a merge request section.

1. **migrations/0011_attachments.sql** (new): table `expense_attachments` with `id`, `group_code` (FK `groups`,
   ON DELETE CASCADE), `expense_id` (FK `expenses`, ON DELETE CASCADE), `r2_key`, `content_type`, `size`,
   `created_by`, `created_at`. A UNIQUE index on `expense_id` (one photo) and an index on `group_code`. Migrations
   0001 to 0010 are not edited.
2. **wrangler.jsonc**: `r2_buckets` with binding `RECEIPTS` and bucket name `tally-receipts`, with a comment on the
   bucket setup step. The `database_id` stays unchanged. **worker/http.ts**: `RECEIPTS: R2Bucket` in `Env`; add 415
   to the `ApiError` status union.
3. **shared/receipts.ts** (new): `MAX_RECEIPT_BYTES = 1_048_576`, `RECEIPT_MAX_SIDE = 1600`, `RECEIPT_TYPES`,
   `sniffImageType(bytes)` (JPEG `FF D8 FF`, PNG signature, WebP `RIFF....WEBP`), `targetDimensions`, and
   `receiptKey(code, expenseId, id)` returning `code/expenseId/id`. The type check uses a typed includes helper, not
   a cast. Unit tests in `tests/unit/receipts.test.ts`.
4. **shared/errors.ts**, `src/i18n/locales/en.ts` and `vi.ts`: `RECEIPT_TOO_LARGE`, `RECEIPT_TYPE_NOT_ALLOWED`,
   `ATTACHMENT_NOT_FOUND`. `vi.ts` stays UTF-8 without BOM.
5. **worker/app.ts**: the global `bodyLimit` skips `POST /api/groups/:code/expenses/:id/attachments`. That route
   applies its own `bodyLimit` of `MAX_RECEIPT_BYTES`. Mount `attachmentRoutes` under `/groups` with one line; the
   existing mount order stays.
6. **worker/routes/attachments.ts** (new), written against the real code:
   - `POST /:code/expenses/:id/attachments`: `loadGroup`; the live expense (`EXPENSE_NOT_FOUND`); `requireCanEditExpense`;
     `involvesRemovedMember` from `groupData.ts`. Read `arrayBuffer`; over the limit gives 413. Header type plus
     sniffed magic bytes must match and be allowed, else 415. Put the new R2 object first, then write the row with
     one `INSERT ... SELECT ... WHERE EXISTS (live expense in this group) ... ON CONFLICT(expense_id) DO UPDATE`. If
     0 rows change or the write throws, delete the new object and answer `EXPENSE_NOT_FOUND`. Only after the row is
     written, delete the previous object, which is read before the put. R2 errors are logged and ignored.
     `created_by` is `me.memberId ?? 'owner'`. `recordChange` `expense.receipt.add`. Answer 201 `{ id, contentType, size }`.
   - `DELETE /:code/expenses/:id/attachments/:aid`: the same checks; delete the row, then the object (errors logged);
     `recordChange` `expense.receipt.remove`.
   - `GET /:code/expenses/:id/attachments/:aid`: `loadGroup` only (anyone with the link). Joined on the live expense
     of the group. Streams the object with the four headers above. GET writes nothing.
7. **worker/receipts.ts** (new): `deleteReceiptObjects(bucket, prefix)` lists by prefix and deletes in batches of up
   to 1000. `deleteExpenseReceipt(env, expenseId)` looks up the row, deletes the row, then the object (try/catch,
   logged). **worker/routes/expenses.ts** DELETE: after the guarded `UPDATE` succeeds, call `deleteExpenseReceipt`.
   The hunk stays two lines. `parseExpense`, POST and PATCH are not touched (attendance_split edits them).
8. **worker/cleanup.ts**: `purgeInactiveGroups(db, now, receipts?: R2Bucket)`. Existing tests calling
   `purgeInactiveGroups(env.DB, now)` keep compiling. After the `RETURNING` delete, delete each `code + '/'` prefix,
   logging errors without failing the job. `runDailyJobs` passes `env.RECEIPTS`.
9. **worker/groupData.ts** `loadLedger`: an attachments query joins the `Promise.all`; each expense maps `receipt`
   to `{ id, contentType, size }` or null. **shared/types.ts**: `ReceiptDto` and `ExpenseDto.receipt: ReceiptDto | null`.
   `receipt: null` is added to the `ExpenseDto` fixtures in `tests/unit` (groupCsv, groupSummary, settleView,
   expenseRow, and any other that builds one).
10. **tests/api/helpers.ts**: Miniflare gets `r2Buckets: ['RECEIPTS']`; the env is `{ DB, RECEIPTS }`. A `Browser`
    method sends a binary body with a content type and reuses the cookie handling. Test images are small byte arrays
    with valid magic bytes.
11. **tests/api/receipts.test.ts** (new): the matrix rows for the API layer, including the purge, account-deletion
    and lock cases.
12. **src/receiptImage.ts** (new): `createImageBitmap` with `imageOrientation: 'from-image'`; longest side at most
    1600 px; WebP at quality 0.82, JPEG fallback; retries at quality 0.6 and then at 1200 px; a typed
    `ReceiptTooLargeError` when still over 1 MB. No new dependency.
13. **src/api.ts**: `uploadReceipt`, `deleteReceipt`, `receiptUrl`.
14. **src/components/ExpenseForm.tsx** and `ExpenseForm.scss`: an optional file input (`accept="image/*"`); in edit
    mode the current receipt with a remove button. The upload or delete runs after a successful save. If the receipt
    step fails, the expense stays saved and `onSaved(true)` keeps the form open with an error. The `onStale` and
    `editing` props are kept. BEM classes use theme custom properties only.
    **src/components/ExpenseList.tsx**: a receipt icon button, `aria-label` from `t('expenses.receipt.view')`,
    `target="_blank"`, `rel="noopener"`. A `receipt` icon is added to `Icon.tsx` only if missing.
15. **src/pages/GroupPage.tsx**: only the `onSaved(keepForm)` change. When `keepForm` is true, `editing` is not cleared.
16. **Locales**: `expenses.receipt.*` keys in `en.ts` and `vi.ts`; Vietnamese test input uses `\uXXXX` escapes.
17. **e2e/receipts.spec.ts**: (a) add an expense, attach a generated PNG (in memory) in the form, save, see the icon,
    fetch the link (200, `image/*`); (b) a failed receipt upload while editing keeps the form open with the expense
    saved. Synthetic names; the `e2e/i18n.ts` helper; selectors match the real components.
18. **Docs** (same branch): design.md "### receipt_photos" becomes "(built)" with migration 0011, endpoints, key
    layout, the bodyLimit exemption, deletion with the expense (replacing "keeps its photos until the group is
    purged"), purge of R2 prefixes, and the R2 setup step. design.md section 4 hard-delete line notes the attachment
    exception. The design.md purge section "Migration numbers" line names 0011 (and 0012 for attendance_split) as the
    newest. business-rules.md gets an Expenses subsection "Receipt photo", the "Request bodies are limited to 16 KB"
    bullet gains "except receipt uploads, 1 MB", and purge "Complete deletion" lists receipt photos. README.md
    "Not in the MVP" drops receipt photos; the Concepts expense row mentions the optional photo.
19. **Checks**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:hooks`, and
    `npx playwright test --config playwright.local.config.ts`. Each ticket step runs its relevant checks before commit.

## Merge request

- Branch `feat/receipt_photos` into `develop`. The merge request is opened on GitLab from this branch.
- What changed:
  - Migration `0011_attachments.sql` adds `expense_attachments`, one photo per expense, with cascades from `groups` and `expenses`.
  - R2 binding `RECEIPTS` (bucket `tally-receipts`) in `wrangler.jsonc` and `Env`.
  - Routes `POST`, `DELETE` and `GET` under `/groups/:code/expenses/:id/attachments`, with the group, edit and removed-member rules.
  - The global 16 KB body limit skips the upload route, which has its own 1 MB limit.
  - Deleting an expense deletes its photo; a purge deletes the R2 prefix of each purged group; a locked group keeps its photos.
  - Expense ledger rows carry `receipt: { id, contentType, size } | null`.
  - Browser: photos are resized to at most 1600 px and re-encoded as WebP (JPEG fallback), with a typed too-large error.
  - Expense form: optional photo, remove in edit mode, and a kept form with an error when the photo upload fails (`onSaved(true)`).
  - Expense list: receipt icon link that opens the photo in a new tab.
  - Docs: design.md (receipt_photos built, migration numbers, deletion), business-rules.md (Receipt photo, body limit, complete deletion), README.md (MVP list, Expense row).
- Deployment: before a remote deploy, run `npx wrangler r2 bucket create tally-receipts` and `npx wrangler d1 migrations apply DB --remote`.
- Commands and results (in `practice/tally`):
  - `npm run typecheck`: clean.
  - `npm run lint`: clean (oxlint and stylelint).
  - `npm test`: 46 files, 535 tests passed. This includes the new `tests/api/receipts.test.ts` (13 tests) and `tests/unit/receipts.test.ts`.
  - `npm run test:hooks`: 29 passed.
  - `npx playwright test --config playwright.local.config.ts` (port 5193): 146 passed, 2 skipped. Includes both receipt e2e tests on desktop and mobile.
- Self-review (review-checklist) found and fixed one issue before this section was written: removing a photo deleted the
  row unconditionally, so an expense deleted between the check and the statement lost its photo row while the change
  was still recorded. The removal is now gated on the expense still being live, and a test covers the race (it failed
  with 200 before the fix).
- Known notes:
  - `ExpenseForm.tsx` already failed `prettier --check` at `develop`; this branch does not reflow its unrelated lines.
  - Several existing API tests build `Env` for racing writes; they now spread `...env.env` so the `RECEIPTS` binding is kept.
  - One receipt API test runs longer than the default 5 s and has a 30 s timeout, as the other multi-group API tests do.

Deployment note: before a remote deploy, run `npx wrangler r2 bucket create tally-receipts` and
`npx wrangler d1 migrations apply DB --remote`.
