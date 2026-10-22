# Format edited files and notify when Claude Code finishes

| Field | Value |
|---|---|
| Labels | `type::improvement`, `priority::medium`, `area::ui` |
| Reporter | Opus (product owner) |
| Assignee | Developer (trainee) |
| Depends on | `answer_key_guard` |
| Related | - |

## Description

The team rules for Claude Code sessions should be enforced by hooks rather than by reminders. `answer_key_guard`
added the first one, a `PreToolUse` hook that blocks a forbidden action. Two more are needed:

- Files that Claude Code edits should come out in one consistent layout, without a separate formatting step.
- A developer who starts a long task and switches to another window should be told when the session finishes.

## Analysis

- The app has no formatter. The code follows an informal layout: single quotes, semicolons, lines up to about 120
  characters. Running Prettier with `singleQuote` and `printWidth: 120` over the app changes 88 files, mostly by
  wrapping long JSX lines. Reformatting everything at once would produce one large diff that hides real changes
  and conflicts with every open branch.
- A `PostToolUse` hook runs after a tool call succeeds and receives the tool input, including `file_path` for
  `Edit`, `MultiEdit` and `Write`. Formatting only that file moves the code base to the Prettier layout one edited
  file at a time.
- A `Stop` hook runs when Claude Code finishes a reply. A desktop notification needs a different command on each
  operating system: a PowerShell tray balloon on Windows, `osascript` on macOS, `notify-send` on Linux. The
  notifier has to run detached so the hook does not delay the session, and it must not run in CI.
- Neither hook may block work: both exit with code 0 in every case, including missing tools and unparsable input.

## Clarifying questions

1. Should the whole app be reformatted once when Prettier is added?
2. Which files should the formatter touch?
3. Can a developer turn the notification off?

## Answers

Answered by Opus (product owner):

1. No. Only files that are edited are formatted; the rest keep their layout until someone changes them.
2. Code and style files inside `practice/tally` (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css`, `.scss`).
   Markdown and files outside the app are left alone.
3. Yes, with an environment variable, without editing the shared settings.

## Plan

Branch: `feat/claude_code_hooks` from `develop`.

Files:

- `practice/tally/package.json`: `prettier` as a dev dependency. `practice/tally/.prettierrc` (`singleQuote`,
  `printWidth: 120`, the closest match to the current code) and `.prettierignore` (build output, test reports,
  `package-lock.json`).
- `.claude/hooks/format-on-edit.mjs` (new): reads the hook payload, checks that the file is inside
  `practice/tally` with a code or style extension, loads Prettier from the app's `node_modules`, respects
  `.prettierignore`, and rewrites the file only when the output differs. A missing Prettier or a syntax error leaves
  the file as written.
- `.claude/hooks/notify-on-finish.mjs` (new): builds the notifier command for the platform and spawns it detached.
  The message names only the project folder, never a full path. `CLAUDE_NOTIFY=off`, `CI` or `stop_hook_active`
  turn it off; `CLAUDE_NOTIFY=print` prints the command for tests.
- `.claude/settings.json`: a `PostToolUse` entry for `Edit|MultiEdit|Write` and a `Stop` entry.

Tests (`node:test`):

- `.claude/hooks/format-on-edit.test.mjs`: a temporary project that reuses the app's Prettier and settings; checks
  a TypeScript and an SCSS file are formatted, the single quote and line width settings apply, files outside the
  app, Markdown and ignored files are unchanged, an unparsable file is kept, and the exit code is always 0.
- `.claude/hooks/notify-on-finish.test.mjs`: the command for each platform, no full path in the message, quoting
  of a folder name with quotes, silence when turned off, in CI and on a repeated stop.

Docs: the hooks row of the repository `README.md` (with the test command) and a `CLAUDE.md` rule that Prettier is
the code layout and whole folders are not reformatted.

## Merge request

Branch `feat/claude_code_hooks` into `develop`. The merge request is opened on GitLab from this branch; its link is
added when it exists.

What changed:

- `.claude/hooks/format-on-edit.mjs` (new): a `PostToolUse` hook for `Edit`, `MultiEdit` and `Write` that formats
  a code or style file inside `practice/tally` with the app's Prettier and keeps its line endings.
- `.claude/hooks/notify-on-finish.mjs` (new): a `Stop` hook that shows a desktop notification naming the project
  folder. `CLAUDE_NOTIFY=off` turns it off; it stays silent in CI.
- `.claude/settings.json`: registers both hooks next to the answer key guard.
- `practice/tally`: `prettier` as a dev dependency, `.prettierrc`, `.prettierignore`. `npm install` also added the
  existing `engines` field of `package.json` to `package-lock.json`, which was out of sync.
- `README.md` hooks row and a `CLAUDE.md` rule on Prettier.

How it was tested:

- `node --test .claude/hooks/*.test.mjs`: 28 tests, 28 passed (16 answer key guard, 7 format, 5 notify).
- The notify hook was run by hand on Windows: it returned at once with exit code 0 and left the notifier running.
- The app code is unchanged, so typecheck, unit/API tests and e2e are not affected.
