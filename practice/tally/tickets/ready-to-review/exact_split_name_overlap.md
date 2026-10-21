# A long name runs under its exact share field on Linux

| Field | Value |
|---|---|
| Labels | `type::bug`, `priority::medium`, `area::ui` |
| Reporter | Team lead (first GitHub Actions run on `develop`) |
| Assignee | AI team lead |
| Depends on | - |
| Related | `exact_split_share_layout` |

## Description

The first GitHub Actions run on `develop` failed in the e2e job. On the desktop project, the check added by
`exact_split_share_layout` reports that the last participant name overlaps its share field by 7 px. The same suite
passes on Windows.

## Reproduce

1. Run the e2e suite on Linux (the GitHub Actions `ubuntu-latest` runner, or WSL Ubuntu with Node 22 and the
   Playwright Chromium build).
2. `e2e/exact-split.spec.ts` fails at the overlap assertion with `overlap in px per row: 0, 0, 0, 7`.
3. The fourth row is "Christopher".

## Analysis

The test is right; the layout only looks correct with the Windows system font. On Linux the system font is wider,
so "Christopher" is longer than its name column on desktop. The name label is a `field` block, which sets
`min-width: 0`, so the grid column does not grow with the text and the text runs into the share field next to it.
A long name without spaces can do the same at any width, as noted under "Not in scope" in
`exact_split_share_layout`.

## Plan

- Branch `fix/exact_split_name_overlap`.
- `.expense-form__name` gets `overflow-wrap: anywhere`, so a name wraps inside its column instead of running under
  the share field, whatever the font.
- The existing assertion in `e2e/exact-split.spec.ts` is the failing test: it fails on Linux before the change and
  passes after it. No new test is needed.
- `docs/design.md` (Interface) notes that layout checks must hold with the Linux fonts used in CI.

## Review

Approved by the AI team lead: typecheck, 179 unit and API tests and 20 e2e tests pass on Windows, and the 20 e2e
tests pass on Linux (WSL Ubuntu, Node 22, Playwright Chromium, `CI=1`), where the overlap assertion failed before
the change. The change is limited to the name element of the participant row; weight and equal modes keep their
layout.
