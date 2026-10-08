import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../../js/diagnosticSteps.js'), 'utf8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(source, context);
const data = context.window.DIAGNOSTIC_DATA;
const validateCatalog = context.window.validateDiagnosticCatalog;

test('diagnostic data has a version', () => {
  assert.match(data.version, /^\d+\.\d+\.\d+$/);
});

test('diagnostic catalog is fully reachable from each configured start', () => {
  assert.equal(JSON.stringify(validateCatalog(data)), '[]');
});

for (const [name, steps] of Object.entries(data).filter(([, value]) => Array.isArray(value))) {
  test(`${name} has unique keys`, () => {
    const keys = steps.map(step => step.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test(`${name} has valid branch targets`, () => {
    const keys = new Set(steps.map(step => step.key));
    for (const step of steps) {
      for (const branch of [step.onYes, step.onNo]) {
        assert.ok(branch, `${step.key} is missing a branch`);
        const target = branch.jumpTo || branch.next;
        if (!branch.stop) assert.ok(keys.has(target), `${step.key} points to missing ${target}`);
      }
    }
  });
}
