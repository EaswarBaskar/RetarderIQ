import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..', '..');
const source = fs.readFileSync(path.join(projectRoot, 'js', 'diagnosticSteps.js'), 'utf8');
const context = {
  window: {},
  document: { getElementById: () => null },
  console
};
vm.createContext(context);
vm.runInContext(source, context);

const catalog = context.window.DIAGNOSTIC_DATA;
const outputDir = path.join(projectRoot, 'data');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, `diagnosticSteps.v${catalog.version}.json`),
  `${JSON.stringify(catalog, null, 2)}\n`
);
console.log(`Exported diagnostic catalog v${catalog.version}.`);
