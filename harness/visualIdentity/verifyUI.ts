import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { chromium } from "playwright-core";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { identityFixture } from "../../shared/visualIdentity.fixture";

const output = "/tmp/postspark-identity-verification";
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  publicDir: resolve("client/public"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@/lib/trpc": resolve("harness/visualIdentity/uiTrpc.ts"),
      "@/components/UserTopMenu": resolve(
        "harness/visualIdentity/emptyMenu.tsx"
      ),
      "@": resolve("client/src"),
      "@shared": resolve("shared"),
    },
  },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [process.cwd()] } },
});
await server.listen();
const address = server.httpServer!.address() as { port: number };
const browser = await chromium.launch({ headless: true });
const errors: string[] = [],
  checks: Record<string, boolean> = {};
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 1050 },
    mobile: { width: 390, height: 844 },
  })) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", error => errors.push(error.message));
    let saved: any;
    await page.route("**/identity-harness-save", async route => {
      saved = route.request().postDataJSON();
      const identity = identityFixture({
        headingFont: "Fonte de exemplo indisponível",
      });
      identity.description = saved.description;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: saved.id ?? saved.creationId,
          visualIdentity: identity,
        }),
      });
    });
    await page.goto(
      `http://127.0.0.1:${address.port}/harness/visualIdentity/index.html`
    );
    await page
      .getByText("Identidade visual do projeto ativa", { exact: false })
      .waitFor();
    const promptField = page.getByRole("textbox", { name: "Tema ou ideia do post" });
    await promptField.fill("Primeira linha");
    await promptField.press("End");
    await promptField.press("Enter");
    await promptField.pressSequentially("Segunda linha");
    checks[`${name}EnterInsertsNewline`] = await promptField.inputValue() === "Primeira linha\nSegunda linha";
    checks[`${name}EnterDoesNotSubmit`] = await page.evaluate(() => !(window as any).__identitySubmission);
    await promptField.press("Control+Enter");
    checks[`${name}CtrlEnterSubmits`] = await page.evaluate(() =>
      (window as any).__identitySubmission?.prompt === "Primeira linha\nSegunda linha"
    );
    await page.evaluate(() => { delete (window as any).__identitySubmission; });
    if (name === "mobile") await page.locator(".mobile-more-options > summary").click();
    const projectStyle = page.getByRole("button", { name: /Estilo de teste/ });
    await projectStyle.click();
    await page.getByRole("switch", { name: "Gerar imagens com IA" }).click();
    for (const [tone, text, rgb] of [
      ["text", "Uma ideia simples para o próximo post.", "255,92,0"],
      ["script", "slide1:\nPrimeiro texto.\n\nslide2:\nSegundo texto.", "139,92,246"],
      ["url", "https://example.com/", "56,189,248"],
    ]) {
      await promptField.fill(text);
      await page.locator(`.studio-create-page[data-creation-tone="${tone}"]`).waitFor();
      await page.waitForFunction(expected => {
        const root = document.querySelector(".studio-create-page")!;
        const elements = [...root.querySelectorAll('[data-creation-highlight="true"], [data-project-active="true"], .mobile-post-modes > button[aria-pressed="true"], .mobile-project-style[aria-pressed="true"], .mobile-image-toggle[aria-checked="true"]')];
        return elements.length >= 4 && elements.every(el =>
          getComputedStyle(el).borderColor.match(/[\d.]+/g)?.slice(0, 3).join(",") === expected
        );
      }, rgb);
      checks[`${name}${tone}OutlineTone`] = true;
      await page.screenshot({ path: `${output}/${name}-${tone}-outlines.png`, fullPage: true });
      const guide = page.getByRole("button", { name: "Orientações para esta arte", exact: true });
      await guide.click();
      checks[`${name}${tone}ModalTone`] = await page.getByRole("dialog").getAttribute("data-creation-tone") === tone;
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    }
    await page.getByRole("switch", { name: "Gerar imagens com IA" }).click();
    await projectStyle.click();
    if (name === "mobile") await page.locator(".mobile-more-options > summary").click();
    await page.getByRole("textbox", { name: "Tema ou ideia do post" }).fill(
      "Por que gastar horas fazendo sorteio no papelzinho para seu amigo secreto? No ReUNE, você organiza em minutos e cada um recebe seu convite individualmente para verificar quem tirou no sorteio."
    );
    checks[`${name}SinglePrompt`] = await page.getByRole("textbox").count() === 1;
    await page.screenshot({ path: `${output}/${name}-prompt-tools.png`, fullPage: true });
    const guide = page.getByRole("button", { name: "Orientações para esta arte", exact: true });
    await guide.click();
    const visualBrief = "Mais respiro, títulos em destaque, sem fotografias.";
    await page.getByRole("dialog").getByLabel("Suas orientações").fill(visualBrief);
    await page.getByRole("dialog").evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished));
    });
    checks[`${name}OpaqueVisualBrief`] = await page.getByRole("dialog").evaluate(element =>
      getComputedStyle(element).opacity === "1" && getComputedStyle(element).backgroundColor === "rgb(24, 24, 24)"
    );
    await page.screenshot({ path: `${output}/${name}-visual-brief.png`, fullPage: true });
    await page.getByRole("button", { name: "Aplicar orientações", exact: true }).click();
    const editGuide = page.getByRole("button", { name: "Orientações para esta arte · Editar", exact: true });
    await editGuide.click();
    checks[`${name}ReopenVisualBrief`] = await page.getByRole("dialog").getByLabel("Suas orientações").inputValue() === visualBrief;
    await page.getByRole("dialog").getByLabel("Suas orientações").fill("Alteração descartada");
    await page.keyboard.press("Escape");
    checks[`${name}FocusRestored`] = await editGuide.evaluate(el => el === document.activeElement);
    await page
      .getByRole("button", { name: "Já tenho meu conteúdo", exact: true })
      .click();
    const script = page.getByRole("dialog");
    await script
      .getByRole("button", { name: "Colar texto", exact: true })
      .click();
    await script
      .getByLabel("Cole o roteiro completo")
      .fill("slide1:\nMeu conteúdo pronto.\n\nslide2:\nO segundo slide.");
    await script
      .getByText("2 slides identificados.", { exact: false })
      .waitFor();
    await page.screenshot({
      path: `${output}/${name}-bulk-paste.png`,
      fullPage: true,
    });
    await script
      .getByRole("button", { name: "Dividir em slides", exact: true })
      .click();
    checks[`${name}BulkSplit`] =
      (await script.getByLabel("Slide 2", { exact: true }).inputValue()) ===
      "O segundo slide.";
    await script.getByRole("button", { name: "Mover acima" }).nth(1).click();
    await script.getByRole("button", { name: "Usar estes 2 slides" }).click();
    await page
      .getByRole("button", {
        name:
          name === "mobile"
            ? "Gerar posts"
            : "Diagramar 2 slides com fidelidade",
        exact: true,
      })
      .click();
    const submission = await page.evaluate(
      () => (window as any).__identitySubmission
    );
    assert.equal(
      submission.options.parsedSlides[0].rawText,
      "O segundo slide."
    );
    checks[`${name}LiteralOrder`] =
      submission.options.scriptMode === "preserve";
    checks[`${name}SeparateVisualBrief`] = submission.options.visualBrief === visualBrief;
    await page.screenshot({
      path: `${output}/${name}-creation.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Minha marca" }).click();
    await page
      .getByRole("button", { name: "Identidade visual de Minha marca" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Como é a identidade visual da sua marca?")
      .fill("Azul e branco. Apenas isso está definido.");
    await dialog
      .getByRole("button", { name: "Salvar identidade", exact: true })
      .click();
    await dialog
      .getByText(
        "Identidade salva. Ela será usada nas próximas criações deste projeto."
      )
      .waitFor();
    assert.equal(
      saved.description,
      "Azul e branco. Apenas isso está definido."
    );
    checks[`${name}MinimalSave`] = true;
    checks[`${name}FontNotice`] =
      (await dialog
        .getByText("Não encontramos a fonte solicitada", { exact: false })
        .count()) > 0;
    checks[`${name}NoHorizontalOverflow`] = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    await page.screenshot({
      path: `${output}/${name}-identity.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
    await page.close();
  }
  assert.deepEqual(errors, []);
  assert.ok(Object.values(checks).every(Boolean));
  await writeFile(
    `${output}/ui-results.json`,
    JSON.stringify({ controlledApi: true, checks, errors }, null, 2)
  );
  console.log(JSON.stringify({ output, checks, errors }));
} finally {
  await browser.close();
  await server.close();
}
