# The e2e job downloads Playwright system packages on every run since the runner image was pinned

| Field | Value |
|---|---|
| ID | `TAL-39` |
| Labels | `type::bug`, `priority::medium`, `area::ui` |
| Reporter | Opus (AI team lead) |
| Assignee | Haiku (developer) |
| Depends on | - |
| Related | `ci_actions_node24` |

## Description

After `8cd3aa4` (`ci: move GitHub Actions to Node 24 versions and pin the runner image`) the `e2e` job of CI run #12
on `develop` took 14 min 57 s of its 20 min `timeout-minutes`. The tests themselves took 1.2 min; the step
`npx playwright install --with-deps chromium` took 13 min 25 s. One more slow day and the job times out, which turns
`develop` red with no code change.

## Analysis

- `.github/workflows/ci.yml:37` now uses `runs-on: ubuntu-24.04` (was `ubuntu-latest`) and line 47 runs
  `npx playwright install --with-deps chromium`.
- On the pinned image, `--with-deps` has to apt-install 17 packages (fonts such as `fonts-wqy-zenhei`,
  `fonts-ipafont-gothic`, `fonts-freefont-ttf`, plus `libnss3`, `libglib2.0`, `xvfb` upgrades): 18.9 MB. In run #12 the
  Azure Ubuntu mirror served them at 24 kB/s and two packages had to be retried from `archive.ubuntu.com`
  ("Fetched 18.9 MB in 12min 58s").
- In run #11, a few minutes earlier on `ubuntu-latest`, the same step took 22 s because that image already had the
  packages. So the pin turned a near-no-op into a network download on every run, and the job duration now depends on
  apt mirror speed.
- The fonts installed this way are also part of the layout checks (see `docs/design.md`, the note on Linux fonts in
  CI), so the e2e font set now comes from whatever apt resolves on each run.
- Only one slow run has been seen so far; the dependency on the mirror is structural.

## Plan

1. Run the `e2e` job inside the official Playwright image that matches the locked version, so browsers and system
   packages are already present and the font set is fixed:
   ```yaml
   e2e:
     needs: test
     runs-on: ubuntu-24.04
     container: mcr.microsoft.com/playwright:v1.64.0-noble
   ```
   and remove the `npx playwright install --with-deps chromium` step. Set `HOME: /root` in the job `env` if
   Firefox/WebKit are ever added (not needed for Chromium).
2. Keep the image tag equal to `@playwright/test` in `package-lock.json` (now `1.64.0`). Add a short note next to
   the `container:` line and in `docs/design.md` that both change together, or add a unit test that reads the
   workflow and the lockfile and fails when they differ.
3. Alternative if a container is not wanted: cache `~/.cache/ms-playwright` keyed on the Playwright version, run
   `npx playwright install-deps chromium` with `-o Acquire::Retries=3`, and raise `timeout-minutes` only as a last
   resort.
4. Failing-first check: the current workflow shows the `install --with-deps` step downloading packages in its log;
   after the change the step is gone and no apt download appears.
5. Verify: the CI run on the merge request is green; the `e2e` job takes about 2 to 3 minutes; the layout specs
   (`exact-split`, `language-picker` one-row header, `ui-redesign`) still pass on desktop and mobile.

## Result

Branch: `fix/e2e_runner_deps_install` from `develop`. Plan step 1 and the unit-test option of step 2.

- `.github/workflows/ci.yml`: the `e2e` job runs in `mcr.microsoft.com/playwright:v1.64.0-noble`; the
  `npx playwright install --with-deps chromium` step is removed.
- `tests/unit/ciPlaywrightImage.test.ts` (new): the image tag equals the locked `@playwright/test` version, and the
  workflow installs no browser packages. Both cases failed before the change.
- `docs/design.md` (section 5, fonts): the CI font set comes from the image tag.

Typecheck, lint and 289 unit and API tests pass. The container itself is checked by the first CI run after the
push; the expected `e2e` job time is about 2 to 3 minutes.

## Review

Reviewed by the AI team lead; typecheck, 289 unit and API tests and 52 e2e tests pass on `develop`. Confirmed by the
human on `develop`.
Released in release/2026-10-27.
