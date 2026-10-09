import { describe, expect, it } from "vitest";
import {
  componentAssemblyFixture,
  componentAssemblyPlanFixture,
} from "./componentAssembly.fixture";
import {
  componentHash,
  createComponentDefinition,
  assemblyVariationBundleV1Schema,
  assemblyIdentity,
  componentDefinitionV1Schema,
  compactComponentCard,
  validateAssemblyPlan,
  materializeAssemblyPlan,
  materializeEditorialAssemblySlide,
  compositionFromAssemblyBundle,
  preflightAssemblyGeneration,
} from "./componentAssembly";
import { arsenalHash } from "./arsenalContent";
import {
  fragmentContentText,
  arsenalPieceSchema,
  arsenalVariantSchema,
} from "./designArsenal";
import {
  auditArsenalGeometry,
  resolveArsenalGeometry,
  type ArsenalTextMeasurer,
} from "./arsenalGeometry";
const run = {
  traceId: "a20b3bc0-2c41-4080-8b29-fb257b61b7a0",
  runId: "a20b3bc0-2c41-4080-8b29-fb257b61b7a0",
};
const measure: ArsenalTextMeasurer = input => ({
  height: input.text ? input.fontSize * (input.lineHeight ?? 1.2) : 0,
  lines: [
    { width: Math.min(input.width, input.text.length * input.fontSize * 0.45) },
  ],
  runs: [
    { fill: input.fill, fontSize: input.fontSize, fontStyle: input.fontStyle },
  ],
});
describe("component assembly contracts and deterministic compilation", () => {
  it("rejects an intentional pending-photo overlay unless an opaque panel fully protects the text", () => {
    const bundle = materializeAssemblyPlan(
      componentAssemblyPlanFixture(),
      componentAssemblyFixture(),
      run
    ).variations[0].slides[0].bundle;
    const c = resolveArsenalGeometry(compositionFromAssemblyBundle(bundle), {
        measureText: measure,
      }),
      text = c.elements.find(e => e.kind === "text")!,
      image = c.elements.find(e => e.kind === "media")!;
    c.groups = [];
    c.media = {};
    Object.assign(text, {
      x: 50,
      y: 50,
      width: 200,
      height: 60,
      parentId: null,
      rotation: 0,
      zIndex: 2,
      opacity: 1,
      text: "Apoio legível",
    });
    Object.assign(image, {
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      parentId: null,
      rotation: 0,
      zIndex: 0,
      opacity: 1,
      mediaSlot: {id:image.id,label:"Foto",function:"Editorial",prompt:"Fotografia",deferred:true,policy:"cover"},
    });
    c.elements = [image, text];
    c.base.intentionalOverlaps = [[text.id, image.id]];
    const collision = `collision:text_media:${text.id}/${image.id}`;
    expect(auditArsenalGeometry(c, measure)).toContain(collision);
    const panel = {
      ...image,
      id: "opaque-panel",
      kind: "rect" as const,
      x: 40,
      y: 40,
      width: 240,
      height: 100,
      zIndex: 1,
      fill: "#FFFFFF",
      cornerRadius: 0,
    };
    c.elements.push(panel);
    expect(auditArsenalGeometry(c, measure)).not.toContain(collision);
    panel.width = 100;
    expect(auditArsenalGeometry(c, measure)).toContain(collision);
  });
  it("rejects a candidate plan pin that diverges from its variation before delivery", () => {
    const output = materializeAssemblyPlan(
      componentAssemblyPlanFixture(2),
      componentAssemblyFixture(),
      run
    );
    const variation = output.variations[0];
    variation.slides[1].bundle.candidates[0].componentAssembly!.planHash =
      "f".repeat(64);
    const parsed = assemblyVariationBundleV1Schema.safeParse(variation);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.map(issue => issue.message)).toContain(
        "slide_candidate_plan_hash_mismatch"
      );
  });
  it("applies quiet density to content while preserving background/media density and all role/aspect validation", () => {
    const content = componentAssemblyFixture()[0],
      background = createComponentDefinition({
        ...content,
        id: assemblyIdentity("density-background"),
        kind: "background",
        densities: ["balanced", "expressive"],
      }),
      media = createComponentDefinition({
        ...content,
        id: assemblyIdentity("density-media"),
        kind: "media",
        densities: ["balanced", "expressive"],
      }),
      proposal = componentAssemblyPlanFixture();
    for (const variation of proposal.variations) {
      variation.slides[0].density = "quiet";
      variation.slides[0].components.push(
        { id: background.id, hash: background.hash },
        { id: media.id, hash: media.hash }
      );
    }
    expect(
      validateAssemblyPlan(proposal, [content, background, media])
    ).toEqual([]);
    const incompatible = createComponentDefinition({
      ...media,
      roles: ["closing"],
    });
    for (const variation of proposal.variations)
      variation.slides[0].components.find(ref => ref.id === media.id)!.hash =
        incompatible.hash;
    expect(
      validateAssemblyPlan(proposal, [content, background, incompatible])
    ).toContain(`component_incompatible:${media.id}`);
  });
  it("pins preserved recipe hashes and rejects unknown or changed offered components", () => {
    const components = componentAssemblyFixture(),
      plan = componentAssemblyPlanFixture();
    expect(validateAssemblyPlan(plan, components)).toEqual([]);
    const bad = structuredClone(plan);
    bad.variations[0].slides[0].components[0].hash = "f".repeat(64);
    expect(validateAssemblyPlan(bad, components)).toContain(
      `component_not_offered:${components[0].id}`
    );
    expect(() => materializeAssemblyPlan(bad, components, run)).toThrow(
      "component_not_offered"
    );
    const tampered = structuredClone(components[0]);
    tampered.label = "Changed";
    expect(componentDefinitionV1Schema.safeParse(tampered).success).toBe(false);
    expect(componentHash(components[0])).toBe(components[0].hash);
  });
  it("offers capacity and media metadata without sending geometry or full definitions", () => {
    const card = compactComponentCard(componentAssemblyFixture()[0]);
    expect(card.capacity.textRegions.length).toBeGreaterThan(1);
    expect(card.mediaSlots[0].deferred).toBe(true);
    expect(JSON.stringify(card)).not.toMatch(
      /pieceHash|instances|sourceRecipeHash/
    );
  });
  it.each([2, 5, 10])(
    "materializes three ordered %i-slide sequences and records generated origins",
    slides => {
      const components = componentAssemblyFixture(),
        plan = componentAssemblyPlanFixture(slides);
      expect(
        validateAssemblyPlan(plan, components, {
          postMode: "carousel",
          slideCount: slides,
        })
      ).toEqual([]);
      const output = materializeAssemblyPlan(plan, components, {
        ...run,
        experimental: true,
      });
      expect(output.variations).toHaveLength(3);
      expect(output.variations.every(v => v.slides.length === slides)).toBe(
        true
      );
      expect(
        output.variations[0].slides[0].bundle.candidates[0].componentAssembly
          ?.componentHashes
      ).toEqual([components[0].hash]);
      expect(output.variations[0].slides.at(-1)?.role).toBe("closing");
      expect(
        validateAssemblyPlan(plan, components, {
          postMode: "carousel",
          slideCount: slides === 10 ? 9 : slides + 1,
        })
      ).toContain("slide_count:0");
      expect(
        materializeAssemblyPlan(plan, components, run).variations[0].slides[0]
          .bundle.userContentHash
      ).toBe(arsenalHash(plan.variations[0].slides[0].content));
    }
  );
  it("validates slide roles and offered media slot IDs before materialization", () => {
    const plan = componentAssemblyPlanFixture(2),
      components = componentAssemblyFixture();
    plan.variations[0].slides[1].role = "cover";
    plan.variations[0].slides[0].mediaPrompts[0].slotId = "invented-slot";
    expect(
      validateAssemblyPlan(plan, components, {
        postMode: "carousel",
        slideCount: 2,
      })
    ).toContain("slide_role:0/1");
    expect(
      validateAssemblyPlan(plan, components, {
        postMode: "carousel",
        slideCount: 2,
      })
    ).toContain("media_slot_not_offered:invented-slot");
  });
  it("shares injectable measurement, preserves content and permits only declared deferred media", () => {
    const output = materializeAssemblyPlan(
      componentAssemblyPlanFixture(),
      componentAssemblyFixture(),
      run
    );
    const result = preflightAssemblyGeneration(output, {
      measureText: measure,
    });
    const slide = result[0].slides[0];
    expect(slide.pendingMedia).toHaveLength(1);
    expect(slide.issues.some(issue => issue.startsWith("missing_media"))).toBe(
      false
    );
    expect(slide.composition.userContentHash).toBe(
      output.variations[0].slides[0].bundle.userContentHash
    );
    expect(
      slide.composition.elements.some(
        e => e.mediaSlot?.prompt === "Foto editorial para o slide 0"
      )
    ).toBe(true);
    expect(
      preflightAssemblyGeneration(output, { measureText: measure })
    ).toEqual(result);
  });
  it("partitions canonical text without dropping whitespace, inventing text or duplicating words", () => {
    const text = "  Seu negócio não é o que parece.\nConfira!  ",
      count = 6;
    const values = Array.from({ length: count }, (_, index) =>
      fragmentContentText(text, {
        index,
        count,
        unit: "words",
        weights: [1, 2, 1, 2, 1, 1],
      })
    );
    expect(values.join("")).toBe(text);
  });
  it("compiles AI placement and beside relations while auditing unintentional media/text overlap", () => {
    const source = componentAssemblyFixture()[0],
      image = source.fragment.instances.find(i => i.id === "area-foto")!,
      imagePiece = source.pieces[image.pieceHash];
    const media = createComponentDefinition({
      ...source,
      id: assemblyIdentity("media-placement-fixture"),
      kind: "media",
      fragment: {
        ...source.fragment,
        instances: [
          {
            ...image,
            parentId: null,
            x: 0,
            y: 0,
            width: source.fragment.artboard.width,
            height: source.fragment.artboard.height,
          },
        ],
        groups: [],
        bindings: source.fragment.bindings.filter(b => b.kind === "media"),
        relations: [],
        assetIds: [],
        intentionalOverlaps: [],
      },
      pieces: { [image.pieceHash]: imagePiece },
      assets: [],
    });
    const offered = [source, media],
      plan = componentAssemblyPlanFixture();
    for (const v of plan.variations)
      v.slides[0].components.push({ id: media.id, hash: media.hash });
    const collision = preflightAssemblyGeneration(
      materializeAssemblyPlan(plan, offered, run),
      { measureText: measure }
    )[0].slides[0];
    expect(
      collision.issues.some(s => s.startsWith("collision:text_media:"))
    ).toBe(true);
    for (const v of plan.variations) {
      v.slides[0].components[0].placement = {
        x: 0,
        y: 0,
        width: 0.45,
        height: 1,
      };
      v.slides[0].components[1].layoutRelation = {
        kind: "beside",
        relativeTo: source.id,
        gap: 0.04,
      };
    }
    const arranged = preflightAssemblyGeneration(
      materializeAssemblyPlan(plan, offered, run),
      { measureText: measure }
    )[0].slides[0];
    expect(
      arranged.issues.some(s => s.startsWith("collision:text_media:"))
    ).toBe(false);
    const groups = arranged.composition.groups;
    const contentGroup = groups.find(g => g.id === "c0-root")!,
      mediaGroup = groups.find(g => g.id === "c1-root")!;
    expect(mediaGroup.x).toBeGreaterThan(
      contentGroup.x + contentGroup.width * contentGroup.scale
    );
    expect(arranged.composition.userContentHash).toBe(
      arsenalHash(plan.variations[0].slides[0].content)
    );
    for (const v of plan.variations) {
      v.slides[0].components[0].placement = undefined;
      v.slides[0].components[1].layoutRelation = {
        kind: "overlay",
        relativeTo: source.id,
      };
    }
    expect(
      preflightAssemblyGeneration(materializeAssemblyPlan(plan, offered, run), {
        measureText: measure,
      })[0].slides[0].issues.some(s => s.startsWith("collision:text_media:"))
    ).toBe(false);
    plan.variations[0].slides[0].components[0].layoutRelation = {
      kind: "below",
      relativeTo: media.id,
    };
    expect(
      validateAssemblyPlan(plan, offered).some(s =>
        s.startsWith("component_relation_cycle:")
      )
    ).toBe(true);
  });
  it("permits only bounded adjacent line boxes and still rejects wrapped or expanded copy", () => {
    const source = componentAssemblyFixture()[0],
      first = source.fragment.instances.find(i => i.id === "titulo-principal")!,
      original = source.pieces[first.pieceHash];
    const pieces = Object.fromEntries(
      [0, 1].map(index => {
        const p = {
          ...original,
          fontSize: 40,
          contentFragment: {
            index,
            count: 2,
            unit: "words" as const,
            weights: [1, 1],
          },
        };
        return [arsenalHash(p), p];
      })
    );
    const hashes = Object.keys(pieces);
    const component = createComponentDefinition({
      ...source,
      fragment: {
        ...source.fragment,
        groups: [],
        instances: [0, 1].map(index => ({
          ...first,
          id: `line-${index}`,
          pieceHash: hashes[index],
          parentId: null,
          x: 72,
          y: 72 + index * 40,
          width: 700,
          height: 48,
          rotation: 0,
          zIndex: index,
        })),
        bindings: [0, 1].map(index => ({
          id: `bind-${index}`,
          label: "linha",
          kind: "text" as const,
          source: "headline",
          required: true,
          targetIds: [`line-${index}`],
          cardinality: null,
          prefix: "",
          gap: 0,
        })),
        relations: [],
        mediaSlots: [],
        assetIds: original.fontAssetId ? [original.fontAssetId] : [],
        intentionalOverlaps: [],
        lineBoxOverlaps: [
          {
            a: "line-0",
            b: "line-1",
            maxOverlapFraction: 0.25,
            singleLineOnly: true,
          },
        ],
      },
      pieces,
      assets: source.assets.filter(a => a.id === original.fontAssetId),
    });
    const plan = componentAssemblyPlanFixture();
    for (const v of plan.variations) {
      v.slides[0].components = [{ id: component.id, hash: component.hash }];
      v.slides[0].mediaPrompts = [];
      v.slides[0].content = {
        schemaVersion: 3,
        blocks: [
          { id: "title", type: "text", role: "headline", text: "Alpha Beta" },
        ],
        caption: "",
        hashtags: [],
      };
    }
    const output = materializeAssemblyPlan(plan, [component], run);
    expect(
      preflightAssemblyGeneration(output, {
        measureText: measure,
      })[0].slides[0].issues.some(s => s.startsWith("collision:"))
    ).toBe(false);
    const wrapped: ArsenalTextMeasurer = input => ({
      ...measure(input),
      lines: [{ width: 300 }, { width: 300 }],
    });
    const short = structuredClone(plan);
    for (const v of short.variations) v.slides[0].content.blocks[0] = {id:"title",type:"text",role:"headline",text:"Alpha"};
    const shortResult = preflightAssemblyGeneration(materializeAssemblyPlan(short, [component], run), {measureText:measure})[0].slides[0];
    expect(shortResult.issues.filter(s => s.startsWith("content_coverage:"))).toEqual([]);
    expect(shortResult.composition.elements.filter(e => e.kind === "text").map(e => e.text).join("")).toBe("Alpha");
    expect(
      preflightAssemblyGeneration(output, {
        measureText: wrapped,
      })[0].slides[0].issues.some(s => s.startsWith("collision:"))
    ).toBe(true);
    const expanded: ArsenalTextMeasurer = input => ({
      ...measure(input),
      height: input.fontSize * 2,
    });
    // A relation-free source keeps its declared box; unsafe boxes must be rejected even with a single-line permission.
    const unsafe = createComponentDefinition({
      ...component,
      fragment: {
        ...component.fragment,
        instances: component.fragment.instances.map(i => ({
          ...i,
          height: 90,
        })),
      },
    });
    for (const v of plan.variations)
      v.slides[0].components = [{ id: unsafe.id, hash: unsafe.hash }];
    expect(
      preflightAssemblyGeneration(
        materializeAssemblyPlan(plan, [unsafe], run),
        { measureText: expanded }
      )[0].slides[0].issues.some(s => s.startsWith("collision:"))
    ).toBe(true);
  });
  it("audits opaque polygon surfaces across groups and requires sufficient contrasting outline width", () => {
    const source = componentAssemblyFixture()[0],
      instance = source.fragment.instances.find(
        i => i.id === "titulo-principal"
      )!,
      text = {
        ...source.pieces[instance.pieceHash],
        fontSize: 80,
        fill: "#111111",
        stroke: null,
        strokeWidth: 0,
      };
    const polygon = {
      ...text,
      kind: "polygon" as const,
      fill: "#FFFFFF",
      fontAssetId: null,
      points: [0, 0, 1080, 0, 1080, 1296, 0, 1296],
    };
    const textHash = arsenalHash(text),
      polygonHash = arsenalHash(polygon);
    const component = createComponentDefinition({
      ...source,
      colorRoles: { title: "preserve", paper: "preserve" },
      fragment: {
        ...source.fragment,
        artboard: { width: 1080, height: 1296, background: "#111111" },
        groups: [
          {
            id: "paper-group",
            label: "paper",
            parentId: null,
            zIndex: 0,
            x: 0,
            y: 0,
            width: 1080,
            height: 1296,
            rotation: 0,
            opacity: 1,
            scale: 1,
          },
          {
            id: "copy-group",
            label: "copy",
            parentId: null,
            zIndex: 1,
            x: 0,
            y: 0,
            width: 1080,
            height: 1296,
            rotation: 0,
            opacity: 1,
            scale: 1,
          },
        ],
        instances: [
          {
            ...instance,
            id: "paper",
            pieceHash: polygonHash,
            parentId: "paper-group",
            zIndex: 0,
            x: 0,
            y: 0,
            width: 1080,
            height: 1296,
            rotation: 0,
          },
          {
            ...instance,
            id: "title",
            pieceHash: textHash,
            parentId: "copy-group",
            zIndex: 0,
            x: 72,
            y: 72,
            width: 900,
            height: 100,
            rotation: 0,
          },
        ],
        bindings: [
          {
            id: "title",
            label: "Título",
            kind: "text",
            source: "headline",
            required: true,
            targetIds: ["title"],
            cardinality: null,
            prefix: "",
            gap: 0,
          },
        ],
        relations: [],
        mediaSlots: [],
        assetIds: text.fontAssetId ? [text.fontAssetId] : [],
        intentionalOverlaps: [],
      },
      pieces: { [textHash]: text, [polygonHash]: polygon },
      assets: source.assets.filter(a => a.id === text.fontAssetId),
    });
    const plan = componentAssemblyPlanFixture();
    for (const v of plan.variations) {
      v.direction.palette.background = "#111111";
      v.slides[0].components = [{ id: component.id, hash: component.hash }];
      v.slides[0].mediaPrompts = [];
      v.slides[0].content = {
        schemaVersion: 3,
        blocks: [
          {
            id: "title",
            type: "text",
            role: "headline",
            text: "Black ink on white paper",
          },
        ],
        caption: "",
        hashtags: [],
      };
    }
    const issues = preflightAssemblyGeneration(
      materializeAssemblyPlan(plan, [component], run),
      { measureText: measure }
    )[0].slides[0].issues;
    expect(issues.some(s => s.startsWith("contrast:"))).toBe(false);
    const pendingPiece = { ...polygon, kind: "media" as const },
      pendingHash = arsenalHash(pendingPiece),
      pendingComponent = createComponentDefinition({
        ...component,
        pieces: { [textHash]: text, [pendingHash]: pendingPiece },
        fragment: {
          ...component.fragment,
          instances: component.fragment.instances.map(i =>
            i.id === "paper" ? { ...i, pieceHash: pendingHash } : i
          ),
          mediaSlots: [
            {
              id: "paper",
              label: "Foto",
              function: "Fundo editorial",
              prompt: "Foto editorial",
              deferred: true,
              policy: "cover",
            },
          ],
        },
      });
    for (const v of plan.variations)
      v.slides[0].components = [
        { id: pendingComponent.id, hash: pendingComponent.hash },
      ];
    const pending = materializeAssemblyPlan(plan, [pendingComponent], run),
      empty = preflightAssemblyGeneration(pending, { measureText: measure })[0]
        .slides[0];
    expect(empty.issues.some(s => s.startsWith("contrast:unknown:"))).toBe(
      false
    );
    const present = compositionFromAssemblyBundle(
        pending.variations[0].slides[0].bundle
      ),
      mediaId = present.base.mediaSlots![0].id;
    present.media[mediaId] = {
      kind: "user",
      url: "https://example.com/real-photo.jpg",
      focalX: 0.5,
      focalY: 0.5,
    };
    expect(
      resolveArsenalGeometry(present, { measureText: measure }).issues.some(s =>
        s.startsWith("contrast:unknown:")
      )
    ).toBe(true);
    const outlined = {
        ...text,
        fill: "#FFFFFF",
        stroke: "#111111",
        strokeWidth: 4,
      },
      outlineHash = arsenalHash(outlined);
    const outlineComponent = createComponentDefinition({
      ...component,
      pieces: { [outlineHash]: outlined, [polygonHash]: polygon },
      fragment: {
        ...component.fragment,
        instances: component.fragment.instances.map(i =>
          i.id === "title" ? { ...i, pieceHash: outlineHash } : i
        ),
      },
    });
    for (const v of plan.variations)
      v.slides[0].components = [
        { id: outlineComponent.id, hash: outlineComponent.hash },
      ];
    expect(
      preflightAssemblyGeneration(
        materializeAssemblyPlan(plan, [outlineComponent], run),
        { measureText: measure }
      )[0].slides[0].issues.some(s => s.startsWith("contrast:"))
    ).toBe(false);
    const thin = { ...outlined, strokeWidth: 0.5 },
      thinHash = arsenalHash(thin),
      thinComponent = createComponentDefinition({
        ...outlineComponent,
        pieces: { [thinHash]: thin, [polygonHash]: polygon },
        fragment: {
          ...outlineComponent.fragment,
          instances: outlineComponent.fragment.instances.map(i =>
            i.id === "title" ? { ...i, pieceHash: thinHash } : i
          ),
        },
      });
    for (const v of plan.variations)
      v.slides[0].components = [
        { id: thinComponent.id, hash: thinComponent.hash },
      ];
    expect(
      preflightAssemblyGeneration(
        materializeAssemblyPlan(plan, [thinComponent], run),
        { measureText: measure }
      )[0].slides[0].issues.some(s => s.startsWith("contrast:low:"))
    ).toBe(true);
  });
  it("preserves selected pending media and prompts in explicit editorial fallback", () => {
    const plan = componentAssemblyPlanFixture(),
      components = componentAssemblyFixture(),
      bundle = materializeAssemblyPlan(plan, components, run);
    for (const [slot, variation] of bundle.variations.entries())
      variation.slides[0].bundle = materializeEditorialAssemblySlide(
        plan,
        slot,
        0,
        components,
        run,
        ["collision:text_media:source"]
      );
    const fallback = bundle.variations[0].slides[0].bundle;
    expect(fallback.content).toEqual(plan.variations[0].slides[0].content);
    expect(fallback.candidates[0].variant.mediaSlots?.[0].prompt).toBe(
      plan.variations[0].slides[0].mediaPrompts[0].prompt
    );
    const resolved = preflightAssemblyGeneration(bundle, {
      measureText: measure,
    })[0].slides[0];
    expect(resolved.pendingMedia).toHaveLength(1);
    expect(
      resolved.issues.some(s => s.startsWith("collision:text_media:"))
    ).toBe(false);
    expect(
      resolved.composition.elements
        .filter(e => e.kind === "text")
        .every(e => e.fontSize >= 36)
    ).toBe(true);
  });
  it("overrides preserved source colors only when an explicit brand palette is supplied", () => {
    const source = componentAssemblyFixture()[0],
      preserved = createComponentDefinition({
        ...source,
        colorRoles: Object.fromEntries(
          source.fragment.instances.map(i => [i.id, "preserve" as const])
        ),
      }),
      plan = componentAssemblyPlanFixture();
    for (const v of plan.variations) {
      v.slides[0].components = [{ id: preserved.id, hash: preserved.hash }];
      v.slides[0].mediaPrompts = v.slides[0].mediaPrompts.map(p => ({
        ...p,
        componentId: preserved.id,
      }));
    }
    const native = materializeAssemblyPlan(plan, [preserved], run).variations[0]
      .slides[0].bundle;
    for (const i of preserved.fragment.instances) {
      const p = preserved.pieces[i.pieceHash];
      expect(
        Object.values(native.pieces).some(
          n => n.fill === p.fill && n.stroke === p.stroke && n.kind === p.kind
        )
      ).toBe(true);
    }
    const palette = {
      background: "#FAFAFA",
      text: "#101010",
      accent: "#5E28AB",
    };
    const branded = materializeAssemblyPlan(plan, [preserved], {
      ...run,
      brandPalette: palette,
    }).variations[0].slides[0].bundle;
    expect(
      Object.values(branded.pieces).every(p =>
        Object.values(palette).includes(p.fill)
      )
    ).toBe(true);
    expect(
      Object.values(branded.pieces)
        .filter(p => p.kind === "text")
        .every(p => p.fill === palette.text)
    ).toBe(true);
    expect(
      branded.candidates[0].variant.instances.map(i => [
        i.x,
        i.y,
        i.width,
        i.height,
        i.rotation,
      ])
    ).toEqual(
      native.candidates[0].variant.instances.map(i => [
        i.x,
        i.y,
        i.width,
        i.height,
        i.rotation,
      ])
    );
    expect(branded.userContentHash).toBe(native.userContentHash);
  });
  it("keeps old definition hashes stable without injecting new optional defaults", () => {
    const c = componentAssemblyFixture()[0],
      piece = Object.values(c.pieces)[0];
    expect(arsenalPieceSchema.parse(piece)).toEqual(piece);
    const { mediaSlots, ...old } = c.fragment;
    expect(arsenalVariantSchema.parse(old)).toEqual(old);
    expect(arsenalHash(arsenalVariantSchema.parse(old))).toBe(arsenalHash(old));
  });
});
