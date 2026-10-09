import data from "../arsenal/windowFixture.json";
import {
  arsenalVariantSchema,
  arsenalAssetSchema,
  arsenalPieceSchema,
  arsenalOriginSchema,
  type ArsenalComposition,
} from "@shared/designArsenal";
import {
  arsenalHash,
  designContentDocumentSchema,
} from "@shared/arsenalContent";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import {
  putArsenalComposition,
  readArsenalComposition,
  resolveArsenalComposition,
} from "./arsenalComposition";
import { ensureArsenalFont } from "./arsenalAssets";

export function createArsenalFixtureComposition(): ArsenalComposition {
  const base = arsenalVariantSchema.parse(data.variant),
    content = designContentDocumentSchema.parse(data.content);
  const pieces = Object.fromEntries(
    Object.entries(data.pieces).map(([hash, p]) => [
      hash,
      arsenalPieceSchema.parse(p),
    ])
  );
  const c: ArsenalComposition = {
    version: 2,
    origin: arsenalOriginSchema.parse(data.origin),
    base,
    pieces,
    assets: data.assets.map(a => arsenalAssetSchema.parse(a)),
    content,
    userContentHash: arsenalHash(content),
    generatedContentHash: arsenalHash(content),
    contentRevision: 0,
    elements: [],
    groups: base.groups,
    relations: base.relations,
    overrides: {},
    richText: {},
    media: {},
    seed: 0,
    state: "needs_adjustment",
    issues: ["missing_media"],
    layoutOrigin: "catalog-variant",
    sourceVariantKey: base.variantKey,
    effectiveAspectRatio: base.aspectRatio,
    projection: { scale: 1, x: 0, y: 0 },
    artboard: base.artboard,
  };
  return readArsenalComposition(resolveArsenalComposition(c));
}
export async function createArsenalFixturePost(): Promise<CanvasPostModel> {
  // Load verified font bytes before the first measurement. No paid operation or catalogue publication.
  await Promise.all(
    data.assets.map(a => ensureArsenalFont(arsenalAssetSchema.parse(a)))
  );
  const c = createArsenalFixtureComposition();
  return putArsenalComposition(
    {
      ...structuredClone(INITIAL_POST),
      id: crypto.randomUUID(),
      aspectRatio: "5:6",
      familyName: "Janelas",
      palette: {
        background: c.artboard.background,
        text: "#111111",
        accent: "#46AF45",
      },
      slides: [
        { id: crypto.randomUUID(), step: "", headline: "", subtext: "" },
      ],
      currentSlideIndex: 0,
    },
    c
  );
}
