// PreToolUse hook: stops a Claude Code session from reading the exercise answer keys (`tally-*-answers.md`).
// The keys live in the folder that holds the repository (the "keys folder"), so they are never committed.
// Exit code 2 blocks the tool call and shows stderr to Claude; exit code 0 lets it run. Input that is not a
// hook payload is allowed.
//
// What is checked:
// - Read, Edit, NotebookEdit: `file_path` / `notebook_path`. Content fields (`old_string`, ...) are ignored.
// - Grep: `path` (default: the working directory) and `glob`. The search `pattern` is ignored.
// - Glob: `pattern`, resolved against `path` (default: the working directory).
// - Bash, PowerShell: the command, split into words. `cd` / `Set-Location` move the base for later words.
//   Text-only words are skipped: `git -m` / `--message` values, `echo` / `printf` / `Write-Output` / `Write-Host`
//   arguments and quoted heredoc bodies (`<<'EOF'`, PowerShell `@'...'@`). A `$(...)` or backtick substitution
//   inside such text is still checked, and so is the script of `bash -c` / `pwsh -Command`.
//
// A path or word is blocked when:
// - one of its path segments names `answer` together with `tally` or a glob character, or is a `tally*` glob;
// - it is a glob that can match a file directly in the keys folder (`../*.md`, `../**`);
// - it is the keys folder (or an ancestor) used as the root of Grep, Glob or a recursive shell search
//   (`grep -r`, `rg`, `find`, `Get-ChildItem -Recurse`, ...).
//
// Allowed on purpose: listing the keys folder (`ls ..`) shows names only; the Write tool is not matched, because
// the seeding prompts in practice/tally/PRACTICE.md create the keys with it.
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

/** True when a path segment names an answer key, or is a glob that could match one. */
function namesKey(text) {
  return text
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

/** Splits a command into segments of words. Quotes group text; `| ; & ( )`, newlines and Bash backticks split. */
function parseCommand(command, bash) {
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
      else if (bash && quote === '"' && c === '\\') word += command[++i] ?? '';
      else word += c;
    } else if (bash && c === '\\') {
      word = (word ?? '') + (command[++i] ?? '');
    } else if (c === "'" || c === '"') {
      quote = c;
      word ??= '';
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

/** Checks the `$(...)` and backtick substitutions inside a word as commands of their own. */
function checkSubstitutions(text, base, bash) {
  const pattern = bash ? /\$\(([^()]*)\)|`([^`]*)`/g : /\$\(([^()]*)\)/g;
  for (const match of text.matchAll(pattern)) checkCommand(match[1] ?? match[2], base, bash);
}

function checkCommand(command, base, bash) {
  const text = command
    .replace(/<<-?[ \t]*(['"])(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*\r?(?=\n|$)/g, (_, q, d, line) => line)
    .replace(/@'[ \t]*\r?\n[\s\S]*?\r?\n'@/g, "''");
  for (const all of parseCommand(text, bash)) {
    const start = all.findIndex((w) => !/^\w+=/.test(w)); // skip `VAR=value` prefixes
    if (start < 0) continue;
    const words = all.slice(start);
    const name = path.basename(words[0].replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
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
      checkSubstitutions(w, base, bash);
    }
    for (const w of checked) checkPath(w.startsWith('-') ? w.replace(/^[^=]*=?/, '') : w, base);
    const recursive =
      SEARCHES.has(name) ||
      (POSIX_RECURSIVE.has(name) && rest.some((w) => /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)$/.test(w))) ||
      (PS_RECURSIVE.has(name) && rest.some((w) => /^-r(e(c(u(r(se?)?)?)?)?)?$/i.test(w)));
    if (recursive) {
      const operands = checked.filter((w) => !w.startsWith('-')).slice(PATTERN_FIRST.has(name) ? 1 : 0);
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
