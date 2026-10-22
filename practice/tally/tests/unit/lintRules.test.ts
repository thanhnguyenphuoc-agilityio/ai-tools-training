import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error Stylelint config is an ES module without companion type declarations
import stylelintConfig from '../../stylelint.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Oxlint tally plugin (no-literal-ui-text)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tally-oxlint-test-'));
    const pluginPath = path.resolve(__dirname, '../../lint/tally-plugin.mjs').split(path.sep).join('/');
    const oxlintConfig = {
      plugins: ['typescript', 'react'],
      jsPlugins: [pluginPath],
      rules: {
        'tally/no-literal-ui-text': 'error',
      },
    };
    fs.writeFileSync(path.join(tmpDir, '.oxlintrc.json'), JSON.stringify(oxlintConfig, null, 2));
  });

  afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function runOxlint(filename: string, content: string) {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    const result = spawnSync('npx', ['oxlint', filename], {
      cwd: tmpDir,
      shell: true,
      encoding: 'utf8',
      timeout: 30000,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    };
  }

  it('reports literal text in JSX children', () => {
    const res = runOxlint('bad-text.tsx', 'export function Bad() { return <div>Hello world</div>; }\n');
    expect(res.status).not.toBe(0);
    expect(res.output).toContain('tally(no-literal-ui-text)');
    expect(res.output).toContain('User-facing text must come from t()/tp() in src/i18n/locales');
  });

  it('reports literal text in user-facing attributes like aria-label', () => {
    const res = runOxlint(
      'bad-attr.tsx',
      'export function BadAttr() { return <button aria-label="Submit form">icon</button>; }\n',
    );
    expect(res.status).not.toBe(0);
    expect(res.output).toContain('tally(no-literal-ui-text)');
  });

  it('allows translated expressions with t()', () => {
    const res = runOxlint(
      'good-expr.tsx',
      'declare const t: (k: string) => string;\nexport function Good() { return <div>{t("common.save")}</div>; }\n',
    );
    expect(res.status).toBe(0);
    expect(res.output).not.toContain('tally(no-literal-ui-text)');
  });

  it('allows whitespace and punctuation-only text', () => {
    const res = runOxlint(
      'good-punct.tsx',
      'declare const t: (k: string) => string;\nexport function Punct() { return <div>{t("label")}: </div>; }\n',
    );
    expect(res.status).toBe(0);
    expect(res.output).not.toContain('tally(no-literal-ui-text)');
  });
});

describe('Stylelint conventions', () => {
  it('reports non-BEM class selectors', async () => {
    const result = await stylelint.lint({
      code: '.myCamelCaseClass { display: block; }',
      config: stylelintConfig,
    });
    expect(result.errored).toBe(true);
    const rules = result.results[0].warnings.map((w) => w.rule);
    expect(rules).toContain('selector-class-pattern');
  });

  it('allows valid BEM class selectors', async () => {
    const result = await stylelint.lint({
      code: '.card__header--active { display: block; }',
      config: stylelintConfig,
    });
    expect(result.errored).toBe(false);
  });

  it('reports hex colors outside theme files', async () => {
    const result = await stylelint.lint({
      code: '.button { color: #123456; }',
      config: stylelintConfig,
      codeFilename: 'src/components/Button.scss',
    });
    expect(result.errored).toBe(true);
    const rules = result.results[0].warnings.map((w) => w.rule);
    expect(rules).toContain('color-no-hex');
  });

  it('allows hex colors inside _themes.scss', async () => {
    const result = await stylelint.lint({
      code: ':root { --color-accent: #0f766e; }',
      config: stylelintConfig,
      codeFilename: 'src/styles/base/_themes.scss',
    });
    expect(result.errored).toBe(false);
  });
});
