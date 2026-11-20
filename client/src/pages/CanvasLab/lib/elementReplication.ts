import { readTextGradient } from "@shared/textGradient";
import type { CanvasPostModel } from "../components/types";
import {
  executeEditorCommand,
  editorTextGradient,
  projectEditorLayers,
  resolveEditorProperties,
  resolveEditorSelection,
  type EditorLayer,
  type EditorTarget,
} from "./editorController";
import { flattenEditorLayers } from "./editorSelection";
import { upgradeCompositionToV3 } from "./arsenalComposition";

export const APPEARANCE_PROPERTIES = {
  fontFamily: "Fonte",
  fontSize: "Tamanho da fonte",
  fontWeight: "Peso da fonte",
  fill: "Cor",
  align: "Alinhamento do texto",
  lineHeight: "Altura da linha",
  letterSpacing: "Espaçamento das letras",
  effect: "Efeito",
  effectColor: "Cor do efeito",
  textGradient: "Gradiente do texto",
  opacity: "Opacidade",
  cornerRadius: "Arredondamento",
  stroke: "Contorno",
  strokeWidth: "Espessura do contorno",
} as const;
export type AppearanceProperty = keyof typeof APPEARANCE_PROPERTIES;
export type ElementCorrespondence = {
  slideId: string;
  candidates: EditorLayer[];
  options: EditorLayer[];
  status: "matched" | "missing" | "ambiguous";
};

export function copyableAppearanceProperties(
  post: CanvasPostModel,
  target: EditorTarget
): AppearanceProperty[] {
  const { values, supported } = resolveEditorProperties(post, target);
  return (Object.keys(APPEARANCE_PROPERTIES) as AppearanceProperty[]).filter(
    key =>
      key === "textGradient"
        ? resolveEditorSelection(post, target)?.kind === "text" &&
          readTextGradient(editorTextGradient(post, target)) !== undefined
        : supported.includes(key) && values[key] !== undefined
  );
}

/** IDs/bindings and semantic roles outrank appearance. Ambiguity always requires a choice. */
export function findElementCorrespondences(
  post: CanvasPostModel,
  sourceTarget: EditorTarget
): ElementCorrespondence[] {
  const source = resolveEditorSelection(post, sourceTarget);
  if (!source) return [];
  const sourceSlide = post.slides.find(s => s.id === sourceTarget.slideId)!;
  const sourceElement = sourceSlide.composition?.elements.find(
    e => e.id === source.id
  );
  const sourceBinding = sourceSlide.composition?.base.bindings.find(
    b => b.id === sourceElement?.bindingId || b.targetIds.includes(source.id)
  );
  const sourceValues = resolveEditorProperties(post, sourceTarget).values;
  return post.slides
    .filter(slide => slide.id !== sourceTarget.slideId)
    .map(slide => {
      const options = flattenEditorLayers(
        projectEditorLayers(post, slide.id)
      ).filter(l => l.kind === source.kind);
      const sameNamespace =
        (!sourceSlide.composition && !slide.composition) ||
        sourceSlide.composition?.origin.variantHash ===
          slide.composition?.origin.variantHash;
      let candidates = sameNamespace
        ? options.filter(l => l.id === source.id)
        : [];
      if (
        !candidates.length &&
        sourceBinding &&
        sourceSlide.composition?.origin.variantHash ===
          slide.composition?.origin.variantHash
      ) {
        const targetBindings = slide.composition!.base.bindings.filter(
          b => b.source === sourceBinding.source
        );
        candidates = options.filter(l =>
          targetBindings.some(
            b =>
              b.targetIds.includes(l.id) ||
              slide.composition!.elements.some(
                e => e.id === l.id && e.bindingId === b.id
              )
          )
        );
      }
      if (
        !candidates.length &&
        (source.role === "headline" || source.role === "body")
      )
        candidates = options.filter(l => l.role === source.role);
      if (!candidates.length && source.kind === "text" && source.text?.trim())
        candidates = options.filter(
          l => l.text?.trim() === source.text!.trim()
        );
      if (!candidates.length && source.kind === "group")
        candidates = options.filter(l => l.label === source.label);
      if (
        !candidates.length &&
        (source.kind === "image" || source.kind === "shape")
      ) {
        candidates = options.filter(l => {
          const { values } = resolveEditorProperties(post, l.target);
          return ["x", "y", "width", "height"].every(
            key =>
              typeof sourceValues[key] === "number" &&
              values[key] === sourceValues[key]
          );
        });
      }
      return {
        slideId: slide.id,
        options,
        candidates,
        status:
          candidates.length === 1
            ? ("matched" as const)
            : candidates.length
              ? ("ambiguous" as const)
              : ("missing" as const),
      };
    });
}

export function replicateElementAppearance(
  post: CanvasPostModel,
  source: EditorTarget,
  targets: readonly EditorTarget[],
  properties: readonly AppearanceProperty[]
) {
  const fail = (reason: string) => ({
    ok: false as const,
    post,
    changed: [] as EditorTarget[],
    reason,
  });
  if (!resolveEditorSelection(post, source))
    return fail("O objeto de origem não existe mais.");
  const available = copyableAppearanceProperties(post, source);
  if (!properties.length || properties.some(key => !available.includes(key)))
    return fail("Escolha propriedades disponíveis na origem.");
  if (
    !targets.length ||
    new Set(targets.map(t => t.slideId)).size !== targets.length ||
    targets.some(t => t.slideId === source.slideId)
  )
    return fail("Escolha um objeto por slide de destino.");
  const sourceValues = resolveEditorProperties(post, source).values;
  const sourceWidth =
    post.slides.find(s => s.id === source.slideId)!.composition?.artboard
      .width ?? 360;
  let next = post;
  const changed: EditorTarget[] = [];
  for (const target of targets) {
    const layer = resolveEditorSelection(next, target);
    const before = resolveEditorProperties(next, target);
    const targetWidth =
      next.slides.find(s => s.id === target.slideId)?.composition?.artboard
        .width ?? 360;
    const unitScale = targetWidth / sourceWidth;
    const patch = Object.fromEntries(
      properties
        .filter(key => key !== "textGradient")
        .map(key => [
          key,
          ["fontSize", "letterSpacing", "cornerRadius", "strokeWidth"].includes(
            key
          ) && typeof sourceValues[key] === "number"
            ? Number(sourceValues[key]) * unitScale
            : sourceValues[key],
        ])
    );
    if (
      !layer ||
      layer.locked ||
      properties.some(key =>
        key === "textGradient"
          ? layer.kind !== "text"
          : !before.supported.includes(key)
      )
    )
      return fail(
        "Um destino foi removido, está bloqueado ou não aceita as propriedades escolhidas."
      );
    const gradient = readTextGradient(editorTextGradient(post, source));
    const gradientChanged =
      properties.includes("textGradient") &&
      JSON.stringify(editorTextGradient(next, target)) !==
        JSON.stringify(gradient);
    if (
      !gradientChanged &&
      properties
        .filter(key => key !== "textGradient")
        .every(key => before.values[key] === patch[key])
    )
      continue;
    // Font bytes and custom registrations travel with the confirmed asset reference.
    if (properties.includes("fontFamily")) {
      const sourceComp = post.slides.find(
        s => s.id === source.slideId
      )?.composition;
      const index = next.slides.findIndex(s => s.id === target.slideId),
        comp = next.slides[index].composition;
      if (comp && sourceComp) {
        const assets = [...comp.assets];
        for (const asset of sourceComp.assets.filter(
          a => a.family === sourceValues.fontFamily
        ))
          if (!assets.some(a => a.id === asset.id)) assets.push(asset);
        const registered = [
          ...(sourceComp.version === 3 ? sourceComp.userFonts : []),
          ...(post.userFonts ?? []),
        ];
        let composition = { ...comp, assets };
        if (registered.length) {
          const upgraded = upgradeCompositionToV3(composition);
          composition = {
            ...upgraded,
            userFonts: Array.from(
              new Map(
                [...upgraded.userFonts, ...registered].map(f => [f.family, f])
              ).values()
            ),
          };
        }
        next = {
          ...next,
          slides: next.slides.map((s, i) =>
            i === index ? { ...s, composition } : s
          ),
        };
      }
    }
    const result = executeEditorCommand(next, target, {
      type: "properties",
      patch,
    });
    if (!result.ok)
      return fail(result.reason ?? "Não foi possível aplicar a aparência.");
    if (properties.includes("textGradient")) {
      const filled = executeEditorCommand(result.post, target, {
        type: "text-gradient",
        gradient,
      });
      if (!filled.ok)
        return fail(filled.reason ?? "Não foi possível copiar o gradiente.");
      result.post = filled.post;
    }
    const after = resolveEditorProperties(result.post, target);
    if (
      gradientChanged ||
      properties.some(key => before.values[key] !== after.values[key])
    )
      changed.push(target);
    next = result.post;
  }
  return { ok: true as const, post: changed.length ? next : post, changed };
}
