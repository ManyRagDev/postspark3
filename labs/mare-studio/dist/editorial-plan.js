import { FPS } from "./montage-model.js";

const fail = msg => {
  throw Error(msg);
};
const text = v => typeof v === "string" && v.trim() && v.length <= 256;
const range = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const integer = (v, lo, hi) => Number.isInteger(v) && range(v, lo, hi);
const color = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

// Recover a model-added sentence period on the final literal CTA. Leave every other line intact.
export function restoreLiteralCta(script, cta) {
  const last = script?.shots?.at?.(-1);
  if (
    !cta ||
    !Array.isArray(last?.copy) ||
    last.copy.includes(cta) ||
    !last.copy.some(line => line === cta + ".")
  )
    return script;
  return {
    ...script,
    shots: [
      ...script.shots.slice(0, -1),
      { ...last, copy: last.copy.map(line => (line === cta + "." ? cta : line)) },
    ],
  };
}

export function validateScript(script, { assets, targetFrames, cta }) {
  const find = (id, kind) => assets.find(a => a.id === id && a.kind === kind);
  if (!text(script?.title) || !Array.isArray(script.shots) || !integer(script.shots.length, 1, 16))
    fail("O roteiro precisa de um título e de 1 a 16 cenas.");
  let frames = 0;
  for (const s of script.shots) {
    if (
      !text(s?.name) ||
      !integer(s.frames, 1, targetFrames) ||
      typeof s.evidence !== "string" ||
      !s.evidence.trim() ||
      !Array.isArray(s.copy) ||
      !s.copy.every(text) ||
      !Array.isArray(s.images) ||
      !s.images.every(id => find(id, "image")) ||
      s.copy.length + s.images.length > 8
    )
      fail("Cena, texto ou referência inválida no roteiro.");
    if (s.video != null) {
      const v = find(s.video, "video");
      if (!v || (!(s.copy.length || s.images.length) && s.frames > v.duration * FPS + 1e-5))
        fail("A cena de gravação não cabe na fonte ou contém camadas incompatíveis.");
    } else if (!s.copy.length && !s.images.length) fail("Cena vazia no roteiro.");
    frames += s.frames;
  }
  if (frames !== targetFrames) fail("A duração do roteiro diverge do briefing: " + frames + " quadros.");
  if (script.music != null && !find(script.music, "audio")) fail("Trilha desconhecida.");
  if (
    cta &&
    (script.shots.at(-1).video != null ||
      !script.shots.at(-1).copy.includes(cta) ||
      script.shots.flatMap(s => s.copy).filter(t => t === cta).length !== 1)
  )
    fail("A chamada final precisa ter uma camada de texto própria e única.");
}

export function compileDirection(script, direction, { assets, cta }, adjustments = []) {
  if (!Array.isArray(direction?.shots) || direction.shots.length !== script.shots.length)
    fail("A direção precisa cobrir todas as cenas do roteiro.");
  const commands = [{ id: "project.rename", name: script.title }];
  let cursor = 0;
  // V1 can play a recording or a layered composition. For mixed beats the director
  // chooses the cut; both pieces keep their editable sources and total frame count.
  const cuts = script.shots.flatMap((s, i) => {
    const d = direction.shots[i];
    if (s.video == null || (!s.copy.length && !s.images.length)) return [[s, d]];
    if (!integer(d?.graphicFrames, 1, s.frames - 1))
      fail("Indique o corte entre os cards e a gravação em " + s.name);
    return [
      [{ ...s, video: null, frames: d.graphicFrames }, d],
      [
        {
          ...s,
          name: s.name + " · gravação",
          images: [],
          copy: [],
          frames: s.frames - d.graphicFrames,
        },
        d,
      ],
    ];
  });
  for (const [i, [s, d]] of cuts.entries()) {
    const compositionId = "scene-" + (i + 1),
      clipId = "shot-" + (i + 1);
    const duration = s.frames / FPS;
    if (s.video != null) {
      const lastFrame = Math.floor(assets.find(a => a.id === s.video).duration * FPS + 1e-5);
      if (!integer(d?.trimFrame, 0, lastFrame - s.frames)) fail("Recorte fora da gravação original.");
      commands.push(
        { id: "media.insert", clipId, asset: s.video },
        {
          id: "clip.set",
          clipId,
          fields: { name: s.name, trim: d.trimFrame / FPS, duration },
        }
      );
    } else {
      if (
        !color(d?.background) ||
        !Array.isArray(d.layers) ||
        d.layers.length !== s.copy.length + s.images.length
      )
        fail("A direção omitiu camadas ou o fundo da cena " + s.name);
      const used = new Set();
      commands.push(
        { id: "composition.create", compositionId, name: s.name, duration },
        { id: "composition.background", compositionId, color: d.background }
      );
      for (const raw of d.layers) {
        const l = { ...raw };
        const words = l?.kind === "text",
          sources = words ? s.copy : s.images;
        if ((!words && l?.kind !== "image") || !integer(l.index, 0, sources.length - 1))
          fail("Camada sem origem no roteiro.");
        const layerId = l.kind + "-" + l.index;
        if (used.has(layerId)) fail("A direção repetiu uma camada.");
        used.add(layerId);
        // The end is exclusive. The final entrance key must be inside the visible interval.
        const endFrame = l.endFrame === undefined ? s.frames : l.endFrame;
        const available = endFrame - l.enterFrame - 1;
        const entrance =
          l.entranceFrames === undefined
            ? l.animation === "none"
              ? 0
              : Math.min(8, available)
            : l.entranceFrames;
        if (
          !range(l.width, 1, 8000) ||
          !range(l.height, 1, 8000) ||
          !range(l.x, 0, 540) ||
          !range(l.y, 0, 960) ||
          !integer(l.enterFrame, 0, s.frames - 1) ||
          !integer(endFrame, l.enterFrame + 1, s.frames) ||
          !integer(entrance, 0, available) ||
          (l.animation === "none" && entrance !== 0) ||
          !["none", "fade", "rise"].includes(l.animation) ||
          (words && (!color(l.color) || !range(l.size, 12, 120)))
        )
          fail("Posição, estilo ou tempo inválido em " + s.name);
        const scale = Math.min(1, 540 / l.width, 960 / l.height);
        l.width *= scale;
        l.height *= scale;
        l.x = Math.min(540 - l.width / 2, Math.max(l.width / 2, l.x));
        l.y = Math.min(960 - l.height / 2, Math.max(l.height / 2, l.y));
        if (scale !== 1 || l.x !== raw.x || l.y !== raw.y)
          adjustments.push({
            scene: s.name,
            layer: layerId,
            reason: "Enquadramento ajustado à tela vertical",
          });
        const ref = { compositionId, layerId },
          value = sources[l.index];
        if (cta && words && value === cta && endFrame !== s.frames)
          fail("A chamada final precisa permanecer visível até o último quadro.");
        const fields = {
          name: words ? value : assets.find(a => a.id === value).name,
          width: l.width,
          height: l.height,
          start: l.enterFrame / FPS,
          end: endFrame / FPS,
        };
        if (words)
          Object.assign(fields, {
            text: value,
            wrap: true,
            fontSize: l.size,
            color: l.color,
          });
        else fields.fit = "contain";
        commands.push({
          id: "layer.add",
          ...ref,
          type: l.kind,
          fields,
          ...(words ? {} : { image: value }),
        });
        const motion = entrance > 0;
        commands.push({
          id: "layer.pose",
          ...ref,
          fields: { x: l.x, y: l.y, opacity: motion ? 0 : 1 },
        });
        if (motion) {
          const time = entrance / FPS;
          for (const [channel, initial, final] of [
            ["opacity", 0, 1],
            ...(l.animation === "rise" ? [["y", l.y + 20, l.y]] : []),
          ])
            commands.push(
              {
                id: "key.set",
                ...ref,
                channel,
                time: 0,
                value: initial,
                ease: "linear",
              },
              {
                id: "key.set",
                ...ref,
                channel,
                time,
                value: final,
                ease: "out",
              }
            );
        }
      }
      commands.push({
        id: "composition.insert",
        compositionId,
        clipId,
        time: cursor / FPS,
      });
    }
    cursor += s.frames;
  }
  if (script.music != null) {
    // Some models repeat the same soundtrack level on every shot.
    const levels = new Set(direction.shots.map(shot => shot.volume));
    const volume = direction.volume ?? (levels.size === 1 ? direction.shots[0].volume : undefined);
    if (!range(volume, 0.001, 1)) fail("Volume da trilha inválido.");
    commands.push({
      id: "sound.set",
      asset: script.music,
      enabled: true,
      volume,
    });
  }
  return commands;
}
