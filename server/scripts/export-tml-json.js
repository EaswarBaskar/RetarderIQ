import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'tml.js'), 'utf8'), context);
const catalog = context.window.TML_DIAGNOSTIC_DATA;
fs.writeFileSync(path.join(root, 'data', `tmlDiagnostic.v${catalog.version}.json`), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Exported TML catalog v${catalog.version}.`);
