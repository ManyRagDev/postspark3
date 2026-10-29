import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { arsenalHash } from "@shared/arsenalContent";
import { readArsenalComposition } from "@shared/designArsenal";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { editArsenalContent, editArsenalElementText, putArsenalComposition, resolveArsenalComposition, upgradeCompositionToV3 } from "./arsenalComposition";
import { executeEditorCommand, resolveEditorPhrase } from "./editorController";
import { INITIAL_POST } from "../components/types";

const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
beforeAll(() => Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => createCanvas(20, 20) } }));
afterAll(() => { if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document"); });
const ids = ["titulo-principal", "titulo-segundo"];
function fixture(version: number) {
  const c = createArsenalFixtureComposition();
  const first = c.base.instances.find(i => i.id === ids[0])!;
  const piece = c.pieces[first.pieceHash];
  for (let index = 0; index < 2; index++) {
    const p = { ...piece, contentFragment: { index, count: 2, unit: "words" as const } };
    const hash = arsenalHash(p); c.pieces[hash] = p;
    if (!index) first.pieceHash = hash;
    else c.base.instances.push({ ...first, id: ids[index], pieceHash: hash, y: first.y + 200, zIndex: first.zIndex + 1 });
  }
  c.base.bindings.find(b => b.id === "binding-headline")!.targetIds = ids;
  c.content.headline = "Faça pausa";
  c.origin.variantHash = arsenalHash(c.base); c.origin.definitionHash = arsenalHash(c.base);
  const resolved = readArsenalComposition(resolveArsenalComposition(c));
  return version === 3 ? upgradeCompositionToV3(resolved) : resolved;
}
const shown = (c: ReturnType<typeof fixture>) => ids.map(id => c.elements.find(e => e.id === id)!.text).join("");

describe.each([2, 3])("fragmented composition V%s", version => {
  it("changes a fragment without duplicated words, including a no-op commit", () => {
    const original = fixture(version);
    const same = editArsenalElementText(original, ids[0], original.elements.find(e => e.id === ids[0])!.text);
    expect(same.content).toEqual(original.content);
    const expanded = editArsenalElementText(same, ids[0], "Compre com");
    expect(shown(expanded)).toBe("Compre com pausa");
    expect(() => readArsenalComposition(expanded)).not.toThrow();
    const shorter = editArsenalElementText(original, ids[0], "Compre");
    const second = editArsenalElementText(shorter, ids[1], "com calma");
    expect(shown(second)).toBe("Compre com calma");
    expect(() => readArsenalComposition(second)).not.toThrow();
  });
  it("edits the complete phrase and then applies font and size through the properties panel", () => {
    let post = putArsenalComposition({ ...structuredClone(INITIAL_POST), aspectRatio: "5:6" }, fixture(version));
    const target = { slideId: post.slides[0].id, elementId: ids[0] };
    expect(resolveEditorPhrase(post, target)?.text).toBe("Faça pausa");
    for (const command of [
      { type: "text", text: "Compre com calma", scope: "phrase" },
      { type: "properties", patch: { fontFamily: "Poppins" } },
      { type: "properties", patch: { fontSize: 24 } },
    ] as const) {
      const result = executeEditorCommand(post, target, command);
      expect(result.ok, result.reason).toBe(true); post = result.post;
    }
    const c = readArsenalComposition(JSON.parse(JSON.stringify(post.slides[0].composition)));
    expect(shown(c)).toBe("Compre com calma");
    expect(c.elements.find(e => e.id === ids[0])).toMatchObject({ fontFamily: "Poppins", fontSize: 24 });
  });
  it("replaces stale bound copy when the whole source changes", () => {
    const original = fixture(version);
    const stale = resolveArsenalComposition({ ...original, overrides: { [ids[0]]: { text: "Antigo", fill: "#123456" } } });
    const next = editArsenalContent(stale, { ...stale.content, headline: "Novo título completo" });
    expect(shown(next)).toBe("Novo título completo");
    expect(next.elements.find(e => e.id === ids[0])!.fill).toBe("#123456");
    expect(() => readArsenalComposition(next)).not.toThrow();
  });
  it("keeps explicitly edited rich text while projecting bound copy", () => {
    const c = fixture(version);
    const edited = editArsenalElementText(c, ids[0], "Compre", [{ text: "Compre", color: "#d4af37", bold: true }]);
    const element = edited.elements.find(e => e.id === ids[0])!;
    expect(element.richText?.map(chunk => chunk.text).join("")).toBe(element.text);
    expect(element.richText?.[0]).toMatchObject({ color: "#d4af37", bold: true });
    const whole = createArsenalFixtureComposition();
    const single = editArsenalElementText(whole, ids[0], "Título novo", [{ text: "Título novo", color: "#d4af37" }]);
    expect(single.elements.find(e => e.id === ids[0])!.richText?.[0]).toMatchObject({ text: "Título novo", color: "#d4af37" });
  });
});
