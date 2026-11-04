import { spawn } from 'node:child_process';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { supabaseEnvironment, validateEnvironment } from './environment.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const action = process.argv[2];
const commands = {
  start: ['start','--runtime','native','--preparation','on-demand','--exclude','functions,analytics,pooler,realtime'],
  status: ['status','--output-format','json'],
  env: ['status','--env','--output-format','text'],
  stop: ['stop'],
};
if (!commands[action]) throw new Error('Only local start/status/env/stop are supported');
await mkdir(path.join(root, '.acervo82-local'), { recursive: true });
const filename = path.join(root, `.acervo82-local/supabase-${action}.log`);
const log = await open(filename, 'w', 0o600);
console.log(`Supabase local ${action}: output saved privately in .acervo82-local/supabase-${action}.log`);
const child = spawn(process.execPath, [path.join(root,'node_modules/supabase/dist/supabase.js'),...commands[action]], { cwd: root, env: supabaseEnvironment(root), stdio: ['ignore', log.fd, log.fd] });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', async error => { await log.close(); console.error(error.message); process.exitCode = 1; });
child.once('exit', async code => {
  await log.close();
  try {
    if (code === 0 && action === 'env') {
      const status = parse(await readFile(filename, 'utf8'));
      const envPath = path.join(root, '.acervo82-local/.env');
      let profile = await readFile(envPath, 'utf8');
      const values = { SUPABASE_URL: status.API_URL, VITE_SUPABASE_URL: status.API_URL,
        DATABASE_URL: status.DB_URL, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY || status.SECRET_KEY,
        VITE_SUPABASE_ANON_KEY: status.ANON_KEY || status.PUBLISHABLE_KEY };
      if (Object.values(values).some(v => !v || /[\r\n]/.test(v))) throw new Error('local_status_credentials_missing');
      const current = parse(profile);
      if (current.SUPABASE_URL !== values.SUPABASE_URL || current.DATABASE_URL !== values.DATABASE_URL) throw new Error('local_status_endpoint_mismatch');
      validateEnvironment({ ...current, ...values });
      for (const [key,value] of Object.entries(values)) profile = profile.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${JSON.stringify(value)}`);
      await writeFile(envPath, profile, { mode: 0o600 });
    }
    console.log(JSON.stringify({ action, exitCode: code, localOnly: true, log: `.acervo82-local/supabase-${action}.log` }));
    process.exitCode = code ?? 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
