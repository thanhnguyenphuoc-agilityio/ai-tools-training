// PostToolUse hook: formats an app file with Prettier right after Claude Code edits or writes it.
// Only files inside `practice/tally` with a code or style extension are formatted, with the Prettier copy and the
// `.prettierrc` of the app. Files Claude does not touch keep their layout, so the code base moves to the Prettier
// layout one edited file at a time instead of in one large reformatting commit.
//
// The hook never blocks: it always exits with code 0. Nothing happens when the input is not a hook payload, the
// file is outside the app, Prettier is not installed (`npm ci` not run yet), the file is listed in
// `.prettierignore`, or Prettier cannot parse it (the edit is kept as written and the type checker reports it).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss']);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const file = input?.tool_input?.file_path;
if (typeof file !== 'string' || !EXTENSIONS.has(path.extname(file).toLowerCase())) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const appDir = path.join(projectDir, 'practice', 'tally');
const target = path.resolve(input.cwd || projectDir, file);
const relative = path.relative(appDir, target);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) process.exit(0);

let prettier;
try {
  prettier = createRequire(path.join(appDir, 'package.json'))('prettier');
} catch {
  process.exit(0);
}

try {
  const info = await prettier.getFileInfo(target, { ignorePath: path.join(appDir, '.prettierignore') });
  if (info.ignored || !info.inferredParser) process.exit(0);
  const source = readFileSync(target, 'utf8');
  const options = await prettier.resolveConfig(target, { editorconfig: false });
  const formatted = await prettier.format(source, { ...options, filepath: target });
  if (formatted !== source) writeFileSync(target, formatted);
} catch {
  // A syntax error or an unreadable file: keep the edit as written.
}
process.exit(0);
