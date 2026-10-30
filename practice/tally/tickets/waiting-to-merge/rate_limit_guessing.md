# Throttle guessing of group codes and owner keys

| Field | Value |
|---|---|
| ID | `TAL-51` |
| Labels | `type::improvement`, `priority::low`, `area::security` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `group_link_guessing` |

## Description

Group codes (about 59.5 bits) and owner keys (256 bits) cannot be guessed in practice (see `group_link_guessing`),
but the API has no rate limiting. As defense in depth, repeated failed attempts from one client should be slowed
down: lookups that answer `GROUP_NOT_FOUND`, and owner recovery attempts that answer `WRONG_OWNER_KEY` or
`OWNER_KEY_REVOKED`. Every route that loads a group through `loadGroup` is covered, including the live updates
WebSocket endpoint. Over the limit, the API answers 429 with a stable error code that every locale translates.
Viewing an existing group and normal use stay unaffected.

## Notes from the reporter

- Use the Cloudflare Workers Rate Limiting binding configured in wrangler; no new npm dependency and no external
  service. API tests run it through Miniflare.
- Also send `Referrer-Policy: same-origin` so group links never leave the site in the Referer header.

## Plan

- `wrangler.jsonc`: a `GUESS_LIMITER` rate limiting binding, 20 per 60 seconds; `Env.GUESS_LIMITER` optional.
- `worker/throttle.ts`: `throttleFailure(c, kind)` counts one failure per client IP and kind; over the limit it
  throws `429 TOO_MANY_ATTEMPTS`.
- `worker/groupData.ts` `loadGroup`: counts a `lookup` failure before `GROUP_NOT_FOUND` (malformed codes included).
- `worker/routes/groups.ts` owner claim: counts an `owner` failure before `WRONG_OWNER_KEY` and `OWNER_KEY_REVOKED`.
- `shared/errors.ts` and both locales: `TOO_MANY_ATTEMPTS`.
- `worker/app.ts` and `index.html`: `Referrer-Policy: same-origin`.
- Tests: `tests/api/rate-limit-guessing.test.ts` through Miniflare's `ratelimits`.
- Docs: `docs/business-rules.md` (security section), `docs/design.md` (`rate_limit_guessing`).
