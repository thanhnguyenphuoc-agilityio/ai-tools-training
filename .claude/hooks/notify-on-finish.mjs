// Stop hook: shows a desktop notification when Claude Code finishes a reply, so a long task can run while the
// developer works in another window. Windows uses a tray balloon (PowerShell), macOS `osascript`, Linux
// `notify-send` when it is installed. The notifier runs detached, so the hook returns at once.
//
// The message names only the folder of the project, never a full path. The hook never blocks and always exits
// with code 0.
//
// Environment:
// - `CLAUDE_NOTIFY=off` turns the notification off for one developer.
// - `CLAUDE_NOTIFY=print` prints the notifier command as JSON instead of running it (used by the tests).
// - `CI` set: no notification.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {
  // Not a hook payload: notify anyway, with the folder of the working directory.
}
const mode = (process.env.CLAUDE_NOTIFY ?? '').toLowerCase();
if (mode === 'off' || process.env.CI || input.stop_hook_active) process.exit(0);

const folder = path.basename(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const title = 'Claude Code';
const message = `Finished in ${folder}`;

function notifier(platform) {
  if (platform === 'win32') {
    const quote = (text) => `'${text.replace(/'/g, "''")}'`;
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$n = New-Object System.Windows.Forms.NotifyIcon',
      '$n.Icon = [System.Drawing.SystemIcons]::Information',
      '$n.Visible = $true',
      `$n.ShowBalloonTip(5000, ${quote(title)}, ${quote(message)}, 'Info')`,
      'Start-Sleep -Seconds 6',
      '$n.Dispose()',
    ].join('; ');
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', script]];
  }
  if (platform === 'darwin') {
    const quote = (text) => `"${text.replace(/["\\]/g, '\\$&')}"`;
    return ['osascript', ['-e', `display notification ${quote(message)} with title ${quote(title)}`]];
  }
  return ['notify-send', [title, message]];
}

const [command, args] = notifier(process.env.CLAUDE_NOTIFY_PLATFORM || process.platform);
if (mode === 'print') {
  process.stdout.write(JSON.stringify({ command, args }));
  process.exit(0);
}
try {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); // notifier not installed: no notification
  child.unref();
} catch {
  // Spawning failed: no notification.
}
process.exit(0);
