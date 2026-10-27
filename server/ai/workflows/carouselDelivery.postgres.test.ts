import { inspectGenerationEvidence } from "../../generationEvidence";
import { healthyReviewV7Fixture } from "./proposalReviewV7.fixture";
import { readFile } from "node:fs/promises";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { generationPostgresFixture } from "./generationPostgres.fixture";
import {
  componentDefinitionV1Schema,
  compactComponentCard,
} from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import { authorCarouselVisualVariant } from "../../designCatalog/carouselVisualVariants";
import { prepareHistoricalContextGeneration as prepareOrchestratedGeneration } from "./historicalPreparation.fixture";
import { GenerationCoordinator } from "./generationCoordinator";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { createComponentTextMeasurer } from "../componentTextMeasurer";
import { ENV } from "../../_core/env";
import { invokeLLM, type InvokeParams } from "../../_core/llm";
import { durableOperations, projectSiteIntelligenceSnapshot } from "./generationRuntime";
import { readJournalResult } from "./generationJournalTrace";
import {
  interpretRawBriefing,
  creationBriefToExecutionBrief,
  type BrandKitSummaryInput,
} from "@shared/creationBrief";
import type { SiteIntelligence } from "@shared/postspark";
import { editorialPlanFixture } from "./proposalEditorial.fixture";
import {
  attachFactCoverageFixture,
  renderReviewFixtureScenes,
} from "./proposalReview.fixture";
import { compileCompleteDesign } from "../../../client/src/pages/CanvasLab/lib/completeDesignCompiler";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "../../../client/src/pages/CanvasLab/lib/saveAdapter";
vi.mock("../../../client/src/pages/CanvasLab/lib/arsenalAssets", () => ({
  ensureArsenalFont: vi.fn(async () => {}),
}));
const originalEnv = { ...ENV };
const owner = "11111111-1111-4111-8111-111111111111";
let pg: PGlite,
  serial = 0;
const sources = (
  JSON.parse(
    await readFile(
      new URL("./fixtures/carousel-catalog.json", import.meta.url),
      "utf8"
    )
  ) as unknown[]
).map(d => componentDefinitionV1Schema.parse(d));
const definitions = sources.flatMap(d => [
  d,
  authorCarouselVisualVariant(d, "development"),
  authorCarouselVisualVariant(d, "closing"),
]);
const loadAssetBytes = (a: any) =>
  readFile(new URL(`./fixtures/carousel-assets/${a.sha256}`, import.meta.url));
const query = async (sql: string, params: any[] = []) => pg.query(sql, params);
async function rpc(sql: string, params: any[] = []) {
  await query("SET ROLE service_role");
  try {
    return (await query(sql, params)).rows[0]?.value as any;
  } finally {
    await query("RESET ROLE");
  }
}
beforeAll(async () => {
  pg = await generationPostgresFixture(owner);
  for (const d of definitions) {
    await query(
      "insert into postspark.design_components values($1,$2,$3,'content','approved',$4)",
      [d.id, d.hash, JSON.stringify(d), owner]
    );
    for (const a of d.assets) {
      await query(
        "insert into postspark.design_catalog_assets values($1,$2) on conflict do nothing",
        [a.id, JSON.stringify(a)]
      );
      await query(
        "insert into postspark.design_component_assets values($1,$2)",
        [d.id, a.id]
      );
    }
  }
}, 30000);
afterEach(async () => {
  Object.assign(ENV, originalEnv); vi.unstubAllGlobals();
  await query(
    "update postspark.generation_v5_requests set status='failed' where status in ('queued','running')"
  );
});
afterAll(async () => {
  await pg?.close();
});
async function prepare(inputOverrides: Record<string, any> = {}, contextOverride?: string) {
  const id = `30000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  const base = {
    ownerId: owner,
    idempotencyKey: id,
    content: "Café fresco.",
    platform: "instagram",
    inputType: "text",
    postMode: "carousel",
    slideCount: 3,
    ...inputOverrides,
  };
  if (base.postMode === "static") {
    delete (base as any).slideCount;
  }
  const input = orchestratedGenerationInputSchema.parse(base);
  const catalog = await query(
    "select definition from postspark.design_components where status='approved'"
  );
  const defs = catalog.rows.map((r: any) =>
    componentDefinitionV1Schema.parse(r.definition)
  );
  const preparationResults = new Map<string, unknown>();
  const recordedSelectorPrompts: any[] = [];
  const prepared = await prepareOrchestratedGeneration(
    input,
    owner,
    false,
    Date.now() + 60000,
    {
      operation: async (key, work) => { const result=await work(); preparationResults.set(key,result); return result; },
      loadContext: async () => contextOverride ?? input.content,
      preferences: async () => defaultStudioPreferences,
      retrieve: async () => defs.map(compactComponentCard),
      hydrate: async ids => defs.filter(d => ids.includes(d.id)),
      shortlist: async ({ cards }) => ({
        cards,
        evaluated: [],
        batches: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      }),
      generate: async p => {
        recordedSelectorPrompts.push(p);
        const data = JSON.parse(p.messages[1].content as string);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  version: 2,
                  options: data.catalog.map((o: any) => ({
                    offerId: o.offerId,
                    reason: "Fixture: curated exact offer",
                  })),
                }),
              },
            },
          ],
        } as any;
      },
    }
  );
  await rpc(
    "select postspark.generation_v5_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval '10 minutes') value",
    [id, owner, id, "a".repeat(64), JSON.stringify(input)]
  );
  const lease = await rpc(
    "select postspark.generation_v5_claim('fixture-controlled-providers') value"
  );
  await rpc(
    "select postspark.generation_v5_lease_update($1,$2,'prepared',$3::jsonb) value",
    [id, lease.leaseToken, JSON.stringify(prepared)]
  );
  for(const [key,result] of Array.from(preparationResults.entries())) {
    await rpc("select postspark.generation_v5_operation($1,$2,$3,'begin') value",[id,lease.leaseToken,`prepare:${key}`]);
    await rpc("select postspark.generation_v5_operation($1,$2,$3,'complete',$4::jsonb) value",[id,lease.leaseToken,`prepare:${key}`,JSON.stringify(result)]);
  }
  return { id, input, prepared, lease, recordedSelectorPrompts };
}
async function deliveries(
  commitBeforeReady = true,
  inputOverrides: Record<string, any> = {},
  contextOverride?: string,
  failSlot?: number
) {
  const s = await prepare(inputOverrides, contextOverride);
  const measureText = await createComponentTextMeasurer(
    definitions.flatMap(d => d.assets),
    loadAssetBytes
  );
  const bought: string[] = [];
  ENV.openRouterApiKey = "fixture-no-network";
  const controlledGenerate = async (p: InvokeParams) => {
        if (p.taskRoute === "post_evaluation") return {choices:[{message:{content:JSON.stringify(healthyReviewV7Fixture(p))}}]} as any;
        const prompt = p.messages
          .map(m => (typeof m.content === "string" ? m.content : ""))
          .join("\n");
        const match = prompt.match(/Direção selecionada para esta proposta \((\d+)\)/);
        const slotIndex = match ? parseInt(match[1], 10) - 1 : 0;
        if (failSlot !== undefined && slotIndex === failSlot) {
          throw new Error("simulated_provider_failure_for_slot");
        }
        const sequence =
          s.prepared.selectedDefinitions[slotIndex] ??
          s.prepared.selectedDefinitions[0];
        const copy = {
          caption: "Café fresco.",
          hashtags: [],
          slides: sequence.map(d => ({
            values: completeDesignFields(d).map(f => ({
              fieldId: f.id,
              value:
                f.kind === "list"
                  ? Array.from(
                      { length: f.cardinality?.min || 1 },
                      () => "Café fresco."
                    )
                  : f.role === "headline"
                    ? "Café de todo dia"
                    : f.role === "body"
                      ? "Café fresco."
                      : f.role === "callToAction"
                        ? "Venha conhecer"
                        : "01",
            })),
            mediaPrompts: [],
          })),
        };
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...copy,

                }),
              },
            },
          ],
        } as any;
  };
  const recordedBodies: any[] = [];
  let responses = 0;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (typeof url === "string" && !url.includes("openrouter.ai") && !url.startsWith("/api/")) {
      throw new Error(`UNMOCKED_NETWORK_CALL_BLOCKED: ${url}`);
    }
    const body = JSON.parse(init.body);
    recordedBodies.push(body);
    const review = body.messages.some((m:any)=>typeof m.content==="string"&&m.content.includes("Política postspark.review.v7"));
    const result = await controlledGenerate({...body,taskRoute:review?"post_evaluation":"carousel_generation"});
    return new Response(JSON.stringify({...result,id:`fixture-provider-${++responses}`,model:body.model,usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30,cost:0.001}}),{status:200});
  }));
  const operationStore:any = {
    beginOperation:async(_id:string,_lease:string,key:string)=>rpc("select postspark.generation_v5_operation($1,$2,$3,'begin') value",[s.id,s.lease.leaseToken,key]),
    persistOperationResult:async(_id:string,_lease:string,key:string,result:any)=>rpc("select postspark.generation_v5_operation($1,$2,$3,'complete',$4::jsonb) value",[s.id,s.lease.leaseToken,key,JSON.stringify(result)]),
    markOperationUncertain:async(_id:string,_lease:string,key:string)=>rpc("select postspark.generation_v5_operation($1,$2,$3,'uncertain') value",[s.id,s.lease.leaseToken,key]),
  };
  const coordinator = new GenerationCoordinator(
    {
      requestId: s.id,
      runId: s.id,
      actor: owner,
      prompt: s.input.content,
      reviewPolicyVersion: s.prepared.reviewPolicyVersion,
      reviewExecutionConfig: s.prepared.reviewExecutionConfig,
      editorialContextHash: s.prepared.editorialContextHash,
      contextContent: s.prepared.contextContent,
      selectedDefinitions: s.prepared.selectedDefinitions,
      experimental: false,
      postMode: s.input.postMode,
      executionBrief: s.input.executionBrief,
    },
    {
      actor: owner,
      measureText,
      renderReviewScenes: renderReviewFixtureScenes,
      mediaAdapter: {
        generate: async () => ({
          url: `/api/post-media/${owner}/${"c".repeat(64)}`,
        }),
      },
      generateText: invokeLLM,
      reviewOperations: async proposalId => (await query("select operation_key,state,result from postspark.generation_v5_operations where request_id=$1",[s.id])).rows
        .filter((r:any)=>r.operation_key.startsWith(`${proposalId}:review:`)||r.operation_key.startsWith(`${proposalId}:review_evidence_repair:`))
        .map((r:any)=>({operationKey:r.operation_key.slice(proposalId.length+1),state:r.state,result:readJournalResult(r.result)})),
      operationForProposal: proposalId => async ({operationKey},work) => {
        bought.push(`${proposalId}:${operationKey}`);
        return durableOperations(operationStore,{id:s.id,deadlineAt:Date.now()+600000} as any,s.lease.leaseToken,new AbortController().signal,`${proposalId}:`)(operationKey,work);
      },
      deliver: commitBeforeReady ? async delivery => { await rpc("select postspark.generation_v5_lease_update($1,$2,'commit',$3::jsonb) value",[s.id,s.lease.leaseToken,JSON.stringify({delivery,projection:{completeDesignV1:delivery.bundle}})]); } : undefined,
      executeOperation: async ({ operationKey }, work) => {
        bought.push(operationKey);
        return work();
      },
    }
  );
  return { ...s, snapshot: await coordinator.start(), bought, recordedBodies };
}
describe("curated real catalog → preparation → canonical bundle → PostgreSQL commit/grants → editor persistence", () => {
  it("delivers three sequences with exact stored identities and atomic grants; lost commit response is idempotent", async () => {
    const s = await deliveries();
    expect(
      s.snapshot.proposals.map(p => ({
        status: p.status,
        reason: p.errorReason,
      })),
      JSON.stringify(s.snapshot.proposals)
    ).toEqual([0, 1, 2].map(() => ({ status: "ready", reason: undefined })));
    expect(s.snapshot.proposals.every(p=>p.reviews?.at(-1)?.policyVersion===7)).toBe(true);
    const journal = await query("select operation_key,state,result from postspark.generation_v5_operations where request_id=$1",[s.id]);
    expect(journal.rows.every((r:any)=>r.state==="completed")).toBe(true);
    const providerOperations = journal.rows.filter((r:any)=>r.operation_key.startsWith("p-")&&!r.operation_key.includes(":image:"));
    expect(providerOperations).toHaveLength(6);
    expect(providerOperations.every((r:any)=>r.result.id&&r.result.model)).toBe(true);
    for (const delivery of s.snapshot.proposals) {
      if (delivery.status !== "ready") throw new Error("not_ready");
      const payload = {
        delivery,
        projection: { completeDesignV1: delivery.bundle },
      };
      const commit = () =>
        rpc(
          "select postspark.generation_v5_lease_update($1,$2,'commit',$3::jsonb) value",
          [s.id, s.lease.leaseToken, JSON.stringify(payload)]
        );
      await commit();
      await commit();
      for (const slide of delivery.bundle.slides) {
        const origin = slide.composition.origin.componentAssembly!;
        const found = await query(
          "select definition_hash from postspark.design_components where id=$1",
          [origin.componentIds[0]]
        );
        expect(found.rows[0].definition_hash).toBe(origin.componentHashes[0]);
      }
      const editor = await compileCompleteDesign(delivery.bundle, {
        assetDeadline: performance.now() + 5000,
      });
      const saved = canvasModelToSavePayload(editor, {
        inputType: "text",
        inputContent: s.input.content,
      });
      const reopened = savedPostToCanvasModel({
        id: 1,
        ...saved,
        canvas_model: JSON.parse(JSON.stringify(saved.canvasModel)),
      } as any);
      expect(reopened.slides.map(s => arsenalHash(s.composition))).toEqual(
        delivery.bundle.slides.map(s => arsenalHash(s.composition))
      );
    }
    const invalid = await query(
      "select count(*) n from postspark.design_component_asset_grants g where not exists(select 1 from postspark.design_component_assets a where a.component_id=g.component_id and a.asset_id=g.asset_id)"
    );
    expect(Number(invalid.rows[0].n)).toBe(0);
    const before = await query(
      "select count(*) n from postspark.design_component_asset_grants"
    );
    expect(Number(before.rows[0].n)).toBeGreaterThan(0);
    await rpc("select postspark.generation_v5_finish($1,$2,'completed') value",[s.id,s.lease.leaseToken]);
    const request=(await query("select * from postspark.generation_v5_requests where id=$1",[s.id])).rows[0];
    const report=inspectGenerationEvidence({request,operations:journal.rows});
    // This catalog/lease fixture loads 0034/0035/0038, not the financial schema.
    // The real 0036 settlement/ledger is exercised in generationBilling.postgres.test.ts.
    // Do not fabricate billing fields to turn this limited fixture into homologation.
    expect(report.checks.filter(c=>!c.passed).map(c=>c.code).sort()).toEqual(["billing_terminal_settled","canonical_billing_mode"]);
    expect(report.passed).toBe(false);
    expect(report.checks.filter(c=>c.scope.startsWith("slot:")).every(c=>c.passed)).toBe(true);
    const corrupt=structuredClone(journal.rows) as any[];
    const review=corrupt.find(o=>o.operation_key.includes(":review:initial:"));
    review.result.__proposalReview.textUnitInventory[0].text+=" altered";
    expect(inspectGenerationEvidence({request,operations:corrupt}).checks.some(c=>c.code==="review_text_units_complete"&&!c.passed)).toBe(true);

  }, 30000);
  it.each(["missing", "archived", "hash", "unlinked"])(
    "rejects %s before any partial grant",
    async kind => {
      const s = await deliveries(false);
      const p = s.snapshot.proposals.find(p => p.status === "ready");
      expect(p).toBeDefined();
      if (p?.status !== "ready") return;
      const changed = structuredClone(p),
        scene = changed.bundle.slides[1].composition,
        component = scene.origin.componentAssembly!.componentIds[0];
      if (kind === "missing")
        scene.origin.componentAssembly!.componentIds[0] =
          "ffffffff-ffff-4fff-8fff-ffffffffffff";
      if (kind === "hash")
        scene.origin.componentAssembly!.componentHashes[0] = "f".repeat(64);
      if (kind === "archived")
        await query(
          "update postspark.design_components set status='archived' where id=$1",
          [component]
        );
      if (kind === "unlinked")
        scene.assets.push({ ...scene.assets[0], id: "not-linked-asset" });
      const before = await query(
        "select count(*) n from postspark.design_component_asset_grants"
      );
      await expect(
        rpc(
          "select postspark.generation_v5_lease_update($1,$2,'commit',$3::jsonb) value",
          [
            s.id,
            s.lease.leaseToken,
            JSON.stringify({ delivery: changed, projection: {} }),
          ]
        )
      ).rejects.toThrow();
      expect(
        (
          await query(
            "select count(*) n from postspark.design_component_asset_grants"
          )
        ).rows[0]
      ).toEqual(before.rows[0]);
      if (kind === "archived")
        await query(
          "update postspark.design_components set status='approved' where id=$1",
          [component]
        );
    },
    30000
  );

  it(
    "AC-6: delivers full integrated flow with snapshot + brand kit + complementary instruction with editor roundtrip and partial delivery",
    async () => {
      const snapshotObj: SiteIntelligence = {
        id: "snap-integrated-01",
        sourceUrl: "https://cafegourmet.test",
        fingerprint: "fp-integ-123",
        extractedAt: "2026-10-15T12:00:00Z",
        quality: {
          overall: 90,
          visual: 85,
          semantic: 95,
          evidenceCoverage: 90,
          fallbackUsed: false,
          warnings: [],
        },
        brand: {
          brandName: "Café Gourmet",
          industry: "Alimentos e Bebidas",
        },
        business: {
          summary: "Cafés especiais torrados artesanalmente",
          valueProposition: "Grãos selecionados direto do produtor",
          products: ["Café torrado", "Grãos especiais"],
          services: [],
          audiences: ["Apreciadores de café especial"],
          audienceProblems: ["Dificuldade de encontrar cafés frescos"],
          differentiators: ["Altitude elevada e colheita seletiva"],
          goals: ["educate"],
        },
        editorial: {
          pillars: ["Qualidade", "Origem"],
          priorityTopics: ["Torra artesanal", "Sustentabilidade"],
          toneGuidelines: ["acolhedor e especialista"],
          prohibitedClaims: ["café instantâneo"],
        },
        evidence: [
          {
            id: "ev-1",
            kind: "body",
            sourceUrl: "https://cafegourmet.test/origem",
            text: "Grãos 100% arábica cultivados acima de 1200 metros de altitude na Serra da Mantiqueira.",
          },
        ],
      };
      const snapshotText = projectSiteIntelligenceSnapshot(snapshotObj);

      const brandKit: BrandKitSummaryInput = {
        brand_name: "Café Gourmet",
        tone: "acolhedor e especialista",
        brand_essence: "Autenticidade e terroir da Mantiqueira",
        target_audience: "Apreciadores de café especial",
      };

      const rawBriefStatic = "História do café especial da Mantiqueira";
      const creationBriefStatic = interpretRawBriefing(rawBriefStatic, {
        selectedFormat: "static",
        brandKit,
      });
      const executionBriefStatic = creationBriefToExecutionBrief(creationBriefStatic);

      const rawBriefCarousel = "Passo a passo da torra artesanal do café na Mantiqueira";
      const creationBriefCarousel = interpretRawBriefing(rawBriefCarousel, {
        selectedFormat: "carousel",
        brandKit,
      });
      const executionBriefCarousel = creationBriefToExecutionBrief(creationBriefCarousel);

      // 1. Static post integrated test (AC-3)
      const staticComplement = "Instrução complementar: destacar altitude de cultivo dos grãos.";
      const sStatic = await deliveries(
        true,
        {
          postMode: "static",
          content: staticComplement,
          executionBrief: executionBriefStatic,
        },
        snapshotText
      );

      // Verify that effective messages sent to selector contain snapshot, brand, and complement
      expect(sStatic.recordedSelectorPrompts.length).toBeGreaterThan(0);
      const selectorText = sStatic.recordedSelectorPrompts
        .map((p: any) => p.messages.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n"))
        .join("\n");
      expect(selectorText).toContain("Grãos 100% arábica cultivados acima de 1200 metros de altitude na Serra da Mantiqueira.");
      expect(selectorText).toContain("Autenticidade e terroir da Mantiqueira");
      expect(selectorText).toContain(staticComplement);

      // Verify copy requests contain snapshot, brand, and complement
      const staticCopyRequests = (sStatic.recordedBodies || []).filter(
        (b: any) => !b.messages.some((m: any) => typeof m.content === "string" && m.content.includes("Política postspark.review.v7"))
      );
      expect(staticCopyRequests.length).toBe(3);
      for (const req of staticCopyRequests) {
        const text = req.messages.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
        expect(text).toContain("Grãos 100% arábica cultivados acima de 1200 metros de altitude na Serra da Mantiqueira.");
        expect(text).toContain("Autenticidade e terroir da Mantiqueira");
        expect(text).toContain(staticComplement);
      }

      // Verify review requests contain snapshot, brand, and complement
      const staticReviewRequests = (sStatic.recordedBodies || []).filter(
        (b: any) => b.messages.some((m: any) => typeof m.content === "string" && m.content.includes("Política postspark.review.v7"))
      );
      expect(staticReviewRequests.length).toBe(3);
      for (const req of staticReviewRequests) {
        const text = req.messages.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
        expect(text).toContain("Grãos 100% arábica cultivados acima de 1200 metros de altitude na Serra da Mantiqueira.");
        expect(text).toContain("Autenticidade e terroir da Mantiqueira");
        expect(text).toContain(staticComplement);
      }

      expect(sStatic.snapshot.proposals.map(p => p.status)).toEqual([
        "ready",
        "ready",
        "ready",
      ]);
      for (const p of sStatic.snapshot.proposals) {
        expect(p.bundle.slides).toHaveLength(1);
        expect(typeof p.bundle.caption).toBe("string");
        expect(p.bundle.caption.length).toBeGreaterThan(0);

        const editor = await compileCompleteDesign(p.bundle, {
          assetDeadline: performance.now() + 5000,
        });
        expect(editor.slides).toHaveLength(1);
        expect(editor.slides[0].composition).toBeDefined();

        const saved = canvasModelToSavePayload(editor, {
          inputType: "text",
          inputContent: sStatic.input.content,
        });
        const reopened = savedPostToCanvasModel({
          id: 2,
          ...saved,
          canvas_model: JSON.parse(JSON.stringify(saved.canvasModel)),
        } as any);
        expect(reopened.slides).toHaveLength(1);
        expect(arsenalHash(reopened.slides[0].composition)).toBe(
          arsenalHash(p.bundle.slides[0].composition)
        );
      }
      await rpc("select postspark.generation_v5_finish($1,$2,'completed') value", [sStatic.id, sStatic.lease.leaseToken]);

      // 2. Carousel full integrated test (AC-3)
      const carouselComplement = "Instrução complementar: focar nas notas sensoriais de torra média.";
      const sCarousel = await deliveries(
        true,
        {
          postMode: "carousel",
          slideCount: 3,
          content: carouselComplement,
          executionBrief: executionBriefCarousel,
        },
        snapshotText
      );

      expect(sCarousel.snapshot.proposals.map(p => p.status)).toEqual([
        "ready",
        "ready",
        "ready",
      ]);
      for (const p of sCarousel.snapshot.proposals) {
        expect(p.bundle.slides).toHaveLength(3);
        const editor = await compileCompleteDesign(p.bundle, {
          assetDeadline: performance.now() + 5000,
        });
        expect(editor.slides).toHaveLength(3);

        const saved = canvasModelToSavePayload(editor, {
          inputType: "text",
          inputContent: sCarousel.input.content,
        });
        const reopened = savedPostToCanvasModel({
          id: 4,
          ...saved,
          canvas_model: JSON.parse(JSON.stringify(saved.canvasModel)),
        } as any);
        expect(reopened.slides.map(s => arsenalHash(s.composition))).toEqual(
          p.bundle.slides.map(s => arsenalHash(s.composition))
        );
      }
      await rpc("select postspark.generation_v5_finish($1,$2,'completed') value", [sCarousel.id, sCarousel.lease.leaseToken]);

      // 3. Partial delivery test (AC-4: proposal 0 fails, siblings 1 and 2 finish ready)
      // Must use the exact same brief/brand data as the carousel scenario, failing only slot 0
      const sPartial = await deliveries(
        true,
        {
          postMode: "carousel",
          slideCount: 3,
          content: carouselComplement,
          executionBrief: executionBriefCarousel,
        },
        snapshotText,
        0
      );

      expect(sPartial.snapshot.overallStatus).toBe("partial");
      expect(sPartial.snapshot.proposals.find(p => p.slot === 0)?.status).toBe(
        "failed"
      );
      const readyProposals = sPartial.snapshot.proposals.filter(p => p.status === "ready");
      expect(readyProposals).toHaveLength(2);

      for (const p of readyProposals) {
        expect(p.bundle.slides).toHaveLength(3);
        const editor = await compileCompleteDesign(p.bundle, {
          assetDeadline: performance.now() + 5000,
        });
        const saved = canvasModelToSavePayload(editor, {
          inputType: "text",
          inputContent: sPartial.input.content,
        });
        const reopened = savedPostToCanvasModel({
          id: 5,
          ...saved,
          canvas_model: JSON.parse(JSON.stringify(saved.canvasModel)),
        } as any);
        expect(reopened.slides.map(s => arsenalHash(s.composition))).toEqual(
          p.bundle.slides.map(s => arsenalHash(s.composition))
        );
      }

      // Financial non-homologation check: limited catalog fixture reports incomplete billing settlement
      const partialRequest = (await query("select * from postspark.generation_v5_requests where id=$1", [sPartial.id])).rows[0];
      const partialJournal = (await query("select operation_key,state,result from postspark.generation_v5_operations where request_id=$1", [sPartial.id])).rows;
      const partialEvidence = inspectGenerationEvidence({ request: partialRequest, operations: partialJournal });
      const failedCodes = partialEvidence.checks.filter(c => !c.passed).map(c => c.code);
      expect(failedCodes).toContain("billing_terminal_settled");
      expect(failedCodes).toContain("canonical_billing_mode");
      expect(failedCodes).toContain("three_ready_slots");
      expect(partialEvidence.passed).toBe(false);
      await rpc("select postspark.generation_v5_finish($1,$2,'partial') value", [sPartial.id, sPartial.lease.leaseToken]);
    },
    45000
  );
});
