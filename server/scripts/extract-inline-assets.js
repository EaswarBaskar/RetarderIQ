import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(serverDir, '..', '..');

function extract(page, cssFile, jsFile, scriptPrefix) {
  const pagePath = path.join(root, page);
  let html = fs.readFileSync(pagePath, 'utf8');
  const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map(match => match[1].trim());
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1].trim()).filter(Boolean);

  if (styles.length) {
    fs.writeFileSync(path.join(root, cssFile), `${styles.join('\n\n')}\n`);
    html = html.replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi, '');
    html = html.replace('</head>', `  <link rel="stylesheet" href="${cssFile.replaceAll('\\', '/')}">\n</head>`);
  }

  if (scripts.length) {
    fs.writeFileSync(path.join(root, jsFile), `${scripts.join('\n\n')}\n`);
    html = html.replace(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
    const scriptTag = `  <script src="${scriptPrefix}"></script>\n`;
    html = html.replace('</body>', `${scriptTag}</body>`);
  }
  fs.writeFileSync(pagePath, html);
}

extract('index.html', 'css/index-inline.css', 'js/index-inline.js', 'js/index-inline.js');
extract('admin.html', 'css/admin-inline.css', 'js/admin.js', 'js/admin.js');
