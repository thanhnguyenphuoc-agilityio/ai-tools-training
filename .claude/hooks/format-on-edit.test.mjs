// Run with: node --test .claude/hooks/format-on-edit.test.mjs (after `npm ci` in practice/tally)
// Each case copies a file into a temporary project that reuses the app's Prettier and `.prettierrc`, pipes a
// PostToolUse payload to the hook and checks the file afterwards. The hook must always exit with code 0.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./format-on-edit.mjs', import.meta.url));
const realApp = fileURLToPath(new URL('../../practice/tally/', import.meta.url));

const project = mkdtempSync(path.join(tmpdir(), 'format-hook-'));
const app = path.join(project, 'practice', 'tally');
mkdirSync(path.join(app, 'src'), { recursive: true });
cpSync(path.join(realApp, '.prettierrc'), path.join(app, '.prettierrc'));
cpSync(path.join(realApp, '.prettierignore'), path.join(app, '.prettierignore'));
writeFileSync(path.join(app, 'package.json'), '{}');
symlinkSync(path.join(realApp, 'node_modules'), path.join(app, 'node_modules'), 'junction');
after(() => rmSync(project, { recursive: true, force: true }));

function edit(relativePath, content, { tool = 'Edit', cwd = project } = {}) {
  const file = path.join(project, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: tool, tool_input: { file_path: file }, cwd }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(file, 'utf8');
}

test('formats an edited TypeScript file with the app settings', () => {
  const out = edit('practice/tally/src/sum.ts', 'export const sum = (a:number,b:number)=>{return a+b}\n');
  assert.equal(out, "export const sum = (a: number, b: number) => {\n  return a + b;\n};\n");
});

test('uses single quotes and a 120 character line from .prettierrc', () => {
  const long = `export const label = "${'x'.repeat(90)}";\n`;
  assert.equal(edit('practice/tally/src/label.ts', long, { tool: 'Write' }), long.replace(/"/g, "'"));
});

test('keeps the line endings the file already uses', () => {
  const out = edit('practice/tally/src/crlf.ts', 'export const a = {b:1}\r\nexport const c = 2\r\n');
  assert.equal(out, 'export const a = { b: 1 };\r\nexport const c = 2;\r\n');
});

test('formats SCSS', () => {
  assert.equal(edit('practice/tally/src/a.scss', '.a{color:red}\n'), '.a {\n  color: red;\n}\n');
});

test('leaves files outside the app, other extensions and ignored files unchanged', () => {
  const messy = 'const a  =  1\n';
  assert.equal(edit('tools/script.js', messy), messy);
  assert.equal(edit('practice/tally/docs/notes.md', '#  Title\n'), '#  Title\n');
  assert.equal(edit('practice/tally/dist/bundle.js', messy), messy);
});

test('keeps a file it cannot parse as written', () => {
  const broken = 'export const = ;\n';
  assert.equal(edit('practice/tally/src/broken.ts', broken), broken);
});

test('exits 0 on input that is not a hook payload', () => {
  const result = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
  assert.equal(result.status, 0);
});
