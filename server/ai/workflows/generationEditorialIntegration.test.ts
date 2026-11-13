import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard, createComponentDefinition, assemblyIdentity } from "@shared/componentAssembly";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { editorialCatalogHash, type FrozenEditorialCatalog, type EditorialIntentReading } from "@shared/editorialIntent";
import { resolveGenerationModelConfig } from "../generationModel";
import { prepareOrchestratedGeneration, verifyPreparedEligibility } from "./generationPreparation";
import { shortlistCompleteDesigns } from "../../designCatalog/designShortlist";
import type { InvokeParams } from "../../_core/llm";
import { buildSearchIndex, searchDocuments } from "../../designCatalog/familySearchIndex";
import type { EmbeddingEngine } from "../editorialAffinity/embeddingEngine";

const owner = "00000000-0000-4000-8000-000000000001";
const definitions = completeDesignTestDefinitions();
const cards = definitions.map(compactComponentCard);
const document = { version: 1 as const, intents: [
  { id: "comparar", label: "Comparar alternativas", description: "Confrontar alternativas por critérios." },
  { id: "avaliar_limites", label: "Avaliar limitações", description: "Explicar pontos negativos sem exigir comparação." },
], designs: definitions.map(d => ({ sourceId: d.id, sourceHash: d.hash, intentIds: ["comparar", "avaliar_limites"], rationale: "Composição apta a destacar ideias e explicações." })) };
const catalog: FrozenEditorialCatalog = { version: 1, catalogRevision: "4", revision: "00000000-0000-4000-8000-000000000004", hash: editorialCatalogHash(document), document };

async function fixture(prompt: string, editorial: EditorialIntentReading, frozen: FrozenEditorialCatalog | null = catalog, sources = definitions) {
  const input = orchestratedGenerationInputSchema.parse({ ownerId: owner, inputType: "text", content: prompt, platform: "instagram", postMode: "static", idempotencyKey: "editorial-integration" });
  const config = resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" });
  const journal = new Map<string, unknown>();
  const readCatalog = vi.fn(async () => frozen);
  const generate = vi.fn(async (params: InvokeParams) => ({
    id: "provider-intent-1", model: config.model,
    choices: [{ message: { content: JSON.stringify({ version: 1, objective: prompt,
      tone: { description: "Claro", origin: "inferred", rationale: "Leitura acessível" }, adaptation: "controlled",
      requirements: [], content: [{ id: "idea", meaning: prompt, requirementIds: [], sourceIds: [] }], editorial }) } }],
  }) as any);
  const evaluate = vi.fn(async (request: any) => ({ id: "jev-fixture", model: request.model,
    answers: Object.fromEntries(Object.keys(request.questions).map((id, i) => [id, { type: "score" as const, score: Math.max(2, 4 - i * 0.02), confidence: 0.9 }])),
    usage: { input_tokens: 100, output_tokens: 10, cost: 0 },
  }));
  const observer = vi.fn(async () => { throw new Error("local encoder must stay disabled"); });
  const shortlist = vi.fn((args: Parameters<typeof shortlistCompleteDesigns>[0]) => shortlistCompleteDesigns(args, evaluate));
  const deps = { generationConfig: config, generate, readEditorialCatalog: readCatalog, observeEditorialAffinity: observer,
    hydrate: vi.fn(async (ids: string[]) => sources.filter(d => ids.includes(d.id))),
    preferences: async () => defaultStudioPreferences, retrieve: async () => sources.map(compactComponentCard),
    loadContext: async () => prompt, shortlist,
    operation: async <T>(key: string, work: () => Promise<T>): Promise<T> => {
      if (!journal.has(key)) journal.set(key, JSON.parse(JSON.stringify(await work())));
      return structuredClone(journal.get(key)) as T;
    },
  };
  const run = () => prepareOrchestratedGeneration(input, owner, true, Date.now() + 600_000, deps);
  return { input, config, journal, deps, run, generate, readCatalog, shortlist, evaluate, observer };
}

describe("catalog → interpretation → JEV → persisted planning", () => {
  it("recovers an uncertain 1.5 judgement without duplicating the only family, retaining scores and replaying without provider calls", async () => {
    const f=await fixture("Apresente uma ideia",{version:1,signals:[]},null,[definitions[0]]);
    f.evaluate.mockImplementation(async request=>({id:"jev-low",model:request.model,answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:"score" as const,score:1.5,confidence:.12}])),usage:{input_tokens:100,output_tokens:10,cost:0}}));
    const p=await f.run();
    expect(p.planning?.familyElection).toMatchObject({version:3,recovery:{outcome:"partial",attempts:[{score:1.5,confidence:.12,accepted:true}]}});
    // The current receipt allows one proposal per design identity. A single
    // recovered family leaves two slots open instead of duplicating its design.
    const recoveredSlots = p.planning!.slots.filter(s => s.status === "viable");
    expect(recoveredSlots).toHaveLength(1);
    expect(p.planning!.slots.filter(s => s.status === "insufficient_fit")).toHaveLength(2);
    expect(p.planning?.ranking.every(s=>s.score===1.5)).toBe(true);
    expect(p.selectionReasons[recoveredSlots[0].slot]).toContain("recuperada");
    const count=f.evaluate.mock.calls.length;
    expect((await f.run()).planning).toEqual(p.planning);
    expect(f.evaluate).toHaveBeenCalledTimes(count);
    await expect(verifyPreparedEligibility(p,true,f.deps.hydrate)).resolves.toBeUndefined();
  });
  it("preserves the old bounded protocol when the recovery marker was not recorded", async () => {
    const f=await fixture("Apresente uma ideia",{version:1,signals:[]},null,[definitions[0]]);
    const operation=f.deps.operation;
    f.deps.operation=async(key,work)=>operation(key,async()=>{const value=await work();if(key==="selection_input")delete(value as any).familyRecoveryVersion;return value;});
    f.evaluate.mockImplementation(async request=>({id:"jev-low",model:request.model,answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:"score" as const,score:1.5,confidence:.12}])),usage:{input_tokens:100,output_tokens:10,cost:0}}));
    const p=await f.run();
    expect(p.planning?.familyElection?.version).toBe(2);
    expect(p.planning?.familyElection?.recovery).toBeUndefined();
    expect(p.planning?.slots.every(s=>s.status==="insufficient_fit")).toBe(true);
  });
  it("retrieves before JEV in the actual preparation and replays 200 sources without buying or embedding again", async () => {
    const sources = Array.from({ length: 200 }, (_, i) => createComponentDefinition({ ...definitions[0],
      id: assemblyIdentity(["large-editorial-integration", i]), source: { ...definitions[0].source, variantKey: `large-${i}` },
      completeDesign: { ...definitions[0].completeDesign!, family: `large-${i}` } }));
    const f = await fixture("Explique um conceito", { version: 1, signals: [] }, null, sources);
    const engine = { metadata: { dimensions: 384, fingerprint: "a".repeat(64) }, embed: vi.fn(async (texts: string[]) => ({
      vectors: texts.map(() => Float32Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0)),
      inputs: texts.map(() => ({ tokenCount: 1, usedTokens: 1, truncated: false })),
    })) } as unknown as EmbeddingEngine;
    const index = await buildSearchIndex(searchDocuments(sources.map(compactComponentCard), null, 2), engine);
    const load = vi.fn(async () => ({ engine, index }));
    Object.assign(f.deps, { familySearchIndex: load });
    const first = await f.run();
    expect(first.planning?.familyElection?.version).toBe(3);
    expect(first.planning?.familyElection?.ranking).toHaveLength(24);
    expect(first.planning?.familyElection?.candidates).toHaveLength(200);
    expect(first.planning?.slots.every(s => s.status === "viable")).toBe(true);
    expect(f.evaluate.mock.calls.flatMap(([r]) => Object.keys(r.questions))).toHaveLength(24);
    expect(f.journal.has("family_retrieval")).toBe(true);
    load.mockImplementation(async () => { throw new Error("replay must not load today's index"); });
    f.generate.mockImplementation(async () => { throw new Error("duplicate interpretation"); });
    f.evaluate.mockImplementation(async () => { throw new Error("duplicate JEV call"); });
    vi.mocked(engine.embed).mockClear();
    const reopened = await f.run();
    expect(JSON.parse(JSON.stringify(reopened.planning))).toEqual(JSON.parse(JSON.stringify(first.planning)));
    expect(engine.embed).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    await expect(verifyPreparedEligibility(JSON.parse(JSON.stringify(reopened)), true, f.deps.hydrate)).resolves.toBeUndefined();
  });
  it("fails before interpretation or JEV if a large catalogue has no complete index", async () => {
    const sources = Array.from({ length: 25 }, (_, i) => createComponentDefinition({ ...definitions[0],
      id: assemblyIdentity(["missing-index", i]), completeDesign: { ...definitions[0].completeDesign!, family: `missing-${i}` } }));
    const f = await fixture("Explique", { version: 1, signals: [] }, null, sources);
    Object.assign(f.deps, { familySearchIndex: async () => { throw new Error("no provisioned index"); } });
    await expect(f.run()).rejects.toThrow("catalog_retrieval_unavailable");
    expect(f.generate).not.toHaveBeenCalled(); expect(f.evaluate).not.toHaveBeenCalled();
  });
  it.each([
    ["Compare A e B", "comparar", "requested", "Compare A e B"],
    ["Quais os pontos negativos do carro X?", "avaliar_limites", "requested", "pontos negativos do carro X"],
    ["Explique X, sem comparação", "comparar", "forbidden", "sem comparação"],
  ] as const)("preserves a partial reading for %s through the actual preparation pipeline", async (prompt, intentId, state, requestQuote) => {
    const editorial: EditorialIntentReading = { version: 1, signals: [{ intentId, state, origin: "explicit", clarity: "clear", requestQuote, rationale: "Pedido explícito no trecho citado." }] };
    const f = await fixture(prompt, editorial);
    const prepared = await f.run();
    expect(prepared.planning?.intent.editorial).toEqual(editorial);
    expect(prepared.planning?.editorialCatalog).toEqual(catalog);
    expect(prepared.planning?.slots.every(s => s.status === "viable")).toBe(true);
    expect(f.generate).toHaveBeenCalledTimes(1);
    expect(f.generate.mock.calls[0][0].traceLabel).toBe("generation_intent_v1");
    const extractionData = JSON.parse(f.generate.mock.calls[0][0].messages.find(m => m.role === "user")!.content as string);
    expect(extractionData.editorialVocabulary).toEqual(document.intents);
    expect(f.shortlist.mock.calls[0][0].editorialIntentVersion).toBe(1);
    expect(f.evaluate).toHaveBeenCalled(); // even with only three eligible designs
    const jev = f.evaluate.mock.calls[0][0];
    expect(JSON.parse(jev.state).context.intent.editorial).toEqual(editorial);
    expect(Object.values(jev.questions).every((q: any) => q.instructions.design.editorial.catalogHash === catalog.hash)).toBe(true);
    expect(prepared.planning!.intent.requirements).toEqual([]);
    expect(f.observer).not.toHaveBeenCalled();
    await expect(verifyPreparedEligibility(JSON.parse(JSON.stringify(prepared)), true, f.deps.hydrate)).resolves.toBeUndefined();
  });
  it("keeps vague and unannotated requests neutral", async () => {
    const f = await fixture("faça algo interessante", { version: 1, signals: [] }, null);
    const prepared = await f.run();
    expect(prepared.planning).toMatchObject({ editorialCatalog: null, intent: { editorial: { version: 1, signals: [] }, requirements: [] } });
    expect(Object.values(f.shortlist.mock.calls[0][0].profiles!).every((p: any) => p.editorial.catalogHash === null && p.editorial.intents.length === 0)).toBe(true);
  });
  it("replays the frozen vocabulary and result without rereading catalog or repurchasing providers", async () => {
    const f = await fixture("Compare A e B", { version: 1, signals: [{ intentId: "comparar", state: "requested", origin: "explicit", clarity: "clear", requestQuote: "Compare A e B", rationale: "Comparação expressa" }] });
    const first = await f.run();
    f.readCatalog.mockImplementation(async () => { throw new Error("new catalog must not be consulted on replay"); });
    f.generate.mockImplementation(async () => { throw new Error("second paid call"); });
    f.evaluate.mockImplementation(async () => { throw new Error("second paid JEV call"); });
    const second = await f.run();
    expect(JSON.parse(JSON.stringify(second.planning))).toEqual(JSON.parse(JSON.stringify(first.planning)));
    expect(f.readCatalog).toHaveBeenCalledTimes(1);
    expect(f.generate).toHaveBeenCalledTimes(1);
    expect(f.evaluate).toHaveBeenCalledTimes(1);
  });
  it("rejects invented taxonomy before paying for JEV", async () => {
    const f = await fixture("Compare A e B", { version: 1, signals: [{ intentId: "inventado", state: "requested", origin: "explicit", clarity: "clear", requestQuote: "Compare A e B", rationale: "Invalid ID" }] });
    await expect(f.run()).rejects.toThrow("planning_response_invalid");
    expect(f.evaluate).not.toHaveBeenCalled();
  });
  it("assesses each family once and only then plans a concrete source from that family", async () => {
    const sibling = createComponentDefinition({ ...definitions[0], id: assemblyIdentity(["family-election-sibling"]), label: "Alternative composition" });
    const f = await fixture("Compare A e B", { version: 1, signals: [] }, catalog, [...definitions, sibling]);
    const prepared = await f.run();
    const questions = f.evaluate.mock.calls.flatMap(([request]) => Object.values(request.questions) as any[]);
    expect(questions).toHaveLength(3);
    expect(new Set(questions.map(q => q.instructions.design.family)).size).toBe(3);
    expect(questions.every(q => q.instructions.design.version === 5 && !q.instructions.design.variants && !q.instructions.design.sequence)).toBe(true);
    expect(f.journal.get("selection_input")).toMatchObject({ familyRankingVersion: 1 });
    expect(prepared.planning!.familyElection!.candidates).toHaveLength(3);
    expect(prepared.planning!.familyElection!.candidates.find(c => c.family === definitions[0].completeDesign!.family)!.memberIds).toHaveLength(2);
    expect(prepared.planning!.ranking).toHaveLength(4);
    expect(new Set(prepared.planning!.offers.map(o => o!.family)).size).toBe(3);
    expect(prepared.planning!.offers.every(o => [...definitions, sibling].some(d => d.id === o!.sourceId))).toBe(true);
    await expect(verifyPreparedEligibility(JSON.parse(JSON.stringify(prepared)), true, f.deps.hydrate)).resolves.toBeUndefined();
  });
  it("keeps historical editorial receipts on their original per-source judgments", async () => {
    const f = await fixture("Compare A e B", { version: 1, signals: [] });
    const operation = f.deps.operation;
    f.deps.operation = async (key, work) => operation(key, async () => {
      const value = await work();
      if (key === "selection_input") {
        delete (value as any).familyRankingVersion;
        delete (value as any).familyRetrievalVersion;
        delete (value as any).familyRecoveryVersion;
      }
      return value;
    });
    const prepared = await f.run();
    expect(prepared.planning!.familyElection).toBeUndefined();
    expect(f.evaluate.mock.calls.flatMap(([r]) => Object.values(r.questions) as any[]).every(q => q.instructions.design.version === 3)).toBe(true);
  });
});

describe("capability policy in the full preparation path", () => {
  it("pins manual editorial obligations through judge, three plans and replay without new provider effects", async () => {
    const f = await fixture("Compare A e B na arte. Prefiro azul.", {version: 1, signals: []});
    f.input.selectionPolicy = "capability_v1";
    const original = f.generate.getMockImplementation()!;
    f.generate.mockImplementation(async params => {
      const response = await original(params);
      const reading = JSON.parse(response.choices[0].message.content);
      reading.semanticQuery = "comparar alternativas";
      reading.requirements = [
        {id: "comparison", description: "Comparar A e B", kind: "content", surface: "art", source: "declared", strength: "required", origin: "explicit", requestQuote: "Compare A e B na arte", itemCount: null},
        {id: "color", description: "Preferência azul", kind: "execution", surface: "art", source: "declared", strength: "preference", origin: "inferred", requestQuote: "Prefiro azul", itemCount: null},
      ];
      reading.content[0].requirementIds = ["comparison"];
      response.choices[0].message.content = JSON.stringify(reading);
      return response;
    });
    const first = await f.run();
    expect(first.planning?.slots.every(slot => slot.status === "viable")).toBe(true);
    expect(first.planning?.intent.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "comparison", source: "declared", strength: "required", origin: "explicit"}),
      expect.objectContaining({id: "color", source: "declared", strength: "preference", origin: "inferred"}),
      expect.objectContaining({source: "physical", strength: "required"}),
    ]));
    expect(f.journal.get("selection_input")).toMatchObject({selectionPolicy: "capability_v1", familyNeutrality: {selectionPolicy: "capability_v1"}});
    expect(JSON.parse(f.evaluate.mock.calls[0][0].state).assessmentTask).toContain("declared required constraints");
    f.generate.mockImplementation(async () => { throw new Error("unexpected repeated interpretation"); });
    f.evaluate.mockImplementation(async () => { throw new Error("unexpected repeated judging"); });
    expect((await f.run()).planning).toEqual(first.planning);
    await expect(verifyPreparedEligibility(first, true, f.deps.hydrate)).resolves.toBeUndefined();
    f.input.selectionPolicy = "legacy";
    await expect(f.run()).rejects.toThrow("preparation_contract_incompatible");
  });
});
