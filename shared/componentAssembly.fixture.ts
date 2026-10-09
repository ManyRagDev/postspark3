import reference from "../client/src/pages/CanvasLab/arsenal/windowFixture.json";
import {
  createComponentDefinition,
  assemblyIdentity,
  assemblySlideRoles,
  assemblyDensities,
  type AssemblyPlanV1,
} from "./componentAssembly";
import { arsenalHash } from "./arsenalContent";
import {
  ARSENAL_VARIABLE_COMPILER,
  arsenalVariantSchema,
  arsenalPieceSchema,
  arsenalAssetSchema,
} from "./designArsenal";

/** Preserved window recipe fixture; independent of the three-module pilot kit. */
export function componentAssemblyFixture() {
  const content = createComponentDefinition({
    schemaVersion: 1,
    id: assemblyIdentity("window-reference-component-fixture"),
    kind: "content",
    label: "Janelas da referência",
    description:
      "Conjunto real de janelas e conteúdo, preservado para contrato",
    source: {
      kind: "recipe",
      recipeHash: arsenalHash(reference.variant),
      fileHash: arsenalHash(reference),
      referenceId: "window-fixture",
      variantKey: reference.variant.variantKey,
    },
    roles: [...assemblySlideRoles],
    densities: [...assemblyDensities],
    aspectRatios: ["1:1", "4:5", "5:6", "9:16"],
    fragment: arsenalVariantSchema.parse({
      ...reference.variant,
      compilerVersion: ARSENAL_VARIABLE_COMPILER,
      mediaSlots: [
        {
          id: "area-foto",
          label: "Foto da referência",
          function: "Assunto editorial",
          prompt: "Assunto do slide",
          deferred: true,
          policy: "cover",
        },
      ],
    }),
    pieces: Object.fromEntries(
      Object.entries(reference.pieces).map(([hash, p]) => [
        hash,
        arsenalPieceSchema.parse(p),
      ])
    ),
    assets: reference.assets.map(a => arsenalAssetSchema.parse(a)),
  });
  return [content];
}
export function componentAssemblyPlanFixture(slides = 1): AssemblyPlanV1 {
  const c = componentAssemblyFixture()[0];
  return {
    schemaVersion: 1,
    postMode: slides === 1 ? "static" : "carousel",
    aspectRatio: "5:6",
    variations: [0, 1, 2].map(slot => ({
      id: `variation-${slot}`,
      direction: {
        label: `Direção ${slot}`,
        palette: { background: "#FFFFFF", text: "#111111", accent: "#A33E18" },
        typographyComponentId: null,
      },
      caption: `Legenda ${slot}`,
      hashtags: [],
      slides: Array.from({ length: slides }, (_, index) => ({
        id: `slide-${index}`,
        role:
          slides === 1
            ? "static"
            : index === 0
              ? "cover"
              : index === slides - 1
                ? "closing"
                : "development",
        density: index === 0 ? "expressive" : "quiet",
        content: {
          schemaVersion: 3,
          blocks: [
            {
              id: "headline",
              type: "text",
              role: "headline",
              text: `Título ${slot}-${index}`,
            },
            {
              id: "list",
              type: "list",
              items: [
                { id: "item-one", text: "Primeiro item" },
                { id: "item-two", text: "Segundo item" },
              ],
            },
          ],
          caption: "",
          hashtags: [],
        },
        components: [{ id: c.id, hash: c.hash }],
        mediaPrompts: [
          {
            componentId: c.id,
            slotId: "area-foto",
            prompt: `Foto editorial para o slide ${index}`,
          },
        ],
      })),
    })),
  };
}
