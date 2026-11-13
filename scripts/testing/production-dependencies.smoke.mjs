/** Run in an isolated prod-only copy, with node --import tsx.
 * Never boot the API/worker or execute a remote CLI operation.
 */
import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw new Error('PROD_SMOKE_NETWORK_BLOCKED'); };
for (const name of ['node:http', 'node:https']) {
  const mod = require(name); mod.request = deny; mod.get = deny;
}
const net = require('node:net');
net.connect = deny; net.createConnection = deny; net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
require('node:tls').connect = deny;
globalThis.fetch = async () => deny();
syncBuiltinESMExports();
assert.equal(process.env.DOTENV_CONFIG_PATH, '/dev/null');
assert.equal(process.env.NODE_ENV, 'production');
const forbidden = ['vitest', '@vitest/mocker', 'tinypool', 'vite', 'happy-dom',
  'drizzle-orm', 'supabase', 'pnpm', '@pgsql/parser'];
for (const name of forbidden) {
  assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' }, name);
}
const installed = await readdir(new URL('../../node_modules/.pnpm/', import.meta.url));
for (const name of forbidden) {
  assert(!installed.some(entry => entry.startsWith(name.replace('/', '+') + '@')),
    `dev package left physically installed: ${name}`);
}
assert.equal(require('tsx/package.json').version, '4.23.15');
assert.equal(typeof (await import('cross-env')).crossEnv, 'function');
const modules = [
  'server/ai/workflows/generationStore.ts',
  'server/ai/workflows/generationRuntime.ts',
  'server/ai/workflows/generationWorkerIdentity.ts',
  'server/ai/workflows/proposalRenderer.ts',
  'server/brandCapture.ts',
  'server/designCatalog/versionedCatalog.ts',
  'server/designCatalog/importFrozenCatalog.ts',
  'scripts/motorPreflight.ts',
  'harness/completeDesigns/importEditorialCatalog.ts',
  'server/routers.ts',
  'server/_core/supabaseAuth.ts',
];
for (const file of modules) await import(new URL('../../' + file, import.meta.url).href);
assert.equal(networkAttempts, 0);
console.log(JSON.stringify({ ok: true, scope: 'prod-only-imports', modules,
  forbiddenPackagesAbsent: forbidden, networkAttempts, workerStarted: false,
  applicationStarted: false, remoteJourneyValidated: false }));
