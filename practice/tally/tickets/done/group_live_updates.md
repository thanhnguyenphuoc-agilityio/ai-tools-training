# Live updates on an open group page

| Field | Value |
|---|---|
| ID | `TAL-52` |
| Labels | `type::feature`, `priority::medium`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | - |

## Description

An open group page does not refresh when another member joins, adds or deletes an expense, records a transfer or
changes settings. The page shows the state from the moment it was opened, and a member has to reload to see the
changes of the others.

## Analysis

`src/pages/GroupPage.tsx` loads the group in these cases only:

- when the page opens;
- when the account version changes (sign in, sign out, account edit);
- after the page's own actions, through the `onChanged` and `onSaved` callbacks.

Every group write goes through the routes mounted under `/groups/:code` (`worker/routes/groups.ts`,
`members.ts`, `expenses.ts`, `transfers.ts`, `link.ts`). Account routes (`PATCH /me`, `DELETE /me`) change how
groups render (name and saved bank details, membership of the deleted account), but they do not sit under a group
code.

No WebSocket and no Durable Object exist yet. The Workers runtime offers both, so the page can receive a signal
without polling.

## Clarifying questions

1. Which transport carries the signal: polling, Server-Sent Events or WebSocket?
2. What does the message carry: the changed data, or only a signal?
3. How does the page show an update: a notice, a silent refresh, or a button to reload?
4. What happens after a lost connection or when the tab returns to the foreground?

## Answers

From the product owner (human), 2026-10-29:

1. Push over WebSocket: one Durable Object per group (SQLite-backed, WebSocket Hibernation API) at /api/groups/:code/live.
2. The message is a signal only ({type:'changed'}), never group data; the client then calls api.getGroup.
3. The page updates silently: no toast; fields the person is typing in keep their values.
4. On reconnect (lost connection, or the tab coming back to the foreground) the client reconnects automatically and reloads the group once so no signal is missed.

Design notes from Opus (AI team lead):

- One Durable Object per group, named by the group code. It stores nothing; it only keeps the open sockets.
- The Durable Object uses the WebSocket Hibernation API, so an idle socket does not keep the object in memory.
- A signal is sent after every successful group write, including writes that change nothing (one extra reload is
  harmless).
- Account routes (`PATCH /me`, `DELETE /me`) signal the groups whose display they change: groups owned by the account
  and groups where a member is linked to the account.
- The signal is sent after the handler returns, so after the D1 write has committed.
- The endpoint is a GET: it writes nothing to D1 and does not move `last_activity_at`.
- The Durable Object binding is optional. Without it the app works as before, and the live endpoint answers 404.
- The client debounces signals by about 250 ms and reconnects with a backoff of 1 s, doubling up to 30 s.

## Acceptance criteria

- An open group page refreshes within about one second after another member joins, adds, edits or deletes an expense,
  records or confirms a transfer, changes group settings, changes members, or links an account.
- The refresh is silent: no toast and no banner. A failed refresh keeps the current page; a 404 keeps today's
  not-found handling.
- Fields the person is typing in (an expense description, a settings form) keep their values after a refresh.
- After a lost connection, or when the tab returns to the foreground, the page reconnects and reloads once.
- The signal carries no group data; the client reads the group through the existing `GET /api/groups/:code`.
- `PATCH /me` and `DELETE /me` refresh the groups whose display they change.
- Without the Durable Object binding, all existing behaviour is unchanged.
- `GET /api/groups/:code/live` without a WebSocket upgrade answers 404 `NOT_FOUND`; an unknown code answers 404
  `GROUP_NOT_FOUND`.

## Test matrix (QA)

| Area | Case | Expected |
|---|---|---|
| API | Every write route under `/groups/:code` (group PATCH, owner claim with sign-in, owner attach, owner transfer, lock, unlock, link, member add, claim, patch, remove, release, expense add, edit, delete, transfer add, confirm) | one signal for that group code |
| API | A refused write (403 or 400) | no signal |
| API | Plain `GET /groups/:code` | no signal |
| API | `GET /groups/:code` that auto-links an invited member | one signal |
| API | `PATCH /me` and `DELETE /me` | signal for each affected group |
| API | `POST /groups` (create) | no signal |
| API | Without the `GROUP_LIVE` binding | existing tests unchanged, no error |
| API | `GET /groups/:code/live` without upgrade; unknown code | 404 `NOT_FOUND`; 404 `GROUP_NOT_FOUND` |
| Unit | `LiveConnection` debounce | several signals in 250 ms give one reload |
| Unit | Reconnect backoff | 1 s, 2 s, 4 s, capped at 30 s |
| Unit | One reload after a reconnect that follows a drop | exactly one `onSignal` |
| Unit | One reload on `visibilitychange` to visible while not open | exactly one `onSignal` |
| Unit | Dispose | socket closed, no further reconnect |
| E2E | Alex creates a group; Sam joins through the link in a second context; Sam types a description; Alex adds an expense | Sam sees the new row without reloading, his typed text is kept, no toast on Sam's page |

## Plan

Branch `feat/group_live_updates` from `develop` (1cc5637). The ticket is created in `in-progress/`; the assignee is
Haiku (developer).

1. Ticket and README: this file, and the line "The next free ID is `TAL-53`" in `tickets/README.md`. This is the only
   change to the README on this branch.
2. Durable Object, `worker/liveObject.ts`: class `GroupLive` extends `DurableObject` from `cloudflare:workers`. The
   `/connect` path requires `Upgrade: websocket`, accepts the socket with the Hibernation API and returns 101. The
   `/notify` path (POST) sends `{"type":"changed"}` to every socket, each send in its own try/catch. Incoming messages
   are ignored, close is handled cleanly, and an auto-response answers `ping` with `pong` without waking the object.
   Only `worker/index.ts` imports this file.
3. Signal helper, `worker/live.ts` (no `cloudflare:workers` import): `signalGroup(env, code)` and
   `signalGroups(env, codes)` do nothing when `env.GROUP_LIVE` is missing; otherwise they POST to the object named by
   the group code. Errors are logged, never thrown. A helper runs the signal through `executionCtx.waitUntil` when
   the context exists, and awaits it directly otherwise (tests).
4. Env types, `worker/http.ts`: `Env` gains the optional `GROUP_LIVE` binding; the context variables gain
   `groupChanged`.
5. Middleware, `worker/app.ts`: one middleware on `/groups/:code/*`, registered before the route mounts. It awaits the
   handler, then signals when the method is not GET and the status is below 400 with no error, or when `groupChanged`
   is set. The code must match `GROUP_CODE_RE`. Account routes are not under this path.
6. Auto-link, `worker/routes/groups.ts` GET `/:code`: after `recordChange` in the `member_email_invite` block, set
   `groupChanged`. Nothing else in the handler changes.
7. Account routes, `worker/routes/account.ts`: `PATCH /me` and `DELETE /me` read the affected group codes before the
   write (groups owned by the user and groups with a member linked to the user), then signal them after success. The
   helper for this lives in `worker/live.ts`.
8. Endpoint, `worker/routes/live.ts`, mounted under `/groups`: `loadGroup` first. Without an upgrade header, or without
   the binding, it answers 404 `NOT_FOUND`. Otherwise it forwards the request to the object's `/connect` and returns
   the response. It writes nothing.
9. Entry point, `worker/index.ts`: export `GroupLive`. `wrangler.jsonc`: a `durable_objects` binding `GROUP_LIVE` for
   class `GroupLive`, and a top-level `migrations` entry with tag `v1` and `new_sqlite_classes: ["GroupLive"]`. Each
   block has a comment. This is separate from the D1 `migrations_dir`.
10. Dev check: `npm run dev` serves the object and upgrades `ws://localhost:5173/api/groups/<code>/live`. If the Vite
    plugin does not proxy the upgrade, stop and report.
11. Client, `src/liveUpdates.ts`: class `LiveConnection` with injected WebSocket constructor, timers and URL (`wss` on
    https), debounce of 250 ms, reconnect with backoff (1 s, doubling, capped at 30 s), one `onSignal` after a
    reconnect that follows a drop, one `onSignal` on `visibilitychange` to visible when not open, close on dispose,
    and only the exact `changed` type counts. Hook `useGroupLive(code, onSignal)` closes the connection on unmount or
    code change.
12. Page, `src/pages/GroupPage.tsx`: `refresh` reloads silently; a failed refresh keeps the page, except a 404 keeps
    today's not-found handling. The hook is added next to the existing version effect. `ExpenseForm` stays keyed by the
    edited expense id, and the settings form state is initialised once, so typed text survives a refresh; the e2e
    checks it.
13. Tests:
    - `tests/api/live.test.ts`: a fake `GROUP_LIVE` binding (`idFromName` returns the name, `get` returns an object
      with a `fetch` spy). Each write route is listed by its path so that a new route fails the test until it is
      added. Refused writes, plain GET, auto-link GET, create, account routes, missing binding, and the endpoint
      responses are covered.
    - `tests/unit/liveUpdates.test.ts`: the `LiveConnection` cases from the test matrix, with fake timers and a fake
      socket.
    - `e2e/live-updates.spec.ts`: two browser contexts, as in the test matrix.
14. Docs: `docs/business-rules.md` gets a "Live updates" bullet under "Interface preferences". `docs/design.md` gets a
    "### group_live_updates (built)" section in section 6 and the Durable Object migration and binding in section 2 or
    8.
15. Ticket end: the ticket moves to `waiting-to-merge/` with a "## Merge request" section. The merge request notes that
    a remote deploy needs the Durable Object migration (tag `v1`, `new_sqlite_classes` `GroupLive`), which
    `wrangler deploy` applies from `wrangler.jsonc`; that this branch has no D1 migration; and that the merge reviewer
    re-runs `tests/api/live.test.ts` after `receipt_photos` and `attendance_split` merge, adding their write routes to
    the route list.

## Merge request

Branch `feat/group_live_updates` into `develop`.

An open group page now refreshes silently when another member changes the group. One Durable Object per group
(`GroupLive`, SQLite-backed, WebSocket Hibernation API) holds the open sockets at `GET /api/groups/:code/live`. After
every successful group write, and after the `member_email_invite` auto-link on `GET`, the server sends a signal
`{"type":"changed"}` with no data. The page reloads the group through the existing `GET`. `PATCH /me` and `DELETE /me`
signal the groups that show the account. Without the `GROUP_LIVE` binding nothing changes.

A remote deploy needs the Durable Object migration (tag `v1`, `new_sqlite_classes` `GroupLive`). `wrangler deploy`
applies it from `wrangler.jsonc`. This branch has no D1 migration.

The merge reviewer re-runs `tests/api/live.test.ts` after `receipt_photos` and `attendance_split` merge, and adds their
write routes to the route list in that file.

### Commands and results

Run in `practice/tally` on this branch:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 556 passed, 46 files.
- `npm run test:hooks`: pass.
- `npx playwright test --config playwright.local.config.ts`: 144 passed, 2 skipped.
- Dev server check: `ws://localhost:5173/api/groups/<code>/live` upgrades, and a group `PATCH` pushes
  `{"type":"changed"}` to the open socket.

### Self-review

Reviewed with the `review-checklist` skill. Verdict: approve with nits. Findings:

- [minor] `tests/api/purge.test.ts`: the scheduled-handler test now calls `runDailyJobs` instead of `worker.scheduled`,
  because importing `worker/index.ts` loads the Durable Object class, which Node cannot resolve. The handler is a
  one-line call to `runDailyJobs`, so the behaviour is covered.
- [nit] `worker/routes/account.ts`: `PATCH /me` signals even when the name and bank details are unchanged. One extra
  reload, documented as harmless.
- [nit] `src/liveUpdates.ts`: a signal that arrives in the same moment the tab returns to the foreground can reload
  twice. The second reload shows the same data.

## Review

Reviewed by Opus (AI team lead).

Findings:

- Checked against the Answers: one `GroupLive` Durable Object per group code with the Hibernation API; the message is
  only `{type:"changed"}` and the client reads the group through `GET /api/groups/:code`; the refresh is silent and
  keeps the form state (the form key does not change); reconnect with backoff and one reload after a drop or on
  return to the foreground. The signal runs in one middleware after the handler, only for writes under 400, plus the
  documented `member_email_invite` auto-link on GET. The live endpoint is a GET that writes nothing to D1.
- [minor, cross-ticket] `tests/api/live.test.ts` lists the route files by name. After `receipt_photos` and
  `attendance_split` land on `develop`, the attachment and session routes are not in that list, so the guard test
  that every group write signals does not cover them. Fixed on `develop` through `fix/batch-b-review`.
- [nit] `tests/api/purge.test.ts` PG-8 now calls `runDailyJobs` instead of `worker.scheduled`, because Node cannot
  load `cloudflare:workers`. The handler is a one-line call; accepted.
- No D1 migration; `wrangler.jsonc` carries Durable Object migration `v1`. `tickets/README.md` next free ID is `TAL-53`
  (TAL-50 and TAL-51 come from this batch, TAL-52 is this ticket).

Verdict: approve. Commit authors and dates checked.

Checks: `npm run typecheck` and `npm run lint` passed, `npm test` 46 files / 556 passed, `npm run test:hooks` passed,
e2e (port 5195) 144 passed / 2 skipped. Typecheck and `npm test` rerun on `develop` after the merge.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
