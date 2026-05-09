import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envPath = path.join(root, ".env");
const outPath = path.join(root, "MANYLABS_SUPABASE_REST_AUDIT.json");

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

function monthKey(value) {
  if (!value) return "<none>";
  return String(value).slice(0, 7);
}

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function mapToRows(map, keyName, valueName) {
  return [...map.entries()]
    .map(([key, value]) => ({ [keyName]: key, [valueName]: value }))
    .sort((a, b) => {
      const av = a[valueName];
      const bv = b[valueName];
      if (bv !== av) return bv - av;
      return String(a[keyName]).localeCompare(String(b[keyName]));
    });
}

async function fetchOpenApi(supabaseUrl, key, schema) {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
      "Accept-Profile": schema,
    },
  });
  if (!res.ok) {
    return { schema, ok: false, status: res.status, error: await res.text() };
  }
  const json = await res.json();
  const tables = Object.keys(json.definitions || {}).sort();
  return { schema, ok: true, tables };
}

async function countTable(client, schema, table) {
  const query = client.schema(schema).from(table).select("*", {
    count: "exact",
    head: true,
  });
  const { count, error } = await query;
  if (error) return { schema, table, error: error.message, code: error.code };
  return { schema, table, count };
}

async function listUsersAggregated(client) {
  const perPage = 1000;
  let page = 1;
  let totalUsers = 0;
  let confirmedUsers = 0;
  let unconfirmedUsers = 0;
  const appIdCounts = new Map();
  const providerCounts = new Map();
  const createdByMonth = new Map();
  const usersWithAppId = new Map();
  const userMetadataKeyCounts = new Map();
  const appMetadataKeyCounts = new Map();

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    if (users.length === 0) break;

    for (const user of users) {
      totalUsers += 1;
      if (user.email_confirmed_at) confirmedUsers += 1;
      else unconfirmedUsers += 1;

      const appId = user.app_metadata?.app_id || "<none>";
      inc(appIdCounts, appId);
      if (appId !== "<none>") usersWithAppId.set(user.id, true);

      for (const provider of user.app_metadata?.providers || []) {
        inc(providerCounts, provider);
      }

      for (const key of Object.keys(user.user_metadata || {})) {
        inc(userMetadataKeyCounts, key);
      }
      for (const key of Object.keys(user.app_metadata || {})) {
        inc(appMetadataKeyCounts, key);
      }

      inc(createdByMonth, monthKey(user.created_at));
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return {
    total_users: totalUsers,
    confirmed_users: confirmedUsers,
    unconfirmed_users: unconfirmedUsers,
    users_with_app_id: usersWithAppId.size,
    app_id_counts: mapToRows(appIdCounts, "app_id", "users"),
    provider_counts: mapToRows(providerCounts, "provider", "users"),
    created_by_month: [...createdByMonth.entries()]
      .map(([month, users]) => ({ month, users }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    user_metadata_key_counts: mapToRows(userMetadataKeyCounts, "key", "users"),
    app_metadata_key_counts: mapToRows(appMetadataKeyCounts, "key", "users"),
  };
}

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env at ${envPath}`);
  }

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const schemasToInspect = ["public", "brincareducando", "postspark"];
  const openapi = [];
  for (const schema of schemasToInspect) {
    openapi.push(await fetchOpenApi(supabaseUrl, serviceRoleKey, schema));
  }

  const tableCounts = [];
  for (const schemaInfo of openapi) {
    if (!schemaInfo.ok) continue;
    for (const table of schemaInfo.tables) {
      tableCounts.push(await countTable(client, schemaInfo.schema, table));
    }
  }

  const knownBackfillTables = [
    { schema: "brincareducando", table: "user_roles" },
    { schema: "brincareducando", table: "perfis_criancas" },
    { schema: "brincareducando", table: "historias_favoritas" },
    { schema: "brincareducando", table: "diario_momentos" },
    { schema: "postspark", table: "profiles" },
    { schema: "postspark", table: "spark_transactions" },
    { schema: "postspark", table: "generation_sessions" },
    { schema: "postspark", table: "posts" },
    { schema: "postspark", table: "subscriptions" },
    { schema: "public", table: "profiles" },
    { schema: "public", table: "table_reune" },
    { schema: "public", table: "event_participants" },
    { schema: "public", table: "event_organizers" },
    { schema: "public", table: "event_confirmations" },
    { schema: "public", table: "friendships" },
    { schema: "public", table: "friend_requests" },
    { schema: "public", table: "waitlist_reune" },
  ];

  const knownBackfillCounts = [];
  for (const item of knownBackfillTables) {
    knownBackfillCounts.push(await countTable(client, item.schema, item.table));
  }

  const report = {
    generated_at: new Date().toISOString(),
    supabase_url: supabaseUrl,
    notes: [
      "REST/Admin audit only. Direct Postgres catalog audit failed from this machine.",
      "No emails, tokens, passwords, JWTs, API keys, or personal row payloads are included.",
      "Table discovery is limited to schemas exposed through PostgREST/OpenAPI.",
    ],
    auth: await listUsersAggregated(client),
    openapi,
    table_counts: tableCounts,
    known_backfill_counts: knownBackfillCounts,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
