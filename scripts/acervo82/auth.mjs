import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readLocalEnvironment } from "./environment.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = await readLocalEnvironment(root); // Reject hosted endpoints and auth bypass.
const credentialsPath = path.join(root, ".acervo82-local/test-account.json");
const action = process.argv[2];
if (!["setup", "verify"].includes(action))
  throw new Error("Use setup or verify");
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const checked = result => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
let account;
try {
  account = JSON.parse(await readFile(credentialsPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (action === "setup") {
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      await readFile(
        new URL("../../ops/acervo82/auth-fixture.sql", import.meta.url),
        "utf8"
      )
    );
    await db.query("COMMIT");
    if (account) {
      if (
        account.supabaseUrl !== env.SUPABASE_URL ||
        account.email !== "acervo82@postspark.test"
      )
        throw new Error("test_account_environment_mismatch");
      const { user } = checked(await admin.auth.admin.getUserById(account.id));
      if (
        user.email !== account.email ||
        user.app_metadata?.acervo82_fixture !== true
      )
        throw new Error("test_account_identity_mismatch");
    } else {
      const password = randomBytes(24).toString("base64url");
      const email = "acervo82@postspark.test";
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { role: "admin", acervo82_fixture: true },
          user_metadata: { full_name: "Acervo 82 · Teste local" },
        })
      );
      account = { id: user.id, email, password, supabaseUrl: env.SUPABASE_URL };
      await writeFile(
        credentialsPath,
        `${JSON.stringify(account, null, 2)}\n`,
        { flag: "wx", mode: 0o600 }
      );
    }
    await chmod(credentialsPath, 0o600);
    await db.query(
      "INSERT INTO acervo82_private.access_grants(user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [account.id]
    );
    const filename = path.join(root, ".acervo82-local/.env");
    const current = await readFile(filename, "utf8");
    const next = /^VITE_POSTSPARK_LOCAL_AUTH=/m.test(current)
      ? current.replace(
          /^VITE_POSTSPARK_LOCAL_AUTH=.*$/m,
          "VITE_POSTSPARK_LOCAL_AUTH=email"
        )
      : `${current.trimEnd()}\nVITE_POSTSPARK_LOCAL_AUTH=email\n`;
    await writeFile(filename, next, { mode: 0o600 });
    console.log(
      JSON.stringify({
        localOnly: true,
        account: account.email,
        credentials: ".acervo82-local/test-account.json",
        authBypass: false,
        applicationSchemaComplete: false,
      })
    );
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
} else {
  if (!account || account.supabaseUrl !== env.SUPABASE_URL)
    throw new Error("Run local auth setup first");
  const auth = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const app = `http://127.0.0.1:${env.PORT}`;
  const checks = [];
  const check = (name, ok) => {
    checks.push({ name, ok });
    if (!ok) throw new Error(`verification_failed:${name}`);
  };
  try {
    const wrong = await auth.auth.signInWithPassword({
      email: account.email,
      password: `${account.password}-wrong`,
    });
    check("wrong-password-rejected", !!wrong.error && !wrong.data.session);
    const { session, user } = checked(
      await auth.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      })
    );
    check(
      "real-local-user",
      user.id === account.id && user.app_metadata.role === "admin"
    );
    const invalid = await fetch(`${app}/api/auth/supabase-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: "invalid-local-probe" }),
    });
    check(
      "invalid-token-rejected",
      invalid.status === 401 && !invalid.headers.get("set-cookie")
    );
    const response = await fetch(`${app}/api/auth/supabase-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: session.access_token }),
    });
    const cookie = response.headers.get("set-cookie");
    check(
      "session-bridge-cookie",
      response.ok &&
        cookie?.includes("HttpOnly") &&
        (await response.json()).id === account.id
    );
    const me = async headers =>
      (await (await fetch(`${app}/api/trpc/auth.me`, { headers })).json())
        .result?.data?.json;
    check(
      "backend-recognizes-user",
      (await me({ Cookie: cookie.split(";")[0] }))?.id === account.id
    );
    check("no-cookie-no-user", (await me({})) === null);
    const logout = await fetch(`${app}/api/auth/supabase-logout`, {
      method: "POST",
      headers: { Cookie: cookie.split(";")[0] },
    });
    check(
      "bridge-logout-clears-cookie",
      logout.ok &&
        logout.headers.get("set-cookie")?.includes("Expires=Thu, 01 Jan 1970")
    );
    await db.connect();
    const access = await db.query(
      `select postspark.has_manylabs_app_access($1) as allowed,
      postspark.ensure_manylabs_app_access('00000000-0000-4000-8000-000000000099', $2, 'admin') as denied`,
      [account.id, account.email]
    );
    check(
      "explicit-grant-only",
      access.rows[0].allowed === true && access.rows[0].denied === false
    );
    const rights = await db.query(`select r.rolname,
      has_function_privilege(r.oid, 'postspark.ensure_manylabs_app_access(uuid,text,text)', 'EXECUTE') as execute,
      has_table_privilege(r.oid, 'acervo82_private.access_grants', 'SELECT') as read
      from pg_roles r where rolname in ('anon','authenticated')`);
    check(
      "browser-cannot-grant-access",
      rights.rows.length === 2 && rights.rows.every(r => !r.execute && !r.read)
    );
    const rls = await db.query(
      `select relrowsecurity from pg_class where oid = 'acervo82_private.access_grants'::regclass`
    );
    check("grant-table-rls", rls.rows[0].relrowsecurity === true);
    console.log(
      JSON.stringify({
        localOnly: true,
        checks,
        fullProductJourneyVerified: false,
      })
    );
  } finally {
    // Revoke only the verifier's session; leave the user's browser sessions intact.
    await auth.auth.signOut({ scope: "local" });
    await db.end();
  }
}
