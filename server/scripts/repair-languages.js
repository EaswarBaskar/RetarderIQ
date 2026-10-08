import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'data', 'languages');
const english = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const cp1252 = new Map(Object.entries({
  '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96,
  '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f
}));

function repair(value) {
  if (typeof value !== 'string' || !/[àâ]/.test(value)) return value;
  const bytes = Uint8Array.from([...value].map(char => cp1252.get(char) ?? char.charCodeAt(0)));
  try {
    const decoded = Buffer.from(bytes).toString('utf8');
    return decoded.includes('�') ? value : decoded;
  } catch {
    return value;
  }
}

for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
  const input = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const output = Object.fromEntries(Object.entries({ ...english, ...input }).map(([key, value]) => [key, repair(value)]));
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(output, null, 2)}\n`);
}
