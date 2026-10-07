import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '..', '..');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(projectRoot, 'tml.js'), 'utf8'), context);
const catalog = context.window.TML_DIAGNOSTIC_DATA;
const steps = catalog.steps;

function branchTargets(step) {
  const targets = [];
  for (const key of ['yes', 'no', 'next']) {
    if (typeof step[key] === 'string') targets.push(step[key]);
  }
  for (const option of step.options || []) {
    if (typeof option.next === 'string') targets.push(option.next);
  }
  return targets;
}

test('TML catalog has a version and steps', () => {
  assert.match(catalog.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Object.keys(steps).length > 0);
});

test('TML step keys are unique', () => {
  const keys = Object.keys(steps);
  assert.equal(new Set(keys).size, keys.length);
});

test('TML branch targets point to existing steps', () => {
  for (const [key, step] of Object.entries(steps)) {
    for (const target of branchTargets(step)) {
      assert.ok(steps[target], `${key} points to missing step ${target}`);
    }
  }
});

test('TML terminal steps define a pass/fail outcome', () => {
  for (const [key, step] of Object.entries(steps)) {
    if (step.type === 'end') assert.equal(typeof step.pass, 'boolean', `${key} must define pass`);
  }
});
