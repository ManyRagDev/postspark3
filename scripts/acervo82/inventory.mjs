import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inventory, validateRoster } from './corpus.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const filename = path.join(root, 'designs/acervo82/manifest.json');
const actual = validateRoster(await inventory(root));
const serialized = JSON.stringify(actual, null, 2) + '\n';
if (process.argv.includes('--write')) {
  try { await writeFile(filename, serialized, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; if (await readFile(filename, 'utf8') !== serialized) throw new Error('roster_already_frozen; revise explicitly instead of overwriting'); }
} else if (await readFile(filename, 'utf8') !== serialized) throw new Error('roster_or_source_changed');
console.log(JSON.stringify({ entries: actual.entries.length, groups: Object.fromEntries(['reference','r9','concept'].map(g => [g, actual.entries.filter(e => e.group === g).length])), verifiedFiles: actual.files.length, sourceArchived: true, eligibleForGeneration: 0, externalCalls: 0 }));
