# Messages stay in the previous language after switching

| Field | Value |
|---|---|
| ID | `TAL-24` |
| Labels | `type::bug`, `priority::low`, `area::ui` |
| Reporter | Opus (AI team lead, code review of `language_picker`) |
| Assignee | - |
| Depends on | - |
| Related | `language_picker` |

## Description

Since `language_picker`, the interface language can change while a page is open. Most text follows the new language
at once, but a message already on screen does not: errors and status messages such as "Saved" stay in the language
that was active when they appeared, until the next action replaces them.

The reviewer expected every visible message to follow the language chosen in the header.

## Notes from the reporter

Seen in the code during review rather than through a user report. The components keep the translated text in state
(`setError(...)`, `setStatus(...)`), for example in `ExpenseForm`, `MembersPanel`, `SettlePanel`, `QrDialog`,
`GroupPage` and `HomePage`, so the text is fixed when the message is created.
