import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { openCheckout } from "./lab-browser.mjs";

test("ações locais, sugestão contextual e pedido revisável por API", async t => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  });
  t.after(() => browser.close());
  const page = await openCheckout(browser);
  page.setDefaultTimeout(4500);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const calls = [];
  page.on("request", r => {
    if (/qwen|huggingface|\/api\/director/i.test(r.url())) calls.push(r.url());
  });
  await page.locator("#start-blank").click();
  await page.locator('[data-cp-add="square"]').click();
  const action = id => page.locator('[data-quick="' + id + '"]');
  const state = () =>
    page.evaluate(() => {
      const { context } = window.editor.inspect();
      return window.editor.inspect({ compositionId: context.compositionId });
    });
  await action("rotate").click();
  await page.locator('#quick-settings [name="angle"]').fill("180");
  await page.locator('#quick-settings [name="duration"]').fill("1");
  await page.locator('[form="quick-settings"]').click();
  assert.equal((await state()).layers[0].keys.rotation.at(-1).value, 180);
  await action("ease").click();
  assert.equal((await state()).layers[0].keys.rotation.at(-1).ease, "out");
  await action("unfold").click();
  await action("bandTitle").click();
  await page.locator('#quick-settings [name="text"]').fill("Café 360");
  await page.locator('[form="quick-settings"]').click();
  let doc = await state();
  const [band, title] = doc.layers;
  assert.equal(title.text, "Café 360");
  assert.equal(title.start, band.start + band.keys.scaleX.at(-1).t);
  assert.equal(title.keys.reveal[0].value, 0);
  await page.locator("#undo").click();
  assert.equal((await state()).layers.length, 1);
  await page.locator("#redo").click();
  assert.equal((await state()).layers.length, 2);
  await page.locator("[data-cp-layouts]").click();
  await page.locator('[data-image-layout="mosaic"]').click();
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="tomato"/></svg>'
  );
  await page
    .locator("#layout-files")
    .setInputFiles(
      ["A", "B", "C"].map(name => ({
        name: name + ".svg",
        mimeType: "image/svg+xml",
        buffer: svg,
      }))
    );
  await page.locator("#layout-apply:enabled").click();
  await action("sequence").click();
  await page.locator('#quick-settings [name="gap"]').fill(".3");
  await page.locator('[form="quick-settings"]').click();
  doc = await state();
  const photos = doc.layers
    .filter(l => l.type === "image")
    .sort((a, b) => a.pose.x - b.pose.x || a.pose.y - b.pose.y);
  assert.deepEqual(
    photos.map(l => Math.round(l.keys.opacity.at(-1).t * 100)),
    [22, 52, 82]
  );
  await page.locator("#undo").click();
  assert(
    (await state()).layers
      .filter(l => l.type === "image")
      .every(l => !l.keys.opacity.length)
  );
  await page.locator("#redo").click();
  assert.deepEqual(calls, []);
  await page.locator('[data-cp-select="' + title.id + '"]').click();
  await page.locator("[data-quick-assistant]").click();
  await page.locator("#project-request").fill("Troque por Café 720");
  await page.locator("#assistant-plan").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#assistant-report")
      .textContent.includes("A IA está indisponível")
  );
  assert.deepEqual(calls, []);
  await page.evaluate(() => {
    const m = document.createElement("meta");
    m.name = "mare-director";
    document.head.append(m);
  });
  await page.route("**/api/director", async r => {
    const body = r.request().postDataJSON();
    assert.equal(body.stage, "edit");
    assert.equal(body.context.state.context.layerId, title.id);
    assert(!JSON.stringify(body).includes("data:image"));
    await r.fulfill({
      json: {
        output: {
          summary: "Alterar título",
          commands: [
            {
              id: "layer.set",
              compositionId: doc.id,
              layerId: title.id,
              fields: { text: "Café 720" },
            },
          ],
        },
      },
    });
  });
  await page.locator("#assistant-plan").click();
  await page.locator("#assistant-apply:enabled").waitFor();
  assert.equal(
    (await state()).layers.find(l => l.id === title.id).text,
    "Café 360"
  );
  await page.locator("#assistant-apply").click();
  assert.equal(
    (await state()).layers.find(l => l.id === title.id).text,
    "Café 720"
  );
  assert.equal(calls.length, 1);
  const file = await page.evaluate(async () => {
    const e = window.editor;
    const job = await e.invoke("export.project", {}, e.inspect().revision);
    while (e.job(job).state === "running")
      await new Promise(r => setTimeout(r, 20));
    const blob = e.job(job).result;
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const fresh = await openCheckout(browser);
  await fresh
    .locator("#project-file")
    .setInputFiles({
      name: "teste.mare",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(file),
    });
  await fresh.getByText("Projeto aberto.", { exact: true }).waitFor();
  const reopened = await fresh.evaluate(
    id => window.editor.inspect({ compositionId: id }),
    doc.id
  );
  assert.deepEqual(
    reopened.layers.map(l => [l.id, l.text, l.keys]),
    (await state()).layers.map(l => [l.id, l.text, l.keys])
  );
  assert.deepEqual(errors, []);
});

test("a montagem usa quadros dos clipes, segura a cena final e insere trecho de fala", async t => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  });
  t.after(() => browser.close());
  const p = await openCheckout(browser);
  p.setDefaultTimeout(6000);
  await p.locator("#start-blank").click();
  await p.locator("#project-menu").click();
  await p.locator("#reset").click();
  await p.locator("#confirm-reset").click();
  await p.evaluate(async () => {
    const e = window.editor,
      invoke = (id, a) => e.invoke(id, a, e.inspect().revision);
    await invoke("project.new", { name: "Demonstrar ações" });
    e.prepare(e.inspect().revision, [
      {
        id: "composition.create",
        compositionId: "src",
        name: "Encerramento",
        duration: 3,
      },
      { id: "composition.background", compositionId: "src", color: "#ff3311" },
      {
        id: "layer.add",
        compositionId: "src",
        layerId: "txt",
        type: "text",
        fields: { text: "Café" },
      },
      { id: "media.insert", asset: "builtin/coast", clipId: "v" },
      {
        id: "composition.insert",
        compositionId: "src",
        clipId: "end",
        time: 0,
      },
    ]).apply();
    e.prepare(e.inspect().revision, [
      { id: "clip.order", clipId: "end", index: 1 },
    ]).apply();
    await invoke("view.selectClip", { clipId: "end" });
  });
  await p.locator("#quick-hold").click();
  assert.equal(
    await p.evaluate(
      () => window.editor.inspect({ compositionId: "src" }).layers[0].end
    ),
    4
  );
  await p.locator("#undo").click();
  assert.equal(
    await p.evaluate(
      () => window.editor.inspect({ compositionId: "src" }).layers[0].end
    ),
    3
  );
  await p.locator("#quick-transition").click();
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll(".transition-card canvas")].some(c => {
        const pixels = c
          .getContext("2d")
          .getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] > 200 && pixels[i + 1] < 110 && pixels[i + 2] < 85)
            return true;
        return false;
      }),
    null,
    { timeout: 9000 }
  );
  await p.locator("[data-transition-cancel]").click();
  await p.evaluate(async () => {
    const e = window.editor;
    const { TALK_DEFAULTS } = await import("./speech-model.js");
    const words = [
      { text: "Comece.", start: 0.2, end: 0.8 },
      { text: "Continue.", start: 1.2, end: 1.8 },
      { text: "Termine.", start: 2.2, end: 2.7 },
    ];
    const talk = {
      ...TALK_DEFAULTS,
      speech: {
        start: 0,
        end: 3,
        language: "pt",
        words,
        voices: [
          [0.2, 0.8],
          [1.2, 1.8],
          [2.2, 2.7],
        ],
      },
    };
    e.prepare(e.inspect().revision, [
      { id: "speech.apply", clipId: "v", talk, cuts: [], ripple: false },
    ]).apply();
    await e.invoke("view.selectClip", { clipId: "v" }, e.inspect().revision);
  });
  await p.locator("#edit-speech").click();
  await p.locator('[data-start-excerpt="1"]').click();
  await p.locator("#excerpt-end").selectOption({ index: 1 });
  await p.locator('[data-action="insert-excerpt"]').click();
  const clips = await p.evaluate(() => window.editor.inspect().clips);
  assert.deepEqual(
    clips.map(c => (c.id === "v" ? "v" : c.id === "end" ? "end" : "excerpt")),
    ["v", "excerpt", "end"]
  );
  assert.equal(clips[1].trim, 1.2);
  assert(clips[1].duration > 1.5);
  await p.locator("#undo").click();
  assert.equal(await p.evaluate(() => window.editor.inspect().clips.length), 2);
});
