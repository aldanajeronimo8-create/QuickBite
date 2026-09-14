import { URL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { relative } from 'node:path';

const root = new URL('..', import.meta.url);
const roots = ['src', 'supabase', '.env.example', '.github/workflows', 'package.json'];
const forbidden = /google[\s_-]*sheets|GOOGLE_SHEETS_|export-google-sheets|google-apps-script/i;
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.sql', '.yml', '.yaml', '.env']);

async function collect(path, results = []) {
  const url = new URL(path + (path.endsWith('/') ? '' : '/'), root);
  try {
    const entries = await readdir(url, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
      if (entry.isDirectory()) await collect(path + entry.name + '/', results);
      else if (entry.name === '.env.example' || allowedExtensions.has('.' + entry.name.split('.').pop())) results.push(child);
    }
  } catch {
    // Missing optional roots are ignored; build/type/lint checks remain authoritative.
  }
  return results;
}

const files = [];
for (const target of roots) {
  if (target.endsWith('.example') || target === 'package.json') files.push(new URL(target, root));
  else await collect(target + '/', files);
}

const offenders = [];
for (const file of files) {
  try {
    const text = await readFile(file, 'utf8');
    if (forbidden.test(text)) offenders.push(relative(root.pathname, file.pathname));
  } catch {
    // Ignore unreadable optional files; CI reports build/type failures separately.
  }
}

if (offenders.length) {
  console.error('Legacy Google Sheets references found:');
  offenders.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log('Excel-only export guard passed: no runtime Google Sheets references found.');
