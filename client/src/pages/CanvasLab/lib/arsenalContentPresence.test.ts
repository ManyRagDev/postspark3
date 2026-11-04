import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { readArsenalComposition } from "@shared/designArsenal";
import {
  editArsenalContent,
  putArsenalComposition,
  resolveArsenalComposition,
} from "./arsenalComposition";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";
import { INITIAL_POST } from "../components/types";

function fixture(optIn = true) {
  const source = completeDesignTestDefinitions()[0];
  const support = source.fragment.instances[1];
  const shape = {
    ...source.pieces[support.pieceHash],
    kind: "rect" as const,
    fixedText: null,
  };
  const hash = arsenalHash(shape);
  const definition = createComponentDefinition({
    ...source,
    pieces: { ...source.pieces, [hash]: shape },
    fragment: {
      ...source.fragment,
      instances: [
        ...source.fragment.instances,
        { ...support, id: "card", pieceHash: hash },
        { ...support, id: "marker", x: 20, width: 40 },
      ],
      bindings: [
        ...source.fragment.bindings.map(b =>
          b.id === "support"
            ? {
                ...b,
                required: false,
                ...(optIn
                  ? { hideWhenEmpty: ["support", "marker", "card"] }
                  : {}),
              }
            : b
        ),
        {
          ...source.fragment.bindings[1],
          id: "marker",
          source: "block:label:0:text",
          required: false,
          targetIds: ["marker"],
        },
      ],
    },
  });
  return resolveArsenalComposition(
    instantiateCompleteDesign({
      definition,
      values: [
        { fieldId: "field-0", value: "Título" },
        { fieldId: "field-1", value: "" },
        { fieldId: "field-2", value: "03" },
      ],
      mediaPrompts: [],
      runId: "7406c096-cd30-4d61-b85c-e26cddca7691",
      slot: 0,
      slide: 0,
      planHash: arsenalHash("presence-test"),
      experimental: true,
    })
  );
}
function reopen(scene: ReturnType<typeof fixture>) {
  const model = putArsenalComposition(structuredClone(INITIAL_POST), scene);
  const payload = canvasModelToSavePayload(model, {
    inputType: "text",
    inputContent: "presença",
  });
  const saved = JSON.parse(JSON.stringify(payload.canvasModel));
  const reopened = savedPostToCanvasModel({ id: 1, canvas_model: saved });
  return readArsenalComposition(reopened.slides[0].composition!);
}
describe("CanvasLab content-controlled visual group", () => {
  it("round-trips empty → filled → empty without deleting instances or changing pinned identity", () => {
    let scene = fixture();
    const baseHash = arsenalHash(scene.base),
      origin = scene.origin,
      ids = scene.elements.map(e => e.id);
    for (const text of ["", "Novo cuidado completo", ""]) {
      expect(scene.content.schemaVersion).toBe(3);
      const content = structuredClone(scene.content);
      if (content.schemaVersion !== 3) throw new Error("Unexpected fixture");
      const body = content.blocks.find(b => b.id === "field-1")!;
      if (body.type !== "text") throw new Error("Unexpected field");
      body.text = text;
      scene = reopen(editArsenalContent(scene, content));
      expect(scene.origin).toEqual(origin);
      expect(arsenalHash(scene.base)).toBe(baseHash);
      expect(scene.elements.map(e => e.id)).toEqual(ids);
      for (const id of ["support", "marker", "card"])
        expect(scene.elements.find(e => e.id === id)!.opacity).toBe(
          text ? 1 : 0
        );
      expect(resolveArsenalComposition(scene)).toEqual(scene);
    }
  });
  it("leaves historical unbound surfaces and markers visible without the opt-in metadata", () => {
    const old = reopen(fixture(false));
    expect(old.elements.find(e => e.id === "card")!.opacity).toBe(1);
    expect(old.elements.find(e => e.id === "marker")!.opacity).toBe(1);
  });
});
