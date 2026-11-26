// Inventory of App.tsx production routes, using the isolated navigation fixtures.
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  chromium,
  verifyFixtureSession,
  fixture,
  origin,
  artifacts,
  makeClip,
} = require("./mobile-navigation-fixture.cjs");
const destinations = {
  pro: [
    "/thevoid",
    "/saved-posts",
    "/history",
    "/billing",
    "/pricing",
    "/privacy-settings",
    "/familias",
    "/billing/success",
    "/billing/topup-success",
    "/studio",
    "/studio-v2b",
  ],
  guest: [
    "/",
    "/criar",
    "/privacy",
    "/terms",
    "/cookies",
    "/404",
    "/auth/google-callback",
  ],
  owner: ["/agency"],
  reviewer: ["/agency"],
  editor: ["/agency"],
  admin: ["/admin", "/admin2", "/thevoid-lab"],
  start: ["/start/peca"],
};
const redirects = {
  "/criar": [
    "/criar-new",
    "/p",
    "/preview-home",
    "/crie-posts-incriveis",
    "/landing",
    "/landing2",
    "/landing3",
  ],
  "/": [
    "/stage-3d",
    "/3d-home",
    "/studio-home",
    "/inspiracao",
    "/showcase-stage",
    "/thevoid2",
  ],
  "/thevoid": ["/canvas-lab", "/thevoid-clean", "/studio-v2"],
};
async function run() {
  makeClip();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const failures = [];
  try {
    await verifyFixtureSession(browser);
    for (const [width, height] of [
      [360, 740],
      [390, 844],
      [430, 932],
      [768, 1024],
      [844, 390],
      [1280, 800],
    ]) {
      for (const [role, routes] of Object.entries(destinations)) {
        const ctx = await browser.newContext({
          viewport: { width, height },
          isMobile: width < 1100,
          hasTouch: true,
        });
        try {
          const page = await ctx.newPage();
          await fixture(page, role);
          for (const pathname of routes) {
            await page.goto(origin + pathname);
            try {
              if (pathname === "/auth/google-callback")
                await page.waitForURL(url => url.pathname === "/");
              await page.waitForFunction(
                () =>
                  document.body.innerText.trim().length > 15 &&
                  !/(Carregando laboratório|Carregando sua peça|carregando estúdio|entrando no estúdio)/i.test(
                    document.body.innerText
                  ),
                null,
                { timeout: 12000 }
              );
              const layout = await page.evaluate(() => ({
                width: innerWidth,
                scroll: document.documentElement.scrollWidth,
                heading: document.querySelector("h1")?.textContent,
                text: document.body.innerText.slice(0, 150),
              }));
              assert.ok(layout.scroll <= width + 1, JSON.stringify(layout));
              assert.doesNotMatch(
                layout.text,
                /erro inesperado|something went wrong|ocorreu um erro/i
              );
              if (
                width === 360 &&
                [
                  "pro/familias",
                  "pro/privacy-settings",
                  "owner/agency",
                  "admin/admin",
                ].includes(role + pathname)
              ) {
                await page.screenshot({
                  path: path.join(
                    artifacts,
                    role + "-" + pathname.slice(1) + "-360.png"
                  ),
                });
              }
              console.log(
                JSON.stringify({ width, height, role, pathname, ...layout })
              );
            } catch (e) {
              failures.push({ role, pathname, width, reason: e.message });
              await page.screenshot({
                path: path.join(
                  artifacts,
                  role +
                    "-" +
                    pathname.slice(1).replaceAll("/", "-") +
                    "-" +
                    width +
                    ".png"
                ),
              });
            }
          }
          if (width === 390 && role === "pro") {
            for (const [destination, aliases] of Object.entries(redirects))
              for (const alias of aliases) {
                await page.goto(origin + alias);
                await page.waitForURL(origin + destination, { timeout: 5000 });
                console.log(JSON.stringify({ alias, destination, width }));
              }
          }
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(JSON.stringify(failures));
}
run().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
