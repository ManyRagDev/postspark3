import { describe, it, expect } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { createArsenalFixtureComposition } from "./arsenalFixture";
import {
  resolveArsenalComposition,
  overrideArsenalElement,
} from "./arsenalComposition";
import { arsenalHash } from "@shared/arsenalContent";
import {
  findArsenalTextElementByRole,
  replicateSlideAppearance,
  validateReplication,
  changedReplicationSlides,
} from "./slideReplication";
import { resolveEditorProperties } from "./editorController";
import {
  findElementCorrespondences,
  replicateElementAppearance,
} from "./elementReplication";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "./saveAdapter";

function bodyFixture() {
  let c = createArsenalFixtureComposition();
  const base = {
    ...c.base,
    bindings: c.base.bindings.map(b =>
      b.source === "sectionLabel" ? { ...b, source: "body" as const } : b
    ),
  };
  const content = {
    ...c.content,
    body: "Corpo preservado",
    sectionLabel: null,
  };
  return resolveArsenalComposition({
    ...c,
    base,
    content,
    origin: { ...c.origin, variantHash: arsenalHash(base) },
    userContentHash: arsenalHash(content),
  });
}
function model(): CanvasPostModel {
  const c = bodyFixture(),
    body = findArsenalTextElementByRole(c, "body")!;
  const source = overrideArsenalElement(c, body.id, {
    fontSize: 49,
    lineHeight: 1.7,
    fill: "#123456",
    align: "right",
    letterSpacing: 1.25,
  });
  return {
    ...structuredClone(INITIAL_POST),
    slides: [
      {
        id: "source",
        headline: "Origem",
        subtext: "Corpo preservado",
        step: "",
        composition: source,
      },
      {
        id: "target",
        headline: "Destino",
        subtext: "Corpo preservado",
        step: "",
        composition: c,
      },
      {
        id: "native",
        headline: "Outro título",
        subtext: "Outro texto",
        step: "",
      },
    ],
  };
}
describe("replication follows effective appearance and explicit correspondence", () => {
  it("copies canonical body style and retains it after resolution and JSON save/reopen", () => {
    const post = model(),
      before = structuredClone(post);
    const next = replicateSlideAppearance(post, 0, [1], ["body"]);
    expect(changedReplicationSlides(post, next, [1])).toEqual([1]);
    expect(post).toEqual(before);
    expect(next.slides[2]).toBe(post.slides[2]);
    const payload = canvasModelToSavePayload(next, {
      inputType: "text",
      inputContent: "Teste",
    });
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    });
    const body = findArsenalTextElementByRole(
      resolveArsenalComposition(reopened.slides[1].composition!),
      "body"
    )!;
    expect(body).toMatchObject({
      fontSize: 49,
      lineHeight: 1.7,
      fill: "#123456",
      align: "right",
      letterSpacing: 1.25,
    });
    expect(reopened.slides[1].subtext).toBe("Corpo preservado");
    const again = replicateSlideAppearance(next, 0, [1], ["body"]);
    expect(changedReplicationSlides(next, again, [1])).toEqual([]);
  });
  it("uses px and line spacing across catalogue and native text without copying content or position", () => {
    const post = model();
    const next = replicateSlideAppearance(post, 0, [2], ["body"]);
    const effective = resolveEditorProperties(next, {
      slideId: "native",
      elementId: "subtext",
    }).values;
    const factor = 360 / post.slides[0].composition!.artboard.width;
    expect(effective).toMatchObject({
      lineHeight: 1.7,
      fill: "#123456",
      align: "right",
    });
    expect(effective.fontSize).toBeCloseTo(49 * factor);
    expect(effective.letterSpacing).toBeCloseTo(1.25 * factor);
    expect(next.slides[2].subtext).toBe("Outro texto");
    expect(next.slides[2].subtextPos).toBeUndefined();
  });
  it("refuses locked and nonexistent destinations atomically", () => {
    const post = model(),
      body = findArsenalTextElementByRole(post.slides[1].composition!, "body")!;
    post.slides[1].composition!.elementStates = { [body.id]: { locked: true } };
    expect(validateReplication(post, 0, [1, 2], ["body"]).ok).toBe(false);
    expect(replicateSlideAppearance(post, 0, [1, 2], ["body"])).toBe(post);
    expect(validateReplication(post, 0, [999], ["body"]).ok).toBe(false);
  });
  it("finds semantic body targets across formats and reports ambiguous authorial labels", () => {
    const post = model(),
      body = findArsenalTextElementByRole(post.slides[0].composition!, "body")!;
    expect(
      findElementCorrespondences(post, {
        slideId: "source",
        elementId: body.id,
      }).map(m => m.status)
    ).toEqual(["matched", "matched"]);
    const native = structuredClone(INITIAL_POST);
    native.slides = [
      {
        id: "a",
        headline: "A",
        subtext: "B",
        step: "",
        extraTexts: [{ id: "badge-a", text: "Selo", color: "#123456" }],
      },
      {
        id: "b",
        headline: "C",
        subtext: "D",
        step: "",
        extraTexts: [
          { id: "badge-b", text: "Selo" },
          { id: "badge-c", text: "Selo" },
        ],
      },
    ];
    const source = { slideId: "a", elementId: "badge-a" };
    const match = findElementCorrespondences(native, source)[0];
    expect(match.status).toBe("ambiguous");
    expect(match.candidates).toHaveLength(2);
    const result = replicateElementAppearance(
      native,
      source,
      [{ slideId: "b", elementId: "badge-c" }],
      ["fill"]
    );
    expect(result.ok).toBe(true);
    expect(result.changed).toHaveLength(1);
    expect(result.post.slides[1].extraTexts![0].color).toBeUndefined();
    expect(result.post.slides[1].extraTexts![1]).toMatchObject({
      text: "Selo",
      color: "#123456",
    });
    const noop = replicateElementAppearance(
      result.post,
      source,
      [{ slideId: "b", elementId: "badge-c" }],
      ["fill"]
    );
    expect(noop.changed).toEqual([]);
    expect(noop.post).toBe(result.post);
  });
  it("applies selected properties only and rejects a mixed invalid batch without partial writes", () => {
    const post = model(),
      body = findArsenalTextElementByRole(post.slides[0].composition!, "body")!;
    const targetBody = findArsenalTextElementByRole(
      post.slides[1].composition!,
      "body"
    )!;
    const source = { slideId: "source", elementId: body.id };
    const result = replicateElementAppearance(
      post,
      source,
      [
        { slideId: "target", elementId: targetBody.id },
        { slideId: "native", elementId: "missing" },
      ],
      ["fontSize"]
    );
    expect(result.ok).toBe(false);
    expect(result.post).toBe(post);
    const good = replicateElementAppearance(
      post,
      source,
      [{ slideId: "target", elementId: targetBody.id }],
      ["fontSize"]
    );
    expect(
      resolveEditorProperties(good.post, {
        slideId: "target",
        elementId: targetBody.id,
      }).values
    ).toMatchObject({ fontSize: 49, align: "left", fill: "#111111" });
  });
});
