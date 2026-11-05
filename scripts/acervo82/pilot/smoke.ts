// Explicit live admission. Repeating a case in this session reuses its durable
// idempotency key instead of silently buying a second generation.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { orchestratedGenerationInputSchema } from "../../../shared/generationRequest";
import { readLocalEnvironment } from "../environment.mjs";

const env = await readLocalEnvironment(process.cwd());
const account = JSON.parse(
  await fs.readFile(".acervo82-local/test-account.json", "utf8")
);
const config = JSON.parse(
  await fs.readFile(
    process.env.POSTSPARK_ACERVO82_PILOT_CONFIG ?? ".acervo82-local/pilot.json",
    "utf8"
  )
);
assert.equal(config.supabaseUrl, env.SUPABASE_URL);
assert.equal(config.actor, account.id);
const cases = JSON.parse(
  await fs.readFile("designs/acervo82/pilot/cases.json", "utf8")
);
const test = cases.find((c: any) => c.id === (process.argv[2] ?? "static"));
assert(test, "Provide static, carousel or photo.");
const file = path.join(
  path.dirname(config.budgetFile),
  `smoke-${test.id}.json`
);
let receipt;
try {
  receipt = JSON.parse(await fs.readFile(file, "utf8"));
} catch (error: any) {
  if (error.code !== "ENOENT") throw error;
  receipt = {
    idempotencyKey: `acervo82-${config.session ?? "pilot"}-${test.id}-${randomUUID()}`,
  };
  await fs.writeFile(file, JSON.stringify(receipt, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
}
const input = orchestratedGenerationInputSchema.parse({
  ownerId: account.id,
  inputType: "text",
  content: test.content,
  platform: "instagram",
  postMode: test.postMode,
  ...(test.slides > 1 ? { slideCount: test.slides } : {}),
  aspectRatio: "4:5",
  creationMode: "ideation",
  generationModel: "gemini",
  includeDraftDesigns: true,
  formatIntentConfirmed: true,
  idempotencyKey: receipt.idempotencyKey,
});
const auth = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
try {
  const signed = await auth.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (signed.error) throw signed.error;
  const bridge = await fetch(
    `http://127.0.0.1:${env.PORT}/api/auth/supabase-session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: signed.data.session.access_token }),
    }
  );
  assert(bridge.ok);
  const api = createTRPCProxyClient<AppRouter>({
    links: [
      httpLink({
        url: `http://127.0.0.1:${env.PORT}/api/trpc`,
        transformer: superjson,
        headers: { Cookie: bridge.headers.get("set-cookie")!.split(";")[0] },
      }),
    ],
  });
  const capabilities = await api.generation.capabilities.query();
  assert.equal(capabilities.enabled, true, JSON.stringify(capabilities));
  const result = await api.generation.start.mutate(input);
  receipt = {
    ...receipt,
    requestId: result.snapshot.requestId,
    case: test.id,
    created: result.created,
    capabilities,
  };
  await fs.writeFile(file, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally {
  await auth.auth.signOut({ scope: "local" });
}
