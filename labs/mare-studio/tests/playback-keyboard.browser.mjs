import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { openCheckout } from "./lab-browser.mjs";

async function checkPlayback(page) {
  const play = page.locator("#play");
  const clock = page.locator("#current");
  const before = await clock.textContent();
  await page.keyboard.down("Space");
  try {
    await page.getByRole("button", {name: "Pausar", exact: true}).waitFor();
    await page.keyboard.down("Space");
    await page.waitForFunction(start => document.querySelector("#current").textContent !== start, before);
    assert.equal(await play.getAttribute("aria-label"), "Pausar");
  } finally {
    await page.keyboard.up("Space");
  }
  await page.keyboard.press("Space");
  await page.getByRole("button", {name: "Reproduzir", exact: true}).waitFor();
  assert.notEqual(await clock.textContent(), before);
}

async function checkFrameSteps(page, ruler) {
  const time = () => page.evaluate(async () => (await import("./app.js")).projectEditor.inspect().context.time);
  await page.locator("#back").click();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await time(), 0);
  await page.keyboard.press("ArrowRight");
  assert.equal(await time(), 1 / 30);
  await ruler.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await time(), 2 / 30);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await time(), 1 / 30);
  await page.locator("#end").click();
  const end = await time();
  await page.keyboard.press("ArrowRight");
  assert.equal(await time(), end);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await time(), (Math.ceil(end * 30 - 1e-8) - 1) / 30);
  await page.locator("#back").click();
  await page.keyboard.press("Space");
  await page.getByRole("button", {name: "Pausar", exact: true}).waitFor();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#play").getAttribute("aria-label"), "Reproduzir");
}

test("Espaço e setas controlam a prévia ao editar e preservam digitação e navegação por Tab", async t => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(() => browser.close());
  const origin = process.env.MARE_PRIVATE_ORIGIN;
  async function open() {
    if (!origin) return openCheckout(browser);
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    await page.goto(origin);
    return page;
  }
  const montage = await open();
  await montage.locator("#start-blank").click();
  await montage.locator("#project-menu").click();
  await montage.locator("#reset").click();
  await montage.locator("#confirm-reset").click();
  assert.equal(await montage.locator("#project-menu").evaluate(b => b === document.activeElement), true);
  await checkPlayback(montage);
  assert.equal(await montage.locator("#project-pop").isHidden(), true);
  await checkFrameSteps(montage, montage.getByRole("slider", {name: "Posição na montagem"}));

  await montage.locator("#open-start").focus();
  await montage.keyboard.press("Tab");
  assert.equal(await montage.locator("#project-menu").evaluate(b => b === document.activeElement), true);
  await montage.keyboard.press("Space");
  await montage.locator("#project-pop").waitFor();
  await montage.keyboard.press("Escape");
  await montage.locator("#project-assistant").click();
  const request = montage.locator("#project-request");
  await request.fill("Maré");
  await request.press("End");
  await request.press("Space");
  assert.equal(await request.inputValue(), "Maré ");
  assert.equal(await montage.locator("#play").getAttribute("aria-label"), "Reproduzir");

  const animation = await open();
  await animation.locator("#start-blank").click();
  assert.ok(await animation.locator("#play").isDisabled());
  await animation.locator("#starter-text").click();
  const text = animation.locator('#inspector [data-cp-prop="text"]');
  await text.fill("Nova");
  await text.press("End");
  await text.press("Space");
  assert.equal(await text.inputValue(), "Nova ");
  const at = await animation.locator("#current").textContent();
  await text.press("ArrowLeft");
  assert.equal(await text.evaluate(field => field.selectionStart), 4);
  assert.equal(await animation.locator("#current").textContent(), at);
  assert.equal(await animation.locator("#play").getAttribute("aria-label"), "Reproduzir");
  await animation.locator("#back").click();
  await checkPlayback(animation);
  await checkFrameSteps(animation, animation.getByRole("slider", {name: "Tempo da composição"}));
});
