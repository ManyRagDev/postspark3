import { componentAssemblyFixture } from "./componentAssembly.fixture";
import {
  createComponentDefinition,
  assemblyIdentity,
} from "./componentAssembly";
import { arsenalHash } from "./arsenalContent";

export function completeDesignTestDefinitions() {
  const original = componentAssemblyFixture()[0],
    title = original.fragment.instances.find(i => i.id === "titulo-principal")!,
    piece = original.pieces[title.pieceHash];
  const body = { ...piece, fontSize: 32 },
    bodyHash = arsenalHash(body);
  return [0, 1, 2].map(i =>
    createComponentDefinition({
      ...original,
      id: assemblyIdentity(["complete-design-test", i]),
      label: `Design ${i}`,
      completeDesign: { family: `family-${i}`, baselineVerified: true },
      fragment: {
        ...original.fragment,
        artboard: { ...original.fragment.artboard, background: "#FFFFFF" },
        aspectRatio: "4:5",
        instances: [
          {
            ...title,
            parentId: null,
            x: 72,
            y: 72,
            width: 900,
            height: 220,
            rotation: 0,
          },
          {
            ...title,
            id: "support",
            pieceHash: bodyHash,
            parentId: null,
            x: 72,
            y: 500,
            width: 900,
            height: 140,
            rotation: 0,
          },
        ],
        groups: [],
        relations: [],
        intentionalOverlaps: [],
        mediaSlots: [],
        assetIds: piece.fontAssetId ? [piece.fontAssetId] : [],
        bindings: [
          {
            id: "title",
            label: "Título",
            kind: "text",
            source: "block:headline:0:text",
            required: true,
            targetIds: [title.id],
            cardinality: null,
            prefix: "",
            gap: 0,
          },
          {
            id: "support",
            label: "Apoio",
            kind: "text",
            source: "block:body:0:text",
            required: false,
            targetIds: ["support"],
            cardinality: null,
            prefix: "",
            gap: 0,
          },
        ],
      },
      pieces: { [title.pieceHash]: piece, [bodyHash]: body },
      assets: original.assets.filter(a => a.id === piece.fontAssetId),
    })
  );
}
