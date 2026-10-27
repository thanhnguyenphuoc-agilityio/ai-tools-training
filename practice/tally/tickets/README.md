# Tickets

Tickets work like issues on an issue board. Each ticket is one Markdown file named in short `snake_case` that
summarises the topic (for example `language_picker.md`). The **folder is the status**; a ticket changes status by
moving to another folder (`git mv`).

| Folder | Status | Open / closed |
|---|---|---|
| `backlog/` | Reported, not yet planned | open |
| `todo/` | Planned and clarified; ready to start | open |
| `in-progress/` | A branch exists and work is ongoing | open |
| `waiting-to-merge/` | Merge request into `develop` opened; the AI team lead runs e2e, reviews and merges | open |
| `ready-to-review/` | Merged into `develop`; waiting for the human to test the feature | open |
| `done/` | Confirmed by the human and released to `main` | closed |

## Ticket format

```markdown
# Short title

| Field | Value |
|---|---|
| ID | `TAL-<n>` |
| Labels | `type::feature`, `priority::medium`, `area::ui` |
| Reporter | Opus (AI team lead) |
| Assignee | - |
| Depends on | `other_ticket` |
| Related | - |

## Description            (or ## Question for type::question)

## Notes from the reporter (optional)
```

- **ID** is `TAL-<n>`: the next number after the highest ID on the board, assigned when the ticket is created and
  never reused or changed. Commit messages, merge requests and other tickets may cite the ID next to the file name
  (for example `TAL-9 language_picker`); branch names keep the ticket name. The next free ID is `TAL-41`.
- **Labels** follow GitLab scoped labels:
  - `type::` feature, bug, question or improvement. One `type::` label per ticket; a vague request stays
    `type::question` until it is clarified.
  - `priority::` high, medium or low.
  - `area::` auth, data, members, expenses, settle, ui or security.
  - `source::seeded` marks bugs planted for practice.
- **Reporter** is a simulated role (an AI model name plus its role in the project, such as Opus AI team lead,
  Sonnet QA tester, Haiku or Gemini end user), or `Human` for a request the trainee raises (see "Simulated roles" in the repository
  README).
- **Assignee** is set when the ticket moves to `in-progress/`.
- A question or a vague request is clarified before the ticket moves to `todo/`. The analysis goes into the ticket
  itself: `## Analysis`, `## Clarifying questions` with their `## Answers` (who answered), and `## Reproduce` for
  bugs.

## Workflow

| Step | Who | Branch | Ticket moves to |
|---|---|---|---|
| 1. Clarify the ticket (analysis, questions to the simulated reporter) | Developer | - | `todo/` |
| 2. Create `feat/<ticket_name>` or `fix/<ticket_name>` from `develop`, set the assignee | Developer | feature | `in-progress/` |
| 3. Finish the work, open a merge request into `develop`, link it in the ticket | Developer | feature | `waiting-to-merge/` |
| 4. Run typecheck, unit/API tests and e2e; review with the `review-checklist` skill; request changes or merge the merge request | AI team lead | feature, then `develop` | `ready-to-review/` (moved on the feature branch just before merging) |
| 5. Test the new feature on `develop` (locally or on a preview deploy); confirm or reject | Human | `develop` | - |
| 6. On confirmation, open `release/<yyyy-mm-dd>` from `develop` and move the confirmed tickets to `done/`; merge it into `develop` with a merge request, then open and merge a `develop` -> `main` merge request | AI team lead | release, `develop`, `main` | `done/` |

- If the lead requests changes in step 4, the ticket stays in `waiting-to-merge/` until the developer pushes fixes.
- If the human rejects a feature in step 5, the ticket moves back to `todo/` with a `## Feedback` section, and a
  `fix/<ticket_name>` branch follows the same steps.
- A release to `main` happens only when every ticket in `ready-to-review/` is confirmed. A rejected feature is
  fixed, or reverted on `develop` through a merge request, before the next release.
- `main` only ever contains features a human has tested; nothing is committed to `develop` or `main` directly.
  The exceptions (the Day 0 bootstrap commit, bug seeding with Prompt A and the conflict exercise) are listed in the
  repository `CLAUDE.md`.

## Dependencies

- `joined_groups_list`, `saved_bank_details`, `lock_groups` and `delete_account` need `google_sign_in`.
- `lock_groups` also needs `purge_inactive_groups`; `delete_account` also needs `saved_bank_details`.
- `owner_member_tools` is interface work on top of existing API endpoints.
