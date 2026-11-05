import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import pg from "pg";
import type { AppRouter } from "../../server/routers";
import {
  INITIAL_POST,
  type CanvasPostModel,
} from "../../client/src/pages/CanvasLab/components/types";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "../../client/src/pages/CanvasLab/lib/saveAdapter";
// This module is used only by the isolated launcher. No product server imports.
import { readLocalEnvironment } from "./environment.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = await readLocalEnvironment(root);
const action = process.argv[2];
assert(["fixtures", "verify"].includes(action));
const app = `http://127.0.0.1:${env.PORT}`;
const directory = path.join(root, ".acervo82-local");
const account = JSON.parse(
  await readFile(path.join(directory, "test-account.json"), "utf8")
);
assert.equal(account.supabaseUrl, env.SUPABASE_URL);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = new pg.Client({ connectionString: env.DATABASE_URL });
const filename = path.join(directory, "fixtures.json");
const state: {
  posts: Record<string, number>;
  projectId?: string;
  mediaUrl?: string;
} = await readFile(filename, "utf8")
  .then(JSON.parse)
  .catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
    return { posts: {} };
  });
const sessions: Array<ReturnType<typeof createClient>> = [];
const checks: Array<{ name: string; ok: true }> = [];
function passed(name: string) {
  checks.push({ name, ok: true });
}
async function persist() {
  await writeFile(filename, JSON.stringify(state, null, 2) + "\n", {
    mode: 0o600,
  });
}
async function login(credentials: typeof account) {
  const auth = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  sessions.push(auth);
  const result = await auth.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (result.error) throw result.error;
  assert.equal(result.data.user.id, credentials.id);
  const bridge = await fetch(`${app}/api/auth/supabase-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: result.data.session.access_token }),
  });
  assert.equal(bridge.status, 200);
  const cookie = bridge.headers.get("set-cookie")!.split(";")[0];
  const api = createTRPCProxyClient<AppRouter>({
    links: [
      httpLink({
        url: `${app}/api/trpc`,
        transformer: superjson,
        headers: { Cookie: cookie },
      }),
    ],
  });
  return { api, cookie };
}
function model(kind: string, mediaUrl?: string): CanvasPostModel {
  const headlines =
    kind === "carousel"
      ? [
          "Carrossel de teste local",
          "Texto e identidade por slide",
          "Salvar, reabrir e exportar",
        ]
      : [kind === "media" ? "Mídia privada de teste" : "Post de teste local"];
  const post: CanvasPostModel = {
    ...structuredClone(INITIAL_POST),
    id: `acervo82-test-${kind}`,
    familyId: "minimal-air",
    familyName: "Teste técnico local",
    aspectRatio: "4:5",
    fontFamily: "Inter",
    headline: headlines[0],
    subtext:
      "Documento técnico para verificar edição e persistência. Não integra o catálogo dos 82 designs.",
    caption: `TESTE LOCAL · ${kind} · dados fictícios`,
    imagePrompt: undefined,
    overlayOpacity: 0,
    palette: { background: "#F7F4ED", text: "#162537", accent: "#D14B21" },
    currentSlideIndex: 0,
    slides: headlines.map((headline, i) => ({
      id: `${kind}-slide-${i + 1}`,
      step: `SLIDE ${i + 1}`,
      headline,
      subtext: `Etapa ${i + 1}: conteúdo fictício e editável.`,
      ...(kind === "media" ? { bgImage: mediaUrl } : {}),
    })),
    ...(kind === "media"
      ? { bgImage: mediaUrl, overlayOpacity: 0.65, overlayColor: "#F7F4ED" }
      : {}),
  };
  return post;
}
const input = (post: CanvasPostModel) =>
  canvasModelToSavePayload(post, {
    inputType: "text",
    inputContent: "Fixture técnica local · não integra os 82 designs",
  });

await db.connect();
const initialRequests = (await db.query("select count(*)::int as count from postspark.generation_v5_requests")).rows[0].count;
try {
  const { api, cookie } = await login(account);
  assert.equal((await api.auth.me.query())?.id, account.id);
  passed("authenticated-api");
  const profile = await api.billing.getProfile.query();
  assert.equal(profile.id, account.id);
  assert.equal(profile.plan, "DEV");
  passed("real-local-profile");
  const canvas = createCanvas(512, 512),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#16334D";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#E8A04E";
  ctx.fillRect(80, 80, 352, 352);
  const bytes = canvas.toBuffer("image/png");
  await writeFile(path.join(directory, "sample-upload.png"), bytes);
  const media = await api.post.saveMediaAsset.mutate({
    imageData: `data:image/png;base64,${bytes.toString("base64")}`,
  });
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(media.url, `/api/post-media/${account.id}/${hash}`);
  state.mediaUrl = media.url;
  passed("private-upload");
  const download = await fetch(`${app}${media.url}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  passed("private-download-exact-bytes");
  assert.equal((await fetch(`${app}${media.url}`)).status, 401);
  passed("anonymous-media-denied");
  for (const name of ["postspark-media", "design-arsenal"]) {
    const bucket = await admin.storage.getBucket(name);
    assert.ifError(bucket.error);
    assert.equal(bucket.data!.public, false);
  }
  passed("private-buckets");
  if (action === "fixtures") {
    for (const kind of ["static", "carousel", "media"]) {
      const existing = state.posts[kind]
        ? await api.post.get.query({ id: state.posts[kind] })
        : null;
      if (!existing) {
        state.posts[kind] = (
          await api.post.save.mutate(input(model(kind, media.url)))
        ).id;
        await persist();
      }
    }
    const projects = await api.brandProjects.list.query();
    if (!state.projectId || !projects.some(p => p.id === state.projectId)) {
      const result = await api.brandProjects.upsert.mutate({
        name: "Marca de teste local",
        niche: "Materiais fictícios para avaliação visual",
        sourceType: "form",
        structuredData: {
          offerAndTransformation:
            "Testar o fluxo de autoria sem serviços pagos.",
          factualDifferentials: "Dados fictícios locais.",
          targetAudience: "Equipe de testes",
          painsAndObjections: "",
          voiceTone: "Claro e direto",
          forbiddenTerms: "",
          defaultCta: "Confira o próximo slide.",
        },
        compiledDocument: "",
        isDefault: false,
      });
      state.projectId = result.project.id;
      await persist();
    }
    await persist();
    console.log(
      JSON.stringify({
        localOnly: true,
        fixtures: state,
        existingEditsPreserved: true,
        catalogEntriesCreated: 0,
        paidCalls: 0,
      })
    );
  } else {
    // One dedicated verification post; manual fixtures and their edits are never reset.
    const original = model("verification");
    const existingProbe = state.posts.verification
      ? await api.post.get.query({ id: state.posts.verification })
      : undefined;
    if (existingProbe)
      assert.equal(
        (existingProbe.canvas_model as { id?: string })?.id,
        original.id,
        "refusing-to-overwrite-unrecognized-verification-post"
      );
    if (!existingProbe) {
      state.posts.verification = (
        await api.post.save.mutate(input(original))
      ).id;
      await persist();
    }
    const id = state.posts.verification;
    const edited = structuredClone(original);
    edited.headline = "Persistência verificada localmente";
    edited.slides[0].headline = edited.headline;
    edited.slides[0].extraTexts = [
      {
        id: "note",
        text: "Caixa de texto editável",
        x: 110,
        y: 980,
        width: 700,
        fontSize: 32,
        fontFamily: "Inter",
        color: "#162537",
      },
    ];
    const payload = input(edited);
    const { inputType, inputContent, platform, ...update } = payload;
    await api.post.update.mutate({ id, ...update });
    const reopened = await api.post.get.query({ id });
    assert(reopened);
    assert.deepEqual(
      reopened.canvas_model,
      JSON.parse(JSON.stringify(payload.canvasModel))
    );
    passed("canonical-save-update-reopen");
    const restored = savedPostToCanvasModel(reopened);
    assert.equal(restored.slides[0].headline, edited.headline);
    assert.equal(
      restored.slides[0].extraTexts?.[0].text,
      "Caixa de texto editável"
    );
    passed("official-reopen-adapter");
    assert((await api.post.listSummary.query()).items.some(p => p.id === id));
    passed("saved-gallery-summary");
    assert(
      (await api.brandProjects.list.query()).some(p => p.id === state.projectId)
    );
    passed("brand-project-persisted");
    // A second, explicitly prepared local identity exercises owner isolation.
    const isolationFile = path.join(directory, "isolation-account.json");
    let other = await readFile(isolationFile, "utf8")
      .then(JSON.parse)
      .catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
        return null;
      });
    if (!other) {
      const email = "acervo82-isolation@postspark.test",
        password = randomBytes(24).toString("base64url");
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { acervo82_fixture: true },
        user_metadata: { full_name: "Contraprova local" },
      });
      if (result.error) throw result.error;
      other = {
        id: result.data.user.id,
        email,
        password,
        supabaseUrl: env.SUPABASE_URL,
      };
      await writeFile(isolationFile, JSON.stringify(other, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    }
    assert.equal(other.supabaseUrl, env.SUPABASE_URL);
    const otherIdentity = await admin.auth.admin.getUserById(other.id);
    assert.ifError(otherIdentity.error);
    assert.equal(otherIdentity.data.user.email, other.email);
    assert.equal(otherIdentity.data.user.app_metadata.acervo82_fixture, true);
    await db.query(
      "insert into acervo82_private.access_grants(user_id) values($1) on conflict do nothing",
      [other.id]
    );
    await db.query(
      "insert into postspark.profiles(id,email,plan,sparks) values($1,$2,'FREE',0) on conflict do nothing",
      [other.id, other.email]
    );
    const second = await login(other);
    assert(!(await second.api.post.get.query({ id })));
    await second.api.post.update.mutate({
      id,
      headline: "Tentativa de outro proprietário",
    });
    assert.equal((await api.post.get.query({ id }))!.headline, edited.headline);
    passed("post-owner-isolation");
    assert.equal(
      (
        await fetch(`${app}${media.url}`, {
          headers: { Cookie: second.cookie },
        })
      ).status,
      404
    );
    passed("media-owner-isolation");
    const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      db: { schema: "postspark" },
      auth: { persistSession: false },
    });
    assert((await anon.from("posts").select("id")).error);
    passed("browser-direct-db-denied");
    const safety = await db.query(
      "select (select active_revision is null from postspark.catalog_state where id=true) as empty_catalog, (select count(*)::int from postspark.generation_v5_requests) as requests"
    );
    assert.equal(safety.rows[0].empty_catalog, true);
    assert.equal(safety.rows[0].requests, initialRequests);
    passed("no-catalog-activation-or-generation");
    const rls = await db.query(
      "select count(*)::int as unprotected from pg_tables t join pg_class c on c.oid=(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))::regclass where t.schemaname='postspark' and not c.relrowsecurity"
    );
    assert.equal(rls.rows[0].unprotected, 0);
    passed("application-tables-rls");
    const immutable = await db.query(
      "select has_table_privilege('service_role','postspark.catalog_revisions','INSERT,UPDATE,DELETE') as writable"
    );
    assert.equal(immutable.rows[0].writable, false);
    passed("immutable-catalog-grants-preserved");
    const report = {
      localOnly: true,
      checks,
      paidCalls: 0,
      browserJourneyVerified: false,
      providerGenerationVerified: false,
    };
    await writeFile(
      path.join(root, "artifacts/acervo82/preparation/journey.json"),
      JSON.stringify(report, null, 2) + "\n"
    );
    console.log(JSON.stringify(report));
  }
} finally {
  for (const auth of sessions) await auth.auth.signOut({ scope: "local" });
  await db.end();
}
