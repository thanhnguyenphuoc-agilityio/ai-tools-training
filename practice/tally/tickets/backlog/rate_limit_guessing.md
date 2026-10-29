# Throttle guessing of group codes and owner keys

| Field | Value |
|---|---|
| ID | `TAL-51` |
| Labels | `type::improvement`, `priority::low`, `area::security` |
| Reporter | Product owner (human) |
| Assignee | - |
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
