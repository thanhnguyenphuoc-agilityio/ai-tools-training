# Can a group link be guessed?

| Field | Value |
|---|---|
| ID | `TAL-7` |
| Labels | `type::question`, `priority::medium`, `area::security` |
| Reporter | Sonnet (QA tester) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `rate_limit_guessing` |

## Question

A group link is a short random string, and a group contains bank account numbers. Could a script that keeps
guessing find other people's groups? Does the same apply to the owner recovery link?

## Analysis

**Group code.** `shared/groupCode.ts` draws 12 characters from a 31-character alphabet with `crypto.getRandomValues`
and rejection sampling, so there is no modulo bias. The code space is 31^12 = 787662783788549761, about 7.9e17, or
about 59.5 bits. Codes are not sequential and are not derived from time or ids. `loadGroup` (`worker/groupData.ts`)
answers the same `404 GROUP_NOT_FOUND` for a malformed code and for an unknown one, so the response reveals nothing
about how close a guess was.

**How likely a guessing script is to succeed.** Inactive groups are purged after 10 days, so the number of live groups
G stays small. With G = 10,000 the chance per guess is G / 31^12, about 1.3e-14. A script sending 1,000 requests per
second for a whole year (about 3.15e10 guesses) expects about 0.0004 hits. At G = 1,000,000 it expects about 0.04 hits
a year, while sending 31 billion requests, which is plainly visible in Cloudflare analytics. Guessing a group link is
not a practical attack today. The realistic leak paths are sharing: the link pasted in a public place, screenshots, or
browser history on a shared device.

**Owner recovery link.** The owner key comes from `randomToken()` in `worker/auth.ts`: 32 random bytes in base64url,
256 bits. Only its SHA-256 is stored, and it travels in the URL fragment (`#owner=`), so it does not reach server logs.
Guessing it requires a known group code and 2^256 tries through `POST /groups/:code/owner/claim`, which answers
`403 WRONG_OWNER_KEY`. Device tokens and session tokens come from the same generator, so they carry 256 bits too.

**Owner key revocation.** Once a group is tied to an account (`owner_link_binds_account`), `groups.owner_key_hash` is
set to `'revoked'` (`REVOKED_OWNER_KEY`). Every recovery link then answers `403 OWNER_KEY_REVOKED`, or
`403 GROUP_OWNED_BY_OTHER_ACCOUNT` for a signed-in account other than the owner. Owner access then comes only from the
Google session, whose token also comes from `randomToken()` (256 bits). A revoked link therefore cannot be brute-forced.

Side effect: once a group code is known, `OWNER_KEY_REVOKED` versus `WRONG_OWNER_KEY` reveals whether the group is
attached to an account. This is accepted, because the attacker needs the group code first.

**Other paths.** `member_email_invite` auto-links only a signed-in account whose Google email matches the invite, so it
is no guessing vector. `transfer_ownership` needs an owner session.

**What is missing.** No rate limiting exists anywhere in the Worker. The entropy makes it unnecessary for secrecy, but
limits are cheap defense in depth, and they also cap the D1 read cost of a flood of 404 lookups. No `Referrer-Policy`
header is set. Browsers default to `strict-origin-when-cross-origin`, which already drops the `/g/<code>` path on
cross-origin requests, but an explicit `same-origin` policy makes that intent clear.

## Clarifying questions

1. Should requests be throttled even though guessing is impractical?
2. Should group codes become longer?

## Answers

From the product owner (human):

1. Yes, as a low-priority hardening ticket: a per-IP limit on owner-key claims, and on lookups that answer `GROUP_NOT_FOUND`. Viewing an existing group stays unthrottled. Use the Workers Rate Limiting binding, with no external service and no new npm dependency.
2. No. About 59.5 bits plus the 10-day purge is enough, and a longer code would hurt typing and sharing links. Existing links must keep working.

## Decision

Group links and recovery links cannot be guessed in practice, so no urgent change is needed. This branch changes docs only: `business-rules.md` "Data and safety" replaces the OPEN QUESTION with the entropy figures, and `design.md` section 4 notes the code and token entropy. The follow-up improvement `rate_limit_guessing` (TAL-51) goes in backlog.

## Acceptance criteria

- `docs/business-rules.md` "Data and safety" replaces the OPEN QUESTION with the group code and token entropy figures.
- `docs/design.md` section 4 notes the group code and token entropy, the identical 404 from `loadGroup`, `randomToken()` and the revoked owner key.
- `tickets/backlog/rate_limit_guessing.md` exists as the follow-up (TAL-51).
- No code changes.

## Test matrix (QA)

| Case | Expected |
|---|---|
| Docs only | Typecheck, lint and test run unchanged; no code or test changes |

## Plan

1. Start the ticket: move it to `in-progress/`, set the assignee and the related ticket, add the analysis, questions, answers and decision. Commit `docs(tickets): start group_link_guessing with a plan`.
2. Answer the question in `docs/business-rules.md` and `docs/design.md`. Commit `docs: answer group_link_guessing in business rules and design`.
3. Add the follow-up `tickets/backlog/rate_limit_guessing.md` (TAL-51). Commit `docs(tickets): add rate_limit_guessing follow-up`.
4. Run typecheck, lint, test, test:hooks and e2e (port 5191), then move the ticket to `waiting-to-merge/` with a merge request section. Commit `docs(tickets): move group_link_guessing to waiting-to-merge`.
