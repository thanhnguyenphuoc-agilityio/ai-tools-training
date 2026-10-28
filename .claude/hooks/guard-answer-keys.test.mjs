// Run with: node --test .claude/hooks/guard-answer-keys.test.mjs
// Each case pipes a synthetic payload to the hook and checks its exit code (2 = blocked, 0 = allowed).
// All paths are made up; no test touches a real answer key or the folder above the repository.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./guard-answer-keys.mjs', import.meta.url));

// The keys folder holds the repository. Neither folder needs to exist.
const PROJECT = path.resolve('/guard-test/training/repo');
const PARENT = path.dirname(PROJECT);
const KEY = path.join(PARENT, 'tally-seeded-answers.md');

function run(payload, project = PROJECT) {
  return spawnSync(process.execPath, [hook], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: 'utf8',
  });
}
function status(tool_name, tool_input, { cwd = PROJECT, project = PROJECT } = {}) {
  return run({ tool_name, tool_input, cwd }, project).status;
}
const blocked = (tool, input, options) =>
  assert.equal(status(tool, input, options), 2, `expected ${tool} ${JSON.stringify(input)} to be blocked`);
const allowed = (tool, input, options) =>
  assert.equal(status(tool, input, options), 0, `expected ${tool} ${JSON.stringify(input)} to be allowed`);

test('blocks file tools that name an answer key', () => {
  blocked('Read', { file_path: KEY });
  blocked('Read', { file_path: '../tally-review-answers.md' });
  blocked('Read', { file_path: '/home/sam/training/TALLY-REVIEW-ANSWERS.md' });
  blocked('Edit', { file_path: '../tally-review-answers.md', old_string: 'a', new_string: 'b' });
  blocked('NotebookEdit', { notebook_path: '../tally-review-answers.md', new_source: 'x' });
  blocked('Grep', { pattern: 'bug', path: '../tally-review-answers.md' });
});

test('blocks globs that could match an answer key', () => {
  blocked('Glob', { pattern: '../tally-*-answers.md' });
  blocked('Glob', { pattern: '../tally-*.md' });
  blocked('Glob', { pattern: '../*.md' });
  blocked('Glob', { pattern: '*.md', path: '..' });
  blocked('Glob', { pattern: `${PARENT.replace(/\\/g, '/')}/**/*.md` });
  blocked('Glob', { pattern: '**/*' }, { cwd: PARENT });
  blocked('Grep', { pattern: 'bug', glob: '*answers*' });
});

test('blocks searches rooted at the keys folder', () => {
  blocked('Grep', { pattern: 'bug', path: '..' });
  blocked('Grep', { pattern: 'bug', path: PARENT });
  blocked('Grep', { pattern: 'bug', path: '../..' });
  blocked('Grep', { pattern: 'bug' }, { cwd: PARENT });
});

test('blocks Bash commands that read a key or search the keys folder', () => {
  blocked('Bash', { command: 'cat ../tally-seeded-answers.md' });
  blocked('Bash', { command: 'cat "../tally-seeded-answers.md"' });
  blocked('Bash', { command: 'head -n 20 ../tally-*.md' });
  blocked('Bash', { command: 'cat ../*answers*' });
  blocked('Bash', { command: 'cat ../*.md' });
  blocked('Bash', { command: 'cat < ../tally-seeded-answers.md' });
  blocked('Bash', { command: 'npm test && cat ../tally-review-answers.md' });
  blocked('Bash', { command: 'echo "$(cat ../tally-seeded-answers.md)"' });
  blocked('Bash', { command: 'git commit -m "$(cat ../tally-seeded-answers.md)"' });
  blocked('Bash', { command: 'bash -c "cat ../tally-seeded-answers.md"' });
  blocked('Bash', { command: 'grep -r bug ..' });
  blocked('Bash', { command: 'grep -rn bug ../' });
  blocked('Bash', { command: 'rg bug ..' });
  blocked('Bash', { command: 'rg bug' }, { cwd: PARENT });
  blocked('Bash', { command: 'find .. -name "*.md"' });
  blocked('Bash', { command: 'cd .. && grep -r bug .' });
  blocked('Bash', { command: `grep -R --include=*.md bug "${PARENT.replace(/\\/g, '/')}"` });
});

test('checks the first word of each shell segment', () => {
  blocked('Bash', { command: '"$(cat ../tally-seeded-answers.md)"' });
  blocked('Bash', { command: '< ../tally-seeded-answers.md grep bug' });
  blocked('Bash', { command: 'echo "$(<../tally-seeded-answers.md)"' });
  blocked('PowerShell', { command: '"$(Get-Content ..\\tally-seeded-answers.md)"' });
  blocked('PowerShell', { command: '@"\n$(Get-Content ..\\tally-seeded-answers.md)\n"@' });
});

test('ignores variable names but checks the text around them', () => {
  allowed('PowerShell', {
    command: "$env:TALLY_BOARD_URL=[Environment]::GetEnvironmentVariable('TALLY_BOARD_URL','User'); node x.mjs",
  });
  allowed('PowerShell', { command: 'node x.mjs "$env:TALLY_BOARD_URL" | Select-Object -Last 3' });
  allowed('Bash', { command: 'TALLY_BOARD_REPO=a/b node x.mjs "${TALLY_BOARD_URL}"' });
  blocked('PowerShell', { command: 'Get-Content ..\\tally-$name-answers.md' });
  blocked('Bash', { command: 'cat ../tally-${X}*.md' });
  blocked('Bash', { command: 'cat "$HOME/tally-review-answers.md"' });
});

test('treats -e and --regexp as the pattern of a recursive search', () => {
  blocked('Bash', { command: 'grep -r -ebug ..' });
  blocked('Bash', { command: 'grep -r --regexp=bug ..' });
  blocked('Bash', { command: 'rg --regexp=bug ..' });
  allowed('Bash', { command: 'grep -rn -e parseAmount practice/tally' });
});

test('checks the script of a shell fed by a quoted heredoc', () => {
  blocked('Bash', { command: "bash <<'EOF'\ncat ../tally-seeded-answers.md\nEOF" });
  blocked('Bash', { command: "cat <<'EOF' | sh\ncat ../tally-seeded-answers.md\nEOF" });
});

test('checks option values glued to the option', () => {
  blocked('PowerShell', { command: 'Get-Content -Path:..\\tally-seeded-answers.md' });
  blocked('Bash', { command: 'grep -f../tally-seeded-answers.md x' });
});

test('treats the PowerShell backtick as an escape character', () => {
  blocked('PowerShell', { command: 'Write-Output "a`"b"; gc ..\\tally-seeded-answers.md' });
});

test('checks nested substitutions', () => {
  blocked('Bash', { command: 'echo "$(cat $(echo ../tally-seeded-answers.md))"' });
  allowed('Bash', { command: "git commit -m \"$(cat <<'EOF'\nfix: handle (nested) parentheses\nEOF\n)\"" });
});

test('treats only ls -R as a recursive listing in Bash', () => {
  allowed('Bash', { command: 'ls -ltr ..' });
  allowed('Bash', { command: 'ls -lart ..' });
  blocked('Bash', { command: 'ls -R ..' });
  blocked('PowerShell', { command: 'ls -r ..' });
});

test('blocks PowerShell commands that read a key or search the keys folder', () => {
  blocked('PowerShell', { command: 'Get-Content ..\\tally-seeded-answers.md' });
  blocked('PowerShell', { command: 'Get-Content ..\\tally-*' });
  blocked('PowerShell', { command: 'Write-Output (Get-Content ..\\tally-seeded-answers.md)' });
  blocked('PowerShell', { command: 'Get-ChildItem .. -Recurse | Select-String bug' });
  blocked('PowerShell', { command: 'gci -r ..\\ -Filter *.md' });
  blocked('PowerShell', { command: 'Select-String -Pattern bug -Path ..\\*' });
  blocked('PowerShell', { command: 'Set-Location ..; Get-ChildItem -Recurse' });
});

test('finds the keys folder from a git worktree', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'guard-test-'));
  try {
    const main = path.join(root, 'repo');
    const worktree = path.join(main, '.scratch', 'wt', 'topic');
    mkdirSync(path.join(main, '.git', 'worktrees', 'topic'), { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'topic')}\n`);
    const options = { cwd: worktree, project: worktree };
    blocked('Grep', { pattern: 'bug', path: root }, options);
    blocked('Glob', { pattern: '../../../../*.md' }, options);
    allowed('Grep', { pattern: 'bug', path: '..' }, options);
    allowed('Glob', { pattern: '../*.md' }, options);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('allows normal repository work', () => {
  allowed('Read', { file_path: path.join(PROJECT, 'README.md') });
  allowed('Read', { file_path: 'practice/tally/README.md' });
  allowed('Read', { file_path: '.claude/hooks/guard-answer-keys.mjs' });
  allowed('Edit', { file_path: 'CLAUDE.md', old_string: 'tally-*-answers.md', new_string: 'tally-*-answers.md.' });
  allowed('Grep', { pattern: 'answers', path: 'practice/tally' });
  allowed('Grep', { pattern: 'parseAmount' });
  allowed('Glob', { pattern: '**/*.md' });
  allowed('Glob', { pattern: 'practice/tally/tickets/*/*.md' });
  allowed('Bash', { command: 'cd practice/tally && npm test' });
  allowed('Bash', { command: 'grep -rn parseAmount practice/tally/shared' });
  allowed('Bash', { command: 'find . -name "*.md"' });
  allowed('Bash', { command: 'git commit -m "docs: never read tally-*-answers.md"' });
  allowed('Bash', { command: "git commit -am 'docs: mention ../tally-review-answers.md'" });
  allowed('Bash', { command: 'echo "keys: ../tally-*-answers.md"' });
  allowed('Bash', { command: "git commit -F - <<'EOF'\ndocs: keep tally-*-answers.md closed\nEOF" });
  allowed('Bash', { command: 'node --test .claude/hooks/guard-answer-keys.test.mjs' });
  allowed('Bash', { command: 'ls ..' });
  allowed('PowerShell', { command: 'Get-ChildItem practice\\tally -Recurse -Filter *.ts' });
  allowed('PowerShell', { command: 'Write-Output "tally-*-answers.md stays closed"' });
});

test('allows input that is not a hook payload', () => {
  assert.equal(run('not json').status, 0);
  assert.equal(run('').status, 0);
  assert.equal(run('null').status, 0);
  assert.equal(run({ tool_name: 'Write', tool_input: { file_path: KEY, content: 'x' } }).status, 0);
  assert.equal(run({ tool_name: 'Read' }).status, 0);
});

test('explains the block on stderr', () => {
  const result = run({ tool_name: 'Read', tool_input: { file_path: KEY }, cwd: PROJECT });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /answer keys/);
});
