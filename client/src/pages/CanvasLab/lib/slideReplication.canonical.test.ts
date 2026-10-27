import { describe, it, expect } from "vitest";
import { INITIAL_POST } from "../components/types";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import { replicateSlideAppearance, findArsenalTextElementByRole, validateReplication } from "./slideReplication";
import { resolveArsenalComposition, overrideArsenalElement, addArsenalAuthorialLayer } from "./arsenalComposition";
import { validateFontFile } from "./fontResources";
import { arsenalHash } from "@shared/arsenalContent";
import { readArsenalComposition } from "@shared/designArsenal";

describe("Slide Replication Canonical Behavior (OS-003, OS-006 & C02)", () => {
  it("CP-28: replicated catalog font survives next composition resolution", () => {
    const c = createArsenalFixtureComposition();
    const text = c.elements.find((e) => e.kind === "text")!;
    const p = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Arial",
      slides: [
        { id: "n", step: "", headline: "n", subtext: "" },
        { id: "c", step: "", headline: "c", subtext: "", composition: c },
      ],
    };
    const next = replicateSlideAppearance(p, 0, [1], ["font"]);
    const changed = next.slides[1].composition!;
    expect(changed.elements.find((e) => e.id === text.id)?.fontFamily).toBe("Arial");
    expect(resolveArsenalComposition(changed).elements.find((e) => e.id === text.id)?.fontFamily).toBe("Arial");
  });

  it("CP-29: C source effective font is copied to N", () => {
    let c = createArsenalFixtureComposition();
    const text = findArsenalTextElementByRole(c, "headline")!;
    c = overrideArsenalElement(c, text.id, { fontFamily: "Custom Source" });
    const p = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Root Stale",
      slides: [
        { id: "c", step: "", headline: "c", subtext: "", composition: c },
        { id: "n", step: "", headline: "n", subtext: "" },
      ],
    };
    const next = replicateSlideAppearance(p, 0, [1], ["font"]);
    expect(next.slides[1].visualStyle?.fontFamily).toBe("Custom Source");
  });

  it("CP-30: corrupt four-byte fake font is rejected", () => {
    expect(validateFontFile(new Uint8Array([0, 1, 0, 0]), "bad.ttf").valid).toBe(false);
  });

  it("RC-06 BUG-025: representable headline and body faces remain distinct", () => {
    let c = createArsenalFixtureComposition();
    const base = { ...c.base, bindings: c.base.bindings.map((b) => (b.source === "sectionLabel" ? { ...b, source: "body" as const } : b)) };
    const content = { ...c.content, body: "Body text", sectionLabel: null };
    c = resolveArsenalComposition({ ...c, base, content, origin: { ...c.origin, variantHash: arsenalHash(base) }, userContentHash: arsenalHash(content) } as any);
    const headline = findArsenalTextElementByRole(c, "headline")!;
    const body = findArsenalTextElementByRole(c, "body")!;
    expect(headline).toBeDefined();
    expect(body).toBeDefined();
    let source = overrideArsenalElement(c, headline.id, { fontFamily: "Arial", fontAssetId: null });
    source = overrideArsenalElement(source, body.id, { fontFamily: "Courier New", fontAssetId: null });
    expect(() => readArsenalComposition(source)).not.toThrow();
    expect(() => readArsenalComposition(c)).not.toThrow();
    const p = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Arial",
      slides: [
        { id: "s", step: "", headline: "Source", subtext: "Body text", composition: source },
        { id: "t", step: "", headline: "Target", subtext: "Body text", composition: c },
      ],
    };
    expect(validateReplication(p, 0, [1], ["font"]).ok).toBe(true);
    const result = replicateSlideAppearance(p, 0, [1], ["font"]);
    expect(result.slides[1].composition?.elements.find((e) => e.id === body.id)?.fontFamily).toBe("Courier New");
  });

  it("C04-R4 BUG-025: unrelated authorial text must retain its own face", () => {
    const source = createArsenalFixtureComposition();
    const target = addArsenalAuthorialLayer(source, {
      id: "tx-unbound",
      kind: "text",
      text: "Unrelated authorial label",
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      rotation: 0,
      opacity: 1,
      parentId: null,
      zIndex: 100,
      fontSize: 20,
      fontFamily: "Courier New",
      fill: "#ffffff",
    });
    const p = {
      ...structuredClone(INITIAL_POST),
      fontFamily: "Arial",
      slides: [
        { id: "s", step: "", headline: "s", subtext: "", composition: source },
        { id: "t", step: "", headline: "t", subtext: "", composition: target },
      ],
    };
    expect(() => readArsenalComposition(target)).not.toThrow();
    const next = replicateSlideAppearance(p, 0, [1], ["font"]);
    expect(next.slides[1].composition?.elements.find((e) => e.id === "tx-unbound")?.fontFamily).toBe("Courier New");
  });

  it("control: unrelated authorial face is Courier New before replication", () => {
    const target = addArsenalAuthorialLayer(createArsenalFixtureComposition(), {
      id: "tx-unbound",
      kind: "text",
      text: "Unrelated authorial label",
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      rotation: 0,
      opacity: 1,
      parentId: null,
      zIndex: 100,
      fontSize: 20,
      fontFamily: "Courier New",
      fill: "#ffffff",
    });
    expect(target.elements.find((e) => e.id === "tx-unbound")?.fontFamily).toBe("Courier New");
  });
});

