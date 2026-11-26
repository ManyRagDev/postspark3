// Exercise this checkout with same-origin services from an optional private lab.
// Only the front-end files are routed locally. API, licensed overlays and results use the lab.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const types = {
  js: "text/javascript",
  html: "text/html",
  json: "application/json",
  css: "text/css",
  png: "image/png",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  wav: "audio/wav",
  woff2: "font/woff2",
};
export async function openCheckout(
  browser,
  { origin = "http://localhost", privateLab = false, ...context } = {}
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    ...context,
  });
  const deployed = privateLab ? await page.request.get(origin) : null;
  if (deployed && !deployed.ok()) throw Error("Laboratório privado indisponível.");
  const flags = deployed
    ? ((await deployed.text()).match(/<meta name="mare-(?:processor|speech|narration)"[^>]*>/g) ?? [])
    : [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (privateLab && /^\/(api|renders|transition-media)\//.test(url.pathname)) return route.continue();
    const file = path.resolve(
      dist,
      "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname))
    );
    if (!file.startsWith(dist)) return route.abort();
    let body;
    try {
      body = await readFile(file);
    } catch {
      return route.fulfill({ status: 404 });
    }
    if (file.endsWith("/index.html")) body = body.toString().replace("</head>", flags.join("") + "</head>");
    return route.fulfill({
      body,
      contentType: types[path.extname(file).slice(1)] ?? "application/octet-stream",
    });
  });
  await page.goto(origin);
  await page.evaluate(async () => {
    const { projectEditor: e } = await import("./app.js");
    window.editor = e;
  });
  return page;
}

// Offline browser journeys exercise actual proposals using explicit provider fixtures.
export async function mockEditApi(page, answer) {
  await page.evaluate(() => {
    if (document.querySelector('meta[name="mare-director"]')) return;
    const flag = document.createElement("meta");
    flag.name = "mare-director";
    document.head.append(flag);
  });
  await page.route("**/api/director", async route => {
    const payload = route.request().postDataJSON();
    if (payload.stage !== "edit") return route.fallback();
    await route.fulfill({json:{output:{commands:answer(payload.context.request)}}});
  });
}
export const ctaEditFixture = {id:"text.replaceAndHold",before:"Experimente agora",after:"Crie seu primeiro post",extraSeconds:1};
