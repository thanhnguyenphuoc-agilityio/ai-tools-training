// Run with: node --test .claude/workflow-src/build.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { WORKFLOWS, outputs } from './build.mjs';

const phaseCalls = (text) => [...text.matchAll(/phase: '([^']+)'/g)].map((m) => m[1]);
const declared = (text) => [...text.matchAll(/\{ title: '([^']+)'/g)].map((m) => m[1]);

test('the generated workflows match ticket-batch.js', () => {
  for (const { file, text } of outputs()) {
    assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), text, `run node .claude/workflow-src/build.mjs (${file})`);
  }
});

test('each workflow runs its agents itself, not in a nested workflow', () => {
  for (const { text } of outputs()) {
    assert.doesNotMatch(text, /\bworkflow\(/);
    assert.match(text, /^export const meta = \{/m);
  }
});

// Review runs only in thorough mode, so the fast workflow leaves it out.
const unused = { 'ticket-batch-thorough': null, 'ticket-batch-fast': 'Review' };

test('every phase a workflow can reach is declared, and no other', () => {
  for (const { file, text } of outputs()) {
    const name = Object.keys(unused).find((n) => file.endsWith(`${n}.js`));
    const reachable = [...new Set(phaseCalls(text))].filter((p) => p !== unused[name]);
    assert.deepEqual(declared(text).sort(), reachable.sort(), file);
  }
  assert.deepEqual(Object.keys(WORKFLOWS).sort(), ['ticket-batch-fast', 'ticket-batch-thorough']);
});
