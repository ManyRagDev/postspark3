/** Offline integration: provider judgments, pixels and font metrics are controlled fakes.
 * Preparation, coordinator, composition, review normalization and PostgreSQL billing are real. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "../../../shared/completeDesignGeneration.fixture";
import { decodeGenerationSelectionCatalog } from "../../../shared/generationSelectionTransport";
import { compactComponentCard } from "../../../shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "../../../shared/generationRequest";
import { projectProposalVariation } from "../../../shared/proposalProjection";
import { defaultStudioPreferences } from "../../../shared/studioPreferences";
import { generationReleasePostgresFixture, releaseOwner } from "../../ai/workflows/generationReleasePostgres.fixture";
import { prepareOrchestratedGeneration } from "../../ai/workflows/generationPreparation";
import { GenerationCoordinator } from "../../ai/workflows/generationCoordinator";
import { healthyReviewV10Fixture } from "../../ai/workflows/proposalReviewV10.fixture";
import { renderReviewFixtureScenes } from "../../ai/workflows/proposalReview.fixture";
import { requestInputHash } from "../../ai/workflows/generationRuntime";
import { resolveGenerationModelConfig } from "../../ai/generationModel";
import type { InvokeParams } from "../../_core/llm";

describe("mixed planned slots with durable proportional billing", () => {
  it("delivers two viable siblings, refuses the third before copy and resumes without new effects or debit", async () => {
    const pg = await generationReleasePostgresFixture();
    try {
      await pg.exec(readFileSync(new URL("../../../drizzle/0044_generation_model_config.sql", import.meta.url), "utf8"));
      const definitions = completeDesignTestDefinitions(), runId = "55555555-5555-4555-8555-555555555555";
      for (const definition of definitions) {
        await pg.query("INSERT INTO postspark.design_components(id,definition_hash,definition,kind,status,actor_id) VALUES($1,$2,$3::jsonb,'content','approved',$4)", [definition.id, definition.hash, JSON.stringify(definition), releaseOwner]);
        for (const asset of definition.assets) {
          if (asset.kind === "bundled") await pg.query("INSERT INTO postspark.generation_v5_bundled_assets(id,sha256,mime_type,bytes,family,weight,license) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING", [asset.id, asset.sha256, asset.mimeType, asset.bytes, asset.family, asset.weight, asset.license]);
          else {
            await pg.query("INSERT INTO postspark.design_catalog_assets(id,manifest) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING", [asset.id, JSON.stringify(asset)]);
            await pg.query("INSERT INTO postspark.design_component_assets(component_id,asset_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [definition.id, asset.id]);
          }
        }
      }
      const input = orchestratedGenerationInputSchema.parse({ ownerId: releaseOwner, inputType: "text", content: "Explique como planejar diante de riscos, apenas texto, sem fotografia.", platform: "instagram", postMode: "static", idempotencyKey: runId });
      const config = { ...resolveGenerationModelConfig({ generationModel: "gpt", postMode: "static" }), generationStrategyVersion: 2 as const, editorialIntentVersion: undefined, preparationBudget: undefined };
      const scalar = async (sql: string, params: unknown[] = []) => (await pg.query<{ value: any }>(sql, params)).rows[0]?.value;
      await scalar("SELECT postspark.generation_admit_configured($1,$2,$3,$4,$5::jsonb,false,now()+interval '5 minutes',$6::jsonb) value", [runId, releaseOwner, runId, requestInputHash(input), JSON.stringify(input), JSON.stringify(config)]);
      const claimed = await scalar("SELECT postspark.generation_v5_claim('mixed-slots-test') value");
      const update = (action: string, payload: unknown) => scalar("SELECT postspark.generation_v5_lease_update($1,$2,$3,$4::jsonb) value", [runId, claimed.leaseToken, action, JSON.stringify(payload)]);
      const effects = new Map<string, unknown>();
      const operation = async <T>(key: string, work: () => Promise<T>): Promise<T> => { if (!effects.has(key)) effects.set(key, await work()); return effects.get(key) as T; };
      const provider = vi.fn(async (params: InvokeParams): Promise<any> => {
        if (params.taskRoute === "post_evaluation") return { choices: [{ message: { content: JSON.stringify(healthyReviewV10Fixture(params)) }, finish_reason: "stop" }] };
        const data = params.traceLabel?.startsWith("generation_") ? JSON.parse(params.messages.find(m => m.role === "user")!.content as string) : undefined;
        if (data?.catalog?.encoding) data.catalog = decodeGenerationSelectionCatalog(data.catalog);
        let value: unknown;
        if (params.traceLabel?.includes("generation_intent")) value = { version: 1, objective: "Explicar planejamento", tone: { description: "Cuidadoso", origin: "inferred", rationale: "O assunto envolve riscos." }, adaptation: "controlled", requirements: [], content: [{ id: "idea", meaning: "Planejar com antecedência", sourceIds: [], requirementIds: [] }] };
        else if (params.traceLabel?.includes("generation_selection")) value = { version: 1, slots: [0, 1, 2].map(slot => slot === 2 ? { slot, status: "insufficient_fit", reason: "Não há uma terceira composição adequada", unmetRequirementIds: [] } : { slot, status: "viable", candidateId: data.catalog[slot].candidateId, reason: "Comporta a ideia", editorialApproach: "Planejamento cuidadoso", captionContentIds: [], pages: [{ slideIndex: 0, componentId: data.catalog[slot].profile.sequence[0].alternatives[0], purpose: "Apresentar a ideia", rhythm: "highlight", assignments: [{ fieldId: "field-0", contentIds: ["idea"], itemCount: null, instruction: "Apresente a ideia com clareza" }] }] }) };
        else value = { caption: "Planeje", hashtags: [], slides: [{ values: [{ fieldId: "field-0", value: "Planeje com antecedência" }, { fieldId: "field-1", value: "Reserve tempo para organizar" }], mediaPrompts: [] }] };
        return { choices: [{ message: { content: JSON.stringify(value) } }] };
      });
      const prepared = await prepareOrchestratedGeneration(input, releaseOwner, false, Date.now() + 60000, {
        // This historical billing fixture intentionally supplies a mixed selector response.
        useLegacyLlmSelection: true,
        generationConfig: config, generate: provider, operation, loadContext: async () => input.content, preferences: async () => defaultStudioPreferences,
        retrieve: async () => definitions.map(compactComponentCard), hydrate: async ids => ids.map(id => definitions.find(d => d.id === id)!),
        shortlist: async ({ cards }: any) => ({ cards, evaluated: [], batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }) as any,
      });
      await update("prepared", prepared);
      const coordinatorInput = { ...prepared, executionBrief: input.executionBrief, requestId: runId, runId, actor: releaseOwner, prompt: input.content, platform: input.platform, postMode: input.postMode, generationConfig: config, experimental: false };
      const deps = {
        actor: releaseOwner, generateText: provider, measureText: (p: any) => ({ height: 20, lines: [{ width: 100 }], runs: [{ fill: p.fill, fontSize: p.fontSize, fontStyle: p.fontStyle }] }), renderReviewScenes: renderReviewFixtureScenes,
        operationForProposal: (id: string) => (o: any, work: any) => operation(`${id}:${o.operationKey}`, work),
        reviewOperations: async (id: string) => Array.from(effects).filter(([key]) => key.startsWith(`${id}:`)).map(([key, result]) => ({ operationKey: key.slice(id.length + 1), state: "completed", result })),
        persistUpdate: async (delivery: any) => { await update("checkpoint", { delivery, projection: null }); },
        deliver: async (delivery: any) => { await update("commit", { delivery, projection: projectProposalVariation(delivery.bundle, input) }); },
      };
      const result = await new GenerationCoordinator(coordinatorInput, deps).start();
      expect(result.overallStatus).toBe("partial");
      expect(result.proposals.map(p => p.status)).toEqual(["ready", "ready", "failed"]);
      expect(result.proposals[2].failure?.code).toBe("selection_insufficient_fit");
      expect(provider.mock.calls.filter(([p]) => p.traceLabel?.endsWith("_copy"))).toHaveLength(2);
      await scalar("SELECT postspark.generation_v5_finish($1,$2,'partial',NULL) value", [runId, claimed.leaseToken]);
      const settled = await scalar("SELECT to_jsonb(r) value FROM postspark.generation_v5_requests r WHERE id=$1", [runId]);
      expect(settled.billing_debited).toBe(7); // 1 preparation + 2 delivered static proposals × 3.
      expect(await scalar("SELECT sparks value FROM postspark.profiles WHERE id=$1", [releaseOwner])).toBe(143);
      const before = provider.mock.calls.length;
      const replayed = await new GenerationCoordinator({ ...coordinatorInput, savedProposals: settled.proposals }, deps).start();
      expect(replayed.overallStatus).toBe("partial"); expect(provider).toHaveBeenCalledTimes(before);
      await scalar("SELECT postspark.generation_settle($1) value", [runId]);
      expect(await scalar("SELECT count(*)::int value FROM postspark.spark_transactions")).toBe(1);
      expect(await scalar("SELECT count(*)::int value FROM postspark.next_spark_reservations")).toBe(1);
    } finally { await pg.close(); }
  }, 30000);
});
