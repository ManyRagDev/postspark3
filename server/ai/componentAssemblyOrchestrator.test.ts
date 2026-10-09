import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import cafeReferences from "./fixtures/componentAssemblyCafe.json";
import { createComponentTextMeasurer } from "./componentTextMeasurer";
import { componentAssemblyFixture } from "../../shared/componentAssembly.fixture";
import {
  createComponentDefinition,
  compactComponentCard,
  componentDefinitionV1Schema,
  compositionFromAssemblyBundle,
  type AssemblyPlanV1,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import type { ArsenalTextMeasurer } from "../../shared/arsenalGeometry";
import {
  arsenalWorldGeometry,
  resolveArsenalGeometry,
} from "../../shared/arsenalGeometry";
import {
  generateComponentAssemblyPostVariations,
  type ComponentAssemblyOrchestratorInput,
  type ComponentAssemblyOrchestratorDeps,
} from "./componentAssemblyOrchestrator";
import { prepareGenerationPlan } from "./generationPipeline";
import type { InvokeParams, InvokeResult } from "../_core/llm";
import { StructuredOutputError } from "../_core/llm";
import { validateStructuredContent } from "./providers/modelAdapters";
function fixture() {
  const reference = componentAssemblyFixture()[0],
    instance = reference.fragment.instances.find(
      i => i.id === "titulo-principal"
    )!,
    piece = reference.pieces[instance.pieceHash];
  return createComponentDefinition({
    ...reference,
    fragment: {
      ...reference.fragment,
      instances: [
        {
          ...instance,
          parentId: null,
          x: 72,
          y: 72,
          width: 900,
          height: 250,
          rotation: 0,
        },
      ],
      groups: [],
      bindings: [
        {
          id: "headline",
          label: "Título",
          kind: "text",
          source: "headline",
          required: true,
          targetIds: [instance.id],
          cardinality: null,
          prefix: "",
          gap: 0,
        },
      ],
      relations: [
        {
          id: "fit-title",
          version: 1,
          enabled: true,
          kind: "textFit",
          inputs: [],
          outputs: [
            {
              targetId: instance.id,
              properties: ["x", "width", "height", "fontSize"],
            },
          ],
          parameters: {
            anchor: "left",
            maxWidth: 900,
            maxHeight: 700,
            minFontSize: 30,
          },
        },
      ],
      assetIds: piece.fontAssetId ? [piece.fontAssetId] : [],
      intentionalOverlaps: [],
      mediaSlots: [],
    },
    pieces: { [instance.pieceHash]: piece },
    assets: reference.assets.filter(a => a.id === piece.fontAssetId),
  });
}
function syncRhythm(variation: AssemblyPlanV1["variations"][number]) {
  variation.direction.intent!.rhythm = variation.slides.map((slide, index) => ({
    slideId: slide.id,
    density: slide.density,
    emphasis: (slide.role === "cover"
      ? "hero"
      : slide.role === "closing"
        ? "closing"
        : index % 2 === 0 ? "highlight" : "reading") as "hero" | "closing" | "highlight" | "reading",
  }));
}
function plan(slides = 1): AssemblyPlanV1 {
  const component = fixture();
  return {
    schemaVersion: 1,
    postMode: slides === 1 ? "static" : "carousel",
    aspectRatio: "4:5",
    variations: [0, 1, 2].map(slot => {
      const variationSlides = Array.from({ length: slides }, (_, index) => ({
        id: `s${index}`,
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
              id: "title",
              type: "text",
              role: "headline",
              text: `Mensagem ${slot} no slide ${index}`,
            },
          ],
          caption: "",
          hashtags: [],
        },
        components: [{ id: component.id, hash: component.hash }],
        mediaPrompts: [],
      }));
      return {
        id: `v${slot}`,
        direction: {
          label: `Direção ${slot}`,
          palette: { background: "#FFFFFF", text: "#111111", accent: ["#B54822", "#1D6B5A", "#3658A5"][slot]! },
          typographyComponentId: null,
          intent: {
            language: "graphic" as const,
            hierarchy: "headline" as const,
            mediaRole: "none" as const,
            recurringComponentIds: [],
            rhythm: variationSlides.map((slide, index) => ({
              slideId: slide.id,
              density: slide.density,
              emphasis: slide.role === "cover" ? "hero" as const : slide.role === "closing" ? "closing" as const : index % 2 === 0 ? "highlight" as const : "reading" as const,
            })),
          },
        },
        caption: `Explicação específica ${slot}`,
        hashtags: [],
        slides: variationSlides,
      };
    }),
  };
}
function providerTransport(
  proposal: AssemblyPlanV1,
  definitions: ComponentDefinitionV1[] = [fixture()]
) {
  return {
    ...proposal,
    variations: proposal.variations.map(variation => ({
      ...variation,
      slides: variation.slides.map(slide => {
        const refs = (kind: ComponentDefinitionV1["kind"]) =>
          slide.components
            .filter(
              ref => definitions.find(c => c.id === ref.id)?.kind === kind
            )
            .map(({ hash: _hash, ...ref }) => ref);
        const { density, ...fields } = slide;
        return {
          ...fields,
          components: {
            content: { ...refs("content")[0], density },
            background: refs("background")[0] ?? null,
            media: refs("media"),
            ornament: refs("ornament"),
            typography: refs("typography").map(ref => ({ id: ref.id })),
          },
        };
      }),
    })),
  };
}
const measure: ArsenalTextMeasurer = input => ({
  height: input.text ? input.fontSize * 1.2 : 0,
  lines: [{ width: input.text.length * input.fontSize * 0.3 }],
  runs: [
    { fill: input.fill, fontSize: input.fontSize, fontStyle: input.fontStyle },
  ],
});
const run = "a20b3bc0-2c41-4080-8b29-fb257b61b7a0";
async function harness(responses: unknown[], slides = 1, completeDesignsOnly = false) {
  const requests: InvokeParams[] = [],
    events: unknown[] = [],
    definitions = [completeDesignsOnly ? createComponentDefinition({...fixture(),completeDesign:{family:"whole-test"}}) : fixture()];
  const input: ComponentAssemblyOrchestratorInput = {
    completeDesignsOnly,
    offered: definitions.map(compactComponentCard),
    resolve: vi.fn(async () => definitions),
    slideCount: slides,
    aspectRatio: "4:5",
    experimental: true,
    userUuid: "actor",
    request: {
      inputType: "text",
      content: "Ensine a compor conteúdo editorial",
      platform: "instagram",
      postMode: slides === 1 ? "static" : "carousel",
      creationMode: "ideation",
    },
    siteIntelligence: null,
    executionBrief: null,
    plan: await prepareGenerationPlan({
      sourceContent: "Ensine a compor conteúdo editorial",
    }),
    deadlineMs: null,
  };
  const deps: ComponentAssemblyOrchestratorDeps = {
    measureText: measure,
    clock: () => 1000,
    trace: {
      id: run,
      recordEvent: event => {
        events.push(event);
      },
    },
    generate: async params => {
      requests.push(params);
      const raw =
        responses[Math.min(requests.length - 1, responses.length - 1)];
      return {
        choices: [{ message: { content: JSON.stringify(raw) } }],
      } as InvokeResult;
    },
    loadRecentPosts: async () => [],
    assessOriginality: async () => ({
      assessments: [0, 1, 2].map(() => ({
        score: 100,
        maxCandidateSimilarity: 0,
        maxSiteSimilarity: 0,
        maxHistorySimilarity: 0,
        closestSource: "none" as const,
        fallbackUsed: false,
      })),
      embeddings: [],
      fallbackUsed: false,
    }),
  };
  return { input, deps, requests, events };
}
describe("component assembly generation orchestration", () => {
  it("keeps explicit caption-only support and invitation out of required on-art roles", async () => {
    const proposal = plan(),
      h = await harness([proposal]);
    h.input.request.content =
      "Título curto. Inclua uma frase de apoio e convite somente na legenda.";
    for (const variation of proposal.variations)
      variation.caption = "Uma pausa especial. Venha conhecer o café.";
    expect(
      (await generateComponentAssemblyPostVariations(h.input, h.deps)).status
    ).toBe("approved");
    expect(h.requests).toHaveLength(1);
  });
  it.each([1, 2, 5, 10])(
    "recomposes real references across %i slides without mutating frozen pins or using editorial fallback",
    async count => {
      const definitions = cafeReferences.map(c =>
          componentDefinitionV1Schema.parse(c)
        ),
        paper = definitions.find(c => c.kind === "content")!,
        photo = definitions.find(c => c.kind === "media")!,
        proposal = plan(count);
      for (const [slot, variation] of proposal.variations.entries()) {
        variation.direction.intent!.language = "editorial";
        variation.direction.intent!.mediaRole = slot < 2 ? "support" : "none";
        for (const [index, slide] of variation.slides.entries()) {
          slide.density = "balanced";
          slide.components = [{ id: paper.id, hash: paper.hash }];
          slide.content.blocks = [
            {
              id: "headline",
              type: "text",
              role: "headline",
              text: `Café artesanal ${slot + 1}.${index + 1}`,
            },
            {
              id: "body",
              type: "text",
              role: "body",
              text: "Cada grão selecionado com cuidado, preparado para transformar sua pausa.",
            },
            {
              id: "cta",
              type: "text",
              role: "callToAction",
              text: "Venha tomar um café com a gente.",
            },
          ];
          if (slot < 2) {
            slide.components.push({ id: photo.id, hash: photo.hash });
            slide.mediaPrompts = [
              {
                componentId: photo.id,
                slotId: "photo",
                prompt: `Fotografia de café artesanal ${slot + 1} na mesa de madeira.`,
              },
            ];
          }
        }
        syncRhythm(variation);
      }
      const before = structuredClone(proposal),
        h = await harness([proposal], count);
      h.input.request.content =
        "Crie três direções visuais distintas para divulgar café artesanal. Título curto, uma frase de apoio e convite para conhecer o café. Prefira duas propostas com espaço para fotografia e uma tipográfica sem foto.";
      h.input.offered = definitions.map(compactComponentCard);
      h.input.resolve = async ids =>
        definitions.filter(c => ids.includes(c.id));
      h.deps.measureText = undefined;
      h.deps.createTextMeasurer = assets =>
        createComponentTextMeasurer(assets, asset =>
          readFile(`client/public/arsenal/fonts/${asset.sha256}.woff2`)
        );
      const result = await generateComponentAssemblyPostVariations(
        h.input,
        h.deps
      );
      expect(result.status, result.status === "rejected" ? JSON.stringify(result.issues) : undefined).toBe("approved");
      expect(h.requests).toHaveLength(2);
      expect(proposal).toEqual(before);
      if (result.status !== "approved") return;
      for (const [slot, snapshot] of result.snapshots.entries()) {
        const assembly = snapshot.componentAssemblyV1!;
        expect(assembly.planHash).toBe(arsenalHash(before));
        for (const [index, resolvedSlide] of assembly.slides.entries()) {
          const bundle = resolvedSlide.bundle,
            candidate = bundle.candidates[0],
            measure = await h.deps.createTextMeasurer!(bundle.assets),
            composition = resolveArsenalGeometry(
              compositionFromAssemblyBundle(bundle),
              { measureText: measure, allowReduction: true }
            );
          expect(composition.issues).toEqual([]);
          expect(candidate.componentAssembly?.planHash).toBe(assembly.planHash);
          expect(bundle.runId).toBe(assembly.runId);
          expect(bundle.traceId).toBe(assembly.traceId);
          expect(bundle.slot).toBe(assembly.slot);
          expect(bundle.userContentHash).toBe(
            arsenalHash(before.variations[slot].slides[index].content)
          );
          expect(candidate.componentAssembly?.componentIds).toContain(paper.id);
          expect(candidate.componentAssembly?.resolution?.kind).not.toBe(
            "editorial-fallback"
          );
          if (slot < 2) {
            expect(candidate.componentAssembly?.resolution?.kind).toBe(
              "layout-adaptation"
            );
            expect(resolvedSlide.density).toBe("balanced");
            expect(candidate.componentAssembly?.componentIds).toEqual(
              before.variations[slot].slides[index].components.map(c => c.id)
            );
            expect(candidate.componentAssembly?.componentHashes).toContain(paper.hash);
            expect(candidate.componentAssembly?.resolution?.requestedComponentIds).toEqual(
              before.variations[slot].slides[index].components.map(c => c.id)
            );
            expect(candidate.componentAssembly?.resolution?.reasons).toContain(
              "media_region_repositioned_below_measured_content"
            );
            expect(candidate.variant.mediaSlots?.[0].prompt).toBe(
              before.variations[slot].slides[index].mediaPrompts[0].prompt
            );
            const media = composition.elements.find(e => e.kind === "media")!,
              mw = arsenalWorldGeometry(media, composition.groups);
            const bottom = Math.max(
              ...composition.elements
                .filter(e => e.kind === "text" && e.text)
                .map(e => {
                  const w = arsenalWorldGeometry(e, composition.groups);
                  return w.y + e.height * w.scale;
                })
            );
            expect(mw.y).toBeGreaterThan(bottom);
            expect(media.width * mw.scale).toBeGreaterThan(500);
          }
        }
      }
    }
  );
  it("approves one main call after shared preflight and hydrates only selected components", async () => {
    const h = await harness([plan()]);
    const output = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(output.status).toBe("approved");
    expect(h.requests).toHaveLength(1);
    expect(h.input.resolve).toHaveBeenCalledWith([fixture().id]);
    if (output.status === "approved") {
      expect(output.metrics.generativeCalls).toBe(1);
      expect(output.metrics.repairCalls).toBe(0);
      expect(
        output.snapshots.every(v => v.componentAssemblyV1?.slides.length === 1)
      ).toBe(true);
      expect(
        output.snapshots[0].componentAssemblyV1?.slides[0].bundle
          .userContentHash
      ).toBe(arsenalHash(plan().variations[0].slides[0].content));
    }
  });
  it("rejects new generations without art direction intent after one repair", async () => {
    const withoutIntent = plan();
    for (const variation of withoutIntent.variations)
      delete (variation.direction as typeof variation.direction & { intent?: unknown }).intent;
    const h = await harness([withoutIntent, withoutIntent]);
    const output = await generateComponentAssemblyPostVariations(h.input, h.deps);
    expect(output.status).toBe("rejected");
    expect(h.requests).toHaveLength(2);
    expect(h.input.resolve).not.toHaveBeenCalled();
  });
  it("derives rhythm density from selected content without repairing incorrect slide IDs", async () => {
    const raw = plan(2);
    for (const v of raw.variations) for (const r of v.direction.intent!.rhythm) r.density = "balanced";
    const h = await harness([raw], 2);
    const output = await generateComponentAssemblyPostVariations(h.input, h.deps);
    expect(output.status).toBe("approved");
    expect(h.requests).toHaveLength(1);
    if (output.status === "approved") for (const v of output.snapshots) {
      const bundle = v.componentAssemblyV1!;
      expect(bundle.direction.intent!.rhythm.map(r => r.density)).toEqual(bundle.slides.map(s => s.density));
    }
    raw.variations[0].direction.intent!.rhythm.reverse();
    const invalid = await harness([raw, raw], 2);
    expect((await generateComponentAssemblyPostVariations(invalid.input, invalid.deps)).status).toBe("rejected");
    expect(invalid.input.resolve).not.toHaveBeenCalled();
  });
  it("keeps selected typography and its direction donor pinned through grouped provider transport", async () => {
    const content = fixture(),
      typography = createComponentDefinition({
        ...content,
        id: "43d6e2b0-0a71-449e-8c78-287cf4dc9c67",
        kind: "typography",
        densities: ["balanced", "expressive"],
      }),
      proposal = plan(2),
      definitions = [content, typography];
    for (const variation of proposal.variations) {
      variation.direction.typographyComponentId = typography.id;
      for (const slide of variation.slides)
        slide.components.push({ id: typography.id, hash: typography.hash });
    }
    const h = await harness([providerTransport(proposal, definitions)], 2);
    h.input.offered = definitions.map(compactComponentCard);
    h.input.resolve = async ids => definitions.filter(c => ids.includes(c.id));
    const output = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(output.status).toBe("approved");
    expect(h.requests).toHaveLength(1);
    if (output.status === "approved")
      for (const snapshot of output.snapshots)
        for (const slide of snapshot.componentAssemblyV1!.slides) {
          expect(
            slide.bundle.candidates[0].componentAssembly?.componentIds
          ).toContain(typography.id);
          expect(
            slide.bundle.candidates[0].componentAssembly?.componentHashes
          ).toContain(typography.hash);
        }
    const schema = (h.requests[0].response_format as any).json_schema.schema,
      fontRef =
        schema.properties.variations.items.properties.slides.items.properties
          .components.properties.typography.items;
    expect(Object.keys(fontRef.properties)).toEqual(["id"]);
  });
  it("uses a compact density schema but validates capabilities and resolves authoritative hashes", async () => {
    const base = fixture(),
      balanced = createComponentDefinition({
        ...base,
        id: "df63c6ba-9a3f-4a12-8a31-e4e3b93c30f7",
        densities: ["balanced"],
      }),
      quiet = createComponentDefinition({
        ...base,
        id: "9210d5de-8f35-467f-9bd3-16b8f3b9d812",
        densities: ["quiet"],
      }),
      definitions = [base, balanced, quiet],
      h = await harness([providerTransport(plan(), definitions)]);
    h.input.offered = definitions.map(compactComponentCard);
    h.input.resolve = async ids => definitions.filter(c => ids.includes(c.id));
    const result = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(result.status).toBe("approved");
    const schema = (h.requests[0].response_format as any).json_schema.schema,
      reference =
        schema.properties.variations.items.properties.slides.items.properties
          .components.properties.content;
    expect(reference.anyOf).toBeUndefined();
    expect(reference.properties.id.enum).toEqual(definitions.map(d=>d.id));
    expect(reference.properties.density.enum).toEqual(["quiet","balanced","expressive"]);
    expect(reference.properties.hash).toBeUndefined();
    expect(
      (h.events as any[]).some(
        event =>
          event.stage === "assembly.authoritative_hashes" &&
          event.data.components.some(
            (c: any) => c.id === base.id && c.hash === base.hash
          )
      )
    ).toBe(true);
    const incompatible = providerTransport(plan(),definitions);
    for (const variation of incompatible.variations) {
      variation.slides[0].components.content!.id = balanced.id;
      variation.slides[0].components.content!.density = "expressive";
    }
    const bad = await harness([incompatible,incompatible]);
    bad.input.offered = definitions.map(compactComponentCard);
    expect((await generateComponentAssemblyPostVariations(bad.input,bad.deps)).status).toBe("rejected");
  });
  it("passes the absolute budget and avoids repeating provider failures as repairs", async () => {
    const h=await harness([]);
    h.input.deadlineMs=150000;
    h.deps.generate=vi.fn(async()=>{throw new Error("provider unavailable");});
    const result=await generateComponentAssemblyPostVariations(h.input,h.deps);
    expect(result.status).toBe("failed");
    expect(h.deps.generate).toHaveBeenCalledTimes(1);
    expect(h.deps.generate).toHaveBeenCalledWith(expect.objectContaining({deadlineMs:150000,maxTransportAttempts:1,forceTextSchema:true,disableStructuredRepair:true}));
  });
  it("owns the single repair after local transport validation rejects malformed output", async () => {
    const h=await harness([providerTransport(plan())]);
    const generate=h.deps.generate;
    h.deps.generate=vi.fn().mockRejectedValueOnce(new StructuredOutputError("invalid_json","invalid JSON response")).mockImplementation(generate);
    const result=await generateComponentAssemblyPostVariations(h.input,h.deps);
    expect(result.status).toBe("approved");
    expect(h.deps.generate).toHaveBeenCalledTimes(2);
    expect(result.metrics.repairCalls).toBe(1);
  });
  it("reports exhausted structured responses as parse failures and preserves their cause", async () => {
    for (const wrapped of [false, true]) {
      const h = await harness([]);
      const cause = new StructuredOutputError("schema_mismatch", "Structured output schema_mismatch; skipping repair");
      h.deps.generate = vi.fn(async () => { throw wrapped ? new Error("public wrapper", { cause }) : cause; });
      const result = await generateComponentAssemblyPostVariations(h.input, h.deps);
      expect(result).toMatchObject({ status: "failed", error: { kind: "parse", message: cause.message } });
      expect(h.deps.generate).toHaveBeenCalledTimes(2);
    }
  });
  it("accepts uppercase hex in the serialized provider schema as well as the canonical schema", async () => {
    const h = await harness([providerTransport(plan())]);
    await generateComponentAssemblyPostVariations(h.input, h.deps);
    const schema = (h.requests[0].response_format as any).json_schema.schema;
    const palette = schema.properties.variations.items.properties.direction.properties.palette;
    expect(validateStructuredContent(JSON.stringify({ background: "#FFFFFF", text: "#ABCDEF", accent: "#aBcDeF" }), { name: "palette", schema: palette }).valid).toBe(true);
    expect(validateStructuredContent(JSON.stringify({ background: "#FFF", text: "#ABCDEF", accent: "#aBcDeF" }), { name: "palette", schema: palette }).valid).toBe(false);
  });
  it("sends recursive provider-strict schemas and normalizes nullable optional layout choices", async () => {
    const transport = plan() as unknown as {
      variations: Array<{
        slides: Array<{ components: Array<Record<string, unknown>> }>;
      }>;
    };
    for (const v of transport.variations)
      for (const s of v.slides)
        for (const ref of s.components) {
          ref.placement = null;
          ref.layoutRelation = null;
        }
    transport.variations[1].slides[0].components[0].layoutRelation = {
      kind: "native",
      relativeTo: null,
      gap: null,
    };
    transport.variations[2].slides[0].components[0].placement = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };
    const grouped = providerTransport(transport as unknown as AssemblyPlanV1);
    const h = await harness([grouped]);
    expect(
      (await generateComponentAssemblyPostVariations(h.input, h.deps)).status
    ).toBe("approved");
    const format = h.requests[0].response_format as {
      json_schema: { schema: unknown };
    };
    const inspect = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        v.forEach(inspect);
        return;
      }
      const node = v as Record<string, unknown>;
      if (node.properties) {
        expect(new Set(node.required as string[])).toEqual(
          new Set(Object.keys(node.properties as object))
        );
        expect(node.additionalProperties).toBe(false);
      }
      Object.values(node).forEach(inspect);
    };
    inspect(format.json_schema.schema);
    const inspectPayload = (schema: unknown, value: unknown): void => {
      const node = schema as Record<string, unknown>;
      if (Array.isArray(node.anyOf)) {
        const branch = node.anyOf.find(raw => {
          const b = raw as {
            type?: string;
            properties?: Record<string, { const?: unknown }>;
          };
          if (value === null) return b.type === "null";
          if (b.type === "null") return false;
          if (b.properties?.type?.const && value && typeof value === "object")
            return (
              b.properties.type.const === (value as { type?: unknown }).type
            );
          return true;
        });
        expect(branch).toBeDefined();
        inspectPayload(branch, value);
        return;
      }
      if (node.properties && value && typeof value === "object") {
        const payload = value as Record<string, unknown>;
        for (const [key, property] of Object.entries(
          node.properties as object
        )) {
          expect(
            Object.prototype.hasOwnProperty.call(payload, key),
            `provider-required property ${key}`
          ).toBe(true);
          inspectPayload(property, payload[key]);
        }
      }
      if (Array.isArray(value) && node.items)
        value.forEach(v => inspectPayload(node.items, v));
    };
    inspectPayload(format.json_schema.schema, grouped);
    const root = format.json_schema.schema as any;
    const components =
      root.properties.variations.items.properties.slides.items.properties
        .components;
    expect(components.type).toBe("object");
    expect(components.properties.content.type).toBe("object");
    expect(components.properties.content.properties.id.enum).toEqual([
      fixture().id,
    ]);
    expect(components.properties.media.maxItems).toBe(0);
  });
  it.each([2, 5, 10])(
    "respects %i slides without generating images",
    async slides => {
      const h = await harness([providerTransport(plan(slides))], slides),
        output = await generateComponentAssemblyPostVariations(h.input, h.deps);
      expect(output.status).toBe("approved");
      expect(h.requests).toHaveLength(1);
      if (output.status === "approved")
        expect(
          output.snapshots.every(
            v =>
              v.slides?.length === slides &&
              v.componentAssemblyV1?.slides.length === slides
          )
        ).toBe(true);
      expect(h.requests[0].taskRoute).toBe("carousel_generation");
    }
  );
  it("repairs an unoffered hash once and refuses repeated invalid plans", async () => {
    const wrong = plan();
    wrong.variations[0].slides[0].components[0].hash = "f".repeat(64);
    const repaired = await harness([wrong, plan()]);
    const approved = await generateComponentAssemblyPostVariations(
      repaired.input,
      repaired.deps
    );
    expect(approved.status).toBe("approved");
    expect(repaired.requests).toHaveLength(2);
    expect(repaired.input.resolve).toHaveBeenCalledTimes(1);
    if (approved.status === "approved")
      expect(approved.metrics.repairCalls).toBe(1);
    const failed = await harness([wrong]);
    const rejected = await generateComponentAssemblyPostVariations(
      failed.input,
      failed.deps
    );
    expect(rejected.status).toBe("rejected");
    expect(failed.requests).toHaveLength(2);
    expect(failed.input.resolve).not.toHaveBeenCalled();
  });
  it("delivers explicit editorial fallback preserving overflow copy after at most one repair", async () => {
    const h = await harness([plan()]);
    h.deps.measureText = input => ({ ...measure(input), height: 5000 });
    const output = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(output.status).toBe("approved");
    expect(h.requests).toHaveLength(2);
    if (output.status === "approved")
      for (const [slot, v] of output.snapshots.entries()) {
        const b = v.componentAssemblyV1!.slides[0].bundle;
        expect(b.userContentHash).toBe(
          arsenalHash(plan().variations[slot].slides[0].content)
        );
        expect(b.candidates[0].componentAssembly?.resolution?.kind).toBe(
          "editorial-fallback"
        );
        expect(
          b.candidates[0].componentAssembly?.resolution?.reasons.some(s =>
            s.includes("overflow")
          )
        ).toBe(true);
        expect(
          Object.values(b.pieces).every(
            p => p.fontAssetId && b.assets.some(a => a.id === p.fontAssetId)
          )
        ).toBe(true);
      }
  });
  it("freezes validated copy when a repair attempts to shorten it to fit", async () => {
    const original = plan(),
      shortened = plan();
    shortened.variations[0].slides[0].content.blocks[0] = {
      id: "title",
      type: "text",
      role: "headline",
      text: "Cortado",
    };
    const h = await harness([original, shortened]);
    h.deps.measureText = input => ({ ...measure(input), height: 5000 });
    const output = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(output.status).toBe("approved");
    if (output.status === "approved")
      expect(
        output.snapshots[0].componentAssemblyV1!.slides[0].bundle.content
      ).toEqual(original.variations[0].slides[0].content);
    expect(JSON.stringify(h.requests[1])).toContain("Copy congelada");
  });
  it("allows three arts preserving only the requested literal and rejects moving a title literal into captions", async () => {
    const exact = plan();
    for (const v of exact.variations)
      v.slides[0].content.blocks[0] = {
        id: "title",
        type: "text",
        role: "headline",
        text: "Café artesanal",
      };
    const h = await harness([exact]);
    h.input.request.content =
      "Use exatamente Café artesanal no título das três artes";
    h.input.briefInterpretation = {
      contentSpans: ["Café artesanal"],
      instructionSpans: ["no título das três artes"],
      verbatimSpans: ["Café artesanal"],
      uncertain: false,
    };
    expect(
      (await generateComponentAssemblyPostVariations(h.input, h.deps)).status
    ).toBe("approved");
    const captions = plan();
    for (const v of captions.variations) v.caption = "Café artesanal";
    const invalid = await harness([captions]);
    invalid.input.request.content = h.input.request.content;
    invalid.input.briefInterpretation = h.input.briefInterpretation;
    const output = await generateComponentAssemblyPostVariations(
      invalid.input,
      invalid.deps
    );
    expect(output.status).toBe("rejected");
    if (output.status === "rejected")
      expect(
        output.issues.some(i => i.detail.includes("verbatim_missing"))
      ).toBe(true);
    const scoped = await harness([captions]);
    scoped.input.request.content =
      "Use Novidade no título; use exatamente Café artesanal na legenda";
    scoped.input.briefInterpretation = h.input.briefInterpretation;
    expect(
      (await generateComponentAssemblyPostVariations(scoped.input, scoped.deps))
        .status
    ).toBe("approved");
  });
  it("honors a supported brand font and traces a unavailable font instead of substituting unverified bytes", async () => {
    const h = await harness([plan()]);
    h.input.executionBrief = {
      slides: [],
      mustKeep: [],
      mustInclude: [],
      forbiddenTerms: [],
      rawInput: h.input.request.content,
      brandInput: { fontHint: fixture().assets[0].sourceFamily },
    } as ComponentAssemblyOrchestratorInput["executionBrief"];
    expect(
      (await generateComponentAssemblyPostVariations(h.input, h.deps)).status
    ).toBe("approved");
    const unavailable = await harness([plan()]);
    unavailable.input.executionBrief = {
      slides: [],
      mustKeep: [],
      mustInclude: [],
      forbiddenTerms: [],
      rawInput: unavailable.input.request.content,
      brandInput: { fontHint: "Fonte proprietária ausente" },
    } as ComponentAssemblyOrchestratorInput["executionBrief"];
    expect(
      (
        await generateComponentAssemblyPostVariations(
          unavailable.input,
          unavailable.deps
        )
      ).status
    ).toBe("approved");
    expect(JSON.stringify(unavailable.events)).toContain(
      "font_not_in_verified_offered_components"
    );
  });
  it("keeps explicitly requested support copy and invitation on the artwork instead of captions", async () => {
    const captions = plan();
    for (const v of captions.variations)
      v.caption = "Uma frase de apoio e um convite";
    const invalid = await harness([captions]);
    invalid.input.request.content =
      "Inclua um título curto, uma frase de apoio e um convite.";
    const rejected = await generateComponentAssemblyPostVariations(
      invalid.input,
      invalid.deps
    );
    expect(rejected.status).toBe("rejected");
    if (rejected.status === "rejected") {
      expect(
        rejected.issues.some(i => i.detail.includes("body_required_on_art"))
      ).toBe(true);
      expect(
        rejected.issues.some(i => i.detail.includes("cta_required_on_art"))
      ).toBe(true);
    }
    const complete = plan();
    for (const v of complete.variations)
      v.slides[0].content.blocks.push(
        {
          id: "support",
          type: "text",
          role: "body",
          text: "Uma frase de apoio",
        },
        {
          id: "invite",
          type: "text",
          role: "callToAction",
          text: "Vamos conversar",
        }
      );
    const repaired = await harness([captions, complete]);
    repaired.input.request.content = invalid.input.request.content;
    const approved = await generateComponentAssemblyPostVariations(
      repaired.input,
      repaired.deps
    );
    expect(approved.status).toBe("approved");
    expect(repaired.requests).toHaveLength(2);
    if (approved.status === "approved")
      expect(
        approved.snapshots.every(v =>
          v.componentAssemblyV1!.slides[0].bundle.content.blocks.some(
            b => b.type === "text" && b.role === "body"
          )
        )
      ).toBe(true);
  });
  it("enforces an explicit two-media one-without mix and preserves selected media when fallback is needed", async () => {
    const original = componentAssemblyFixture()[0],
      media = createComponentDefinition({
        ...original,
        id: "c52d47a1-803c-4c46-a416-7cbf65051e99",
      });
    const h = await harness([plan()]);
    h.input.offered = [
      compactComponentCard(fixture()),
      compactComponentCard(media),
    ];
    h.input.resolve = async () => [fixture(), media];
    h.input.request.content =
      "Prefiro duas propostas com foto e uma sem imagem.";
    const invalid = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(invalid.status).toBe("rejected");
    if (invalid.status === "rejected")
      expect(
        invalid.issues.some(i => i.detail.includes("media_mix_required"))
      ).toBe(true);
    const valid = plan();
    for (const v of valid.variations.slice(0, 2)) {
      v.direction.intent!.mediaRole="support";
      v.slides[0].components = [{ id: media.id, hash: media.hash }];
      v.slides[0].content.blocks.push({
        id: "list",
        type: "list",
        items: [
          { id: "one", text: "Primeiro item" },
          { id: "two", text: "Segundo item" },
        ],
      });
      v.slides[0].mediaPrompts = [
        {
          componentId: media.id,
          slotId: "area-foto",
          prompt: "Retrato editorial de pessoas colaborando",
        },
      ];
    }
    const delivery = await harness([valid]);
    delivery.input.offered = h.input.offered;
    delivery.input.resolve = h.input.resolve;
    delivery.input.request.content = h.input.request.content;
    const result = await generateComponentAssemblyPostVariations(
      delivery.input,
      delivery.deps
    );
    expect(result.status,JSON.stringify(result.status==="rejected"?result.issues:result)).toBe("approved");
    if (result.status === "approved")
      expect(
        result.snapshots.map(v =>
          v.componentAssemblyV1!.slides.some(
            s => s.bundle.candidates[0].variant.mediaSlots?.length
          )
        )
      ).toEqual([true, true, false]);
  });
  it("rejects hydration that does not match the immutable offered hash", async () => {
    const h = await harness([plan()]);
    h.input.resolve = async () => [
      createComponentDefinition({
        ...fixture(),
        label: "Different definition",
      }),
    ];
    const output = await generateComponentAssemblyPostVariations(
      h.input,
      h.deps
    );
    expect(output.status).toBe("rejected");
    if (output.status === "rejected")
      expect(
        output.issues.some(issue =>
          issue.detail.includes("resolved_component_hash_mismatch")
        )
      ).toBe(true);
  });
  it("does not call the model for unavailable corpus or invalid count", async () => {
    const h = await harness([plan(2)], 2);
    h.input.offered = [];
    expect(
      (await generateComponentAssemblyPostVariations(h.input, h.deps)).status
    ).toBe("failed");
    expect(h.requests).toHaveLength(0);
    h.input.offered = [compactComponentCard(fixture())];
    h.input.slideCount = 11;
    expect(
      (await generateComponentAssemblyPostVariations(h.input, h.deps)).status
    ).toBe("failed");
    expect(h.requests).toHaveLength(0);
  });
});


describe("whole calibrated design generation",()=>{
  it("repairs a missing CTA using the closing design's empty body region and preserves the whole scene", async () => {
    const base = fixture(), title = base.fragment.instances[0],
      bodyPiece = { ...base.pieces[title.pieceHash], fontSize: 40 },
      bodyHash = arsenalHash(bodyPiece),
      definition = createComponentDefinition({
        ...base, completeDesign: { family: "whole-test" },
        pieces: { ...base.pieces, [bodyHash]: bodyPiece },
        fragment: { ...base.fragment,
          instances: [...base.fragment.instances, { ...title, id: "support", pieceHash: bodyHash, y: 450, height: 150 }],
          bindings: [...base.fragment.bindings, { ...base.fragment.bindings[0], id: "support", source: "block:body:0:text", required: false, targetIds: ["support"] }],
        },
      });
    const proposal = plan(3);
    for (const variation of proposal.variations) for (const slide of variation.slides) {
      slide.components = [{ id: definition.id, hash: definition.hash }];
      slide.content.blocks.push({ id: "support", type: "text", role: "body", text: slide.role === "closing" ? "Visite o Café da Tarde." : "Café artesanal com aromas únicos." });
    }
    const repaired = structuredClone(proposal);
    for (const variation of repaired.variations) {
      const block = variation.slides[2].content.blocks[1];
      if (block.type === "text") block.role = "callToAction";
    }
    const h = await harness([providerTransport(proposal, [definition]), providerTransport(repaired, [definition])], 3, true);
    h.input.request.content = "Carrossel de café artesanal com apoio legível e encerramento com convite para visitar nosso espaço Café da Tarde.";
    h.input.offered = [compactComponentCard(definition)];
    h.input.resolve = async () => [definition];
    const before = structuredClone(definition);
    const outcome = await generateComponentAssemblyPostVariations(h.input, h.deps);
    expect(outcome.status, outcome.status === "rejected" ? JSON.stringify(outcome.issues) : undefined).toBe("approved");
    expect(h.requests).toHaveLength(2);
    expect(JSON.stringify(h.requests[1].messages)).toContain("cta_required_on_art");
    expect(h.requests[0].messages[0].content).toContain('"closingCallToActionBodySource":"block:body:0:text"');
    expect(definition).toEqual(before);
    if (outcome.status !== "approved") return;
    for (const variation of outcome.snapshots) {
      const closing = variation.componentAssemblyV1!.slides[2].bundle;
      const candidate = closing.candidates[0];
      expect(candidate.componentAssembly?.componentIds).toEqual([definition.id]);
      expect(candidate.componentAssembly?.componentHashes).toEqual([definition.hash]);
      const bound = candidate.variant.bindings.find(b => b.source === "block:callToAction:0:text");
      expect(bound?.targetIds).toHaveLength(1);
      expect(closing.content.blocks).toContainEqual({ id: "support", type: "text", role: "callToAction", text: "Visite o Café da Tarde." });
      expect(candidate.variant.instances).toHaveLength(definition.fragment.instances.length);
      const reopened = JSON.parse(JSON.stringify(closing));
      expect(compositionFromAssemblyBundle(reopened, reopened.candidates[0].id).issues).toEqual([]);
    }
  });
  it("does not treat any closing body or a caption-only invitation as a canonical CTA", async () => {
    const proposal = plan(3);
    for (const variation of proposal.variations) variation.caption = "Visite o Café da Tarde.";
    const h = await harness([providerTransport(proposal)], 3, true);
    h.input.request.content = "Carrossel de café com encerramento com convite para nos visitar.";
    const outcome = await generateComponentAssemblyPostVariations(h.input, h.deps);
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") expect(outcome.issues.some(i => i.detail.includes("cta_required_on_art"))).toBe(true);
  });
  it("generates a three-slide carousel without requesting a palette from the model", async () => {
    const proposal = providerTransport(plan(3));
    for (const variation of proposal.variations) delete (variation.direction as any).palette;
    const h = await harness([proposal], 3, true);
    const outcome = await generateComponentAssemblyPostVariations(h.input, h.deps);
    expect(outcome.status).toBe("approved");
    expect(h.requests).toHaveLength(1);
    const schema = (h.requests[0].response_format as any).json_schema.schema;
    const direction = schema.properties.variations.items.properties.direction;
    expect(direction.properties.palette).toBeUndefined();
    expect(direction.required).not.toContain("palette");
    if (outcome.status !== "approved") return;
    for (const variation of outcome.snapshots) {
      expect(variation.backgroundColor).toBe(fixture().fragment.artboard.background);
      expect(variation.componentAssemblyV1!.slides).toHaveLength(3);
      for (const slide of variation.componentAssemblyV1!.slides)
        expect(slide.bundle.candidates[0].componentAssembly?.componentIds).toHaveLength(1);
    }
  });
  it("selects one complete scene and keeps its palette instead of inventing a direction palette",async()=>{
    const p=plan();
    const result=await harness([providerTransport(p)],1,true);
    const outcome=await generateComponentAssemblyPostVariations(result.input,result.deps);
    expect(outcome.status).toBe("approved");
    if(outcome.status!=="approved")return;
    for(const variation of outcome.snapshots){
      const pin=variation.componentAssemblyV1!.slides[0].bundle.candidates[0];
      expect(pin.componentAssembly?.completeDesign?.family).toBe("whole-test");
      expect(pin.variant.artboard.background).toBe(fixture().fragment.artboard.background);
      expect(pin.componentAssembly?.componentIds).toHaveLength(1);
    }
    expect(JSON.stringify(result.requests[0].messages)).toContain("designs COMPLETOS");
  });
  it("rejects repeated failures without quiet or editorial rescue",async()=>{
    const p=plan();
    p.variations.forEach(v=>v.slides[0].content.blocks.push({id:"unsupported-body",type:"text",role:"body",text:"Literal integral que não pode ser removido."}));
    const result=await harness([providerTransport(p),providerTransport(p)],1,true);
    const outcome=await generateComponentAssemblyPostVariations(result.input,result.deps);
    expect(outcome.status).toBe("rejected");
    expect(result.requests).toHaveLength(2);
    expect(JSON.stringify(result.events)).not.toContain("editorial-fallback");
    expect(JSON.stringify(result.events)).not.toContain("quiet-adaptation");
  });
});
