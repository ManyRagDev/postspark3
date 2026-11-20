import { z } from "zod";
import { aspectRatioDimensions, type StoredAspectRatio } from "./aspectRatios";
import { arsenalBundledManifest } from "./arsenalBundledManifest";
import { arsenalHash, designContentDocumentSchema } from "./arsenalContent";
import {
  arsenalAssetSchema,
  arsenalPieceSchema,
  arsenalVariantSchema,
  readArsenalComposition,
  type ArsenalComposition,
  type ArsenalInstance,
  type PieceDefinitionV2,
} from "./designArsenal";
import {
  resolveArsenalGeometry,
  type ArsenalTextMeasurer,
} from "./arsenalGeometry";
import {
  identityFontSchema,
  identityFontWarnings,
  resolveIdentityFont,
  visualIdentitySchema,
  type VisualIdentity,
} from "./visualIdentity";
import { contrastRatio } from "../client/src/pages/CanvasLab/lib/contrast";

const hex = z.string().regex(/^#[a-f\d]{6}$/i);
/** AI proposes a composition, the compiler owns geometry and font assets. */
export const identityCompositionPlanSchema = z
  .object({
    background: hex,
    text: hex,
    accent: hex,
    headingFont: z.string().max(120),
    bodyFont: z.string().max(120),
    margin: z.number().min(0).max(180),
    gap: z.number().min(0).max(120),
    align: z.enum(["left", "center", "right"]),
    pages: z
      .array(
        z
          .object({
            layout: z.enum(["stacked", "centered", "split"]),
            decoration: z.enum(["none", "line"]),
          })
          .strict()
      )
      .min(1)
      .max(10),
  })
  .strict();
export type IdentityCompositionPlan = z.infer<
  typeof identityCompositionPlanSchema
>;
export const visualIdentityUsageSchema = z
  .object({
    identity: visualIdentitySchema,
    plan: identityCompositionPlanSchema,
    appearance: z
      .object({
        palette: z.object({ background: hex, text: hex, accent: hex }).strict(),
        fonts: z
          .object({ heading: identityFontSchema, body: identityFontSchema })
          .strict(),
        margin: z.number(),
        gap: z.number(),
        align: z.enum(["left", "center", "right"]),
        lineHeight: z.number(),
        warnings: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export type IdentityPageContent = { headline: string; body: string };

export function resolveIdentityAppearance(
  identity: VisualIdentity,
  plan: IdentityCompositionPlan
) {
  const rules = identity.rules;
  const generatedFont = (name: string, weight: number, heading: boolean) => ({
    ...resolveIdentityFont(name, weight, heading),
    requested: null,
    substituted: false,
  });
  const fonts = {
    heading: rules.headingFont
      ? identity.fonts.heading
      : generatedFont(plan.headingFont, rules.headingWeight ?? 700, true),
    body: rules.bodyFont
      ? identity.fonts.body
      : generatedFont(plan.bodyFont, rules.bodyWeight ?? 400, false),
  };
  const palette = {
    background: rules.background ?? plan.background,
    text: rules.text ?? plan.text,
    accent: rules.accent ?? plan.accent,
  };
  if (
    !rules.accent &&
    rules.colors.length &&
    !rules.colors.some(color =>
      Object.values(palette).some(
        value => value.toLowerCase() === color.toLowerCase()
      )
    )
  )
    palette.accent = rules.colors[0];
  if (
    rules.colors.length &&
    !rules.background &&
    !rules.text &&
    plan.pages.every(page => page.decoration === "none") &&
    !rules.colors.some(color =>
      [palette.background, palette.text].some(
        value => value.toLowerCase() === color.toLowerCase()
      )
    )
  )
    palette.background = rules.colors[0];
  if (!rules.text && contrastRatio(palette.background, palette.text) < 4.5) {
    palette.text =
      contrastRatio(palette.background, "#FFFFFF") >= 4.5
        ? "#FFFFFF"
        : "#111111";
  }
  const contrastWarnings =
    contrastRatio(palette.background, palette.text) < 4.5
      ? [
          "As cores informadas têm pouco contraste entre texto e fundo. Você pode ajustá-las no editor.",
        ]
      : [];
  return {
    palette,
    fonts,
    margin: rules.margin ?? plan.margin,
    gap: rules.gap ?? plan.gap,
    align: rules.align ?? plan.align,
    lineHeight: rules.lineHeight ?? 1.3,
    warnings: Array.from(
      new Set([
        ...identity.warnings,
        ...identityFontWarnings(fonts),
        ...contrastWarnings,
      ])
    ),
  };
}

export function identityFontAssets(
  appearance: ReturnType<typeof resolveIdentityAppearance>
) {
  return Array.from(
    new Set(Object.values(appearance.fonts).map(f => f.assetId))
  ).map(id => arsenalAssetSchema.strip().parse(arsenalBundledManifest[id]));
}

/** Lossless splitting: even the original separator belongs to the body. */
export function literalIdentityPage(raw: string): IdentityPageContent {
  const line = raw.indexOf("\n");
  return line > 0 && line < 180
    ? { headline: raw.slice(0, line), body: raw.slice(line) }
    : line < 0 && raw.length <= 180
      ? { headline: raw, body: "" }
      : { headline: "", body: raw };
}

export function compileIdentityPage(args: {
  identity: VisualIdentity;
  plan: IdentityCompositionPlan;
  page: IdentityPageContent;
  index: number;
  aspectRatio: StoredAspectRatio;
  measureText: ArsenalTextMeasurer;
  imageUrl?: string;
}): ArsenalComposition {
  const { identity, plan, page, index, aspectRatio, measureText } = args;
  const a = resolveIdentityAppearance(identity, plan);
  const { width: W, height: H } = aspectRatioDimensions[aspectRatio];
  const m = a.margin,
    gap = a.gap,
    width = W - 2 * m;
  const assets = identityFontAssets(a);
  const content = designContentDocumentSchema.parse({
    schemaVersion: 2,
    headline: page.headline,
    body: page.body,
    eyebrow: null,
    sectionLabel: null,
    callToAction: null,
    label: null,
    items: [],
    metric: null,
    attribution: null,
    comparison: null,
    caption: "",
    hashtags: [],
  });
  const pieces: Record<string, PieceDefinitionV2> = {};
  const instances: ArsenalInstance[] = [];
  const bindings: z.infer<
    typeof import("./designArsenal").arsenalBindingSchema
  >[] = [];
  const configured = plan.pages[index];
  if (!configured) throw new Error("identity_page_count_mismatch");
  const reservedLogo = identity.logoUrl ? 88 : 0;
  const imageHeight = args.imageUrl ? Math.min(H * 0.3, 440) : 0;
  const imageBand = imageHeight ? imageHeight + gap : 0;
  const availableHeight = H - 2 * m - reservedLogo - imageBand;
  let layout = configured.layout;
  type Box = {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    role: "headline" | "body";
  };
  function fit(text: string, role: "headline" | "body", w: number, h: number) {
    if (w <= 0 || h <= 0) return null;
    const f = a.fonts[role === "headline" ? "heading" : "body"];
    const asset = assets.find(asset => asset.id === f.assetId)!;
    const preferred =
      (role === "headline"
        ? identity.rules.headingSize
        : identity.rules.bodySize) ?? (role === "headline" ? 82 : 48);
    const minSize = Math.min(30, preferred);
    const minimum = measureText({
      text,
      width: w,
      fontSize: minSize,
      fontFamily: asset.family!,
      fontStyle: String(f.weight),
      fill: a.palette.text,
      lineHeight: a.lineHeight,
    });
    if (minimum.height > h || minimum.lines.some(line => line.width > w + 0.1))
      return null;
    for (
      let size = preferred;
      size >= minSize;
      size = Math.max(minSize, size - 1)
    ) {
      const metrics = measureText({
        text,
        width: w,
        fontSize: size,
        fontFamily: asset.family!,
        fontStyle: String(f.weight),
        fill: a.palette.text,
        lineHeight: a.lineHeight,
      });
      if (
        metrics.height <= h &&
        metrics.lines.every(line => line.width <= w + 0.1)
      )
        return { size, height: Math.max(size * a.lineHeight, metrics.height) };
      if (size === minSize) break;
    }
    return null;
  }
  function boxesFor(candidate: typeof layout): Box[] | null {
    if (!page.headline && !page.body) return [];
    if (candidate === "split" && page.headline && page.body) {
      const column = (width - gap) / 2;
      const title = fit(page.headline, "headline", column, availableHeight);
      const body = fit(page.body, "body", column, availableHeight);
      if (title && body)
        return [
          {
            x: m,
            y: m + imageBand,
            width: column,
            height: title.height,
            fontSize: title.size,
            role: "headline",
          },
          {
            x: m + column + gap,
            y: m + imageBand,
            width: column,
            height: body.height,
            fontSize: body.size,
            role: "body",
          },
        ];
      return null;
    }
    const titleBudget = page.body ? availableHeight * 0.38 : availableHeight;
    const title = page.headline
      ? fit(page.headline, "headline", width, titleBudget)
      : null;
    if (page.headline && !title) return null;
    const bodyBudget =
      availableHeight - (title?.height ?? 0) - (title && page.body ? gap : 0);
    const body = page.body ? fit(page.body, "body", width, bodyBudget) : null;
    if (page.body && !body) return null;
    const total =
      (title?.height ?? 0) + (body?.height ?? 0) + (title && body ? gap : 0);
    const y =
      imageBand +
      (candidate === "centered" ? m + (availableHeight - total) / 2 : m);
    return [
      ...(title
        ? [
            {
              x: m,
              y,
              width,
              height: title.height,
              fontSize: title.size,
              role: "headline" as const,
            },
          ]
        : []),
      ...(body
        ? [
            {
              x: m,
              y: y + (title?.height ?? 0) + (title ? gap : 0),
              width,
              height: body.height,
              fontSize: body.size,
              role: "body" as const,
            },
          ]
        : []),
    ];
  }
  let boxes = boxesFor(layout);
  if (!boxes) {
    layout = "stacked";
    boxes = boxesFor(layout);
  }
  if (!boxes)
    throw new Error(
      `O texto do slide ${index + 1} não cabe com legibilidade. Ajuste o conteúdo ou o formato no briefing.`
    );
  for (const box of boxes) {
    const font = a.fonts[box.role === "headline" ? "heading" : "body"];
    const asset = assets.find(asset => asset.id === font.assetId)!;
    const piece = arsenalPieceSchema.parse({
      kind: "text",
      fill: a.palette.text,
      stroke: null,
      strokeWidth: 0,
      cornerRadius: 0,
      points: [],
      fontFamily: asset.family,
      fontAssetId: asset.id,
      fontSize: box.fontSize,
      fontWeight: font.weight,
      align:
        identity.rules.align ?? (layout === "centered" ? "center" : a.align),
      lineHeight: a.lineHeight,
      letterSpacing: 0,
      fixedText: null,
    });
    const hash = arsenalHash(piece),
      id = `identity-${box.role}`;
    pieces[hash] = piece;
    instances.push({
      id,
      pieceHash: hash,
      parentId: null,
      zIndex: instances.length + 1,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height + 0.25,
      rotation: 0,
      opacity: 1,
    });
    bindings.push({
      id: `bind-${box.role}`,
      label: box.role === "headline" ? "Título" : "Texto",
      kind: "text",
      source: box.role,
      required: false,
      targetIds: [id],
      cardinality: null,
      prefix: "",
      gap: 0,
    });
  }
  // Decoration occupies a separate footer band, never the measured text area.
  if (configured.decoration === "line" && m >= 16) {
    const piece = arsenalPieceSchema.parse({
      kind: "rect",
      fill: a.palette.accent,
      stroke: null,
      strokeWidth: 0,
      cornerRadius: 0,
      points: [],
      fontFamily: assets[0].family,
      fontAssetId: null,
      fontSize: 12,
      fontWeight: 400,
      align: "left",
      lineHeight: 1,
      letterSpacing: 0,
      fixedText: null,
    });
    const hash = arsenalHash(piece);
    pieces[hash] = piece;
    instances.push({
      id: "identity-accent",
      pieceHash: hash,
      parentId: null,
      zIndex: 0,
      x: m,
      y: H - m / 2,
      width: Math.min(120, width),
      height: 4,
      rotation: 0,
      opacity: 1,
    });
  }
  const base = arsenalVariantSchema.parse({
    variantKey: `identity-page-${index}`,
    aspectRatio,
    compilerVersion: "arsenal-v3.0.0",
    artboard: { width: W, height: H, background: a.palette.background },
    instances,
    groups: [],
    bindings,
    relations: [],
    assetIds: assets.map(a => a.id),
    capabilities: ["identity-composition"],
    intentionalOverlaps: [],
    limitations: [],
  });
  // These UUIDs identify a new user composition, not an authored catalogue design.
  const digest = arsenalHash({ identity: identity.revision, base });
  const versionId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const c: ArsenalComposition = {
    version: 3,
    origin: {
      candidateId: `${versionId}:${base.variantKey}`,
      blueprintId: versionId,
      versionId,
      version: 1,
      definitionHash: arsenalHash({ revision: identity.revision, base }),
      variantKey: base.variantKey,
      variantHash: arsenalHash(base),
      compilerVersion: base.compilerVersion,
    },
    base,
    pieces,
    assets,
    content,
    userContentHash: arsenalHash(content),
    generatedContentHash: arsenalHash(content),
    contentRevision: 0,
    elements: [],
    groups: [],
    relations: [],
    overrides: {},
    richText: {},
    media: {},
    seed: index,
    state: "applied",
    issues: [],
    layoutOrigin: "manual-projection",
    sourceVariantKey: base.variantKey,
    effectiveAspectRatio: aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: base.artboard,
    authorialLayers: args.imageUrl
      ? [
          {
            id: "identity-photo",
            kind: "image",
            parentId: null,
            zIndex: 0,
            x: m,
            y: m,
            width,
            height: imageHeight,
            rotation: 0,
            opacity: 1,
            url: args.imageUrl,
          },
        ]
      : [],
    hiddenInstanceIds: [],
    userFonts: [],
    effects: {},
    ...(identity.logoUrl
      ? {
          logo: {
            url: identity.logoUrl,
            position: "custom" as const,
            x: m,
            y: H - m - 64,
            width: 96,
            height: 64,
          },
        }
      : {}),
  };
  return readArsenalComposition(resolveArsenalGeometry(c, { measureText }));
}
