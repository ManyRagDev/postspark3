import { arsenalHash } from "../../shared/arsenalContent";
import { arsenalWorldGeometry } from "../../shared/arsenalGeometry";
import {
  assemblyIdentity,
  createComponentDefinition,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import type { DesignGuidance } from "../../shared/designGuidance";
import {
  applyAuthoredFamilyLayout,
  hasAuthoredFamilyLayout,
} from "./authoredFamilyLayouts";

type VariantFunction = Extract<
  NonNullable<DesignGuidance["carouselVariant"]>,
  { version: 3 }
>["function"];
type Instance = ComponentDefinitionV1["fragment"]["instances"][number];

function nativeFunction(source: ComponentDefinitionV1): VariantFunction {
  if (source.completeDesign?.family === "mosaic-grid") return "list";
  if (source.fragment.bindings.some(b => b.kind === "list")) return "list";
  if (
    source.roles.includes("comparison") ||
    source.fragment.bindings.some(b => /comparison/.test(b.source))
  )
    return "comparison";
  if (source.fragment.mediaSlots?.length) return "image_commentary";
  return "highlight";
}

/** Derive inside the family's native graphic system. Frames, cards, emphasis,
 * photo contracts and typographic associations are retained, never replaced by
 * a universal title/body/bar composition. This is offline authorship only. */
export function authorFamilyCarouselVariant(
  source: ComponentDefinitionV1,
  role: "development" | "closing",
  contentMode: "compose" | "literal",
  functionName: VariantFunction
): ComponentDefinitionV1 {
  if (
    !source.completeDesign?.baselineVerified ||
    source.completeDesign.designGuidance?.carouselVariant
  )
    throw new Error("carousel_repertoire_source_invalid");
  const original = structuredClone(source),
    fragment = original.fragment;
  const headIds = new Set(
    fragment.bindings
      .filter(b => b.source.startsWith("block:headline:"))
      .flatMap(b => b.targetIds)
  );
  const bodyIds = new Set(
    fragment.bindings
      .filter(
        b =>
          b.kind === "list" ||
          b.source.startsWith("block:body:") ||
          b.source.startsWith("block:comparison:")
      )
      .flatMap(b => b.targetIds)
  );
  const classify = (id: string) =>
    headIds.has(id) ? "head" : bodyIds.has(id) ? "body" : "other";
  const ancestry = (instance: Instance) => {
    const result: string[] = [];
    let parent = instance.parentId;
    while (parent) {
      result.push(parent);
      parent = fragment.groups.find(g => g.id === parent)?.parentId ?? null;
    }
    return result;
  };
  const kinds = new Map<string, Set<string>>();
  for (const binding of fragment.bindings)
    for (const id of binding.targetIds) {
      const i = fragment.instances.find(x => x.id === id)!;
      for (const group of ancestry(i)) {
        const set = kinds.get(group) ?? new Set();
        set.add(classify(id));
        kinds.set(group, set);
      }
    }
  const owner = (instance: Instance) => {
    const direct = classify(instance.id);
    if (direct !== "other") return direct;
    if (fragment.bindings.some(b => b.targetIds.includes(instance.id)))
      return "other";
    for (const group of ancestry(instance)) {
      const set = kinds.get(group);
      if (set?.size === 1) return Array.from(set)[0];
    }
    // Native emphasis surfaces can share a large composition group with body/CTA.
    // Follow the text they actually underlay, while leaving full panels untouched.
    const piece = original.pieces[instance.pieceHash],
      shape = arsenalWorldGeometry(
        { ...instance, label: instance.id, scale: 1 },
        fragment.groups
      );
    const area = instance.width * instance.height * shape.scale ** 2;
    if (
      ["rect", "polygon"].includes(piece.kind) &&
      !piece.imageAssetId &&
      area < fragment.artboard.width * fragment.artboard.height * 0.25
    ) {
      const matches = new Set<string>();
      for (const binding of fragment.bindings.filter(b => b.kind !== "media"))
        for (const id of binding.targetIds) {
          const text = fragment.instances.find(i => i.id === id)!,
            w = arsenalWorldGeometry(
              { ...text, label: id, scale: 1 },
              fragment.groups
            );
          const overlap =
            Math.max(
              0,
              Math.min(
                shape.x + instance.width * shape.scale,
                w.x + text.width * w.scale
              ) - Math.max(shape.x, w.x)
            ) *
            Math.max(
              0,
              Math.min(
                shape.y + instance.height * shape.scale,
                w.y + text.height * w.scale
              ) - Math.max(shape.y, w.y)
            );
          if (overlap / (text.width * text.height * w.scale ** 2) > 0.45)
            matches.add(classify(id));
        }
      if (matches.size === 1) return Array.from(matches)[0];
    }
    return "other";
  };
  const worlds = new Map(
    fragment.instances.map(i => [
      i.id,
      arsenalWorldGeometry({ ...i, label: i.id, scale: 1 }, fragment.groups),
    ])
  );
  const bounds = (ids: Set<string>) => {
    const list = fragment.instances.filter(i => ids.has(i.id));
    if (!list.length) return null;
    return {
      x: Math.min(...list.map(i => worlds.get(i.id)!.x)),
      y: Math.min(...list.map(i => worlds.get(i.id)!.y)),
      right: Math.max(
        ...list.map(
          i => worlds.get(i.id)!.x + i.width * worlds.get(i.id)!.scale
        )
      ),
      bottom: Math.max(
        ...list.map(
          i => worlds.get(i.id)!.y + i.height * worlds.get(i.id)!.scale
        )
      ),
    };
  };
  const head = bounds(headIds),
    body = bounds(bodyIds);
  const specific = hasAuthoredFamilyLayout(source, functionName);
  const reflow =
    !specific &&
    (functionName === "reading" || functionName === "synthesis") &&
    head &&
    body &&
    head.bottom - head.y > 0.13 * fragment.artboard.height &&
    body.y >= head.bottom - 1 &&
    !fragment.instances.some(
      i =>
        (headIds.has(i.id) || bodyIds.has(i.id)) &&
        Math.abs(worlds.get(i.id)!.rotation) > 0.1
    );
  const shrink = functionName === "synthesis" ? 0.82 : 0.72;
  const gain = reflow ? (head.bottom - head.y) * (1 - shrink) : 0;
  const bodyScale = reflow
    ? (body.bottom - body.y + gain) / (body.bottom - body.y)
    : 1;
  const pieces: ComponentDefinitionV1["pieces"] = { ...original.pieces };
  const moved = new Map<
    string,
    { width: number; height: number; fontSize: number; scale: number }
  >();
  fragment.instances = fragment.instances.map(instance => {
    const category = owner(instance),
      world = worlds.get(instance.id)!;
    if (!reflow || (category !== "head" && category !== "body"))
      return instance;
    const sx = category === "head" ? shrink : 1,
      sy = category === "head" ? shrink : bodyScale;
    const x =
      category === "head"
        ? (head.x + head.right) / 2 +
          (world.x - (head.x + head.right) / 2) * shrink
        : world.x;
    const y =
      category === "head"
        ? head.y + (world.y - head.y) * shrink
        : body.y - gain + (world.y - body.y) * bodyScale;
    const angle = ((world.rotation - instance.rotation) * Math.PI) / 180,
      dx = x - world.x,
      dy = y - world.y;
    const piece = pieces[instance.pieceHash];
    const fontScale = category === "head" ? shrink : 1;
    const nextPiece = {
      ...piece,
      fontSize: piece.fontSize * fontScale,
      letterSpacing: piece.letterSpacing * fontScale,
      ...(piece.extrusion
        ? {
            extrusion: {
              ...piece.extrusion,
              offsetX: piece.extrusion.offsetX * sx,
              offsetY: piece.extrusion.offsetY * sy,
            },
          }
        : {}),
    };
    const hash = arsenalHash(nextPiece);
    pieces[hash] = nextPiece;
    const next = {
      ...instance,
      pieceHash: hash,
      x:
        instance.x +
        (dx * Math.cos(angle) + dy * Math.sin(angle)) / world.scale,
      y:
        instance.y +
        (-dx * Math.sin(angle) + dy * Math.cos(angle)) / world.scale,
      width: instance.width * sx,
      height: instance.height * sy,
    };
    moved.set(next.id, {
      width: next.width,
      height: next.height,
      fontSize: nextPiece.fontSize,
      scale: fontScale,
    });
    return next;
  });
  fragment.relations = fragment.relations.map(r => {
    if (r.kind !== "textFit") return r;
    const info = moved.get(r.outputs[0].targetId);
    return info
      ? {
          ...r,
          parameters: {
            ...r.parameters,
            maxWidth: info.width,
            maxHeight: info.height,
            minFontSize: Math.min(
              info.fontSize,
              r.parameters.minFontSize * info.scale
            ),
          },
        }
      : r;
  });
  const guidance = structuredClone(source.completeDesign.designGuidance);
  const identity = guidance?.motifs?.length
    ? guidance.motifs
    : [
        "native-layer-structure",
        "native-typographic-hierarchy",
        ...(fragment.mediaSlots?.length ? ["native-photo-placement"] : []),
      ];
  const variantKey = `${source.source.variantKey.slice(0, 60)}-${source.hash.slice(0, 10)}-${role}-${contentMode}-${functionName}-v3`;
  const { hash: _hash, ...definition } = original;
  const candidate: Parameters<typeof createComponentDefinition>[0] = {
    ...definition,
    id: assemblyIdentity([
      "family-carousel-v3",
      source.id,
      source.hash,
      role,
      contentMode,
      functionName,
    ]),
    source: { ...source.source, variantKey },
    fragment: { ...fragment, variantKey },
    pieces,
    label: `${source.label.slice(0, 115)} · ${functionName}`,
    roles: [role],
    description: `${functionName}: composição derivada das regiões e ornamentos nativos da família; campos e mídia preservados.`,
    completeDesign: {
      ...source.completeDesign,
      designGuidance: {
        version: 1,
        carouselVariant: {
          version: 3,
          role,
          contentMode,
          sourceId: source.id,
          sourceHash: source.hash,
          function: functionName,
          identity,
        },
        ...(guidance?.familyIdentity
          ? { familyIdentity: guidance.familyIdentity }
          : {}),
        ...(guidance?.fieldRelationships
          ? { fieldRelationships: guidance.fieldRelationships }
          : {}),
        ...(guidance?.representation
          ? { representation: guidance.representation }
          : {}),
        summary:
          `${guidance?.summary ?? source.label} ${reflow ? "Título reduzido dentro da assinatura nativa; espaço liberado para leitura nos blocos existentes." : "Composição nativa para ênfase, repetição intencional ou exemplo."}`.slice(
            0,
            1000
          ),
        motifs: identity,
        preserve: guidance?.preserve ?? [
          "Preservar os ornamentos, relações tipográficas, cores e mídias nativos.",
        ],
        contentRules: [
          ...(guidance?.contentRules ?? []),
          "Selecionar esta composição pela função da página. Repetição é permitida; não inventar texto, rótulos nem CTA para preencher campos.",
        ].slice(0, 20),
        mediaRules: guidance?.mediaRules ?? [],
        knownLimitations: [
          ...(guidance?.knownLimitations ?? []),
          "Capacidade é estimativa geométrica; composição não certifica legibilidade de qualquer texto.",
        ].slice(0, 30),
        ...(guidance?.original ? { original: guidance.original } : {}),
      },
    },
  };
  if (specific) applyAuthoredFamilyLayout(candidate, functionName);
  candidate.id = assemblyIdentity([
    "family-carousel-v3",
    source.id,
    source.hash,
    role,
    contentMode,
    functionName,
    arsenalHash(candidate.fragment),
    arsenalHash(candidate.pieces),
  ]);
  return createComponentDefinition(candidate);
}

export function authorFamilyCarouselRepertoire(
  source: ComponentDefinitionV1
): ComponentDefinitionV1[] {
  const functions: VariantFunction[] = [nativeFunction(source)];
  if (
    source.fragment.bindings.some(
      b =>
        b.kind === "list" ||
        b.source.startsWith("block:body:") ||
        b.source.startsWith("block:comparison:")
    )
  )
    functions.push("reading");
  return (["compose", "literal"] as const).flatMap(mode => [
    ...Array.from(new Set(functions))
      .map(fn => authorFamilyCarouselVariant(source, "development", mode, fn))
      .filter(
        d =>
          d.completeDesign?.designGuidance?.carouselVariant?.version !== 3 ||
          d.completeDesign.designGuidance.carouselVariant.function !==
            "reading" ||
          arsenalHash(d.fragment.instances) !==
            arsenalHash(source.fragment.instances) ||
          arsenalHash(d.fragment.bindings) !==
            arsenalHash(source.fragment.bindings)
      ),
    authorFamilyCarouselVariant(source, "closing", mode, "synthesis"),
  ]);
}
