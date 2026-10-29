# Hide the owner access notice after creating a group while signed in

| Field | Value |
|---|---|
| ID | `TAL-57` |
| Labels | `type::improvement`, `priority::low`, `area::ui` |
| Reporter | Product owner (human) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `owner_link_binds_account` |

## Description

After creating a group while signed in, the owner sees a card "Owner access is tied to your account" with a single
"I have saved it" button. There is nothing to save, so the card only adds a click. It should not be shown when the
owner is signed in.

## Acceptance criteria

- Creating a group while signed in opens the group page with no notice card and no recovery link.
- Creating a group as a guest still shows the recovery link banner.
- The members tab of an account-owned group still states that owner access is tied to the account.

## Plan

- `src/pages/GroupPage.tsx`: drop the `showOwnerNote` state and the `OwnerAccessNote` card.
- `src/components/OwnerKeyBanner.tsx`: remove `OwnerAccessNote`.
- `src/pages/HomePage.tsx`: stop passing `created` in the navigate state.
- `src/i18n/locales/*.ts`: remove the unused `ownerAccess.title`.
- `e2e/owner-link-binds-account.spec.ts` (OL-7): expect no notice. `account`, `joined-groups`, `saved-bank` and
  `transfer-ownership` specs: drop the dismiss click after a signed-in create and wait for the owner badge instead.
- `docs/business-rules.md`, `docs/design.md`: describe the page without the notice.

## Review

- Typecheck, lint, unit/API tests and the affected e2e specs pass. Merged into `develop`.

Confirmed by the human on local `develop`. Released in release/2026-10-29.
