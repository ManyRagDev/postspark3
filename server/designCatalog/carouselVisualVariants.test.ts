import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  assemblyIdentity,
  createComponentDefinition,
} from "@shared/componentAssembly";
import {
  completeDesignFields,
  instantiateCompleteDesign,
} from "@shared/completeDesignGeneration";
import { arsenalHash } from "@shared/arsenalContent";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { arsenalPieceSchema } from "@shared/designArsenal";
import { carouselVisualContract } from "@shared/carouselVisual";
import {
  authorCarouselVisualSequence,
  authorCarouselVisualVariant,
} from "./carouselVisualVariants";

function decoratedSource() {
  const base = completeDesignTestDefinitions()[0];
  const shape = arsenalPieceSchema.parse({
    ...Object.values(base.pieces)[0],
    kind: "rect",
    fill: "#F24B00",
    fixedText: null,
  });
  const pieceHash = arsenalHash(shape);
  return createComponentDefinition({
    ...base,
    pieces: { ...base.pieces, [pieceHash]: shape },
    fragment: {
      ...base.fragment,
      instances: [
        ...base.fragment.instances,
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `decoration-${i}`,
          pieceHash,
          parentId: null,
          x: 20 + i * 45,
          y: 900,
          width: 20,
          height: 20,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
        })),
      ],
    },
  });
}

describe("materialized carousel visual variants", () => {
  it("retains the exact cover and creates quieter reading and distinct closing scenes with source provenance", () => {
    const source = decoratedSource(),
      before = structuredClone(source);
    const sequence = authorCarouselVisualSequence([
      source,
      source,
      source,
      source,
    ]);
    expect(sequence[0]).toBe(source);
    expect(source).toEqual(before);
    expect(new Set(sequence.map(d => d.id)).size).toBe(3);
    expect(sequence[1]).toEqual(sequence[2]);
    for (const [index, d] of Array.from(sequence.entries()).slice(1)) {
      expect(d.completeDesign?.family).toBe(source.completeDesign?.family);
      expect(d.completeDesign?.designGuidance?.carouselVariant).toEqual({
        version: 2,
        contentMode: "compose",
        role: index === 3 ? "closing" : "development",
        sourceId: source.id,
        sourceHash: source.hash,
      });
      expect(
        d.fragment.instances.filter(i => d.pieces[i.pieceHash].kind === "rect")
          .length
      ).toBeLessThan(6);
      expect(d.assets).toEqual(source.assets);
      expect(
        Object.values(d.pieces)
          .filter(p => p.kind === "text")
          .every(p => source.assets.some(a => a.id === p.fontAssetId))
      ).toBe(true);
    }
    expect(completeDesignFields(sequence[1]).map(f => f.source)).toEqual(
      completeDesignFields(source).map(f => f.source)
    );
    expect(completeDesignFields(sequence[3]).at(-1)?.role).toBe("callToAction");
    expect(
      sequence[3].fragment.instances.some(i => i.id === "carousel-cta")
    ).toBe(true);
  });

  it("preserves native photo slots and embedded image assets without substituting media", () => {
    const base = decoratedSource();
    const media = arsenalPieceSchema.parse({
      ...Object.values(base.pieces)[0],
      kind: "media",
      fontAssetId: null,
      fixedText: null,
    });
    const pieceHash = arsenalHash(media);
    const source = createComponentDefinition({
      ...base,
      pieces: { ...base.pieces, [pieceHash]: media },
      fragment: {
        ...base.fragment,
        instances: [
          ...base.fragment.instances,
          {
            id: "photo",
            pieceHash,
            parentId: null,
            x: 20,
            y: 800,
            width: 500,
            height: 300,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
          },
        ],
        mediaSlots: [
          {
            id: "photo",
            label: "Produto",
            function: "Foto contratada",
            prompt: "Produto fornecido",
            deferred: true,
            policy: "contain",
          },
        ],
        bindings: [
          ...base.fragment.bindings,
          {
            id: "media",
            label: "Produto",
            kind: "media",
            source: "media.primary",
            required: false,
            targetIds: ["photo"],
            cardinality: null,
            prefix: "",
            gap: 0,
          },
        ],
      },
    });
    const derived = authorCarouselVisualVariant(source, "closing");
    expect(derived.fragment.mediaSlots).toEqual(source.fragment.mediaSlots);
    expect(
      derived.fragment.instances.find(i => i.id === "photo")?.pieceHash
    ).toBe(pieceHash);
    expect(derived.fragment.bindings.find(b => b.kind === "media")).toEqual(
      source.fragment.bindings.at(-1)
    );
    expect(derived.assets).toEqual(source.assets);
  });

  it("keeps existing field IDs and literal values; visual_only adds no CTA or invented copy", () => {
    const source = decoratedSource();
    const derived = authorCarouselVisualVariant(source, "closing", false);
    expect(completeDesignFields(derived)).toEqual(completeDesignFields(source));
    const values = completeDesignFields(derived).map((f, i) => ({
      fieldId: f.id,
      value: i ? "Texto literal obrigatório." : "Gancho original",
    }));
    const scene = resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition: derived,
        values,
        mediaPrompts: [],
        runId: assemblyIdentity("literal-carousel"),
        slot: 0,
        slide: 1,
        planHash: arsenalHash("plan"),
        experimental: true,
      }),
      {
        measureText: i => ({
          height: i.fontSize * 1.3,
          lines: [{ width: i.text.length * i.fontSize * 0.35 }],
          runs: [],
        }),
      }
    );
    expect(scene.issues).toEqual([]);
    expect(
      scene.elements
        .filter(e => e.kind === "text" && e.opacity > 0)
        .map(e => e.text)
    ).toEqual(values.map(v => v.value));
    expect(
      completeDesignFields(derived).some(f => f.role === "callToAction")
    ).toBe(false);
  });

  it("keeps native list cardinality and every item slot", () => {
    const base = decoratedSource();
    const list = structuredClone(base);
    const first = list.fragment.instances.find(i => i.id === "support")!;
    list.fragment.instances.push({ ...first, id: "second-item", y: 700 });
    const binding = list.fragment.bindings.find(b => b.id === "support")!;
    Object.assign(binding, {
      source: "block:list:0:items",
      kind: "list",
      listMode: "native-slots",
      targetIds: ["support", "second-item"],
      cardinality: { min: 1, max: 2 },
    });
    const { hash: _, ...definition } = list;
    const derived = authorCarouselVisualVariant(
      createComponentDefinition(definition),
      "development"
    );
    expect(
      derived.fragment.bindings.find(b => b.kind === "list")
    ).toMatchObject({
      targetIds: ["support", "second-item"],
      cardinality: { min: 1, max: 2 },
      listMode: "native-slots",
    });
  });

  it("gives title-only covers an explanation field after the cover, preserving literal mode", () => {
    const base = decoratedSource();
    const source = createComponentDefinition({
      ...base,
      fragment: {
        ...base.fragment,
        bindings: base.fragment.bindings.filter(b => b.id !== "support"),
        instances: base.fragment.instances.filter(i => i.id !== "support"),
      },
    });
    const sequence = authorCarouselVisualSequence([source, source, source]);
    expect(completeDesignFields(sequence[0]).map(f => f.role)).toEqual([
      "headline",
    ]);
    expect(completeDesignFields(sequence[1]).map(f => f.role)).toEqual([
      "headline",
      "body",
    ]);
    expect(completeDesignFields(sequence[2]).map(f => f.role)).toEqual([
      "headline",
      "body",
      "callToAction",
    ]);
    expect(
      completeDesignFields(
        authorCarouselVisualVariant(source, "closing", false)
      )
    ).toEqual(completeDesignFields(source));
  });

  it("is deterministic, handles two slides and leaves static/explicit identical layouts intact", () => {
    const source = decoratedSource();
    expect(authorCarouselVisualVariant(source, "closing")).toEqual(
      authorCarouselVisualVariant(source, "closing")
    );
    expect(authorCarouselVisualSequence([source])[0]).toBe(source);
    expect(authorCarouselVisualSequence([source, source])[1].roles).toEqual([
      "closing",
    ]);
    expect(carouselVisualContract(1)).toBeNull();
    expect(
      carouselVisualContract(4, "Use o mesmo layout em todos os slides")
    ).toBeNull();
    expect(
      carouselVisualContract(4, "Mantenha a mesma identidade visual")
    ).not.toBeNull();
  });
});
