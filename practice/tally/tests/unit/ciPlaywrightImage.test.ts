import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflow = fs.readFileSync(path.resolve(__dirname, '../../../../.github/workflows/ci.yml'), 'utf8');
const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package-lock.json'), 'utf8'));

// The e2e job runs in the Playwright image so that browsers, system packages and fonts come with the image
// instead of an apt download on every run (e2e_runner_deps_install). The image must match the locked version.
describe('CI e2e container', () => {
  it('uses the Playwright image of the locked @playwright/test version', () => {
    const image = workflow.match(/container:\s*mcr\.microsoft\.com\/playwright:v([\d.]+)-noble/);
    expect(image?.[1]).toBe(lock.packages['node_modules/@playwright/test'].version);
  });

  it('does not install browser system packages at run time', () => {
    expect(workflow).not.toMatch(/playwright install/);
  });
});
