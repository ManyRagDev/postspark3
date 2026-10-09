import { aspectRatioHeight } from "./aspectRatios";
import {
  arsenalHash,
  readContentSource,
  visualContentSources,
  visualSourcesFor,
  type DesignContent,
} from "./arsenalContent";
import {
  ARSENAL_COMPILER,
  ARSENAL_VARIABLE_COMPILER,
  type PieceDefinitionV2,
  type ResolvedVariantDefinitionV2,
} from "./designArsenal";
export interface ArsenalFallbackOptions {
  slot?: number;
}

interface BlockMeta {
  type: string;
  role?: string;
  part: string;
}

function resolveSourceMeta(content: DesignContent, source: string): BlockMeta {
  if (content.schemaVersion === 3) {
    const match = source.match(/^content:([A-Za-z0-9_-]+):([a-zA-Z.]+)$/);
    if (match) {
      const [, blockId, part] = match;
      const b = content.blocks.find(block => block.id === blockId);
      if (b) {
        return {
          type: b.type,
          role: b.type === "text" ? b.role : undefined,
          part,
        };
      }
    }
  }
  return {
    type: source === "items" ? "list" : "text",
    role: source,
    part: source.includes(".") ? source.split(".").pop()! : "text",
  };
}

export function buildArsenalFallback(
  content: DesignContent,
  aspectRatio: ResolvedVariantDefinitionV2["aspectRatio"],
  palette: { background: string; text: string; accent?: string },
  options: ArsenalFallbackOptions = {}
) {
  const width = 1080,
    height = aspectRatioHeight(aspectRatio, 1080);
  const slot = options.slot ?? 0;
  const isCentered = slot === 1;
  const align = isCentered ? ("center" as const) : ("left" as const);
  const anchor = isCentered ? ("center" as const) : ("left" as const);

  const pieces: Record<string, PieceDefinitionV2> = {};
  const variantKey =
    slot === 1
      ? `fallback-${aspectRatio.replace(":", "x")}-centered`
      : slot === 2
        ? `fallback-${aspectRatio.replace(":", "x")}-accent`
        : `fallback-${aspectRatio.replace(":", "x")}`;

  const base: ResolvedVariantDefinitionV2 = {
    variantKey,
    aspectRatio,
    compilerVersion:
      content.schemaVersion === 3
        ? ARSENAL_VARIABLE_COMPILER
        : ARSENAL_COMPILER,
    artboard: { width, height, background: palette.background },
    groups: [],
    instances: [],
    bindings: [],
    relations: [],
    assetIds: [],
    capabilities: [],
    intentionalOverlaps: [],
    limitations: [
      "Fallback editorial; não é uma composição publicada do arsenal.",
    ],
  };

  const ordered =
    content.schemaVersion === 3
      ? visualSourcesFor(content)
      : [
          "eyebrow",
          "headline",
          ...visualContentSources.filter(
            s => s !== "headline" && s !== "eyebrow"
          ),
        ];

  // Count total content elements to calibrate vertical density
  const totalItemCount = ordered.reduce((sum, s) => {
    const val = readContentSource(content, s);
    return sum + (Array.isArray(val) ? val.length : 1);
  }, 0);
  const isDense = totalItemCount > 6;

  for (const source of ordered) {
    const value = readContentSource(content, source);
    if (
      !(Array.isArray(value)
        ? value.length
        : typeof value === "string"
          ? value.length
          : 0)
    )
      continue;
    const id = `copy-${source.replace(/[.:]/g, "-")}`;
    const meta = resolveSourceMeta(content, source);

    let fontSize = 36;
    let fontWeight = 400;
    let lineHeight = 1.25;
    let letterSpacing = 0;
    let required = false;

    if (content.schemaVersion === 3) {
      if (meta.type === "text") {
        switch (meta.role) {
          case "headline": {
            const textLen = typeof value === "string" ? value.length : 40;
            const maxHeadline = isDense ? 60 : 76;
            const minHeadline = 44;
            fontSize = Math.max(
              minHeadline,
              Math.min(
                maxHeadline,
                Math.floor(
                  (height - 180) /
                    (totalItemCount * 1.35 + (textLen > 60 ? 2 : 1))
                )
              )
            );
            fontWeight = 700;
            lineHeight = 1.15;
            letterSpacing = -0.5;
            required = true;
            break;
          }
          case "eyebrow":
          case "sectionLabel":
            fontSize = isDense ? 22 : 24;
            fontWeight = 600;
            lineHeight = 1.2;
            letterSpacing = 1.8;
            break;
          case "callToAction":
            fontSize = isDense ? 24 : 28;
            fontWeight = 600;
            lineHeight = 1.2;
            break;
          case "label":
            fontSize = isDense ? 22 : 24;
            fontWeight = 500;
            lineHeight = 1.2;
            break;
          case "body":
          default: {
            const bodyLen = typeof value === "string" ? value.length : 100;
            const maxBody = isDense ? 30 : 36;
            const minBody = 24;
            fontSize = Math.max(
              minBody,
              Math.min(
                maxBody,
                Math.floor(
                  (height - 200) /
                    (totalItemCount * 1.6 + (bodyLen > 150 ? 2.5 : 1))
                )
              )
            );
            fontWeight = 400;
            lineHeight = 1.35;
            break;
          }
        }
      } else if (meta.type === "list") {
        fontSize = isDense ? 26 : 30;
        fontWeight = 400;
        lineHeight = 1.3;
      } else if (meta.type === "metric") {
        if (meta.part === "value") {
          fontSize = isDense ? 72 : 88;
          fontWeight = 800;
          lineHeight = 1.05;
          required = true;
        } else {
          fontSize = 24;
          fontWeight = 500;
          lineHeight = 1.2;
        }
      } else if (meta.type === "quote") {
        if (meta.part === "text") {
          fontSize = isDense ? 32 : 38;
          fontWeight = 500;
          lineHeight = 1.3;
          required = true;
        } else {
          fontSize = 24;
          fontWeight = 400;
          lineHeight = 1.2;
        }
      } else if (meta.type === "comparison") {
        if (meta.part.endsWith(".label")) {
          fontSize = 26;
          fontWeight = 600;
          lineHeight = 1.2;
        } else {
          fontSize = 28;
          fontWeight = 400;
          lineHeight = 1.3;
        }
      }
    } else {
      // Schema V2
      if (source === "headline") {
        fontSize = 80;
        fontWeight = 700;
        lineHeight = 1.15;
        required = true;
      } else if (source === "eyebrow" || source === "sectionLabel") {
        fontSize = 24;
        fontWeight = 600;
        letterSpacing = 1.5;
      } else if (source === "callToAction" || source === "label") {
        fontSize = 28;
        fontWeight = 600;
      } else {
        fontSize = 36;
        fontWeight = 400;
        lineHeight = 1.35;
      }
    }

    const piece: PieceDefinitionV2 = {
      kind: "text",
      fill: palette.text,
      stroke: null,
      strokeWidth: 0,
      cornerRadius: 0,
      points: [],
      fontFamily: "Arial",
      fontAssetId: null,
      fontSize,
      fontWeight,
      align,
      lineHeight,
      letterSpacing,
      fixedText: null,
    };
    const hash = arsenalHash(piece);
    pieces[hash] = piece;

    base.instances.push({
      id,
      pieceHash: hash,
      parentId: null,
      zIndex: base.instances.length,
      x: 72,
      y: 72,
      width: width - 144,
      height: Math.ceil(fontSize * lineHeight),
      rotation: 0,
      opacity: 1,
    });

    base.bindings.push({
      id,
      label: source,
      kind: Array.isArray(value) ? "list" : "text",
      source,
      required,
      targetIds: [id],
      cardinality: Array.isArray(value)
        ? { min: 0, max: Math.max(64, value.length) }
        : null,
      prefix: "",
      gap: content.schemaVersion === 3 ? 12 : 20,
    });

    base.relations.push({
      id: `fit-${id}`,
      version: 1,
      enabled: true,
      kind: "textFit",
      inputs: [],
      outputs: [{ targetId: id, properties: ["x", "width", "height"] }],
      parameters: {
        anchor,
        maxWidth: width - 144,
        maxHeight: height - 144,
        minFontSize: fontSize,
      },
    });
  }

  if (base.instances.length) {
    const startY = slot === 2 ? 96 : 72;
    const gap = content.schemaVersion === 3 ? (isDense ? 10 : 18) : 24;
    base.relations.push({
      id: "text-flow",
      version: 1,
      enabled: true,
      kind: "verticalFlow",
      inputs: base.instances.map(i => i.id),
      outputs: base.instances.map(i => ({ targetId: i.id, properties: ["y"] })),
      parameters: { startY, gap },
    });
  }

  return { base, pieces };
}
