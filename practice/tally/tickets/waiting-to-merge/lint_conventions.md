# Check the code conventions automatically

| Field | Value |
|---|---|
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Sonnet (QA tester) |
| Assignee | Developer (trainee) |
| Depends on | `claude_code_hooks` |
| Related | - |

## Description

The conventions in `CLAUDE.md` are checked only by reviewers: no user-facing text outside the locale files, BEM
class names, and colors only through the theme custom properties. Prettier formats the files Claude Code edits, but
nothing reports a broken convention. A lint step should report these problems locally and in CI, before review.

## Analysis

- ESLint with `typescript-eslint` does not support the TypeScript version the app uses (7.x; `typescript-eslint`
  accepts `<6.1`). Oxlint parses TypeScript and JSX on its own, needs no TypeScript peer, and accepts custom rules
  written as JavaScript plugins in the ESLint rule format. It covers the general checks (unused variables, React
  hooks rules) and runs the project rule for UI text.
- Stylelint with `stylelint-config-standard-scss` checks the SCSS files. Its built-in rules cover the two style
  conventions: `selector-class-pattern` for BEM names and `color-no-hex` with `color-named` for raw colors. The theme
  palette file `src/styles/base/_themes.scss` is the only place where raw colors are allowed.
- "No hard-coded UI text" becomes a custom Oxlint rule: text between JSX tags, and string literals in the attributes
  that users see or hear (`aria-label`, `title`, `placeholder`, `alt`), are reported. Text that is only whitespace or
  punctuation inside an expression (`{t('...')}`) is not affected.
- Prettier is already the layout through the `format-on-edit` hook. A Prettier check over the whole app would fail
  until every file is edited once, so it stays out of the lint step.

## Clarifying questions

1. Should the lint step fail CI?
2. Should existing violations be fixed in this branch, or only new ones reported?
3. Are the general recommended rules wanted, or only the project conventions?

## Answers

Answered by Opus (product owner):

1. Yes. `npm run lint` runs in the CI `test` job, after typecheck.
2. Fixed in this branch, so that CI stays green. A rule that would need a large rewrite is set to a narrower option
   and the reason is written next to it in the config.
3. Both: the default correctness rules of each tool plus the project conventions. Purely stylistic rules that
   Prettier already decides are turned off.

## Plan

Branch: `feat/lint_conventions` from `develop`.

Files:

- `practice/tally/package.json`: dev dependencies `oxlint`, `stylelint`, `stylelint-config-standard-scss`; scripts
  `lint:js` (`oxlint`), `lint:css` (`stylelint "src/**/*.scss"`) and `lint` (both). No other new dependency.
- `practice/tally/.oxlintrc.json`: plugins `typescript`, `react`, `react-hooks` (if available, else note it);
  `jsPlugins: ["./lint/tally-plugin.mjs"]`; rule `tally/no-literal-ui-text: error`; ignore `dist`, `.wrangler`,
  `test-results`, `playwright-report`. Tests and e2e specs may contain literal text: turn the custom rule off for
  `tests/**`, `e2e/**`, `scripts/**` and `worker/**` with `overrides`.
- `practice/tally/lint/tally-plugin.mjs` (new): plugin `tally` with rule `no-literal-ui-text`. Reports `JSXText`
  that contains a letter or digit, and `JSXAttribute` named `aria-label`, `title`, `placeholder` or `alt` whose value
  is a string literal containing a letter. Message: "User-facing text must come from t()/tp() in
  src/i18n/locales".
- `practice/tally/stylelint.config.mjs` (JavaScript, so each choice can carry a comment): extends
  `stylelint-config-standard-scss`.
  - `selector-class-pattern`: BEM, `^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$`.
  - `color-no-hex: true`, `color-named: "never"`, with an override for `src/styles/base/_themes.scss` that turns
    both off.
  - Rules that only restate layout Prettier already owns, or that would rewrite much of the existing code without
    catching bugs, are turned off with a one-line reason each.
- `.github/workflows/ci.yml`: `- run: npm run lint` after `npm run typecheck` in the `test` job.
- Existing violations: fix them in the app code (move literal text to both locale files `en.ts` and `vi.ts`, with
  `\uXXXX` escapes for Vietnamese in tests if any; rename non-BEM classes in both SCSS and TSX; replace raw colors
  with theme custom properties, adding a new property to both palettes in `_themes.scss` if none fits). Separate
  commits per kind of fix.

Tests:

- `practice/tally/tests/unit/lintRules.test.ts`: runs `npx oxlint` (through `node:child_process`) on small fixture
  files written to a temporary folder with a copy of `.oxlintrc.json` pointing at the plugin; checks that literal JSX
  text and a literal `aria-label` are reported, and that `{t('key')}`, whitespace and punctuation-only text are not.
- The same test runs Stylelint through its Node API (`stylelint.lint({ code, config })`) to check a non-BEM class, a
  hex color outside the theme file and a hex color in a file named like `_themes.scss`.
- `npm run lint`, `npm run typecheck`, `npm test` and `npx playwright test` pass.

Docs:

- `practice/tally/README.md` commands list and the repository `CLAUDE.md` Commands section: `npm run lint`.
- `CLAUDE.md` Styles/Language rules: one line saying `npm run lint` checks UI text, BEM and theme colors.
- `docs/design.md`: a short "Lint" paragraph (tools, why Oxlint instead of ESLint, where the custom rule lives).

## Merge request

Branch `feat/lint_conventions` into `develop`. The merge request is opened on GitLab from this branch; its link is
added when it exists.

What changed:

- `practice/tally/package.json`: added dev dependencies `oxlint`, `stylelint`, `stylelint-config-standard-scss` and
  scripts `lint:js`, `lint:css`, `lint`.
- `practice/tally/.oxlintrc.json` (new): plugins `typescript` and `react`, `jsPlugins: ["./lint/tally-plugin.mjs"]`,
  rule `tally/no-literal-ui-text: error`, ignored build output, and overrides disabling the custom rule for `tests/**`,
  `e2e/**`, `scripts/**` and `worker/**`.
- `practice/tally/lint/tally-plugin.mjs` (new): custom plugin `tally` with rule `no-literal-ui-text` that reports
  literal text in JSX children (`JSXText` with letters or digits) and user-facing attributes (`aria-label`, `title`,
  `placeholder`, `alt`).
- `practice/tally/stylelint.config.mjs` (new): extends `stylelint-config-standard-scss`, checks BEM selector pattern
  and disallows hex/named colors outside `_themes.scss`, with rules that Prettier owns turned off with a one-line reason.
- `.github/workflows/ci.yml`: added `npm run lint` step in the `test` job after `npm run typecheck`.
- `practice/tally/tests/unit/lintRules.test.ts` (new): unit tests for Oxlint custom plugin and Stylelint rules.
- Docs: updated `practice/tally/README.md`, repository `CLAUDE.md`, and `docs/design.md`.

How it was tested:

- `npm run lint`: 0 errors.
- `npm run typecheck`: 0 errors.
- `npm test`: 16 test files, 229 passed.
- `npx playwright test`: 22 passed across desktop and mobile.
- `node --test ../../.claude/hooks/*.test.mjs`: 28 tests, 28 passed.

