---
name: review-checklist
description: Review a branch, merge request or diff in this training repo against the Day-3 checklist (correctness, tests, readability, security basics, scope) and write actionable comments. Use when asked to review, self-review before opening an MR, or check a teammate's MR.
---

# Review checklist (Day 3)

Review the change the user names (a branch, an MR, or the current diff against `develop`). If nothing is named,
use `git diff develop...HEAD`. Read the linked ticket in `practice/tally/tickets/` and the relevant parts of
`docs/business-rules.md` and `docs/design.md` first. Do not open any `*-answers.md` file.

Go through the checklist **in this order**. Importance falls from top to bottom:

1. **Correctness**: does it do what the ticket and business rules say? Edge cases: zero, one participant, rounding
   leftovers, duplicate members, deleted expenses, timezone/date boundaries, unclaimed members.
2. **Tests**: is there a test that would fail without the change? Are the assertions about behaviour, not
   implementation? Run `npm run typecheck` and `npm test` in `practice/tally` and report the result.
3. **Readability**: names, size of functions, matches surrounding code, comments explain *why*.
   Repo conventions: no user-facing text outside `src/i18n/locales` (and no Vietnamese anywhere else in source),
   new keys exist in every locale, SCSS follows BEM with tokens/mixins, colors only via theme custom properties,
   amounts stay integer minor units.
4. **Security basics**:
   - Input validation in `worker/http.ts` style.
   - Permission checks go through `worker/policy.ts`.
   - No secrets, tokens or real data committed.
   - Cookies stay HttpOnly.
   - No owner key or token in URLs that reach the server.
5. **Scope**:
   - Flag changes unrelated to the ticket.
   - Docs (`business-rules.md`, `design.md`) are updated when behaviour changes.
   - A schema change goes in a new migration.

## Output

For each finding, write one actionable comment in this form:

```
[severity: blocker | major | minor | nit] path/to/file.ts:LINE
What is wrong, with the concrete case that breaks: "when X, it returns Y".
Suggested fix: "guard it like Z" / "add a test that ...".
```

Then end with:
- **Verdict:** approve, approve with nits, or request changes.
- **Could I review this from the MR description alone?** Answer yes or no, and say what is missing.

Do not give verdicts without a reason ("looks good"). Do not invent problems to reach a count. If there are fewer
than three real findings, say so.
