# Sign in with Google

| Field | Value |
|---|---|
| ID | `TAL-6` |
| Labels | `type::feature`, `priority::high`, `area::auth` |
| Reporter | Opus (product owner) |
| Assignee | - |
| Depends on | - |
| Related | - |

## Description

Owners who change devices lose owner access to their groups. The recovery link shown at group creation is often
acknowledged without being saved. Google sign-in should restore access after signing in on any device.

## Notes from the reporter

- Signing in must stay optional. Occasional members only open the link to pay.

## Analysis

Today access lives on the device: the owner key (recovery link) and the member device token (cookie). Losing the
device loses the access unless the recovery link was saved. An account gives a second way back that does not
depend on the device. The request names owners; the same problem exists for members, whose device token is lost
with the device. The design in `docs/design.md` (`google_sign_in`) covers both, plus dev sign-in for tests.

Points the request leaves open: which access an account restores, what happens to groups created before signing in,
what is stored about the person, how long a sign-in lasts, and what signing out removes.

## Clarifying questions

1. Should an account restore only owner access, or also "I am this member" on a new device?
2. How does a group created before signing in get attached to the account?
3. Which data from Google may be stored, and who may see it?
4. How long does a sign-in last on a device?
5. What does signing out remove: the account session only, or also the access the device had from links?
6. Can one account be two members of the same group?
7. Can developers and tests sign in without a real Google account?

## Answers

From Opus (product owner):

1. Both. A group created while signed in belongs to the account; joining or claiming a name while signed in links
   that member to the account.
2. The owner, signed in on a device that has owner access, uses "Link to my account" on the group. A member can do
   the same for their own member.
3. The Google account id, the email and the display name. The email is never shown to other members; the group
   shows the member name as today.
4. 30 days, then the person signs in again.
5. Only the account session. Access the device has from a recovery link or a device token stays.
6. No. One account is at most one member per group.
7. Yes, through the development sign-in in the design, which must be impossible to enable in production.

## Acceptance criteria

- Given a person who is not signed in, when they open a group link, then they can view, join and pay exactly as
  before; nothing asks them to sign in.
- Given a signed-in person, when they create a group, then the group belongs to their account; when they open the
  group on another device and sign in there, then they are the owner without the recovery link.
- Given a signed-in person, when they join a group or claim a name, then on another device, after signing in, they
  are that member.
- Given an owner with access from a recovery link on this device, when they choose "Link to my account" while signed
  in, then the group belongs to the account. Given a group that already belongs to another account, then linking is
  refused.
- Given an account that is already a member of a group, when it joins, claims or links another member of the same
  group, then the request is refused.
- Given a signed-in person, when they sign out, then the account session ends and the access from links or device
  tokens on that device remains.
- Given a session older than 30 days, then it no longer identifies the person.
- Given the development sign-in, when it is not enabled in the local configuration or the host is not `localhost`,
  then the endpoint answers 404.
- The email of a person is never returned in a group's data.

## Test matrix (QA)

Drafted by Sonnet (QA tester) from the criteria above.

| ID | Scenario | Level |
|---|---|---|
| GS-1 | Guest and device-token flows unchanged (existing API and e2e suites) | API, e2e |
| GS-2 | Create while signed in, then sign in on a second browser context: owner | API, e2e |
| GS-3 | Join, then claim, while signed in; second context signed in: same member | API |
| GS-4 | Link a group with the owner key; link a group owned by another account: 403 | API |
| GS-5 | Same account as a second member of one group: refused | API |
| GS-6 | Sign out keeps the owner key access of the device | API |
| GS-7 | Expired session (fake clock) does not identify | API |
| GS-8 | Dev sign-in: 404 without the flag, 404 with the flag on another host | API |
| GS-9 | Group DTO never contains an email | API |
| GS-10 | Google ID token check: wrong audience, wrong issuer, unverified email, expired: all refused | unit |
| GS-11 | Sign-in button and account menu at 375px and 1366px, both themes | e2e (dev sign-in) |
