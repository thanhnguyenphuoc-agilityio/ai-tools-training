// PreToolUse hook: stops a Claude Code session from reading the exercise answer keys (`tally-*-answers.md`).
// The keys live in the folder that holds the repository (the "keys folder"), so they are never committed.
// Exit code 2 blocks the tool call and shows stderr to Claude; exit code 0 lets it run. Input that is not a
// hook payload is allowed.
//
// What is checked:
// - Read, Edit, NotebookEdit: `file_path` / `notebook_path`. Content fields (`old_string`, ...) are ignored.
// - Grep: `path` (default: the working directory) and `glob`. The search `pattern` is ignored.
// - Glob: `pattern`, resolved against `path` (default: the working directory).
// - Bash, PowerShell: the command, split into words, the command name and `VAR=value` prefixes included. `cd` /
//   `Set-Location` move the base for later words. Option values are checked in the `--opt=value` and PowerShell
//   `-Param:value` forms; a value glued to a short option (`-fvalue`) is checked by name only.
//   Text-only words are skipped: `git -m` / `--message` values, `echo` / `printf` / `Write-Output` / `Write-Host`
//   arguments and quoted heredoc bodies (`<<'EOF'`, PowerShell `@'...'@`). A `$(...)` (nested too) or backtick
//   substitution inside such text is still checked, and so is the script of `bash -c` / `pwsh -Command` and a
//   quoted heredoc fed to a shell (`bash <<'EOF'`, `cat <<'EOF' | sh`).
//
// A path or word is blocked when:
// - one of its path segments names `answer` together with `tally` or a glob character, or is a `tally*` glob;
// - it is a glob that can match a file directly in the keys folder (`../*.md`, `../**`);
// - it is the keys folder (or an ancestor) used as the root of Grep, Glob or a recursive shell search
//   (`grep -r`, `rg`, `find`, `Get-ChildItem -Recurse`, ...).
//
// Allowed on purpose: listing the keys folder (`ls ..`, `ls -ltr ..`; in Bash only `ls -R` recurses) shows names
// only; the Write tool is not matched, because the seeding prompts in practice/tally/PRACTICE.md create the keys
// with it.
//
// Known limits. The hook guards against mistakes, not deliberate evasion; the CLAUDE.md rule still applies.
// - Names built at run time are not seen: variables (`f=answers; cat ../tally-x-$f.md`), concatenation, encoded
//   commands, interpreters that open files themselves (`node -e`, `python -c`), `ls .. | xargs cat`.
// - The shell parsing is approximate. Over-blocking is possible, for example a recursive search of a subfolder
//   after `cd ..`, or a regex word that looks like a key glob.
// - MCP tools are not checked.
// - If the hook cannot run (node not on PATH, `$CLAUDE_PROJECT_DIR` not expanded), nothing is blocked.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const GLOB_CHAR = /[*?[{]/;
const TEXT_COMMANDS = new Set(['echo', 'printf', 'write-output', 'write-host']);
const CD_COMMANDS = new Set(['cd', 'pushd', 'set-location', 'sl', 'chdir']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'pwsh', 'powershell', 'cmd']);
const SEARCHES = new Set(['rg', 'find', 'fd', 'tree']);
const POSIX_RECURSIVE = new Set(['grep', 'egrep', 'fgrep', 'ls']); // with -r, -R or --recursive
const PS_RECURSIVE = new Set(['dir', 'gci', 'get-childitem', 'ls']); // with -Recurse or a prefix of it
const PATTERN_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg']);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
if (!input || typeof input !== 'object') process.exit(0);

const tool = String(input.tool_name ?? '');
const args = input.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cwd = path.resolve(input.cwd || projectDir);
const keysDir = findKeysDir(projectDir);

function block(reason) {
  process.stderr.write(
    `Blocked: this ${tool} call ${reason}. The answer keys (tally-*-answers.md) stay closed (see CLAUDE.md). ` +
      'Ask the user if this is really needed.\n',
  );
  process.exit(2);
}

/** The keys folder is the parent of the main checkout. In a worktree, `.git` is a file pointing into it. */
function findKeysDir(dir) {
  let repo = path.resolve(dir);
  try {
    const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(path.join(repo, '.git'), 'utf8'))?.[1].trim() ?? '';
    const main = /^(.*)[\\/]\.git[\\/]worktrees[\\/]/.exec(gitdir);
    if (main) repo = path.resolve(main[1]);
  } catch {
    // `.git` is a folder or is missing: `dir` is the main checkout
  }
  return path.dirname(repo);
}

/**
 * True when a path segment names an answer key, or is a glob that could match one. Variable names (`$TALLY_X`,
 * `${TALLY_X}`, PowerShell `$env:TALLY_X`) are dropped first, so `$env:TALLY_X=[Environment]::...` is not read as a
 * `tally*[` glob; the text around a variable is still checked.
 */
function namesKey(text) {
  return text
    .replace(/\$(\{[^}]*\}|(env:)?\w+)/gi, '')
    .split(/[\\/]/)
    .some(
      (part) =>
        (/answer/i.test(part) && (/tally/i.test(part) || GLOB_CHAR.test(part))) || /tally[^*?[{]*[*?[{]/i.test(part),
    );
}

/** Resolves a path as typed; accepts `\`, `~` and Git Bash drive paths (`/c/...`). */
function toPath(text, base) {
  let p = text.replace(/\\/g, '/').replace(/^~(?=\/|$)/, homedir().replace(/\\/g, '/'));
  if (process.platform === 'win32') p = p.replace(/^\/([a-z])(?=\/|$)/i, '$1:/');
  return path.resolve(base, p);
}

/** True when `dir` is the keys folder or one of its ancestors. */
function holdsKeys(dir) {
  const rel = path.relative(dir, keysDir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True when an absolute glob can match a file directly in the keys folder: `../*`, `../*.md`, `../**`. */
function globReachesKeys(glob) {
  const parts = glob.split(/[\\/]/);
  const first = parts.findIndex((part) => GLOB_CHAR.test(part));
  if (first < 0) return false;
  const root = parts.slice(0, first).join(path.sep) + path.sep;
  if (!holdsKeys(root)) return false;
  const rest = parts.slice(first).filter(Boolean);
  const depth = path.relative(root, keysDir).split(/[\\/]/).filter(Boolean).length + 1;
  return rest.some((part) => part.includes('**')) || rest.length === depth;
}

/** Checks a path or word. `root`: it is the root of a recursive search. */
function checkPath(value, base, { root = false } = {}) {
  if (typeof value !== 'string' || value === '') return;
  if (namesKey(value)) block('names an answer key or a glob that could match one');
  const abs = toPath(value, base);
  if (GLOB_CHAR.test(value) ? globReachesKeys(abs) : root && holdsKeys(abs)) {
    block('reaches the folder that holds the answer keys');
  }
}

/**
 * Splits a command into segments of words. Quotes and `$(...)` group text; `| ; & ( )`, newlines and Bash
 * backticks split.
 * The escape character (`\` in Bash, backtick in PowerShell) works outside quotes and inside double quotes.
 */
function parseCommand(command, bash) {
  const escape = bash ? '\\' : '`';
  const segments = [[]];
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) segments.at(-1).push(word);
    word = null;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (quote === '"' && c === escape) word += command[++i] ?? '';
      else word += c;
    } else if (c === escape) {
      word = (word ?? '') + (command[++i] ?? '');
    } else if (c === "'" || c === '"') {
      quote = c;
      word ??= '';
    } else if (c === '$' && command[i + 1] === '(') {
      // Keep a substitution inside its word: `cat $(echo x)` reads the file the inner command prints.
      const end = substitutionEnd(command, i, bash);
      word = (word ?? '') + command.slice(i, end + 1);
      i = end;
    } else if (c === '#' && word === null) {
      while (i + 1 < command.length && command[i + 1] !== '\n') i++;
    } else if ('|;&()\n'.includes(c) || (bash && c === '`')) {
      endWord();
      if (segments.at(-1).length) segments.push([]);
    } else if (/\s/.test(c) || c === '<' || c === '>') {
      endWord();
    } else {
      word = (word ?? '') + c;
    }
  }
  endWord();
  return segments.filter((words) => words.length);
}

/** Index of the `)` that closes the `$(` at `start`, counting nested parentheses outside quotes. */
function substitutionEnd(text, start, bash) {
  const escape = bash ? '\\' : '`';
  let depth = 0;
  let quote = null;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === escape && quote !== "'") i++;
    else if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return text.length;
}

/** Checks the `$(...)` and backtick substitutions inside a word as commands of their own, nested ones included. */
function checkSubstitutions(text, base, bash) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '(') {
      const end = substitutionEnd(text, i, bash);
      checkCommand(text.slice(i + 2, end), base, bash);
      i = end;
    } else if (bash && text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end < 0) break;
      checkCommand(text.slice(i + 1, end), base, bash);
      i = end;
    }
  }
}

/** The lower-case command name of a word: `C:\Tools\Grep.exe` gives `grep`. */
function commandName(word) {
  return path.basename(word.replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
}

function checkCommand(command, base, bash) {
  const text = command
    .replace(/<<-?[ \t]*(['"])(\w+)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*\r?(?=\n|$)/g, (_, q, d, line, body, at, all) => {
      // A quoted heredoc body is text, unless it is the script of a shell (`bash <<'EOF'`, `cat <<'EOF' | sh`).
      const before = commandName(all.slice(0, at).split(/[\n;|&(]/).at(-1).trim().split(/\s+/)[0] ?? '');
      const piped = line.split('|').slice(1).map((part) => commandName(part.trim().split(/\s+/)[0] ?? ''));
      const shell = [before, ...piped].find((word) => SHELLS.has(word));
      if (shell) checkCommand(body, base, !['pwsh', 'powershell', 'cmd'].includes(shell));
      return line;
    })
    .replace(/@'[ \t]*\r?\n[\s\S]*?\r?\n'@/g, "''");
  for (const all of parseCommand(text, bash)) {
    for (const w of all) checkSubstitutions(w, base, bash);
    const start = all.findIndex((w) => !/^\w+=/.test(w)); // `VAR=value` prefixes
    for (const w of all.slice(0, start < 0 ? all.length : start)) checkPath(w.replace(/^\w+=/, ''), base);
    if (start < 0) continue;
    const words = all.slice(start);
    const name = commandName(words[0]);
    checkPath(words[0], base);
    const rest = words.slice(1);
    if (CD_COMMANDS.has(name)) {
      base = toPath(rest.find((w) => !w.startsWith('-')) ?? homedir(), base);
      continue;
    }
    const checked = [];
    for (let i = 0; i < rest.length; i++) {
      const w = rest[i];
      const textOnly =
        TEXT_COMMANDS.has(name) ||
        (name === 'git' && (/^--message=/.test(w) || /^(-[a-z]*m|--message)$/.test(rest[i - 1] ?? '')));
      if (SHELLS.has(name) && /^[-/](c|command)$/i.test(rest[i - 1] ?? '')) {
        checkCommand(w, base, !['pwsh', 'powershell', 'cmd'].includes(name));
      } else if (!textOnly) checked.push(w);
    }
    for (const w of checked) {
      if (!w.startsWith('-')) {
        checkPath(w, base);
        continue;
      }
      // Option value: `--file=x`, PowerShell `-Path:x`; a value glued without a separator (`-fx`) is name-checked.
      if (namesKey(w)) block('names an answer key or a glob that could match one');
      const value = bash ? /=(.*)$/s.exec(w) : /[=:](.*)$/s.exec(w);
      if (value) checkPath(value[1], base);
    }
    // `ls -r` is reverse order in Bash and `-Recurse` in PowerShell; grep takes `-r` and `-R`.
    const posixFlag = name === 'ls' ? /^(-[a-zA-Z]*R[a-zA-Z]*|--recursive)$/ : /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)$/;
    const recursive =
      SEARCHES.has(name) ||
      (POSIX_RECURSIVE.has(name) && (bash || name !== 'ls') && rest.some((w) => posixFlag.test(w))) ||
      (PS_RECURSIVE.has(name) && (!bash || name !== 'ls') && rest.some((w) => /^-r(e(c(u(r(se?)?)?)?)?)?$/i.test(w)));
    if (recursive) {
      // grep and rg take the pattern as the first operand, unless it is given with -e / --regexp / -f / --file.
      const patternOption = rest.some((w) => /^(-[a-zA-Z]*[ef]|--(regexp|file)(=|$))/.test(w));
      const skip = PATTERN_FIRST.has(name) && !patternOption ? 1 : 0;
      const operands = checked.filter((w) => !w.startsWith('-')).slice(skip);
      for (const op of operands.length ? operands : ['.']) checkPath(op, base, { root: true });
    }
  }
}

switch (tool) {
  case 'Read':
  case 'Edit':
  case 'NotebookEdit':
    checkPath(args.file_path ?? args.notebook_path, cwd);
    break;
  case 'Grep':
    checkPath(args.path || '.', cwd, { root: true });
    checkPath(args.glob, cwd);
    break;
  case 'Glob': {
    const base = args.path ? toPath(args.path, cwd) : cwd;
    if (typeof args.pattern === 'string') checkPath(args.pattern, base);
    break;
  }
  case 'Bash':
  case 'PowerShell':
    if (typeof args.command === 'string') checkCommand(args.command, cwd, tool === 'Bash');
    break;
}
process.exit(0);
