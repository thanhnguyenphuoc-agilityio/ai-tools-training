# UI text lint rule misses string literals inside JSX expressions

| Field | Value |
|---|---|
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `lint_conventions` |

## Description

`tally/no-literal-ui-text` is meant to enforce the CLAUDE.md rule that user-facing text, separators and arrows
included, comes only from `t()`/`tp()`. It reports bare JSX text, but the most common ways to hard-code a separator
or a label in JSX pass the lint without an error. The rule tests pass, so the gap is not visible today.

## Analysis

- Commits `5fd9824` (plugin) and `5b6658f` (symbol-only text); file `practice/tally/lint/tally-plugin.mjs:39-76`.
- The rule checks `JSXText` and, for `aria-label`, `title`, `placeholder` and `alt`, a plain string literal or
  `{"..."}`. It does not look at expression containers in JSX children, template literals or conditional expressions.
- Verified with the repository oxlint config: none of these is reported.

  ```tsx
  <span>{n}{' → '}</span>                      // symbol separator, the case 5b6658f meant to catch
  <p>{'Hello world'}</p>
  <p>{`Total: ${n}`}</p>
  <button aria-label={`Close`}>…</button>
  <p>{n > 0 ? 'Yes' : t('no')}</p>
  ```

- The current `src/` has no such case, so this is a guard gap, not an existing violation.

## Plan

1. In `lint/tally-plugin.mjs`, add a `JSXExpressionContainer` visitor for containers whose parent is a JSX element
   or fragment (children), and reuse it for the target attributes:
   - report a string `Literal` with visible text (`HAS_VISIBLE_TEXT`);
   - report a `TemplateLiteral` when any quasi has visible text;
   - recurse into `ConditionalExpression` (both branches) and `LogicalExpression` (right side).
   Keep whitespace-only literals such as `{' '}` allowed.
2. Leave `className`, `key`, `href` and other non-text attributes alone (they are not in `TARGET_ATTRS`).
3. Tests in `tests/unit/lintRules.test.ts` that fail before the change: one case each for `{' → '}`, `{'Hello'}`,
   a template literal child, `aria-label={\`Close\`}` and a ternary with a literal branch; plus an allowed case for
   `{' '}` and `{cond ? t('a') : t('b')}`.
4. Run `npm run lint` on the whole app and fix or justify anything newly reported.
5. Update the lint section of `docs/design.md` with the forms the rule now covers.
6. Verify: `npm run typecheck`, `npm run lint`, `npm test`.

## Merge request

Branch `feat/lint_ui_text_expression_literals` into `develop`.

What changed:
- `practice/tally/lint/tally-plugin.mjs`: added `JSXExpressionContainer` visitor for JSX child containers and extended target attribute checking to cover string literals, template literals, conditional expression branches, and logical expression right sides.
- `practice/tally/tests/unit/lintRules.test.ts`: added test cases for string literals, symbol separators, template literals, and conditional branches in children and attributes, plus allowed cases for whitespace and translated conditionals.
- `practice/tally/docs/design.md`: updated `lint_conventions` section with details on the expressions and literals checked by `tally/no-literal-ui-text`.

## Review

Reviewed by Opus (AI team lead) with `review-checklist`.

- `tally/no-literal-ui-text` now checks JSX expression containers in children and in the target attributes: string
  literals, template literals with visible text, both branches of a conditional and the right side of a logical
  expression, after unwrapping TypeScript casts and parentheses. `{' '}` stays allowed.
- One gap in the tests: the logical expression case had no test. Added `{cond && 'Yes'}` (reported).
- `npm run lint` reports nothing new in `src/`. After a rebase on `develop`: typecheck and lint pass, 239 tests pass
  (18 lint rule tests).

Released on 2026-10-23.
