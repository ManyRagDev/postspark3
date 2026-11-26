const {
    verifyFixtureSession,
    fixture,
    origin,
    chromium,
    model,
    makeClip,
    artifacts,
  } = require("./mobile-navigation-fixture.cjs"),
  assert = require("assert/strict");
makeClip();
const failures = [];
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  try {
    await verifyFixtureSession(browser);
    for (const [w, h] of (
      process.env.SIZES || "360x740,390x844,430x932,768x1024,844x390,1280x800"
    )
      .split(",")
      .map(k => k.split("x").map(Number))) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h },
        recordVideo:
          w === 360
            ? { dir: artifacts, size: { width: w, height: h } }
            : undefined,
        isMobile: w < 1100,
        hasTouch: true,
      });
      const p = await ctx.newPage();
      await fixture(p, "pro");
      p.setDefaultTimeout(8000);
      const logged = [];
      const step = async (name, f) => {
        try {
          await f();
          const screen = await p.evaluate(() => ({
            root: document.documentElement.scrollWidth,
            w: document.documentElement.clientWidth,
          }));
          assert.ok(screen.root <= screen.w + 1, JSON.stringify(screen));
          logged.push([name, "pass"]);
        } catch (e) {
          failures.push({ w, h, name, message: e.message });
          logged.push([
            name,
            String(e.message).split("\n").slice(0, 3).join(" "),
          ]);
          await p
            .screenshot({
              path: artifacts + "/flow-" + w + "-" + name + ".png",
            })
            .catch(() => {});
        }
      };
      const tap = name =>
        p.getByRole("button", { name, exact: true }).first().tap();
      await step("brief", async () => {
        await p.goto(origin + "/thevoid");
        let input = p.locator("textarea:visible").first();
        await input.fill("Novo lançamento no Brasil");
        await p.setViewportSize({ width: w, height: Math.min(h, 460) });
        await input.press("End");
        assert.equal(await input.inputValue(), "Novo lançamento no Brasil");
        await p.setViewportSize({ width: w, height: h });
        await input.blur();
        await p.getByRole("button", { name: "Carrossel", exact: true }).tap();
        assert.equal(await input.inputValue(), "Novo lançamento no Brasil");
      });
      await step("account", async () => {
        await tap("Conta do Usuário");
        await p.getByRole("menuitem", { name: /Posts salvos/ }).tap();
        await p.waitForURL(/saved-posts/);
      });
      await step("saved-editor", async () => {
        await p.goto(origin + "/saved-posts");
        await tap("Abrir");
        await p.waitForURL(/thevoid/);
        await p.getByRole("button", { name: "Baixar post" }).waitFor();
      });
      await step("video", async () => {
        await p.getByRole("button", { name: /Selecionar slide 2:/ }).tap();
        await tap("Reproduzir vídeo");
        await tap("Pausar vídeo");
        await p
          .getByRole("slider", { name: "Tempo do slide" })
          .press("ArrowRight");
        await tap("Fundo");
        await p.getByLabel("Início no vídeo (s)").fill("0.25");
        await p.getByLabel("Volume (0 a 1)").fill("0.4");
        await tap("Aplicar trecho e volume");
        await tap("Fechar painel");
        await tap("Camadas");
        await p
          .locator('[data-layer-row="headline"] button[aria-pressed]')
          .first()
          .tap();
        await tap("Fechar painel");
        await p.getByRole("button", { name: /Selecionar slide 1:/ }).tap();
      });
      await step("slides", async () => {
        await p
          .getByRole("button", { name: "Adicionar slide", exact: true })
          .tap();
        await p
          .getByRole("button", { name: "Ações do slide 3", exact: true })
          .tap();
        await p.getByRole("menuitem", { name: /Mover para a esquerda/ }).tap();
      });
      await step("layers", async () => {
        await tap("Camadas");
        const button = p.locator(
          '[data-layer-row="headline"] button[aria-pressed]'
        );
        await button.first().tap();
        await p
          .getByRole("button", { name: "Fechar painel", exact: true })
          .tap();
      });
      await step("save", async () => {
        await tap("Salvar post");
        const persisted = p.waitForResponse(
          r => r.url().includes("post.update") && r.ok(),
          { timeout: 15000 }
        );
        await tap("Atualizar o post salvo");
        await persisted;
        await p
          .getByRole("dialog", { name: "Salvar post" })
          .waitFor({ state: "hidden" });
      });
      await step("download", async () => {
        await tap("Baixar post");
        const file = p.waitForEvent("download", { timeout: 15000 });
        await p
          .getByRole("menuitem", { name: /Imagem do slide atual.*PNG/ })
          .first()
          .tap();
        assert.ok((await file).suggestedFilename().endsWith(".png"));
      });
      await step("reopen", async () => {
        await p.goto(origin + "/saved-posts");
        await tap("Abrir");
        await p.getByRole("button", { name: /Selecionar slide 3:/ }).tap();
        await tap("Fundo");
        assert.equal(await p.getByLabel("Volume (0 a 1)").inputValue(), "0.4");
        assert.equal(
          await p.getByLabel("Início no vídeo (s)").inputValue(),
          "0.25"
        );
        await tap("Fechar painel");
      });
      await step("gallery", async () => {
        await p.goto(origin + "/saved-posts");
        await p.evaluate(
          model =>
            sessionStorage.setItem(
              "postspark.restore_generation",
              JSON.stringify({
                variations: [{ fixedCanvas: model }],
                inputContent: "Briefing de teste",
              })
            ),
          model
        );
        await p.goto(origin + "/thevoid");
        await p
          .getByRole("button", { name: "Próxima página do carrossel" })
          .tap();
        const edit = p
          .getByRole("button", {
            name: /Personalizar Post|Editar proposta|Editar no CanvasLab|Abrir no CanvasLab/i,
          })
          .first();
        if (await edit.count()) await edit.tap();
        else throw new Error("Edição ausente na galeria");
        await p.getByRole("button", { name: "Baixar post" }).waitFor();
      });
      await step("brief-return", async () => {
        await p.getByRole("button", { name: "Voltar para a galeria" }).tap();
        await p.getByRole("button", { name: /^Novo tema$/i }).tap();
        assert.equal(
          await p.locator("textarea:visible").first().inputValue(),
          "Briefing de teste"
        );
      });
      await step("zoom", async () => {
        await p.goto(origin + "/billing");
        const client = await ctx.newCDPSession(p);
        try {
          await client.send("Emulation.setPageScaleFactor", {
            pageScaleFactor: 1.5,
          });
          const scale = await p.evaluate(() => visualViewport.scale);
          assert.ok(scale >= 1.49);
          await p
            .getByRole("link", { name: "Ver planos e gerenciar assinatura" })
            .tap();
          await p.waitForURL(/pricing/);
        } finally {
          await client.send("Emulation.setPageScaleFactor", {
            pageScaleFactor: 1,
          });
          await client.detach();
        }
      });
      await step("billing", async () => {
        await p.goto(origin + "/billing");
        await p.getByRole("heading", { name: "Extrato de Sparks" }).waitFor();
        await p.getByText("Débito", { exact: true }).waitFor();
        await p
          .getByRole("link", { name: "Ver planos e gerenciar assinatura" })
          .tap();
        await p.getByRole("button", { name: /Assinar o Pro$/i }).tap();
        await p.waitForURL(/checkout-test/);
        await p.getByRole("link", { name: "Cancelar" }).tap();
        await p.waitForURL(/pricing/);
      });
      await step("purchase-return", async () => {
        await p.getByRole("button", { name: /Assinar o Pro$/i }).tap();
        await p.getByRole("link", { name: "Confirmar" }).tap();
        await p.waitForURL(/thevoid/);
        await p.goto(origin + "/billing/topup-success?session_id=fixture");
        await p.getByRole("button", { name: "Conferir recarga" }).tap();
        await p
          .getByText("Recarga confirmada. Seus Sparks estão no saldo.")
          .waitFor();
        await p.getByRole("link", { name: "Ver saldo" }).tap();
        await p.getByText("Débito", { exact: true }).waitFor();
      });
      await step("auth-focus", async () => {
        const guest = await browser.newContext({
          viewport: { width: w, height: h },
          isMobile: w < 1100,
          hasTouch: true,
        });
        try {
          const page = await guest.newPage();
          await fixture(page, "guest");
          page.setDefaultTimeout(4000);
          await page.goto(origin + "/pricing");
          const opener = page.getByRole("button", { name: /Assinar o Pro$/i });
          await opener.tap();
          const dialog = page.getByRole("dialog");
          await dialog
            .getByLabel("E-mail", { exact: true })
            .fill("teste@example.test");
          await page.setViewportSize({ width: w, height: Math.min(h, 340) });
          await dialog.getByLabel("Senha", { exact: true }).fill("teste");
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          await page.waitForFunction(
            el => el === document.activeElement,
            await opener.elementHandle(),
            { timeout: 2000 }
          );
        } finally {
          await guest.close();
        }
      });
      for (const role of ["owner", "editor", "reviewer"]) {
        await step("agency-" + role, async () => {
          const a = await ctx.newPage();
          try {
            await fixture(a, role);
            a.setDefaultTimeout(5000);
            await a.goto(origin + "/agency");
            if (role === "reviewer") {
              await a.getByRole("button", { name: "Conferir" }).tap();
              await a.getByRole("button", { name: "Fechar" }).tap();
              await a.getByRole("button", { name: "Aprovar" }).tap();
              await a.getByText(/Aprovado · Revisão/).waitFor();
            } else {
              await a
                .getByRole("button", { name: "Editar", exact: true })
                .tap();
              await a.getByRole("button", { name: "Baixar post" }).waitFor();
              await a.goto(origin + "/agency");
              await a
                .getByRole("button", { name: "Enviar para revisão" })
                .tap();
              await a.getByText(/Em revisão · Revisão/).waitFor();
            }
          } finally {
            await a.close();
          }
        });
      }
      console.log(JSON.stringify({ w, h, logged }));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw Error(JSON.stringify(failures));
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
