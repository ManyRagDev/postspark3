import { describe, expect, it } from "vitest";
import { arsenalHash } from "../../shared/arsenalContent";
import { createComponentDefinition } from "../../shared/componentAssembly";
import { arsenalPieceSchema, ARSENAL_VARIABLE_COMPILER } from "../../shared/designArsenal";
import type { ComponentPackage } from "./extract";
import { ornamentComponents } from "./ornamentComponents";

const hash = (value: unknown) => arsenalHash(value);
function fixture(): ComponentPackage {
  const ids = ["marcador-roxo-1", "marcador-roxo-2", "marcador-laranja-1", "marcador-laranja-2", "adesivo-seta", "adesivo-laranja", "titulo"];
  const pieces = Object.fromEntries(ids.map((id, index) => {
    const fill = ["#9871C0", "#9871C1", "#9871C2", "#9871C3", "#9871C4", "#9871C5", "#111111"][index];
    const piece = arsenalPieceSchema.parse({ kind: id === "titulo" ? "text" : "rect", fill, stroke: null, strokeWidth: 0, cornerRadius: 0, points: [], fontFamily: "Arial", fontAssetId: null, fontSize: 24, fontWeight: 400, align: "left", lineHeight: 1, letterSpacing: 0, fixedText: null });
    return [hash(piece), piece];
  }));
  const instances = ids.map((id, index) => ({ id, pieceHash: Object.keys(pieces)[index], parentId: "paper-group", zIndex: index, x: index * 12, y: 20, width: 10, height: 10, rotation: 0, opacity: 1 }));
  const fragment = { variantKey: "1x1-source", aspectRatio: "1:1" as const, compilerVersion: ARSENAL_VARIABLE_COMPILER, artboard: { width: 720, height: 720, background: "#FFFFFF" }, instances, groups: [{ id: "paper-group", label: "Papel", parentId: null, zIndex: 0, x: 0, y: 0, width: 720, height: 720, rotation: 0, opacity: 1, scale: 1 }], bindings: [], relations: [], assetIds: [], capabilities: ["rect", "groups"], intentionalOverlaps: [], limitations: [] };
  const base = createComponentDefinition({ schemaVersion: 1, id: "11111111-1111-4111-8111-111111111111", kind: "content", label: "Scrapbook · content", description: "Fixture", source: { kind: "recipe", recipeHash: "a".repeat(64), fileHash: "b".repeat(64), referenceId: "0623fb1c14937cd1e67e980b566710ba", variantKey: fragment.variantKey }, roles: ["static"], densities: ["balanced"], aspectRatios: ["1:1"], fragment, pieces, assets: [] });
  return { components: [base], source: {} } as unknown as ComponentPackage;
}

describe("ornamentComponents", () => {
  it("isolates allowlisted geometry, keeps its group ancestry, and leaves source content intact", () => {
    const p = fixture();
    const source = p.components[0];
    const result = ornamentComponents(p);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("ornament");
    expect(result[0].fragment.instances.map(instance => instance.id)).toEqual([
      "marcador-roxo-1", "marcador-roxo-2", "marcador-laranja-1", "marcador-laranja-2", "adesivo-seta", "adesivo-laranja",
    ]);
    expect(result[0].fragment.groups.map(group => group.id)).toEqual(["paper-group"]);
    expect(result[0].fragment.bindings).toEqual([]);
    expect(result[0].fragment.instances.some(instance => instance.id === "titulo")).toBe(false);
    expect(source.fragment.instances).toHaveLength(7);
  });
});
