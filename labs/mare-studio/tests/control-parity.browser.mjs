import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { openCheckout } from "./lab-browser.mjs";

async function pageFor(t, options) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const page = await openCheckout(browser, options);
  await page.evaluate(async () => {
    const e = window.editor;
    window.invoke = (id, args = {}) => e.invoke(id, args, e.inspect().revision);
    window.prepare = commands => e.prepare(e.inspect().revision, commands);
    window.change = (selector, value) => {
      const field = document.querySelector(selector);
      if (!field) throw Error("Campo ausente " + selector);
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    };
    window.waitUntil = async predicate => {
      const until = performance.now() + 12000;
      while (!predicate()) {
        if (performance.now() > until) throw Error("A interface não confirmou a alteração");
        await new Promise(r => setTimeout(r, 15));
      }
    };
    window.equal = (actual, expected, label) => {
      function compare(a, b, path) {
        if (Object.is(a, b)) return;
        if (
          a &&
          b &&
          typeof a === "object" &&
          typeof b === "object" &&
          Array.isArray(a) === Array.isArray(b)
        ) {
          for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (Object.hasOwn(a, k) !== Object.hasOwn(b, k))
              throw Error(label + " campo ausente " + path + "." + k);
            compare(a[k], b[k], path + "." + k);
          }
          return;
        }
        throw Error(label + " " + path + ": " + JSON.stringify(a) + " ~ " + JSON.stringify(b));
      }
      compare(actual, expected, "");
    };
    await invoke("project.new", { name: "Comparação" });
  });
  return page;
}

test(
  "todos os modelos, campos do inspetor e quadros correspondem aos comandos",
  { timeout: 300000 },
  async t => {
    const page = await pageFor(t);
    const templates = await page.evaluate(() => editor.options().templates);
    let fields = 0;
    for (const item of templates) {
      await page.evaluate(async ({ id, name, duration }) => {
        await invoke("project.new", { name: "Comparação" });
        document.querySelector("#animation-catalog").click();
        document.querySelector('[data-template="' + id + '"]').click();
        const use = document.querySelector("[data-animation-insert]");
        await waitUntil(() => !use.disabled);
        use.click();
        await waitUntil(() => editor.inspect().context.mode === "motion");
        const cid = editor.inspect().context.compositionId,
          query = { compositionId: cid, time: duration * 0.63 };
        const candidate = await editor.prepareWithAssets(editor.inspect().revision, [
          { id: "composition.create", compositionId: "native", name, duration, template: id },
        ]);
        const manual = editor.inspect(query),
          native = candidate.inspect({ ...query, compositionId: "native" });
        equal(manual.layers, native.layers, id + " criação");
        const bytes = async blob =>
          Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))).join(
            ","
          );
        const job = await invoke("preview.frame", query);
        await waitUntil(() => editor.job(job).state !== "running");
        const expected = await candidate.preview({ compositionId: "native" }, query.time);
        equal(await bytes(editor.job(job).result), await bytes(expected), id + " quadro");
        editor.release(job);
      }, item);
      const count = await page.evaluate(async ({ id, duration }) => {
        const compositionId = editor.inspect().context.compositionId,
          query = { compositionId, time: duration * 0.63 };
        const art = new File([await (await fetch("./assets/catalog-avatar.png")).blob()], "imagem.png", {
          type: "image/png",
        });
        const ref = await editor.attach(art, "image");
        // Use a distinct replacement even in models already displaying the catalog avatar.
        const alternate = new File(
          [await (await fetch("./assets/catalog-product.png")).blob()],
          "produto.png",
          { type: "image/png" }
        );
        const ref2 = await editor.attach(alternate, "image");
        const controls = editor.controls(compositionId);
        for (const f of controls) {
          const selector = '[data-cp-template-field="' + f.index + '"]';
          const el = document.querySelector(selector);
          if (!el) throw Error(id + " sem campo " + f.label);
          let file = art;
          let value =
            f.type === "number"
              ? Number(f.value) === Number(f.max)
                ? f.min
                : f.max
              : f.type === "color"
                ? f.value === "#112233"
                  ? "#334455"
                  : "#112233"
                : f.type === "select"
                  ? Object.keys(f.choices).find(k => k !== f.value)
                  : f.type === "file"
                    ? ref
                    : "Teste de campo";
          const commands = () => [{ id: "template.set", compositionId, index: f.index, value }];
          let proposal;
          try {
            proposal = prepare(commands());
          } catch (err) {
            if (f.type !== "file" || !err.message.includes("já corresponde"))
              throw Error(id + " " + f.label + " " + err.message);
            value = ref2;
            file = alternate;
            proposal = prepare(commands());
          }
          const revision = editor.inspect().revision;
          if (f.type === "file") {
            const dt = new DataTransfer();
            dt.items.add(file);
            el.files = dt.files;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } else change(selector, value);
          await waitUntil(() => editor.inspect().revision !== revision);
          equal(editor.inspect(query).layers, proposal.inspect(query).layers, id + " " + f.label);
          if (f.type === "file") {
            const job = await invoke("preview.frame", query);
            await waitUntil(() => editor.job(job).state !== "running");
            const a = await editor.job(job).result.arrayBuffer(),
              b = await (await proposal.preview({ compositionId }, query.time)).arrayBuffer();
            equal(
              Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", a))),
              Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b))),
              id + " pixels da imagem"
            );
            editor.release(job);
          }
          await invoke("history.undo");
        }
        return controls.length;
      }, item);
      fields += count;
    }
    t.diagnostic(templates.length + " modelos e " + fields + " controles");
  }
);

test("biblioteca de elementos e canais de keyframes têm a mesma edição pelo inspetor e pela sessão", async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    document.querySelector("#create-composition").click();
    const cid = editor.inspect().context.compositionId,
      query = { compositionId: cid, time: 1 };
    const types = new Set();
    for (const category of ["Formas", "Símbolos"]) {
      document.querySelector('[data-cp-category="' + category + '"]').click();
      const choices = Array.from(document.querySelectorAll("[data-cp-add]"), el => el.dataset.cpAdd);
      for (const type of choices) {
        if (types.has(type)) continue;
        let ref;
        const revision = editor.inspect().revision;
        if (type === "image") {
          const f = new File([await (await fetch("./assets/catalog-avatar.png")).blob()], "Teste.png", {
            type: "image/png",
          });
          ref = await editor.attach(f, "image");
          const dt = new DataTransfer();
          dt.items.add(f);
          const el = document.querySelector("[data-cp-file]");
          el.files = dt.files;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else document.querySelector('[data-cp-add="' + type + '"]').click();
        await waitUntil(() => editor.inspect().revision !== revision);
        const layer = editor.inspect(query).layers.at(-1);
        await invoke("history.undo");
        const command = {
          id: "layer.add",
          compositionId: cid,
          layerId: layer.id,
          type,
          ...(ref ? { image: ref } : {}),
        };
        const proposal = prepare([command]);
        equal(proposal.inspect(query).layers.at(-1), layer, type);
        types.add(type);
      }
    }
    for (const type of types)
      if (!editor.options().layerTypes.includes(type)) throw Error("Tipo manual ausente: " + type);
    document.querySelector('[data-cp-add="text"]').click();
    const layerId = editor.inspect().context.layerId;
    await invoke("view.seek", { time: 1 });
    const channels = editor.options().channels,
      eases = editor.options().easings;
    for (const channel of channels) {
      change("[data-cp-keychannel]", channel);
      document.querySelector("[data-cp-keyadd]").click();
      const layer = editor.inspect(query).layers[0],
        key = layer.keys[channel].at(-1);
      if (!key) throw Error("Chave ausente " + channel);
      for (const ease of [...eases.filter(x => x !== "linear"), "bezier", "linear"]) {
        const expected = ease === "bezier" ? [0.33, 0, 0.67, 1] : ease;
        const proposal = prepare([
          {
            id: "key.set",
            compositionId: cid,
            layerId,
            channel,
            time: key.t,
            value: key.value,
            ease: expected,
          },
        ]);
        change("[data-cp-ease]", ease);
        equal(editor.inspect(query).layers, proposal.inspect(query).layers, channel + " " + ease);
      }
      document.querySelector("[data-cp-keyremove]").click();
      if (editor.inspect(query).layers[0].keys[channel].length) throw Error("Remoção " + channel);
    }
    return { elements: types.size, channels: channels.length, easings: eases.length + 1 };
  });
  t.diagnostic(JSON.stringify(result));
});

test(
  "cada vídeo oferecido pela biblioteca tem miniatura, prévia e mídia decodificável",
  { timeout: 90000 },
  async t => {
    const page = await pageFor(t);
    const result = await page.evaluate(async () => {
      const entries = await invoke("asset.search");
      for (const entry of entries) {
        for (const ext of ["jpg", "preview.mp4", "mp4"]) {
          const url =
            (ext === "preview.mp4" ? entry.mp4 : entry[ext]) ??
            "./assets/video-library/" + entry.id + "." + ext;
          const response = await fetch(url);
          if (!response.ok) throw Error(url);
          const blob = await response.blob();
          if (ext === "jpg") {
            const img = await createImageBitmap(blob);
            if (!img.width) throw Error(url);
            img.close();
            continue;
          }
          const object = URL.createObjectURL(blob),
            video = document.createElement("video");
          try {
            await new Promise((ok, fail) => {
              video.onloadedmetadata = ok;
              video.onerror = () => fail(Error(url));
              video.src = object;
            });
            if (!video.videoWidth || !Number.isFinite(video.duration)) throw Error(url);
          } finally {
            video.removeAttribute("src");
            video.load();
            URL.revokeObjectURL(object);
          }
        }
      }
      return entries.length;
    });
    assert(result > 0);
    t.diagnostic(result + " vídeos");
  }
);

test("as quatro alças físicas alteram a mesma geometria que o comando", { timeout: 60000 }, async t => {
  const page = await pageFor(t);
  await page.evaluate(() => document.querySelector("#create-composition").click());
  for (const type of ["text", "square"]) {
    await page.locator('[data-cp-add="' + type + '"]').click();
    for (const locked of [true, false]) {
      if ((await page.locator("[data-cp-lock]").getAttribute("aria-pressed")) !== String(locked))
        await page.locator("[data-cp-lock]").click();
      for (const x of [-1, 1])
        for (const y of [-1, 1]) {
          const box = await page.locator('[data-cp-corner="' + x + "," + y + '"]').boundingBox();
          const start = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
          const delta = { x: 9 * x, y: 8 * y };
          await page.evaluate(
            ({ x, y, delta, start, locked }) => {
              const state = editor.inspect(),
                { compositionId, layerId, time } = state.context;
              const canvas = document.querySelector("#screen").getBoundingClientRect();
              const scale = Math.min(canvas.width / 540, canvas.height / 960);
              const left = canvas.x + (canvas.width - 540 * scale) / 2,
                top = canvas.y + (canvas.height - 960 * scale) / 2;
              const dx = (start.x + delta.x - left) / scale - (start.x - left) / scale,
                dy = (start.y + delta.y - top) / scale - (start.y - top) / scale;
              window.geometry = prepare([
                {
                  id: "layer.resize",
                  compositionId,
                  layerId,
                  time,
                  corner: { x, y },
                  delta: { x: dx, y: dy },
                  locked,
                },
              ]).inspect({ compositionId }).layers;
            },
            { x, y, delta, start, locked }
          );
          await page.mouse.move(start.x, start.y);
          await page.mouse.down();
          await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 4 });
          await page.mouse.up();
          await page.evaluate(() => {
            const { compositionId } = editor.inspect().context;
            equal(editor.inspect({ compositionId }).layers, window.geometry, "alça");
          });
          await page.locator("#undo").click();
        }
    }
  }
});

test("transições da galeria, navegação e gravação MP4 em tempo real", { timeout: 120000 }, async t => {
  const origin = process.env.MARE_PRIVATE_ORIGIN;
  const page = await pageFor(t, origin ? { origin, privateLab: true } : {});
  const summary = await page.evaluate(async () => {
    const e = editor;
    prepare([
      { id: "composition.create", compositionId: "a", duration: 1, name: "Azul" },
      { id: "composition.background", compositionId: "a", color: "#1144bb" },
      { id: "composition.insert", compositionId: "a", clipId: "one", time: 0 },
      { id: "composition.create", compositionId: "b", duration: 1, name: "Laranja" },
      { id: "composition.background", compositionId: "b", color: "#dd6622" },
      { id: "composition.insert", compositionId: "b", clipId: "two", time: 1 },
    ]).apply();
    const join = () => document.querySelector('[data-transition-to="two"]');
    join().click();
    const visible = Array.from(document.querySelectorAll("[data-transition]"), el => el.dataset.transition);
    document.querySelector("#close-dialog").click();
    equal(visible.filter(Boolean).sort(), e.options().transitions.sort(), "galeria");
    for (const type of [...visible.filter(Boolean), ""]) {
      join().click();
      document.querySelector('[data-transition="' + type + '"]').click();
      const frames = Number(document.querySelector("#dip-frames").value);
      const proposal = prepare([{ id: "transition.set", clipId: "two", fromId: "one", type: type || null }]);
      document.querySelector("#dip-apply").click();
      await waitUntil(() => !document.querySelector("#dialog").open);
      equal(e.inspect().clips, proposal.inspect().clips, type + " padrão " + frames);
      if (type) {
        join().click();
        const field = document.querySelector("#dip-frames");
        field.value = 4;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        const changed = prepare([{ id: "transition.set", clipId: "two", fromId: "one", type, frames: 4 }]);
        document.querySelector("#dip-apply").click();
        await waitUntil(() => !document.querySelector("#dialog").open);
        equal(e.inspect().clips, changed.inspect().clips, type + " 4 quadros");
      }
    }
    for (const group of ["all", "new", "scene", "marketing"]) {
      document.querySelector("#animation-catalog").click();
      document.querySelector('[data-animation-filter="' + group + '"]').click();
      const field = document.querySelector(".animation-catalog-search");
      field.value = "reels";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      equal(
        Array.from(document.querySelectorAll("[data-template]:not([hidden])"), n => n.dataset.template),
        (await invoke("query.templates", { query: "reels", group })).map(t => t.id),
        group
      );
      document.querySelector("#close-dialog").click();
    }
    const id = await invoke("export.video", { realtime: true });
    await waitUntil(() => e.job(id).state !== "running");
    if (e.job(id).state === "failed") throw Error(e.job(id).error);
    const file = e.job(id).result;
    const v = document.createElement("video"),
      url = URL.createObjectURL(file);
    try {
      await new Promise((ok, fail) => {
        v.onloadedmetadata = ok;
        v.onerror = fail;
        v.src = url;
      });
      return { effects: visible.length - 1, bytes: file.size, dimensions: [v.videoWidth, v.videoHeight] };
    } finally {
      URL.revokeObjectURL(url);
      e.release(id);
    }
  });
  assert.deepEqual(summary.dimensions, [1080, 1920]);
  assert(summary.bytes > 1024);
  t.diagnostic(JSON.stringify(summary));
});

test("montagem móvel mantém cortes e ordem ao rolar, buscar e editar pelo toque", async t => {
  const page = await pageFor(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.evaluate(async () => {
    await invoke("project.example");
    await invoke("view.timeline", { zoom: 3, snap: false });
  });
  const order = await page.evaluate(() => editor.inspect().clips.map(c => c.id));
  const scroll = page.locator(".mlt-scroll");
  await scroll.scrollIntoViewIfNeeded();
  const b = await scroll.boundingBox();
  const client = await page.context().newCDPSession(page);
  const swipe = async (type, points) =>
    client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const x = Math.round(b.x + Math.min(b.width, 310) - 22),
    y = Math.round(b.y + b.height * 0.55);
  await swipe("touchStart", [{ x, y }]);
  for (let offset = 20; offset <= 140; offset += 20) await swipe("touchMove", [{ x: x - offset, y }]);
  await swipe("touchEnd", []);
  await page.waitForFunction(() => editor.inspect().context.timeline.scrollLeft > 0);
  assert.deepEqual(await page.evaluate(() => editor.inspect().clips.map(c => c.id)), order);
  const ruler = page.locator(".mlt-ruler");
  const r = await ruler.boundingBox();
  await page.touchscreen.tap(Math.round(b.x + b.width * 0.45), Math.round(r.y + r.height / 2));
  assert(await page.evaluate(() => editor.inspect().context.time > 0));
  await page.evaluate(async ([first, second]) => {
    await invoke("view.selectClip", { clipId: first });
    const expected = prepare([{ id: "clip.order", clipId: first, index: 1 }]).inspect().clips;
    document.querySelector('[aria-label="Mover clipe para depois"]').click();
    equal(editor.inspect().clips, expected, "ordem");
    await invoke("history.undo");
    const clip = editor.inspect().clips.find(c => c.id === second);
    await invoke("view.selectClip", { clipId: second });
    await invoke("view.seek", { time: clip.start + 1 });
    document.querySelector('[aria-label="Dividir no marcador"]').click();
    const manual = editor.inspect().clips;
    const newId = manual[manual.findIndex(c => c.id === second) + 1].id;
    await invoke("history.undo");
    equal(
      prepare([{ id: "clip.split", clipId: second, offset: 1, newId }]).inspect().clips,
      manual,
      "divisão"
    );
  }, order);
});

test("layouts, canais numéricos e edição de propriedades reproduzem o documento manual", async t => {
  const page = await pageFor(t);
  const summary = await page.evaluate(async () => {
    document.querySelector("#create-composition").click();
    const e = editor,
      compositionId = e.inspect().context.compositionId,
      q = { compositionId };
    const files = new DataTransfer();
    for (const f of ["catalog-product.png", "catalog-avatar.png", "catalog-before.png"]) {
      const blob = await (await fetch("./assets/" + f)).blob();
      files.items.add(new File([blob], f, { type: "image/png" }));
    }
    const input = document.querySelector("[data-cp-file]");
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitUntil(() => e.inspect(q).layers.length === 3);
    document.querySelector("[data-cp-layouts]").click();
    const layouts = Array.from(
      document.querySelectorAll("[data-image-layout]"),
      el => el.dataset.imageLayout
    );
    document.querySelector("#layout-cancel").click();
    for (const layout of layouts) {
      document.querySelector("[data-cp-layouts]").click();
      document.querySelector('[data-image-layout="' + layout + '"]').click();
      document.querySelectorAll(".image-layout-files input:not(:checked)").forEach(el => el.click());
      const layers = e.inspect(q).layers.map(l => l.id);
      const expected = prepare([
        { id: "layer.layout", compositionId, layerIds: layers, layout, time: 0 },
      ]).inspect(q);
      document.querySelector("#layout-apply").click();
      equal(e.inspect(q).layers, expected.layers, layout);
      await invoke("history.undo");
    }
    document.querySelector('[data-cp-add="text"]').click();
    const layerId = e.inspect().context.layerId,
      target = { layerId, compositionId };
    for (const [prop, value] of Object.entries({
      text: "Texto revisado",
      name: "Camada revisada",
      color: "#867410",
      fontSize: 45,
      start: 0.5,
      end: 3.5,
    })) {
      const command = { id: "layer.set", ...target, fields: { [prop]: value } };
      const expected = prepare([command]).inspect(q);
      change('[data-cp-prop="' + prop + '"]', value);
      equal(e.inspect(q).layers, expected.layers, prop);
      await invoke("history.undo");
    }
    for (const [channel, value] of Object.entries({
      x: 245,
      y: 440,
      rotation: 13,
      opacity: 0.85,
      reveal: 0.7,
      scaleX: 1.12,
      scaleY: 0.91,
    })) {
      const expected = prepare([{ id: "layer.transform", ...target, time: 0, channel, value }]).inspect(q);
      change(
        '[data-cp-channel="' + channel + '"]',
        ["opacity", "reveal"].includes(channel) ? value * 100 : value
      );
      equal(e.inspect(q).layers, expected.layers, channel);
      await invoke("history.undo");
    }
    return layouts;
  });
  t.diagnostic(summary.join(", "));
});

test("pistas adicionais, grupo, trilha e filtros produzem o mesmo estado dos controles da montagem", async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    await invoke("project.example");
    const e = editor,
      click = selector => document.querySelector(selector).click();
    for (const filter of ["video", "audio", "all"]) {
      click('[data-filter="' + filter + '"]');
      const expected = document.querySelector("#library-items").textContent;
      await invoke("view.library", { filter });
      equal(document.querySelector("#library-items").textContent, expected, filter);
    }
    for (const kind of ["video", "audio"]) {
      click('[aria-label^="Adicionar pista."]');
      click("#add-" + kind + "-track");
      let track = e.inspect().tracks.at(-1);
      const trackId = track.id,
        asset = kind === "audio" ? "builtin/sound" : "builtin/tide";
      await invoke("history.undo");
      prepare([{ id: "track.add", trackId, kind }]).apply();
      equal(e.inspect({ trackId }).track, track, "pista");
      await invoke("view.seek", { time: 1 });
      click('button[data-lane="' + trackId + '"]');
      click("#lane-example");
      await waitUntil(() => e.inspect({ trackId }).track.clips.length === 1);
      const manual = e.inspect({ trackId }).track,
        clipId = manual.clips[0].id;
      await invoke("history.undo");
      const inserted = prepare([{ id: "media.insert", clipId, trackId, asset, start: 1 }]);
      equal(inserted.inspect({ trackId }).track, manual, kind + " inserir");
      inserted.apply();
      const q = { trackId, clipId },
        fields = { start: 2, trim: 0.25, duration: 1.5 };
      const changed = prepare([{ id: "clip.set", ...q, fields }]);
      click('[data-lane="' + trackId + '"] .lane-block');
      document.querySelector("#lane-start").value = 2;
      document.querySelector("#lane-trim").value = 0.25;
      document.querySelector("#lane-length").value = 1.5;
      click("#lane-apply");
      equal(e.inspect(q).clip, changed.inspect(q).clip, "recorte na pista");
      // The manual insertion ends at the succeeding clip.
      await invoke("view.seek", { time: 0 });
      click('button[data-lane="' + trackId + '"]');
      click("#lane-example");
      await waitUntil(() => e.inspect({ trackId }).track.clips.length === 2);
      const gap = e.inspect({ trackId }).track;
      await invoke("history.undo");
      equal(
        prepare([{ id: "media.insert", clipId: gap.clips.at(-1).id, trackId, asset, start: 0 }]).inspect({
          trackId,
        }).track,
        gap,
        "espaço livre"
      );
      const removed = prepare([{ id: "clip.remove", ...q }]);
      click('[data-lane="' + trackId + '"] .lane-block');
      click("#lane-delete");
      equal(e.inspect({ trackId }).track, removed.inspect({ trackId }).track, "excluir clipe");
      const noTrack = prepare([{ id: "track.remove", trackId }]);
      click('button[data-lane="' + trackId + '"]');
      click("#lane-remove");
      equal(e.inspect().tracks, noTrack.inspect().tracks, "excluir pista");
    }
    await invoke("view.sound");
    const enabled = !e.inspect().sound.enabled;
    const toggle = prepare([{ id: "sound.set", enabled }]);
    click("#sound-toggle");
    equal(e.inspect().sound, toggle.inspect().sound, "silenciar");
    const volume = 0.31,
      vol = prepare([{ id: "sound.set", volume }]);
    const range = document.querySelector("#volume");
    range.value = volume;
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    equal(e.inspect().sound, vol.inspect().sound, "volume");
    const clipIds = e
      .inspect()
      .clips.slice(0, 2)
      .map(c => c.id);
    await invoke("view.group", { clipIds });
    const duration = 3,
      shortened = prepare([{ id: "clips.shorten", clipIds, duration }]);
    document.querySelector("#group-seconds").value = duration;
    click("#group-apply");
    equal(e.inspect().clips, shortened.inspect().clips, "grupo");
  });
});

test("arrastar início e chave na régua e editar a Bézier usa os tempos e valores do documento", async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    document.querySelector("#create-composition").click();
    document.querySelector('[data-cp-add="triangle"]').click();
    const { compositionId, layerId } = editor.inspect().context;
    window.target = { compositionId, layerId };
    prepare([
      { id: "key.set", ...target, channel: "rotation", time: 1, value: 15, ease: [0.33, 0, 0.67, 1] },
    ]).apply();
    await invoke("view.timeline", { snap: false, channel: "rotation", curves: true, keyTime: 1 });
    equal(editor.inspect().context.timeline.keyTime, 1, "seleção de keyframe");
  });
  const drag = async (locator, dx, dy) => {
    await locator.scrollIntoViewIfNeeded();
    const r = await locator.boundingBox(),
      x = Math.round(r.x + r.width / 2),
      y = Math.round(r.y + r.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 6 });
    await page.mouse.up();
  };
  for (const [selector, onset] of [
    ["[data-cp-onset]", true],
    ["[data-cp-key]", false],
  ]) {
    const el = page.locator(selector).first(),
      width = await el.evaluate(el => el.parentElement.getBoundingClientRect().width);
    const dx = 26,
      delta = Math.round(((dx * 4) / width) * 100) / 100;
    await page.evaluate(
      ({ delta, onset }) => {
        const command = onset
          ? { id: "layer.set", ...target, fields: { start: delta } }
          : { id: "key.shift", ...target, channel: "rotation", times: [1], delta };
        window.expected = prepare([command]).inspect(target).layers;
      },
      { delta, onset }
    );
    await drag(el, dx, 0);
    await page.evaluate(() => equal(editor.inspect(target).layers, window.expected, "régua"));
    await page.locator("#undo").click();
  }
  await page.locator("[data-cp-key]").first().click();
  const handle = page.locator('[data-bezier-handle="0"]');
  const { w, h, range } = await handle.evaluate(el => {
    const p = el.parentElement,
      r = p.getBoundingClientRect();
    return { w: r.width, h: r.height, range: +p.dataset.high - +p.dataset.low };
  });
  const v = n => Math.round(n * 1000) / 1000;
  const ease = [v(0.33 + 8 / w), v((6 * range) / h), 0.67, 1];
  await page.evaluate(ease => {
    window.expected = prepare([
      { id: "key.set", ...target, channel: "rotation", time: 1, value: 15, ease },
    ]).inspect(target).layers;
  }, ease);
  await drag(handle, 8, -6);
  await page.evaluate(() => equal(editor.inspect(target).layers, window.expected, "alça Bézier"));
});

test("gestos na tela e na pilha mantêm os mesmos valores e a mesma ordem das camadas", async t => {
  const page = await pageFor(t);
  const state = await page.evaluate(() => {
    document.querySelector("#create-composition").click();
    for (const type of ["square", "circle"]) document.querySelector('[data-cp-add="' + type + '"]').click();
    const { compositionId, layerId } = editor.inspect().context;
    const l = editor.inspect({ compositionId, layerId }).layers[0],
      b = document.querySelector("#screen").getBoundingClientRect();
    const scale = Math.min(b.width / 540, b.height / 960);
    return { compositionId, layerId, x: b.x + b.width / 2, y: b.y + b.height / 2, scale, pose: l.pose };
  });
  const { compositionId, layerId, x, y, scale, pose } = state;
  const dx = 14,
    dy = 9;
  await page.mouse.move(Math.round(x), Math.round(y));
  await page.mouse.down();
  await page.mouse.move(Math.round(x) + dx, Math.round(y) + dy, { steps: 4 });
  await page.mouse.up();
  const manual = await page.evaluate(({ compositionId }) => editor.inspect({ compositionId }).layers, state);
  await page.locator("#undo").click();
  const predicted = await page.evaluate(
    ({ compositionId, layerId, vx, vy }) => {
      return prepare(
        ["x", "y"].map((channel, i) => ({
          id: "layer.transform",
          compositionId,
          layerId,
          channel,
          time: 0,
          value: i ? vy : vx,
        }))
      ).inspect({ compositionId }).layers;
    },
    {
      compositionId,
      layerId,
      vx: Math.round((pose.x + dx / scale) * 1000) / 1000,
      vy: Math.round((pose.y + dy / scale) * 1000) / 1000,
    }
  );
  assert.deepEqual(manual, predicted);
  const buttons = page.locator(".cp-stack [data-cp-sort]");
  await buttons.first().scrollIntoViewIfNeeded();
  const a = await buttons.first().boundingBox(),
    b = await buttons.last().boundingBox();
  const layer = await buttons.first().getAttribute("data-cp-select");
  const ordered = await page.evaluate(
    ({ compositionId, layerId }) =>
      prepare([{ id: "layer.order", compositionId, layerId, index: 0 }]).inspect({ compositionId }).layers,
    { compositionId, layerId: layer }
  );
  await page.mouse.move(a.x + 15, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 15, b.y + b.height * 0.82, { steps: 8 });
  await page.mouse.up();
  assert.deepEqual(
    await page.evaluate(id => editor.inspect({ compositionId: id }).layers, compositionId),
    ordered
  );
});

test("composição procedural legada, duplicação de fonte, corte e inspeção da sessão", async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    const e = editor;
    const input = (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    await invoke("project.example");
    const wave = e.inspect().compositions.find(c => c.kind === "wave"),
      q = { compositionId: wave.id },
      clip = e.inspect().clips.find(c => c.compositionId === wave.id);
    await invoke("view.animation", { ...q, clipId: clip.id });
    for (const [control, key, value] of [
      ["scene-title", "title", "Outra onda"],
      ["custom-color", "color", "#123456"],
      ["speed", "speed", 1.45],
      ["entry", "entry", 0.6],
      ["amplitude", "amplitude", 0.85],
    ]) {
      const candidate = prepare([{ id: "composition.wave", ...q, fields: { [key]: value } }]).inspect(q);
      input(document.getElementById(control), value);
      equal(e.inspect(q).scene, candidate.scene, control);
      await invoke("history.undo");
    }
    document.querySelector("#duplicate-composition").click();
    await waitUntil(() => e.inspect().context.compositionId !== wave.id);
    const copy = e.inspect().context.compositionId,
      actual = e.inspect({ compositionId: copy });
    await invoke("view.montage");
    await invoke("history.undo");
    const expected = prepare([{ id: "composition.duplicate", ...q, newId: copy, clipId: clip.id }]).inspect({
      compositionId: copy,
    });
    equal(actual.scene, expected.scene, "fonte duplicada");
    equal(actual.uses, expected.uses, "ocorrência");
    const video = e.inspect().clips.find(c => c.kind === "video");
    await invoke("view.selectClip", { clipId: video.id });
    for (const [field, key, value] of [
      ["clip-length", "duration", 1.5],
      ["trim", "trim", 0.4],
      ["clip-name", "name", "Recortado"],
    ]) {
      const spec = { id: "clip.set", clipId: video.id, fields: { [key]: value } };
      const expected = prepare([spec]).inspect().clips;
      input(document.getElementById(field), value);
      equal(e.inspect().clips, expected, field);
    }
    const manualIndex = e.inspect().clips.findIndex(c => c.id === video.id);
    document.querySelector('[aria-label="Duplicar clipe"]').click();
    const manual = e.inspect().clips,
      newId = manual[manualIndex + 1].id;
    await invoke("history.undo");
    const clone = prepare([{ id: "clip.duplicate", clipId: video.id, newId }]);
    equal(clone.inspect().clips, manual, "duplicação");
    clone.apply();
    await invoke("view.selectClip", { clipId: newId });
    const del = prepare([{ id: "clip.remove", clipId: newId }]);
    document.querySelector('[aria-label="Excluir clipe"]').click();
    equal(e.inspect().clips, del.inspect().clips, "exclusão");
    const nav = () => e.inspect().context;
    for (const panel of ["media", "props", "preview"]) {
      await invoke("view.panel", { panel });
      equal(nav().panel, panel, "painel");
    }
    await invoke("view.timeline", { snap: true, zoom: 2 });
    equal(nav().timeline.snap, true, "encaixe");
    equal(nav().timeline.zoom, 2, "zoom");
    await invoke("view.seek", { time: 0.3 });
    equal(nav().time, 0.3, "marcador");
    await invoke("view.play");
    await waitUntil(() => nav().playing);
    await invoke("view.play");
    await waitUntil(() => !nav().playing);
    await invoke("view.fullscreen", { enabled: true });
    equal(nav().fullscreen, true, "tela cheia");
    await invoke("view.fullscreen", { enabled: false });
    equal(nav().fullscreen, false, "reduzir prévia");
  });
});

test("os seis comandos de vídeo falado reproduzem as propostas do painel com transcrição existente", async t => {
  const page = await pageFor(t);
  const cases = [
    ["Gere legendas clássicas", "montagem.gerarLegendas", { style: "classic" }],
    ["Encurte as pausas acima de um segundo", "montagem.encurtarPausas", { minimum: 1 }],
    ["Remova as hesitações", "montagem.removerHesitacoes", {}],
    ["Corte a frase “tudo bem”", "montagem.cortarFrase", { phrase: "tudo bem" }],
    ["Sugira um trecho para um reel de 5 segundos", "montagem.sugerirTrecho", { target: 5 }],
    [
      "Use fundo original e cor #123456",
      "montagem.estilizarVideoFalado",
      { background: "original", color: "#123456" },
    ],
  ];
  await page.evaluate(async cases => {
    const e = editor;
    const { TALK_DEFAULTS } = await import("./speech-model.js");
    const wait = () => new Promise(ok => setTimeout(ok, 15));
    for (const [prompt, id, params] of cases) {
      await invoke("project.new", { name: "Fala" });
      prepare([{ id: "media.insert", clipId: "v", asset: "builtin/coast" }]).apply();
      const talk = {
        ...TALK_DEFAULTS,
        captions: "off",
        background: "original",
        speech: {
          start: 0,
          end: 6,
          language: "pt",
          words: [
            ["Aprenda", 0.05, 0.35],
            ["ahn", 0.4, 0.6],
            ["tudo", 0.7, 0.9],
            ["bem", 1, 1.3],
            ["hoje.", 2.9, 3.2],
            ["Acabou!", 5.25, 5.65],
          ].map(([text, start, end]) => ({ text, start, end })),
          voices: [
            [0.05, 1.4],
            [2.9, 3.2],
            [5.2, 5.7],
          ],
        },
      };
      prepare([{ id: "speech.apply", clipId: "v", cuts: [], ripple: true, talk }]).apply();
      const candidate = prepare([{ id, clipId: "v", ...params }]);
      const snapshot = api =>
        api.inspect().clips.map(c => {
          const { id, ...fields } = api.inspect({ clipId: c.id }).clip;
          return fields;
        });
      const expected = snapshot(candidate),
        revision = e.inspect().revision;
      await invoke("view.selectClip", { clipId: "v" });
      document.querySelector("#edit-speech").click();
      await wait();
      document.querySelector("#speech-prompt").value = prompt;
      document.querySelector("#speech-request").requestSubmit();
      await waitUntil(() => !document.querySelector('[data-action="apply"]').disabled);
      document.querySelector('[data-action="apply"]').click();
      await waitUntil(() => e.inspect().revision !== revision);
      equal(snapshot(e), expected, id);
    }
  }, cases);
});

test("a abertura de animação e vídeo, os atalhos e o catálogo cobrem a superfície inicial do editor", async t => {
  const page = await pageFor(t);
  await page.evaluate(async () => {
    const e = editor;
    const groups = [
      ["view.montage", "montage-mode apply-and-return"],
      ["view.animation", "motion-mode edit-scene"],
      ["project.save", "save"],
      ["export.video", "export"],
      ["query.templates", "start-templates animation-catalog starter-template"],
      ["project.animation", "start-blank new-art"],
      ["view.home", "open-start start-continue"],
      ["project.open", "start-open unpack project-file"],
      ["project.fromVideo", "start-video new-video first-video"],
      ["asset.stock", "start-stock-library stock-library"],
      ["project.example", "start-demo reset"],
      ["history.undo", "undo"],
      ["history.redo", "redo"],
      ["composition.create", "menu-composition create-composition"],
      ["project.rename", "rename"],
      ["composition.rename", "rename-animation"],
      ["export.project", "pack"],
      ["narration.generate", "generate-narration"],
      ["speech.edit", "edit-speech"],
      ["composition.duplicate", "duplicate-composition"],
      ["composition.insert", "insert-composition"],
      ["view.panel", "panel:media panel:preview panel:props"],
      ["view.library", "filter:all filter:video filter:audio"],
      ["asset.import", "import media-file"],
      ["layer.add", "starter-text"],
      ["view.seek", "back end"],
      ["view.play", "play"],
      ["view.fullscreen", "full"],
      ["composition.duration", "composition-duration"],
      ["catalog", "project-menu project-assistant"],
      ["plan", "starter-prompt"],
    ];
    // The actual shell independently defines the denominator. New controls require a mapping.
    const actual = Array.from(document.querySelectorAll("button,a,input,select,textarea"))
      .filter(el => el.id || el.dataset.filter || el.dataset.panel)
      .map(el => el.id || (el.dataset.filter ? "filter:" + el.dataset.filter : "panel:" + el.dataset.panel));
    const response = await fetch("./index.html");
    const source = new DOMParser().parseFromString(await response.text(), "text/html");
    const permanent = Array.from(source.querySelectorAll("button,a,input,select,textarea")).map(
      el => el.id || (el.dataset.filter ? "filter:" + el.dataset.filter : "panel:" + el.dataset.panel)
    );
    equal(groups.flatMap(([, ids]) => ids.split(" ")).sort(), permanent.sort(), "inventário da interface");
    const catalog = e.catalog().map(s => s.id);
    for (const [cmd, ids] of groups) {
      if (
        !catalog.includes(cmd) &&
        typeof e[cmd] !== "function" &&
        !(cmd === "narration.generate" && document.getElementById("generate-narration").hidden)
      )
        throw Error("Sem comando para " + ids);
      for (const id of ids.split(" ")) if (!actual.includes(id)) throw Error("Controle ausente " + id);
    }
    await invoke("view.home", { open: true });
    equal(e.inspect().context.home, true, "início");
    document.querySelector("#start-blank").click();
    const form = () => {
      const state = e.inspect();
      return [
        state.name,
        state.context.mode,
        state.clips.length,
        state.compositions.map(c => [c.name, c.duration, c.layers.length]),
      ];
    };
    const blank = form();
    await invoke("project.animation");
    equal(form(), blank, "novo desenho");
    const sample = new File([await (await fetch("./assets/coast.mp4")).blob()], "Costa.mp4", {
      type: "video/mp4",
    });
    const el = document.querySelector("#first-video"),
      files = new DataTransfer();
    files.items.add(sample);
    el.files = files.files;
    const old = e.inspect().revision;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await waitUntil(() => e.inspect().revision > old);
    const movie = () => e.inspect().clips.map(c => [c.name, c.kind, c.duration, c.trim]);
    const manual = movie();
    await invoke("project.fromVideo", { file: sample });
    equal(movie(), manual, "novo vídeo");
    await invoke("project.save");
    return true;
  });
  await page.reload();
  await page.waitForFunction(() => document.getElementById("project-name").textContent === "Costa");
  const restored = await page.evaluate(async () => {
    const { projectEditor } = await import("./app.js");
    return projectEditor.inspect().clips[0];
  });
  assert.equal(restored.name, "Costa.mp4");
  assert.equal(restored.duration, 6);
});
