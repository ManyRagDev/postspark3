import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const envPath = path.join(root, ".env");
const outPath = path.join(root, "MANYLABS_SUPABASE_AUDIT.json");
const localAuditRequire = createRequire(
  path.join(root, ".manylabs-audit", "node_modules", "pg", "package.json")
);
const { Client } = localAuditRequire("pg");

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = parsed.username.split(".")[0] || "***";
    return parsed.toString();
  } catch {
    return "<invalid>";
  }
}

function connectionCandidates(connectionString) {
  const candidates = [];
  const seen = new Set();

  function add(label, value) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push({ label, value });
  }

  add("original", connectionString);

  try {
    const parsed = new URL(connectionString);
    const projectFromHost = parsed.hostname.match(/^aws-[^.]+\.pooler\.supabase\.com$/)
      ? null
      : null;
    const projectFromUser = parsed.username.includes(".")
      ? parsed.username.split(".").pop()
      : "";
    const projectFromOptions = decodeURIComponent(parsed.searchParams.get("options") || "")
      .match(/project=([a-z0-9]+)/i)?.[1] || "";
    const projectRef = projectFromOptions || projectFromUser || projectFromHost || "";

    const noOptions = new URL(parsed.toString());
    noOptions.searchParams.delete("options");
    add("without_options", noOptions.toString());

    if (projectRef && parsed.username === "postgres") {
      const withTenantUser = new URL(parsed.toString());
      withTenantUser.username = `postgres.${projectRef}`;
      withTenantUser.searchParams.delete("options");
      add("tenant_username_without_options", withTenantUser.toString());
    }

    if (projectRef && parsed.username !== `postgres.${projectRef}`) {
      const tenantUser = new URL(parsed.toString());
      tenantUser.username = `postgres.${projectRef}`;
      add("tenant_username_original_query", tenantUser.toString());
    }

    if (projectRef) {
      const direct = new URL(parsed.toString());
      direct.hostname = `db.${projectRef}.supabase.co`;
      direct.port = "5432";
      direct.username = "postgres";
      direct.search = "";
      add("direct_db_host", direct.toString());
    }
  } catch {
    // Keep only original when URL parsing fails.
  }

  return candidates;
}

async function q(client, text, params = []) {
  const result = await client.query(text, params);
  return result.rows;
}

async function countDistinct(client, schema, table, column) {
  const sql = `
    select
      count(*)::bigint as total_rows,
      count(distinct ${quoteIdent(column)})::bigint as distinct_values
    from ${quoteIdent(schema)}.${quoteIdent(table)}
    where ${quoteIdent(column)} is not null
  `;
  const rows = await q(client, sql);
  return rows[0] ?? { total_rows: "0", distinct_values: "0" };
}

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env at ${envPath}`);
  }

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing in PostSpark 3 .env");
  }

  let client;
  let connectedCandidate;
  const attempts = [];
  for (const candidate of connectionCandidates(connectionString)) {
    try {
      const candidateClient = new Client({
        connectionString: candidate.value,
        ssl: { rejectUnauthorized: false },
      });
      await candidateClient.connect();
      client = candidateClient;
      connectedCandidate = candidate;
      break;
    } catch (error) {
      attempts.push({
        label: candidate.label,
        database_url_redacted: redactUrl(candidate.value),
        code: error.code,
        message: error.message,
      });
    }
  }

  if (!client || !connectedCandidate) {
    console.error(JSON.stringify({ connection_attempts: attempts }, null, 2));
    throw new Error("Could not connect to Supabase Postgres using DATABASE_URL candidates");
  }

  const report = {
    generated_at: new Date().toISOString(),
    connection: {
      database_url_redacted: redactUrl(connectedCandidate.value),
      connection_candidate: connectedCandidate.label,
      failed_attempts: attempts,
    },
    project: {},
    schemas: [],
    tables: [],
    auth: {},
    policies: [],
    auth_user_triggers: [],
    security_definer_functions: [],
    auth_user_references: [],
    user_link_columns: [],
    distinct_user_link_counts: [],
    supabase_settings: {},
    notes: [
      "No emails, access tokens, passwords, JWTs, API keys, or row-level personal payloads are included.",
      "Counts are intended for migration planning and should be reviewed before any write/backfill.",
    ],
  };

  report.project = (await q(client, `
    select
      current_database() as database,
      current_user as current_user,
      version() as postgres_version,
      now() as checked_at
  `))[0];

  report.supabase_settings = (await q(client, `
    select
      current_setting('pgrst.db_schemas', true) as pgrst_db_schemas,
      current_setting('pgrst.jwt_secret', true) is not null as has_pgrst_jwt_secret
  `))[0];

  report.schemas = await q(client, `
    select
      n.nspname as schema_name,
      count(c.oid) filter (where c.relkind in ('r','p'))::int as table_count,
      count(c.oid) filter (where c.relkind = 'v')::int as view_count,
      count(p.oid)::int as function_count
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid
    left join pg_proc p on p.pronamespace = n.oid
    where n.nspname not like 'pg_%'
      and n.nspname <> 'information_schema'
    group by n.nspname
    order by n.nspname
  `);

  report.tables = await q(client, `
    select
      n.nspname as schema_name,
      c.relname as table_name,
      case c.relkind
        when 'r' then 'table'
        when 'p' then 'partitioned_table'
        when 'v' then 'view'
        when 'm' then 'materialized_view'
        else c.relkind::text
      end as relation_type,
      coalesce(s.n_live_tup, c.reltuples)::bigint as estimated_rows,
      obj_description(c.oid) as comment
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname not like 'pg_%'
      and n.nspname <> 'information_schema'
      and c.relkind in ('r','p','v','m')
    order by n.nspname, c.relname
  `);

  report.auth = {
    users_summary: (await q(client, `
      select
        count(*)::bigint as total_users,
        count(*) filter (where email_confirmed_at is not null)::bigint as confirmed_users,
        count(*) filter (where email_confirmed_at is null)::bigint as unconfirmed_users,
        count(*) filter (where raw_app_meta_data ? 'app_id')::bigint as users_with_app_id,
        count(*) filter (where raw_user_meta_data <> '{}'::jsonb)::bigint as users_with_user_metadata
      from auth.users
    `))[0],
    app_id_counts: await q(client, `
      select
        coalesce(raw_app_meta_data->>'app_id', '<none>') as app_id,
        count(*)::bigint as users
      from auth.users
      group by 1
      order by users desc, app_id
    `),
    identity_provider_counts: await q(client, `
      select
        provider,
        count(*)::bigint as identities,
        count(distinct user_id)::bigint as users
      from auth.identities
      group by provider
      order by identities desc, provider
    `),
    created_by_month: await q(client, `
      select
        to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
        count(*)::bigint as users
      from auth.users
      group by 1
      order by 1
    `),
  };

  report.policies = await q(client, `
    select
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    from pg_policies
    where schemaname not like 'pg_%'
      and schemaname <> 'information_schema'
    order by schemaname, tablename, policyname
  `);

  report.auth_user_triggers = await q(client, `
    select
      tg.tgname as trigger_name,
      n.nspname as function_schema,
      p.proname as function_name,
      pg_get_triggerdef(tg.oid, true) as trigger_definition
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace cn on cn.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where cn.nspname = 'auth'
      and c.relname = 'users'
      and not tg.tgisinternal
    order by tg.tgname
  `);

  report.security_definer_functions = await q(client, `
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as security_definer,
      l.lanname as language,
      p.provolatile as volatility,
      (pg_get_functiondef(p.oid) ilike '%auth.users%') as references_auth_users,
      (pg_get_functiondef(p.oid) ilike '%service_role%') as references_service_role
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname not like 'pg_%'
      and n.nspname <> 'information_schema'
      and p.prosecdef = true
    order by n.nspname, p.proname, args
  `);

  report.auth_user_references = await q(client, `
    select
      ns.nspname as schema_name,
      cls.relname as table_name,
      att.attname as column_name,
      con.conname as constraint_name,
      conf_ns.nspname as referenced_schema,
      conf_cls.relname as referenced_table,
      conf_att.attname as referenced_column
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join pg_class conf_cls on conf_cls.oid = con.confrelid
    join pg_namespace conf_ns on conf_ns.oid = conf_cls.relnamespace
    join unnest(con.conkey) with ordinality as ck(attnum, ord) on true
    join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = ck.ord
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ck.attnum
    join pg_attribute conf_att on conf_att.attrelid = con.confrelid and conf_att.attnum = fk.attnum
    where con.contype = 'f'
      and conf_ns.nspname = 'auth'
      and conf_cls.relname = 'users'
    order by ns.nspname, cls.relname, att.attname
  `);

  report.user_link_columns = await q(client, `
    select
      table_schema as schema_name,
      table_name,
      column_name,
      data_type,
      udt_name
    from information_schema.columns
    where table_schema not in ('pg_catalog', 'information_schema')
      and table_schema not like 'pg_%'
      and column_name in (
        'user_id',
        'user_uuid',
        'usuario_id',
        'created_by',
        'owner_id',
        'profile_id',
        'id'
      )
    order by table_schema, table_name, column_name
  `);

  for (const row of report.user_link_columns) {
    if (row.schema_name === "auth") continue;
    if (!["uuid", "text", "bigint", "integer"].includes(row.udt_name)) continue;
    try {
      const counts = await countDistinct(client, row.schema_name, row.table_name, row.column_name);
      report.distinct_user_link_counts.push({
        schema_name: row.schema_name,
        table_name: row.table_name,
        column_name: row.column_name,
        total_rows_with_value: counts.total_rows,
        distinct_values: counts.distinct_values,
      });
    } catch (error) {
      report.distinct_user_link_counts.push({
        schema_name: row.schema_name,
        table_name: row.table_name,
        column_name: row.column_name,
        error: error.message,
      });
    }
  }

  await client.end();

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
