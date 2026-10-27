import {
  assemblyIdentity,
  createComponentDefinition,
  type ComponentDefinitionV1,
} from "@shared/componentAssembly";
import {
  arsenalPieceSchema,
  type PieceDefinitionV2,
  type ResolvedVariantDefinitionV2,
} from "@shared/designArsenal";
import { arsenalHash } from "@shared/arsenalContent";
import { narrativeSlideRole } from "@shared/carouselNarrative";

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Explicit reading/closing design policy. The source cover remains immutable;
 * derived definitions get their own identities and travel through every normal
 * copy, measurement, render, review and persistence gate. No client-side reflow. */
export function authorCarouselVisualVariant(
  source: ComponentDefinitionV1,
  role: "development" | "closing",
  allowAdditionalText = true
): ComponentDefinitionV1 {
  if (!source.completeDesign?.baselineVerified)
    throw new Error("carousel_variant_requires_eligible_complete_design");
  if (source.completeDesign.designGuidance?.carouselVariant)
    throw new Error("carousel_variant_cannot_derive_from_variant");
  const base = source.fragment,
    W = base.artboard.width,
    H = base.artboard.height;
  const textBindings = base.bindings.filter(b => b.kind !== "media");
  const headline =
    textBindings.find(b => /:headline:/.test(b.source)) ?? textBindings[0];
  if (!headline) throw new Error("carousel_variant_missing_headline");
  const styleOf = (binding: typeof headline) =>
    source.pieces[
      base.instances.find(i => i.id === binding.targetIds[0])!.pieceHash
    ];
  const titleStyle = styleOf(headline);
  const bodyStyle = styleOf(
    textBindings.find(b => /:body:/.test(b.source)) ?? headline
  );
  const palette = Array.from(
    new Set([
      base.artboard.background,
      ...Object.values(source.pieces).map(p => p.fill),
    ])
  );
  const surface = base.instances
    .filter(i => {
      const p = source.pieces[i.pieceHash];
      return (
        p.kind === "rect" &&
        i.opacity >= 0.95 &&
        !/shadow|sombra/i.test(i.id) &&
        p.fill !== base.artboard.background &&
        i.width * i.height >= W * H * 0.12
      );
    })
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const readingBackground = surface
    ? source.pieces[surface.pieceHash].fill
    : base.artboard.background;
  const ink = (preferred: string) => {
    const color =
      contrast(readingBackground, preferred) >= 4.5
        ? preferred
        : [...palette].sort(
            (a, b) =>
              contrast(readingBackground, b) - contrast(readingBackground, a)
          )[0];
    if (contrast(readingBackground, color) < 4.5)
      throw new Error("carousel_variant_no_readable_source_color");
    return color;
  };
  const accent =
    [...palette]
      .filter(c => c !== readingBackground)
      .sort((a, b) => {
        const spread = (hex: string) => {
          const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
          return Math.max(...v) - Math.min(...v);
        };
        return spread(b) - spread(a);
      })[0] ?? ink(bodyStyle.fill);
  const backgroundMedia = base.instances.filter(i => source.pieces[i.pieceHash].kind === "media" && i.width >= W * .9 && i.height >= H * .9);
  const hasPhotoBackground = backgroundMedia.length > 0;
  const instances: ResolvedVariantDefinitionV2["instances"] = [];
  const bindings: ResolvedVariantDefinitionV2["bindings"] = [];
  const relations: ResolvedVariantDefinitionV2["relations"] = [];
  const pieces: Record<string, PieceDefinitionV2> = {};
  const add = (
    id: string,
    piece: PieceDefinitionV2,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex = 10
  ) => {
    const pieceHash = arsenalHash(piece);
    pieces[pieceHash] = piece;
    instances.push({
      id,
      pieceHash,
      parentId: null,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      zIndex,
    });
  };
  if (surface)
    add(
      "carousel-reading-surface",
      source.pieces[surface.pieceHash],
      W * 0.07,
      H * (hasPhotoBackground ? 0.32 : 0.06),
      W * 0.86,
      H * (hasPhotoBackground ? 0.62 : 0.88),
      0
    );
  // A single signature accent replaces the cover's decorative cluster/grid.
  const decorationCount = base.instances.filter(
    i => !["text", "media"].includes(source.pieces[i.pieceHash].kind)
  ).length;
  if (decorationCount > (surface ? 2 : 1)) {
    const signature = arsenalPieceSchema.parse({
      ...bodyStyle,
      kind: "rect",
      fill: accent,
      stroke: null,
      strokeWidth: 0,
      fixedText: null,
      points: [],
      cornerRadius: 0,
      extrusion: undefined,
      contentFragment: undefined,
      textFragments: undefined,
    });
    add(
      "carousel-signature",
      signature,
      W * 0.12,
      H * (hasPhotoBackground ? 0.345 : 0.09),
      W * 0.1,
      H * 0.006,
      1
    );
  }
  const mediaInstances = base.instances.filter(
    i => source.pieces[i.pieceHash].kind === "media" && !backgroundMedia.includes(i)
  );
  for (const i of backgroundMedia) add(i.id, source.pieces[i.pieceHash], i.x, i.y, i.width, i.height, -1);
  const mediaTop = H * 0.31,
    mediaHeight = H * 0.2;
  const columns = Math.min(3, mediaInstances.length),
    rows = Math.ceil(mediaInstances.length / Math.max(1, columns));
  for (const [index, i] of Array.from(mediaInstances.entries())) {
    add(
      i.id,
      source.pieces[i.pieceHash],
      W * (0.12 + ((index % columns) * 0.76) / columns),
      mediaTop + (Math.floor(index / columns) * mediaHeight) / rows,
      (W * 0.76) / columns - W * 0.012,
      mediaHeight / rows - H * 0.012,
      2
    );
  }
  bindings.push(
    ...base.bindings
      .filter(b => b.kind === "media")
      .map(b => structuredClone(b))
  );
  const cta = textBindings.find(b => /:callToAction:/.test(b.source));
  const labels = textBindings.filter(
    b => /:(?:label|eyebrow|sectionLabel):/.test(b.source) && b !== headline
  );
  const supporting = textBindings.filter(
    b => b !== headline && b !== cta && !labels.includes(b)
  );
  const addText = (
    binding: typeof headline,
    x: number,
    y: number,
    width: number,
    height: number,
    size: number,
    display = false,
    original = styleOf(binding)
  ) => {
    const {
      contentFragment: _fragment,
      textFragments: _fragments,
      fixedTextRole: _fixedRole,
      extrusion: _extrusion,
      ...style
    } = original;
    const piece = arsenalPieceSchema.parse({
      ...style,
      fixedText: null,
      fill: ink(original.fill),
      stroke: null,
      strokeWidth: 0,
      fontSize: size,
      align: "left",
      lineHeight: display ? 1.12 : 1.3,
      letterSpacing: 0,
    });
    const targets =
      binding.kind === "list" ? binding.targetIds : [binding.targetIds[0]];
    for (const [i, id] of Array.from(targets.entries())) {
      const rowHeight = height / targets.length;
      add(
        id,
        piece,
        x,
        y + i * rowHeight,
        width,
        rowHeight - (targets.length > 1 ? H * 0.007 : 0)
      );
      relations.push({
        id: `carousel-fit-${id}`,
        kind: "textFit",
        version: 1,
        enabled: true,
        inputs: [],
        outputs: [
          { targetId: id, properties: ["width", "height", "fontSize"] },
        ],
        parameters: {
          anchor: "left",
          maxWidth: width,
          maxHeight: rowHeight - (targets.length > 1 ? H * 0.007 : 0),
          minFontSize: size * 0.9,
        },
      });
    }
    bindings.push({ ...structuredClone(binding), targetIds: targets, gap: 0 });
  };
  for (const [i, b] of Array.from(labels.entries()))
    addText(
      b,
      W * (0.12 + (i * 0.76) / labels.length),
      H * (hasPhotoBackground ? 0.36 : 0.105),
      (W * 0.76) / labels.length - W * 0.012,
      H * 0.035,
      W * 0.022
    );
  addText(
    headline,
    W * 0.12,
    H * (hasPhotoBackground ? 0.41 : 0.16),
    W * 0.76,
    H * (mediaInstances.length ? 0.13 : 0.16),
    W * 0.065,
    true
  );
  const supportTop = hasPhotoBackground ? 0.59 : mediaInstances.length ? 0.55 : 0.36;
  const supportBottom = role === "closing" || cta ? 0.75 : 0.87;
  // Title-only covers need room to explain the story on subsequent slides.
  // Literal mode retains exactly the original field contract.
  if (!supporting.length && allowAdditionalText) {
    addText(
      {
        ...structuredClone(headline),
        id: "carousel-explanation",
        label: "Explicação contínua da ideia deste slide",
        source: "block:body:0:text",
        kind: "text",
        required: false,
        targetIds: ["carousel-body"],
        cardinality: null,
        listMode: undefined,
        prefix: "",
      },
      W * 0.12,
      H * supportTop,
      W * 0.76,
      H * (supportBottom - supportTop - 0.025),
      W * 0.036,
      false,
      bodyStyle
    );
  }
  for (const [i, b] of Array.from(supporting.entries())) {
    const height = (H * (supportBottom - supportTop)) / supporting.length;
    addText(
      b,
      W * 0.12,
      H * supportTop + i * height,
      W * 0.76,
      height - H * 0.025,
      W * 0.036
    );
  }
  if (cta)
    addText(
      cta,
      W * 0.12,
      H * 0.81,
      W * 0.76,
      H * 0.1,
      W * (role === "closing" ? 0.046 : 0.032),
      true
    );
  else if (role === "closing" && allowAdditionalText) {
    const newBinding = {
      ...structuredClone(headline),
      id: "carousel-call-to-action",
      label: "Próximo passo contextual; não inventar destino",
      source: "block:callToAction:0:text" as const,
      kind: "text" as const,
      required: false,
      targetIds: ["carousel-cta"],
      cardinality: null,
      listMode: undefined,
      prefix: "",
    };
    addText(
      newBinding,
      W * 0.12,
      H * 0.81,
      W * 0.76,
      H * 0.1,
      W * 0.046,
      true,
      titleStyle
    );
  }
  // Preserve original field order/IDs for all existing copy, including literal content.
  const order = new Map(base.bindings.map((b, i) => [b.source, i]));
  bindings.sort(
    (a, b) => (order.get(a.source) ?? 1000) - (order.get(b.source) ?? 1000)
  );
  const contentMode: "compose" | "literal" = allowAdditionalText ? "compose" : "literal";
  const variantKey = `${base.variantKey.slice(0, 70)}-${source.hash.slice(0, 12)}-carousel-${role}-${contentMode}-v2`;
  const guidance = source.completeDesign.designGuidance;
  const { hash: _hash, id: _id, ...original } = source;
  const definition = {
    ...original,
    label: `${source.label.slice(0, 130)} · ${role === "closing" ? "encerramento" : "leitura"}`,
    description: `Variante de ${role === "closing" ? "encerramento com CTA" : "leitura com menos decoração"} da família ${source.completeDesign.family}. Capa original preservada.`,
    source: { ...source.source, variantKey },
    roles: [role],
    densities: ["quiet" as const],
    removableElementIds: [],
    colorRoles: Object.fromEntries(
      instances.map(i => [i.id, "preserve" as const])
    ),
    completeDesign: {
      ...source.completeDesign,
      designGuidance: {
        version: 1 as const,
        carouselVariant: {
          version: 2 as const,
          contentMode,
          role,
          sourceId: source.id,
          sourceHash: source.hash,
        },
        summary: `Mesma identidade, cores e fontes da capa; ${role === "closing" ? "síntese e chamada final destacada" : "menos decoração e leitura contínua"}.`,
        motifs: guidance?.motifs ?? [],
        preserve: [
          "Preservar cores, fontes e a geometria desta variante; não reconstruir a capa.",
        ],
        contentRules: [
          role === "closing"
            ? "Resolver a história e usar o campo callToAction para um próximo passo pertinente, salvo instrução explícita ou visual_only."
            : "Desenvolver uma ideia; deixar callToAction opcional vazio quando não necessário. Não repetir o gancho nem preencher rótulos para ocupar espaço.",
        ],
        mediaRules: guidance?.mediaRules ?? [],
        knownLimitations: [
          "Variante de leitura autorada por política explícita; não é reprodução geométrica do slide de capa.",
        ],
        ...(guidance?.original ? { original: guidance.original } : {}),
      },
    },
    fragment: {
      ...structuredClone(base),
      variantKey,
      instances,
      groups: [],
      bindings,
      relations,
      intentionalOverlaps: [],
      lineBoxOverlaps: [],
      limitations: [
        "Geometria da variante de carrossel v2; alterações devem permanecer no documento autoritativo.",
      ],
    },
    pieces,
  };
  return createComponentDefinition({
    ...definition,
    id: assemblyIdentity([
      "carousel-visual-v2",
      source.id,
      source.hash,
      role,
      allowAdditionalText,
    ]),
  });
}

export function authorCarouselVisualSequence(
  definitions: ComponentDefinitionV1[],
  allowAdditionalText = true
) {
  if (definitions.length < 2) return definitions;
  return definitions.map((definition, index) => {
    const role = narrativeSlideRole(index, definitions.length);
    return role === "cover" || role === "static"
      ? definition
      : authorCarouselVisualVariant(definition, role, allowAdditionalText);
  });
}
