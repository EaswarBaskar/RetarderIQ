import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = fs.readdirSync(path.join(root, 'data', 'languages')).filter(file => file.endsWith('.json'));
const catalogs = files.map(file => JSON.parse(fs.readFileSync(path.join(root, 'data', 'languages', file), 'utf8')));

test('locale files contain valid UTF-8 text without common mojibake', () => {
  for (const catalog of catalogs) {
    for (const value of Object.values(catalog)) {
      if (typeof value === 'string') assert.doesNotMatch(value, /[àâï¿½�]/, value);
    }
  }
});

test('all locale files contain the same translation keys', () => {
  const expected = Object.keys(catalogs[0]).sort();
  for (const catalog of catalogs) assert.deepEqual(Object.keys(catalog).sort(), expected);
});
