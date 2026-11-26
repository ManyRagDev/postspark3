import { interpretGroupDuration } from "./composition-ai.js";
import { evaluateLayer } from "./composition-model.js";
import { FPS } from "./montage-model.js";

const fail = message => {
  throw Error(message);
};
const epsilon = 1e-6;
const close = (a, b) => Math.abs(a - b) < epsilon;
const canonical = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const amount = s =>
  ["um", "uma", "mais um", "mais uma"].includes(canonical(s)) ? 1 : Number(s.replace(",", "."));
const frame = t => Math.ceil((t - epsilon) * FPS) / FPS;

function occurrence(project, compositionId, clipId) {
  const uses = project.clips.filter(c => c.compositionId === compositionId);
  return uses.find(c => c.id === clipId) ?? (uses.length === 1 ? uses[0] : undefined);
}
// Restrict an instance edit to that occurrence even when the source is reused.
function scopedSource(project, source, clip) {
  const uses = project.clips.filter(c => c.compositionId === source.id);
  if (uses.length <= 1) return { compositionId: source.id, commands: [] };
  if (!clip) fail("Essa composição aparece em vários clipes. Selecione a ocorrência desejada.");
  const newId = crypto.randomUUID();
  return {
    compositionId: newId,
    commands: [{ id: "composition.duplicate", compositionId: source.id, newId, clipId: clip.id }],
  };
}
export function replaceText(project, before, after, extra, context) {
  const candidates = project.compositions.flatMap(source =>
    (source.document?.layers ?? [])
      .filter(l => l.type === "text" && l.text === before)
      .map(layer => ({ source, layer }))
  );
  if (!candidates.length) fail("Não encontrei uma camada de texto com essa frase.");
  const inScope = candidates.filter(
    c => c.source.id === context.compositionId && (!context.layerId || c.layer.id === context.layerId)
  );
  const match = candidates.length === 1 ? candidates[0] : inScope.length === 1 ? inScope[0] : null;
  if (!match) fail("Encontrei a frase em várias camadas. Selecione a camada desejada na Animação.");
  const { source, layer } = match;
  const clip = occurrence(project, source.id, context.clipId);
  const { compositionId, commands } = scopedSource(project, source, clip);
  const edit = { id: "layer.set", compositionId, layerId: layer.id, fields: { text: after } };
  commands.push(edit);
  const clipShowsLayer = clip && clip.trim < layer.end && layer.start < clip.trim + clip.duration;
  const limit = Math.min(layer.end, clipShowsLayer ? clip.trim + clip.duration : source.duration);
  let previewTime = Math.max(clipShowsLayer ? clip.trim : 0, layer.start, limit - 1 / FPS);
  if (extra) {
    if (!clip || layer.end <= clip.trim || layer.start >= clip.trim + clip.duration)
      fail("Escolha uma ocorrência visível dessa frase na montagem.");
    const cut = clip.trim + clip.duration,
      oldEnd = Math.min(layer.end, cut);
    const pose = evaluateLayer(layer, oldEnd - 1 / FPS);
    if (pose.opacity < 0.99 || pose.reveal < 0.99 || pose.scaleX <= 0 || pose.scaleY <= 0)
      fail("A frase tem uma saída animada. Indique o trecho de leitura que deseja prolongar.");
    const end = oldEnd + extra;
    if (end > cut + epsilon && project.clips.at(-1) !== clip)
      fail("Esse ajuste deslocaria os cortes seguintes. Indique se deseja prolongar a montagem.");
    if (
      end > cut + epsilon &&
      project.extraTracks?.some(t =>
        t.clips.some(c => c.start + c.duration > project.clips.reduce((n, v) => n + v.duration, 0) + epsilon)
      )
    )
      fail("Há conteúdo em outra pista após o encerramento. Escolha o ponto de extensão.");
    if (layer.end < end) edit.fields.end = end;
    if (end > cut + epsilon) {
      if (!close(cut, source.duration))
        fail("Há conteúdo recortado depois da chamada. Indique se deseja revelá-lo.");
      // A terminal hold extends only layers present in the original last frame.
      for (const l of source.document.layers) {
        if (l.end < cut - epsilon) continue;
        if (
          Object.values(l.keys).some(keys => keys.some(k => k.t + l.start > cut + epsilon)) ||
          l.start >= cut
        )
          fail("Há animação depois do corte. Indique quais camadas devem continuar.");
        if (l !== layer && l.end < end)
          commands.push({ id: "layer.set", compositionId, layerId: l.id, fields: { end } });
      }
      commands.push(
        { id: "composition.duration", compositionId, duration: end },
        { id: "clip.set", clipId: clip.id, fields: { duration: end - clip.trim } }
      );
    }
    previewTime = end - 1 / FPS;
  }
  return {
    commands,
    summary:
      "“" +
      before +
      "” → “" +
      after +
      "” em " +
      source.name +
      (extra ? " · leitura prolongada em " + extra + " s" : ""),
    preview: { compositionId, time: previewTime, clipId: clipShowsLayer ? clip.id : undefined },
  };
}

function entrance(layer, at) {
  const rest = evaluateLayer(layer, at);
  const opacity = layer.keys.opacity;
  if (!opacity.length && rest.opacity > 0 && Object.values(layer.keys).every(keys => keys.length === 0)) {
    return { layer, start: layer.start, end: layer.start + 6 / FPS, segments: [], static: true };
  }
  if (layer.props.opacity !== 0 || rest.opacity < 0.99 || rest.reveal < 0.99)
    fail("Não consegui isolar uma entrada por opacidade nesse card.");
  const first = opacity.findIndex(k => k.value > 0);
  const full = opacity.findIndex(k => k.value >= 0.99);
  if (first < 0 || full < first || opacity[full].t + layer.start > at)
    fail("A entrada do card não ficou determinada.");
  const start = layer.start + (opacity[first - 1]?.t ?? 0);
  const segments = [];
  let end = layer.start + opacity[full].t;
  for (const [channel, keys] of Object.entries(layer.keys)) {
    const early = keys.filter(k => k.t + layer.start <= at + epsilon);
    if (!early.length) continue;
    // Require a sustained pose after the entrance. Preserve the key that starts the exit.
    const arrived = early.findIndex(
      (k, i) =>
        close(k.value, rest[channel]) && early.slice(i).every(next => close(next.value, rest[channel]))
    );
    if (arrived < 0) fail("O card continua em movimento. Escolha a fase de entrada.");
    const segment = early.slice(0, arrived + 1);
    if (segment.every(k => close(k.value, layer.props[channel]))) continue;
    end = Math.max(end, layer.start + segment.at(-1).t);
    segments.push({ channel, keys: segment });
  }
  return { layer, start, end, segments };
}

export function sequenceCards(project, context) {
  const groups = project.compositions
    .map(source => ({
      source,
      cards:
        source.document?.layers.filter(l => /\b(card|cart[aã]o)\b/i.test(l.name) && l.type !== "text") ?? [],
    }))
    .filter(x => x.cards.length === 3);
  const group = groups.find(x => x.source.id === context.compositionId) ?? (groups.length === 1 && groups[0]);
  if (!group) fail("Escolha uma composição com três cards identificados pelo nome.");
  const { source, cards } = group,
    at = source.duration / 2;
  if (!cards.every(l => l.start <= at && at < l.end))
    fail("Os três cards precisam de um instante comum de leitura.");
  const sorted = cards.map(l => ({ l, pose: evaluateLayer(l, at) })).sort((a, b) => a.pose.x - b.pose.x);
  if (sorted.some((v, i) => i && Math.abs(v.pose.x - sorted[i - 1].pose.x) < 1))
    fail("Os cards se sobrepõem no eixo horizontal. Indique qual deles é o central.");
  const clip = occurrence(project, source.id, context.clipId);
  const { compositionId, commands } = scopedSource(project, source, clip);
  const [left, middle, right] = sorted.map(({ l }) => entrance(l, at));
  const sides = [left, right].sort((a, b) => a.start - b.start);
  let previousEnd = -1;
  for (const { layer, start, end, segments, static: needsFade } of [...sides, middle]) {
    const delta = Math.max(0, frame(previousEnd + 1 / FPS - start));
    if (needsFade) {
      const target = { compositionId, layerId: layer.id, channel: "opacity" };
      commands.push(
        { id: "layer.pose", compositionId, layerId: layer.id, fields: { opacity: 0 } },
        { id: "key.set", ...target, time: delta, value: 0, ease: "linear" },
        { id: "key.set", ...target, time: delta + 6 / FPS, value: layer.props.opacity, ease: "out" }
      );
    }
    if (delta)
      for (const { channel, keys } of segments) {
        commands.push({
          id: "key.shift",
          compositionId,
          layerId: layer.id,
          channel,
          times: keys.map(k => k.t),
          delta,
        });
        if (keys[0].t > epsilon) {
          commands.push({
            id: "key.set",
            compositionId,
            layerId: layer.id,
            channel,
            time: delta,
            value: layer.props[channel],
            ease: "hold",
          });
        }
      }
    previousEnd = end + delta;
  }
  if (!commands.some(c => c.id === "key.shift" || c.id === "key.set"))
    fail("Os cards já entram em sequência com o central por último.");
  if (previousEnd > at) fail("A sequência ultrapassaria o repouso dos cards. Indique um intervalo maior.");
  return {
    commands,
    summary: "Ordem de entrada: " + [...sides, middle].map(v => v.layer.name).join(" → "),
    preview: { compositionId, time: previousEnd - 1 / FPS, clipId: clip?.id },
  };
}

const textRequest =
  /^(?:troque|substitua|altere|mude)\s+["'“‘«]([^"'”’»]+)["'”’»]\s+(?:por|para)\s+["'“‘«]([^"'”’»]+)["'”’»](?:\s+e\s+(?:deixe|mantenha)\s+(?:a frase|o texto|a chamada)\s+vis[ií]vel\s+por\s+mais\s+(um|uma|\d+(?:[.,]\d+)?)\s+segundos?)?$/iu;
const cardsRequest =
  /^(?:faca |coloque )?os (?:tres|3) (?:cards|cartoes) (?:entrarem|entrar) em sequencia[, ]+e (?:deixe|coloque) o (?:do meio|central) por ultimo$/;
export function isProjectRequest(request) {
  const text = request.trim().replace(/[.!?]$/, "");
  return textRequest.test(text) || cardsRequest.test(canonical(text));
}
export function planProjectRequest(project, request, context = {}) {
  const text = request.trim().replace(/[.!?]$/, "");
  const change = text.match(textRequest);
  if (change) return replaceText(project, change[1], change[2], change[3] ? amount(change[3]) : 0, context);
  if (cardsRequest.test(canonical(text))) return sequenceCards(project, context);
  const rename = text.match(/^(?:renomeie|renomear|mude o nome d[oe]) (?:o )?projeto para (.+)$/iu);
  if (rename) {
    const name = rename[1].replace(/^["'“‘«]|["'”’»]$/gu, "").trim();
    return { summary: "Renomear projeto para “" + name + "”", commands: [{ id: "project.rename", name }] };
  }
  const volume = canonical(text).match(
    /^(?:ajuste|defina|coloque|deixe) (?:o )?volume da trilha (?:em|para) (\d{1,3})\s*%$/
  );
  if (volume)
    return {
      summary: "Volume da trilha · " + volume[1] + "%",
      commands: [{ id: "sound.set", volume: Number(volume[1]) / 100 }],
    };
  if (context.group?.length >= 2) {
    let duration;
    try {
      duration = interpretGroupDuration(text);
    } catch {
      return null;
    }
    return {
      summary: "Encurtar " + context.group.length + " clipes para " + duration + " s",
      commands: [{ id: "clips.shorten", clipIds: context.group, duration }],
    };
  }
  return null;
}
