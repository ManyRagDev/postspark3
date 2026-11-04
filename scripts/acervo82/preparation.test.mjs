import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';
import { inventory, validateRoster, validateRelease, checkedFile } from './corpus.mjs';
import { validateEnvironment, sanitizedEnvironment, supabaseEnvironment } from './environment.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...parse(await readFile(new URL('../../ops/acervo82/local.env.example', import.meta.url))), SUPABASE_SERVICE_ROLE_KEY: 'local-test-service-role', VITE_SUPABASE_ANON_KEY: 'local-test-anon' };

test('the frozen roster covers every original entry and verifies archived image/source bytes without network', async () => {
  const expected = JSON.parse(await readFile(new URL('../../designs/acervo82/manifest.json', import.meta.url)));
  const actual = validateRoster(await inventory(root));
  assert.deepEqual(actual, expected);
  assert.equal(actual.entries.filter(e => e.sourceKind === 'html-css-svg').length, 58);
  const changed = structuredClone(actual); changed.entries[0] = changed.entries[1];
  assert.throws(() => validateRoster(changed), /duplicate/);
  await assert.rejects(checkedFile(root, '../.env'), /unsafe_source_path/);
});
test('remote URLs, frontend/backend project mismatch and accidental admission are refused', () => {
  assert.equal(validateEnvironment(env), true);
  for (const change of [
    { SUPABASE_URL: 'https://production.supabase.co' },
    { VITE_SUPABASE_URL: 'http://localhost:54321' },
    { SUPABASE_URL: 'http://127.0.0.1.attacker.test:54321' },
    { DATABASE_URL: 'postgresql://user:pass@production.invalid/db' },
    { GENERATION_ADMISSION_PAUSED: 'false' },
    { BYPASS_AUTH: 'true' },
    { OPENROUTER_API_KEY: 'real-key-must-not-be-loaded' },
  ]) assert.throws(() => validateEnvironment({ ...env, ...change }));
});
test('the child does not inherit payment/provider credentials, NODE_OPTIONS or the production dotenv file', () => {
  const child = sanitizedEnvironment(env, { PATH: '/usr/bin', STRIPE_SECRET_KEY: 'payment', OPENROUTER_API_KEY: 'provider', NODE_OPTIONS: '--require=unsafe', DOTENV_CONFIG_PATH: '/production/.env', SUPABASE_URL: 'https://production.supabase.co' });
  assert.equal(child.OPENROUTER_API_KEY, undefined);
  assert.equal(child.STRIPE_SECRET_KEY, undefined);
  assert.equal(child.NODE_OPTIONS, undefined);
  assert.equal(child.DOTENV_CONFIG_PATH, '/dev/null');
  assert.equal(child.SUPABASE_URL, env.SUPABASE_URL);
  const cli = supabaseEnvironment(root, { PATH: '/usr/bin', SUPABASE_ACCESS_TOKEN: 'hosted-access', SUPABASE_DB_PASSWORD: 'hosted-password', SUPABASE_CLI_BINARY_OVERRIDE: '/unsafe', SUPABASE_EXPERIMENTAL_STACK: '0' });
  assert.equal(cli.SUPABASE_ACCESS_TOKEN, undefined);
  assert.equal(cli.SUPABASE_CLI_BINARY_OVERRIDE, undefined);
  assert.equal(cli.SUPABASE_DB_PASSWORD, undefined);
  assert.equal(cli.SUPABASE_HOME, path.resolve(root, '..', '.supabase-local'));
  assert.equal(cli.LC_ALL, 'C');
});
test('missing/duplicate entries or missing visual/journey evidence cannot satisfy the release receipt', async () => {
  const roster = JSON.parse(await readFile(new URL('../../designs/acervo82/manifest.json', import.meta.url)));
  const receipt = { format: 'postspark.acervo82.release', version: 1, entries: roster.entries.map((e, i) => ({ id: e.id, definitionId: `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`, definitionHash: 'a'.repeat(64), evidence: Object.fromEntries(['visualReview','alternateCopy','contentFit','saveReopen','export'].map(k => [k, 'b'.repeat(64)])) })) };
  assert.equal(validateRelease(roster, receipt), true);
  const incomplete = structuredClone(receipt); incomplete.entries.pop();
  assert.throws(() => validateRelease(roster, incomplete), /incomplete/);
  const duplicate = structuredClone(receipt); duplicate.entries[0] = duplicate.entries[1];
  assert.throws(() => validateRelease(roster, duplicate), /mismatch/);
  const unverified = structuredClone(receipt); delete unverified.entries[0].evidence.saveReopen;
  assert.throws(() => validateRelease(roster, unverified), /saveReopen/);
  const aliases = structuredClone(receipt); aliases.entries[0].definitionId = aliases.entries[1].definitionId;
  assert.throws(() => validateRelease(roster, aliases), /definition_reused/);
});
