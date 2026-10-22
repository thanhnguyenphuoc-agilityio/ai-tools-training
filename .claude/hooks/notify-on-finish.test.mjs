// Run with: node --test .claude/hooks/notify-on-finish.test.mjs
// The hook runs with CLAUDE_NOTIFY=print, so it prints the notifier command instead of showing a notification.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./notify-on-finish.mjs', import.meta.url));
const PROJECT = path.resolve('/notify-test/work/tally-training');

function run(payload, env = {}) {
  const { CI, ...rest } = process.env;
  const result = spawnSync(process.execPath, [hook], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...rest, CLAUDE_PROJECT_DIR: PROJECT, CLAUDE_NOTIFY: 'print', ...env },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
const stop = { hook_event_name: 'Stop', stop_hook_active: false, cwd: PROJECT };

test('builds a notifier for each platform', () => {
  assert.equal(run(stop, { CLAUDE_NOTIFY_PLATFORM: 'win32' }).command, 'powershell');
  assert.equal(run(stop, { CLAUDE_NOTIFY_PLATFORM: 'darwin' }).command, 'osascript');
  assert.deepEqual(run(stop, { CLAUDE_NOTIFY_PLATFORM: 'linux' }), {
    command: 'notify-send',
    args: ['Claude Code', 'Finished in tally-training'],
  });
});

test('names only the project folder, never the full path', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const text = run(stop, { CLAUDE_NOTIFY_PLATFORM: platform }).args.join(' ');
    assert.match(text, /Finished in tally-training/);
    assert.doesNotMatch(text, /notify-test/);
  }
});

test('quotes a folder name with quotes for PowerShell and AppleScript', () => {
  const project = path.resolve(`/notify-test/it's "here"`);
  const win = run(stop, { CLAUDE_PROJECT_DIR: project, CLAUDE_NOTIFY_PLATFORM: 'win32' }).args.at(-1);
  assert.match(win, /'Finished in it''s "here"'/);
  const mac = run(stop, { CLAUDE_PROJECT_DIR: project, CLAUDE_NOTIFY_PLATFORM: 'darwin' }).args.at(-1);
  assert.match(mac, /"Finished in it's \\"here\\""/);
});

test('stays silent when turned off, in CI and on a repeated stop', () => {
  assert.equal(run(stop, { CLAUDE_NOTIFY: 'off' }), null);
  assert.equal(run(stop, { CI: 'true' }), null);
  assert.equal(run({ ...stop, stop_hook_active: true }), null);
});

test('still notifies on input that is not a hook payload', () => {
  assert.equal(run('not json', { CLAUDE_NOTIFY_PLATFORM: 'linux' }).command, 'notify-send');
});
