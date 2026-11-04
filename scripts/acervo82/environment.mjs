import { parse } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const loopback = new Set(['127.0.0.1','localhost','[::1]']);
export function localUrl(value, name) {
  const url = new URL(value);
  if (!loopback.has(url.hostname) || !['http:','postgresql:','postgres:'].includes(url.protocol) || url.search || url.hash) throw new Error(`non_local_endpoint:${name}`);
  return url;
}
export function validateEnvironment(env, { requireKeys = true } = {}) {
  if (env.POSTSPARK_ACERVO82_LOCAL !== 'true' || env.NODE_ENV !== 'development') throw new Error('acervo82_local_profile_required');
  const server = localUrl(env.SUPABASE_URL, 'SUPABASE_URL');
  const client = localUrl(env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL');
  if (server.href !== client.href || server.pathname !== '/' || server.username || server.password) throw new Error('supabase_frontend_backend_mismatch');
  if (server.protocol !== 'http:') throw new Error('local_supabase_http_required');
  const database = localUrl(env.DATABASE_URL, 'DATABASE_URL');
  if (!['postgres:','postgresql:'].includes(database.protocol)) throw new Error('local_postgres_required');
  if (env.GENERATION_ADMISSION_PAUSED !== 'true' || env.GENERATION_LOCAL_DEMAND_ENABLED !== 'false') throw new Error('catalog_not_ready_admission_must_remain_paused');
  if (!/^\d+$/.test(env.PORT || '') || Number(env.PORT) < 1024 || Number(env.PORT) > 65535 || env.PORT === '3000') throw new Error('isolated_app_port_required');
  if (requireKeys && (!env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_ANON_KEY)) throw new Error('local_supabase_keys_missing');
  for (const [key, value] of Object.entries(env)) {
    if (value && /(?:API_KEY|SECRET|TOKEN|PASSWORD|SMTP|SCREENSHOT_SERVICE|OAUTH_SERVER|S3_|AWS_|GOOGLE_CLIENT)/.test(key)
      && !['SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_ANON_KEY'].includes(key)) throw new Error(`external_integration_not_enabled:${key}`);
  }
  return true;
}

export function sanitizedEnvironment(input, inherited = process.env) {
  validateEnvironment(input);
  const env = {};
  for (const key of ['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TERM','TMPDIR','XDG_CACHE_HOME','PNPM_HOME','SYSTEMROOT']) if (inherited[key]) env[key] = inherited[key];
  // The dedicated file is the only app configuration source. Vite's envDir is
  // redirected below; inherited credentials and NODE_OPTIONS are not forwarded.
  return { ...env, ...input, DOTENV_CONFIG_PATH: '/dev/null', POSTSPARK_ENV_DIR: input.POSTSPARK_ENV_DIR };
}

export function supabaseEnvironment(root, inherited = process.env) {
  const env = {};
  for (const key of ['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TERM','TMPDIR','SYSTEMROOT']) if (inherited[key]) env[key] = inherited[key];
  // The native PostgreSQL distribution invokes shell commands from its cache;
  // keep that cache outside the checkout name, which contains spaces here.
  return { ...env, SUPABASE_HOME: path.resolve(root, '..', '.supabase-local'),
    LANG: 'C', LC_ALL: 'C', DO_NOT_TRACK: '1' };
}
export async function readLocalEnvironment(root) {
  const directory = path.join(root, '.acervo82-local');
  const input = parse(await readFile(path.join(directory, '.env'), 'utf8'));
  input.POSTSPARK_ENV_DIR = directory;
  validateEnvironment(input);
  return input;
}
