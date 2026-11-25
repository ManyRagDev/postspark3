import assert from "node:assert/strict";
import test from "node:test";
import { newLayer, newComposition, evaluateLayer, setKey } from "../dist/composition-model.js";
import { createEditorSession } from "../dist/editor-session.js";
import { commandCatalog, prepareBatch } from "../dist/editor-commands.js";
import { planProjectRequest } from "../dist/project-requests.js";
import { sourceClip, validateProject } from "../dist/project-model.js";

function project(shared = false) {
  const document = newComposition();
  document.layers = [
    newLayer("text", 5, { id: "cta", name: "Chamada", text: "Experimente agora" }),
    newLayer("square", 5, { id: "button", name: "Botão" }),
    newLayer("circle", 3, { id: "earlier" }),
  ];
  setKey(document.layers[0], "opacity", 0.5, 0);
  setKey(document.layers[0], "opacity", 0.9, 1, [0.3, 0, 0.8, 1]);
  const c = { id: "source", name: "Fecho", duration: 5, kind: "composition", document };
  return validateProject({
    name: "Filme",
    compositions: [c],
    clips: [...(shared ? [sourceClip(c, "first")] : []), sourceClip(c, "last")],
    sound: { enabled: false, volume: 0 },
  });
}
const request =
  "Troque ‘Experimente agora’ por ‘Crie seu primeiro post’ e deixe a frase visível por mais um segundo";
function session(initial, context = {}, operations = {}) {
  let p = initial,
    revision = 0;
  const editor = createEditorSession({
    current: () => p,
    revision: () => revision,
    context: () => context,
    services: { operations, projectEpoch: () => 0 },
    commit: q => {
      p = q;
      revision++;
    },
  });
  return { editor, current: () => p };
}

test("CTA estende o fecho e as camadas de sustentação sem tocar nas curvas, mídia ou camadas anteriores", async () => {
  const original = project(),
    { editor, current } = session(original);
  const { proposal } = await editor.plan(request);
  assert.equal(proposal.inspect().duration, 6);
  assert.equal(current().clips[0].duration, 5);
  proposal.apply();
  const [cta, button, other] = current().compositions[0].document.layers;
  assert.equal(cta.text, "Crie seu primeiro post");
  assert.deepEqual(cta.keys, original.compositions[0].document.layers[0].keys);
  assert.equal(cta.end, 6);
  assert.equal(button.end, 6);
  assert.equal(other.end, 3);
  assert.deepEqual(current().sound, original.sound);
  assert.throws(() => proposal.apply(), /mudou|aplicada/);
});

test("a revisão impede uma aplicação tardia e uma falha no final do lote preserva o projeto inteiro", async () => {
  const p = project(),
    { editor, current } = session(p);
  const { proposal } = await editor.plan(request);
  assert.throws(
    () =>
      editor.prepare(0, [
        { id: "project.rename", name: "Novo" },
        { id: "clip.remove", clipId: "ausente" },
      ]),
    /ausente/
  );
  assert.equal(current(), p);
  editor.prepare(0, [{ id: "project.rename", name: "Nome manual" }]).apply();
  assert.throws(() => proposal.apply(), /mudou/);
  assert.equal(current().name, "Nome manual");
  assert.deepEqual(current().clips, p.clips);
});
test("fontes compartilhadas exigem ocorrência inequívoca e isolam a alteração final", () => {
  const p = project(true);
  assert.throws(() => planProjectRequest(p, request), /vários clipes/);
  const { commands } = planProjectRequest(p, request, { clipId: "last" });
  const candidate = prepareBatch(p, commands);
  assert.deepEqual(candidate.clips[0], p.clips[0]);
  assert.deepEqual(candidate.compositions[0], p.compositions[0]);
  assert.notEqual(candidate.clips[0].compositionId, candidate.clips[1].compositionId);
  assert.equal(candidate.compositions[1].document.layers[0].text, "Crie seu primeiro post");
});
test("a entrada dos cards usa a pose, mantém saída e curva de chegada e não depende da posição no array", () => {
  const p = project(),
    c = p.compositions[0];
  c.document.layers = [
    ["top", 270, 0.1],
    ["margem", 390, 0.8],
    ["azul", 150, 0.5],
  ].map(([id, x, t]) => {
    const l = newLayer("square", 5, { id, name: "Card " + id, props: { x, opacity: 0 } });
    for (const [time, value] of [
      [0, 0],
      [t, 0],
      [t + 0.35, 1],
      [4, 1],
      [4.5, 0],
    ])
      setKey(l, "opacity", time, value, [0.2, 0.3, 0.8, 0.9]);
    setKey(l, "x", 0, x - 10);
    setKey(l, "x", t + 0.35, x, "out");
    setKey(l, "x", 4, x);
    setKey(l, "x", 4.5, x + 5);
    return l;
  });
  const { commands } = planProjectRequest(
    p,
    "Faça os três cards entrarem em sequência e deixe o do meio por último"
  );
  const next = prepareBatch(p, commands).compositions[0].document.layers;
  const appearance = l =>
    Array.from({ length: 75 }, (_, i) => i / 30).find(t => evaluateLayer(l, t).opacity > 0.02);
  assert.deepEqual(
    [...next].sort((a, b) => appearance(a) - appearance(b)).map(l => l.id),
    ["azul", "margem", "top"]
  );
  for (const [i, l] of next.entries()) {
    const old = c.document.layers[i];
    for (const axis of ["opacity", "x"]) {
      assert.deepEqual(
        l.keys[axis].filter(k => k.t >= 4),
        old.keys[axis].filter(k => k.t >= 4)
      );
      assert.deepEqual(
        l.keys[axis].map(({ value, ease }) => [value, ease]),
        old.keys[axis].map(({ value, ease }) => [value, ease])
      );
    }
    assert.deepEqual(evaluateLayer(l, 2.5), evaluateLayer(old, 2.5));
  }
});
test("catálogo constrói e edita por IDs, incluindo transformação conjunta, Bézier, transição, corte e trilha", () => {
  const p = project();
  const commands = [
    { id: "composition.create", compositionId: "art", name: "Arte", duration: 3 },
    { id: "layer.add", compositionId: "art", layerId: "title", type: "text", fields: { text: "Maré" } },
    {
      id: "key.set",
      compositionId: "art",
      layerId: "title",
      channel: "x",
      time: 0,
      value: 200,
      ease: [0.2, 0.3, 0.8, 0.9],
    },
    { id: "layer.transform", compositionId: "art", layerId: "title", time: 1, channel: "y", value: 300 },
    { id: "composition.insert", compositionId: "art", clipId: "a", time: 5 },
    { id: "clip.split", clipId: "a", offset: 1, newId: "b" },
    { id: "transition.set", clipId: "b", fromId: "a", type: "cross_dissolve", frames: 10 },
    { id: "track.add", trackId: "audio", kind: "audio" },
    { id: "media.insert", trackId: "audio", clipId: "bed", asset: "imported", start: 0 },
    { id: "sound.set", volume: 0.5, enabled: true },
  ];
  const result = prepareBatch(p, commands, {
    media: () => ({ name: "Trilha", assetId: "audio.1", duration: 3 }),
  });
  const { editor } = session(result);
  assert.deepEqual(editor.inspect({ trackId: "audio" }).track, result.extraTracks[0]);
  assert(commandCatalog().every(c => c.manual && c.params));
  assert.deepEqual(
    result.clips.map(c => [c.id, c.duration, c.trim]),
    [
      ["last", 5, 0],
      ["a", 1, 0],
      ["b", 2, 1],
    ]
  );
  assert.equal(result.clips[2].transitionIn.frames, 10);
  const l = result.compositions[1].document.layers[0];
  assert.deepEqual(l.keys.x[0].ease, [0.2, 0.3, 0.8, 0.9]);
  assert.equal(l.keys.x[1].t, l.keys.y[0].t);
  assert.equal(l.keys.y[0].value, 300);
  assert.equal(result.extraTracks[0].clips[0].assetId, "audio.1");
  assert.throws(() => prepareBatch(p, [{ id: "sound.set", volume: 2 }]));
});
test("o interpretador de composição também produz um lote consultável do projeto", async () => {
  const { editor } = session(project(), { compositionId: "source", layerId: "cta" });
  const plan = await editor.plan("Atrase a entrada do título em seis quadros");
  assert.equal(plan.proposal.inspect({ compositionId: "source", layerId: "cta" }).layers[0].start, 0.2);
});

test("editar uma camada em lote mantém as opções de curva, ordem, posição e exclusão", () => {
  const p = project(),
    id = "source";
  const commands = [
    { id: "composition.background", compositionId: id, color: "#334455" },
    { id: "composition.rename", compositionId: id, name: "Cena final" },
    { id: "layer.order", compositionId: id, layerId: "cta", index: 2 },
    { id: "key.remove", compositionId: id, layerId: "cta", channel: "opacity", time: 0.5 },
    { id: "layer.remove", compositionId: id, layerId: "earlier" },
    {
      id: "layer.resize",
      compositionId: id,
      layerId: "button",
      time: 1,
      corner: { x: 1, y: 1 },
      delta: { x: 20, y: 20 },
      locked: true,
    },
  ];
  const q = prepareBatch(p, commands),
    doc = q.compositions[0].document;
  assert.deepEqual(
    doc.layers.map(l => l.id),
    ["button", "cta"]
  );
  assert.deepEqual(doc.layers[1].keys.opacity, p.compositions[0].document.layers[0].keys.opacity.slice(1));
  assert(doc.layers[0].props.scaleX > 1 && doc.layers[0].props.scaleX === doc.layers[0].props.scaleY);
  assert.equal(doc.background, "#334455");
});

test("correção do vídeo falado usa os mesmos intervalos do modelo de fala e respeita a revisão", async () => {
  const { TALK_DEFAULTS, applySpeechEdit, planSpeechCuts } = await import("../dist/speech-model.js");
  const p = project(),
    c = {
      id: "v",
      kind: "video",
      assetId: "coast",
      name: "Fala",
      trim: 0,
      duration: 5,
      talk: {
        ...TALK_DEFAULTS,
        speech: {
          start: 0,
          end: 5,
          language: "pt",
          words: [
            { text: "Olá", start: 0.1, end: 0.5 },
            { text: "Maré", start: 3, end: 3.3 },
          ],
          voices: [
            [0, 0.5],
            [3, 5],
          ],
        },
      },
    };
  p.clips.unshift(c);
  const cuts = planSpeechCuts(c, c.talk, { pauses: true, minimum: 1, margin: 0.15 }).cuts;
  const expected = applySpeechEdit(p, c, { ...c.talk, captions: "classic" }, cuts, true);
  const { editor, current } = session(p, { clipId: "v" });
  (await editor.plan("Encurte as pausas maiores que um segundo e gere legendas simples")).proposal.apply();
  assert.deepEqual(
    current().clips.map(({ id, ...c }) => c),
    expected.clips.map(({ id, ...c }) => c)
  );
});

test("um trabalho lê a revisão congelada e comunica resultado, falha e cancelamento", async () => {
  let p = project(),
    rev = 0,
    finish;
  const editor = createEditorSession({
    current: () => p,
    revision: () => rev,
    commit: next => {
      p = next;
      rev++;
    },
    context: () => ({}),
    services: {
      operations: {
        read: {
          manual: "Ler",
          params: {},
          kind: "job",
          run: async (_, snapshot, signal, progress) => {
            progress(0.5, "Metade");
            await new Promise(done => {
              finish = done;
            });
            signal.throwIfAborted();
            return snapshot.name;
          },
        },
        fail: {
          manual: "Falhar",
          params: {},
          kind: "job",
          run: () => {
            throw Error("Mídia ausente");
          },
        },
      },
    },
  });
  const id = await editor.invoke("read", {}, 0);
  editor.prepare(0, [{ id: "project.rename", name: "Outra revisão" }]).apply();
  assert.equal(editor.job(id).progress, 0.5);
  finish();
  await new Promise(r => setImmediate(r));
  assert.equal(editor.job(id).result, "Filme");
  assert.equal(editor.job(id).revision, 0);
  const failure = await editor.invoke("fail", {}, 1);
  await new Promise(r => setImmediate(r));
  assert.equal(editor.job(failure).state, "failed");
  assert.equal(editor.job(failure).error, "Mídia ausente");
  const cancelled = await editor.invoke("read", {}, 1);
  editor.release(cancelled);
  finish();
  await new Promise(r => setImmediate(r));
  assert.throws(() => editor.job(cancelled), /ausente/);
  await assert.rejects(() => editor.invoke("read", {}, 0), /mudou/);
});

test("uma edição manual durante o render invalida a entrega e a confirmação do candidato", async () => {
  let complete;
  const operations = { "export.video": { run: (_, candidate) => {
    assert.equal(candidate.name, "Candidato");
    return new Promise(done => { complete = done; });
  }}};
  const { editor, current } = session(project(), {}, operations);
  const plan = editor.prepare(0, [{id:"project.rename",name:"Candidato"}]);
  const rendering = plan.exportCandidate("video", new AbortController().signal);
  editor.prepare(0, [{id:"project.rename",name:"Edição manual"}]).apply();
  complete(new Blob(["vídeo"]));
  await assert.rejects(rendering, /projeto mudou/i);
  assert.throws(() => plan.apply(), /projeto mudou/i);
  assert.equal(current().name, "Edição manual");
});
