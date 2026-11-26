import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { openCheckout } from "./lab-browser.mjs";

test("a prévia desmarca no vazio e mantém seleção, arrasto e alças sobre as camadas", async t => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  });
  t.after(() => browser.close());
  for (const touch of [false, true]) {
    const options = touch
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : { viewport: { width: 1440, height: 1000 } };
    const origin = process.env.MARE_PRIVATE_ORIGIN;
    const page = origin
      ? await browser.newPage(options)
      : await openCheckout(browser, options);
    if (origin) await page.goto(origin);
    await page.locator("#start-blank").click();
    const revision = await page.evaluate(async () => {
      const e = (await import("./app.js")).projectEditor;
      window.editor = e;
      const state = e.inspect(),
        compositionId = state.context.compositionId;
      e.prepare(state.revision, [
        { id: "layer.add", compositionId, layerId: "a", type: "square" },
        { id: "layer.add", compositionId, layerId: "b", type: "circle" },
        { id: "layer.pose", compositionId, layerId: "a", fields: { x: 145 } },
        { id: "layer.pose", compositionId, layerId: "b", fields: { x: 395 } },
      ]).apply();
      return e.inspect().revision;
    });
    await page.locator("#screen").scrollIntoViewIfNeeded();
    const screen = await page.locator("#screen").boundingBox(),
      stage = await page.locator("#stage").boundingBox();
    const scale = Math.min(screen.width / 540, screen.height / 960);
    const point = (x, y) => [
      screen.x + screen.width / 2 + (x - 270) * scale,
      screen.y + screen.height / 2 + (y - 480) * scale,
    ];
    const click = (x, y) =>
      touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    const layer = () =>
      page.evaluate(() => window.editor.inspect().context.layerId);
    for (const [coords, id] of [
      [point(145, 480), "a"],
      [point(395, 480), "b"],
      [point(270, 150), null],
      [point(145, 480), "a"],
      [[stage.x + 3, stage.y + 3], null],
    ]) {
      await click(...coords);
      assert.equal(await layer(), id);
      assert.equal(await page.locator("#layer-resize").isHidden(), id === null);
      assert.equal(
        await page.locator('[data-cp-select=""]').getAttribute("aria-pressed"),
        String(id === null)
      );
    }
    assert.equal(
      await page.evaluate(() => window.editor.inspect().revision),
      revision
    );
    if (!touch) {
      await page.mouse.move(...point(145, 480));
      await page.mouse.down();
      await page.mouse.move(...point(175, 510), { steps: 4 });
      await page.mouse.up();
      assert.equal(await layer(), "a");
      const handle = await page.locator('[data-cp-corner="1,1"]').boundingBox();
      const x = handle.x + handle.width / 2,
        y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 14, y + 14, { steps: 4 });
      await page.mouse.up();
      assert.equal(await layer(), "a");
      assert.equal(
        await page.evaluate(() => window.editor.inspect().revision),
        revision + 2
      );
    }
    await page.close();
  }
});
