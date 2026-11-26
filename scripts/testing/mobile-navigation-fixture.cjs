const fs = require("fs"),
  path = require("path"),
  { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright-core");
const superjson = req("superjson");
const base = path.resolve(process.env.POSTSPARK_TEST_BUILD || "dist/public"),
  origin = "http://localhost",
  actor = "5c309bf8-76ff-451e-89e3-094b934e09cf";
const uid = "d26f907c-853f-45dc-aa51-199020c664f3",
  proj = "b59d3aac-9eaa-4015-b5b7-4c16ac5a695a",
  title = "Minha peça de teste";
const model = {
  id: "responsive-test",
  aspectRatio: "1:1",
  familyId: "editorial-poster",
  fontFamily: "Arial",
  subtextFontFamily: "Arial",
  headline: title,
  subtext: "Produto",
  palette: { text: "#fff", background: "#123456", accent: "#f08000" },
  slides: [
    { id: "s1", headline: title, step: "01", subtext: "Produto" },
    {
      id: "s2",
      temporalMedia: {
        __background__: { kind: "video", assetId: uid, muted: true },
      },
      headline: "Segundo slide",
      subtext: "Vídeo",
      step: "02",
    },
  ],
  currentSlideIndex: 0,
};
const initialRecord = {
  id: 7,
  revision: 1,
  headline: title,
  canvas_model: model,
  inputType: "text",
  inputContent: "Teste",
  createdAt: new Date().toISOString(),
  gallery_preview: null,
  slides: [{}, {}],
};

const currentUser = role =>
  role === "guest"
    ? null
    : {
        id: actor,
        email: "studio@example.test",
        name: "Conta de teste",
        studioPlan:
          role === "start" ? "START" : role === "owner" ? "AGENCY" : "PRO",
        role: role === "admin" ? "admin" : "user",
        ...(role === "reviewer" || role === "editor"
          ? { access: "agency" }
          : {}),
      };
const packages = [
  { id: "mini", name: "Recarga de teste", sparks: 100, price_brl: 19.9 },
];
function answer(key, role, payload, state) {
  switch (key) {
    case "auth.me":
      return currentUser(role);
    case "billing.getProfile":
      return { plan: "PRO", sparks: 345 };
    case "billing.statement":
      return {
        entries: [
          {
            cursor: "1",
            delta: -3,
            balance: 345,
            occurred_at: "2026-01-01T12:00:00Z",
          },
        ],
        next: null,
      };
    case "billing.usage":
      return { completedRounds: 4, nextRefill: new Date().toISOString() };
    case "billing.getTopupPackages":
      return packages;
    case "billing.annualFeatures":
      return { annual: false };
    case "billing.createTopupCheckout":
      return { url: origin + "/checkout-test" };
    case "post.listSummary":
      return { items: [state.saved], total: 1, hasMore: false };
    case "post.get":
      return state.saved;
    case "post.save":
    case "post.update":
      state.saved = {
        ...state.saved,
        canvas_model: JSON.parse(JSON.stringify(payload?.canvasModel || model)),
        revision: state.saved.revision + 1,
      };
      return { id: 7, revision: state.saved.revision };
    case "brandProjects.list":
    case "post.listGenerations":
      return [];
    case "startPilot.state":
      return { draft: null, finalized: null };
    case "admin.listProfiles":
      return [];
  }
  return null;
}
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const artifacts =
  process.env.POSTSPARK_MOBILE_ARTIFACTS ||
  fs.mkdtempSync(path.join(os.tmpdir(), "postspark-mobile-"));
fs.mkdirSync(artifacts, { recursive: true });
const clip = path.join(artifacts, "source.mp4");
function makeClip() {
  execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=128x128:rate=15:duration=3",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    clip,
  ]);
}
async function fixture(page, role) {
  const state = {
    saved: structuredClone(initialRecord),
    status: role === "reviewer" ? "review" : "draft",
  };

  await page.addInitScript(
    ({ role, actor }) => {
      localStorage.setItem(
        "postspark_consent_given",
        JSON.stringify({ given: true, version: "1.0" })
      );
      localStorage.setItem(
        "postspark_cookie_consent",
        JSON.stringify({ accepted: true, version: "1.0" })
      );
      if (role !== "guest") {
        let enc = s => btoa(JSON.stringify(s)).replaceAll("=", "");
        let expiry = Math.floor(Date.now() / 1000) + 7200,
          user = {
            id: actor,
            email: "studio@example.test",
            aud: "authenticated",
            app_metadata: { provider: "email" },
            user_metadata: {},
          };
        const session = {
          access_token:
            enc({ alg: "HS256", typ: "JWT" }) +
            "." +
            enc({ sub: actor, exp: expiry, role: "authenticated" }) +
            ".x",
          token_type: "bearer",
          expires_in: 7200,
          expires_at: expiry,
          refresh_token: "fixture-only",
          user,
        };
        localStorage.setItem("sb-api-auth-token", JSON.stringify(session));
        localStorage.setItem("sb-fixture-auth-token", JSON.stringify(session));
      }
    },
    { role, actor }
  );
  page.on("pageerror", e => console.log("ERROR", page.url(), e.message));
  await page.route("**/*", async r => {
    try {
      const u = new URL(r.request().url()),
        p = u.pathname;
      if (u.origin !== origin) return r.abort();
      if (p.startsWith("/api/trpc/")) {
        const keys = decodeURIComponent(p.slice(10)).split(","),
          input = JSON.parse(
            u.searchParams.get("input") || r.request().postData() || "{}"
          );
        const reply = keys.map((k, i) => ({
          result: {
            data: superjson.serialize(
              answer(
                k,
                role,
                input[i] ? superjson.deserialize(input[i]) : undefined,
                state
              )
            ),
          },
        }));
        return r.fulfill({
          json: u.searchParams.has("batch") ? reply : reply[0],
        });
      }
      if (p.startsWith("/api/studio-media/")) {
        const buf = fs.readFileSync(clip),
          range = /^bytes=(\d+)-(\d*)$/.exec(r.request().headers().range || "");
        if (!range) return r.fulfill({ body: buf, contentType: "video/mp4" });
        const start = Number(range[1]),
          end = Math.min(
            range[2] ? Number(range[2]) : buf.length - 1,
            buf.length - 1
          );
        return r.fulfill({
          status: 206,
          body: buf.subarray(start, end + 1),
          headers: {
            "content-type": "video/mp4",
            "accept-ranges": "bytes",
            "content-range": "bytes " + start + "-" + end + "/" + buf.length,
          },
        });
      }
      if (p === "/api/agency/review") {
        state.status = r.request().postDataJSON().status;
        return r.fulfill({ json: { status: state.status } });
      }
      if (p === "/api/agency")
        return r.fulfill({
          json: {
            userId: actor,
            canCreate: role === "owner",
            workspaces: [
              {
                id: uid,
                name: "Grupo de marketing com projetos e campanhas extensas",
                role:
                  role === "reviewer"
                    ? "reviewer"
                    : role === "editor"
                      ? "editor"
                      : "owner",
              },
            ],
          },
        });
      if (p.startsWith("/api/agency/projects/"))
        return r.fulfill({
          json: [
            {
              id: proj,
              name: "Projeto promocional com peça para homologação",
              revision: 1,
              status: state.status,
            },
          ],
        });
      if (p.startsWith("/api/agency/project/"))
        return r.fulfill({
          json: {
            id: proj,
            name: "Projeto",
            workspace_id: uid,
            revision: 1,
            status: state.status,
            canvas_model: model,
          },
        });
      if (p === "/api/membership/offers")
        return r.fulfill({
          json: {
            start: true,
            paid: ["SOLO", "PRO", "PRO_PLUS", "AGENCY"],
            annualPaid: ["PRO"],
          },
        });
      if (p === "/api/membership/confirm")
        return r.fulfill({ json: { active: true } });
      if (p === "/api/membership/topup-confirm")
        return r.fulfill({ json: { credited: true } });
      if (p === "/api/membership/checkout")
        return r.fulfill({ json: { url: origin + "/checkout-test" } });
      if (p.startsWith("/api/"))
        return r.fulfill({
          json:
            p === "/api/mare/capabilities"
              ? { video: true, editor: true, publicEntry: true }
              : {},
        });
      if (p === "/checkout-test")
        return r.fulfill({
          contentType: "text/html",
          body: '<h1>Pagamento de teste</h1><a href="/billing/success?session_id=fixture">Confirmar</a><a href="/pricing">Cancelar</a>',
        });
      const f = path.resolve(base, "." + p);
      if (!f.startsWith(base + path.sep) && f !== base) return r.abort();
      const file =
        fs.existsSync(f) && fs.statSync(f).isFile()
          ? f
          : path.join(base, "index.html");
      return r.fulfill({
        path: file,
        contentType:
          {
            ".js": "application/javascript",
            ".css": "text/css",
            ".html": "text/html; charset=utf-8",
            ".ttf": "font/ttf",
            ".woff2": "font/woff2",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".json": "application/json",
          }[path.extname(file)] || "application/octet-stream",
      });
    } catch (e) {
      console.error(e.message);
      await r.abort().catch(() => {});
    }
  });
}
// Billing and Agency use the Supabase SDK in addition to the tRPC cookie session.
async function verifyFixtureSession(browser) {
  const page = await browser.newPage();
  try {
    await fixture(page, "owner");
    await page.goto(origin + "/agency");
    await page
      .getByRole("button", { name: "Editar", exact: true })
      .waitFor({ timeout: 8000 });
  } catch (cause) {
    throw new Error(
      "A sessão fictícia não abriu a Agência. Compile com VITE_SUPABASE_URL=https://fixture.invalid e VITE_SUPABASE_ANON_KEY=public-fixture-placeholder conforme ACEITE-MOVEL-POSTSPARK.md.",
      { cause }
    );
  } finally {
    await page.close();
  }
}
module.exports = {
  verifyFixtureSession,
  fixture,
  model,
  origin,
  chromium,
  makeClip,
  artifacts,
};
