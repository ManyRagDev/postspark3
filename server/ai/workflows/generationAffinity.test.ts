import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { compactComponentCard } from "@shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { ENV } from "../../_core/env";
import type { InvokeParams } from "../../_core/llm";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import {
  shortlistCompleteDesigns,
  type JevRequest,
} from "../../designCatalog/designShortlist";
import { resolveGenerationModelConfig } from "../generationModel";
import {
  editorialAffinityReceiptSchema,
  type EditorialAffinityReceipt,
} from "../editorialAffinity/contracts";
import type { AffinityObservationInput } from "../editorialAffinity/observe";
import {
  eligibleCompleteDesignOffersForRequest,
  prepareOrchestratedGeneration,
  selectionInputReceiptSchema,
  verifyPreparedEligibility,
  type PreparationDeps,
} from "./generationPreparation";
import {
  generationReleasePostgresFixture,
  releaseOwner,
} from "./generationReleasePostgres.fixture";

// Provider and affinity outputs below are controlled fixtures. These tests verify
// transport, durable replay and selection isolation, not embedding quality.
const input = orchestratedGenerationInputSchema.parse({
  ownerId: releaseOwner,
  inputType: "text",
  content: "Explique como planejar antes de uma mudança.",
  platform: "instagram",
  postMode: "static",
  idempotencyKey: "editorial-affinity-integration",
});
const { definitions } = electionCatalogFixture(14);
const intent = {
  version: 1,
  objective: "Explicar um planejamento útil",
  tone: {
    description: "Cuidadoso",
    origin: "inferred",
    rationale: "O pedido pede orientação.",
  },
  adaptation: "controlled",
  requirements: [],
  content: [
    {
      id: "idea",
      meaning: "Planejar antes de agir",
      sourceIds: [],
      requirementIds: [],
    },
  ],
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function scoredReceipt(): EditorialAffinityReceipt {
  return editorialAffinityReceiptSchema.parse({
    version: 1,
    mode: "shadow",
    status: "scored",
    inputHash: "a".repeat(64),
    inputScope: "submitted_text_v1",
    configurationHash: "b".repeat(64),
    modelId: "controlled-local-model",
    artifactHash: "c".repeat(64),
    profilesHash: "d".repeat(64),
    scoringVersion: 1,
    tokenCount: 12,
    truncated: false,
    reason: null,
    latencyMs: 3,
    // Deliberately rank the opposite end of the catalogue first.
    scores: [...definitions].reverse().map((d, i) => ({
      profileId: d.id,
      familyId: d.completeDesign!.family,
      sourceHash: d.hash,
      score: 0.95 - i * 0.04,
      references: [
        {
          id: `${d.id}:reference`,
          dimension: "objective",
          score: 0.95 - i * 0.04,
        },
      ],
    })),
  });
}

function setup(
  strategy: 1 | 2,
  observe: NonNullable<PreparationDeps["observeEditorialAffinity"]>,
  journal = new Map<string, unknown>()
) {
  const previousStrategy = ENV.generationStrategyVersion;
  ENV.generationStrategyVersion = strategy;
  const generationConfig = resolveGenerationModelConfig({
    generationModel: "gpt",
    postMode: "static",
  });
  // The local shadow prototype is backlog; exercise its historical protocol only.
  delete generationConfig.editorialIntentVersion;
  const { configurationHash: _previousHash, ...historicalConfig } = generationConfig;
  generationConfig.configurationHash = createHash("sha256").update(JSON.stringify(historicalConfig)).digest("hex");
  ENV.generationStrategyVersion = previousStrategy;
  const evaluate = vi.fn(async (request: JevRequest) => ({
    id: "controlled-jev",
    model: request.model,
    answers: Object.fromEntries(
      Object.keys(request.questions).map((id, index) => [
        id,
        {
          type: "score" as const,
          score: 4 - index * 0.1,
          confidence: 0.9,
        },
      ])
    ),
    usage: { input_tokens: 1, output_tokens: 1, cost: 0 },
  }));
  const generate = vi.fn(async (params: InvokeParams) => {
    const data = JSON.parse(
      params.messages.find(m => m.role === "user")!.content as string
    );
    const result =
      params.traceLabel === "generation_intent_v1"
        ? intent
        : {
            version: params.traceLabel === "generation_selection_v3" ? 3 : 2,
            options: data.catalog.slice(0, 3).map((candidate: any) => ({
              offerId: candidate.offerId,
              reason: "Composição nativa adequada",
              ...(params.traceLabel === "generation_selection_v3"
                ? { editorialApproach: "Explicar um passo útil" }
                : {}),
            })),
          };
    return {
      id: "controlled-provider",
      model: generationConfig.model,
      choices: [
        { message: { role: "assistant", content: JSON.stringify(result) } },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    } as any;
  });
  const deps: PreparationDeps = {
    generationConfig,
    observeEditorialAffinity: observe,
    generate,
    retrieve: async () => definitions.map(compactComponentCard),
    hydrate: vi.fn(async ids => definitions.filter(d => ids.includes(d.id))),
    preferences: async () => defaultStudioPreferences,
    loadContext: async () => input.content,
    shortlist: params => shortlistCompleteDesigns(params, evaluate),
    operation: async <T>(key: string, work: () => Promise<T>) => {
      if (!journal.has(key)) journal.set(key, clone(await work()));
      return clone(journal.get(key)) as T;
    },
  };
  return {
    deps,
    journal,
    generate,
    evaluate,
    run: (request = input) =>
      prepareOrchestratedGeneration(
        request,
        releaseOwner,
        true,
        Date.now() + 600_000,
        deps
      ),
  };
}

function withoutObservation(
  value: Awaited<ReturnType<typeof prepareOrchestratedGeneration>>
) {
  const { editorialAffinity: _observation, ...rest } = value;
  return rest;
}

describe.each([1, 2] as const)(
  "editorial affinity isolation in generation strategy %i",
  strategy => {
    it("persists shadow evidence before provider work without changing selection, plan or provider payloads", async () => {
      const request = orchestratedGenerationInputSchema.parse({
        ...input,
        creationMode: "execution",
        tone: "Tom externo",
        executionBrief: {
          creationMode: "execution", format: "static", platform: "instagram",
          interventionLevel: "light_optimize", contentSourceType: "freeform",
          rawInput: "Planeje a mudança antes de agir.", notes: "Explique com clareza.",
          callToAction: "Salve para consultar depois.", objective: "educate",
          tone: "Mesmo layout em todos os slides", audience: "Público do briefing",
        },
      });
      const disabled = setup(
        strategy,
        vi.fn(async () => undefined)
      );
      const observer = vi.fn(async (_args: AffinityObservationInput) => scoredReceipt());
      const shadow = setup(strategy, observer);
      const baseline = await disabled.run(request);
      const prepared = await shadow.run(request);

      const observed = observer.mock.calls[0][0];
      expect(observed.input).toEqual(request);
      if (strategy === 1) {
        const offers = eligibleCompleteDesignOffersForRequest(definitions.map(compactComponentCard), request);
        expect(observed.catalogIdentities).toEqual(offers.map(offer => ({
          family: offer.family, sourceId: offer.sourceId, sourceHash: offer.sourceHash,
          components: offer.slides.map(slide => ({ id: slide.componentId, hash: slide.componentHash })),
        })));
        expect(observed.repertoireInstructions).toBeUndefined();
      } else {
        expect(observed.catalogIdentities).toBeUndefined();
        expect(observed.repertoireInstructions).toBe([
          request.content, request.executionBrief!.rawInput,
          request.executionBrief!.notes, request.executionBrief!.callToAction,
        ].join("\n"));
        for (const excluded of [request.tone, request.executionBrief!.tone, request.executionBrief!.objective, request.executionBrief!.audience])
          expect(observed.repertoireInstructions).not.toContain(excluded);
      }

      expect(prepared.editorialAffinity).toEqual(scoredReceipt());
      expect(withoutObservation(prepared)).toEqual(
        withoutObservation(baseline)
      );
      expect([...shadow.journal.keys()]).toEqual([...disabled.journal.keys()]);
      expect(
        selectionInputReceiptSchema.parse(shadow.journal.get("selection_input"))
          .editorialAffinity
      ).toEqual(scoredReceipt());
      expect(shadow.generate.mock.calls.map(([p]) => p.messages)).toEqual(
        disabled.generate.mock.calls.map(([p]) => p.messages)
      );
      expect(
        shadow.evaluate.mock.calls.map(([request]) => arsenalHash(request))
      ).toEqual(
        disabled.evaluate.mock.calls.map(([request]) => arsenalHash(request))
      );
      expect(observer.mock.invocationCallOrder[0]).toBeLessThan(
        shadow.generate.mock.invocationCallOrder[0]
      );
      expect(observer.mock.invocationCallOrder[0]).toBeLessThan(
        shadow.evaluate.mock.invocationCallOrder[0]
      );
      expect(
        JSON.stringify(shadow.generate.mock.calls.map(([p]) => p.messages))
      ).not.toContain("controlled-local-model");
      await expect(
        verifyPreparedEligibility(prepared, true, shadow.deps.hydrate)
      ).resolves.toBeUndefined();
    });

    it("keeps generation unchanged when the model is unavailable", async () => {
      const unavailable = editorialAffinityReceiptSchema.parse({
        ...scoredReceipt(),
        status: "unavailable",
        reason: "model_unavailable",
        scores: [],
      });
      const disabled = setup(strategy, async () => undefined);
      const shadow = setup(strategy, async () => unavailable);
      const [baseline, prepared] = await Promise.all([
        disabled.run(),
        shadow.run(),
      ]);
      expect(prepared.editorialAffinity).toEqual(unavailable);
      expect(withoutObservation(prepared)).toEqual(
        withoutObservation(baseline)
      );
    });

    it.each(["throws", "invalid_receipt"] as const)(
      "isolates an observer that %s",
      async fault => {
        const observer = vi.fn(async () => {
          if (fault === "throws")
            throw new Error("private path and prompt must not escape");
          return { ...scoredReceipt(), scores: [{ score: Number.NaN }] } as any;
        });
        const disabled = setup(strategy, async () => undefined);
        const shadow = setup(strategy, observer);
        const [baseline, prepared] = await Promise.all([
          disabled.run(),
          shadow.run(),
        ]);
        expect(prepared.editorialAffinity).toMatchObject({
          status: "unavailable",
          reason: "invalid_output",
          scores: [],
        });
        expect(JSON.stringify(prepared.editorialAffinity)).not.toContain(
          "private path"
        );
        expect(withoutObservation(prepared)).toEqual(
          withoutObservation(baseline)
        );
      }
    );

    it("reuses the stored observation after JSON transport when the configured model changes", async () => {
      const first = setup(strategy, async () => scoredReceipt());
      const prepared = await first.run();
      const persisted = new Map<string, unknown>(
        clone([...first.journal.entries()])
      );
      const changedObserver = vi.fn(async () => ({
        ...scoredReceipt(),
        modelId: "changed-model",
      }));
      const resumed = setup(strategy, changedObserver, persisted);
      const reopened = await resumed.run();
      expect(changedObserver).not.toHaveBeenCalled();
      expect(resumed.generate).not.toHaveBeenCalled();
      expect(resumed.evaluate).not.toHaveBeenCalled();
      expect(reopened).toEqual(prepared);
      expect(reopened.editorialAffinity?.modelId).toBe(
        "controlled-local-model"
      );
      await expect(
        verifyPreparedEligibility(reopened, true, resumed.deps.hydrate)
      ).resolves.toBeUndefined();
    });

    it("does not add observation to a historical receipt when shadow is subsequently enabled", async () => {
      const first = setup(strategy, async () => undefined);
      const prepared = await first.run();
      const observe = vi.fn(async () => scoredReceipt());
      const resumed = setup(
        strategy,
        observe,
        new Map(clone([...first.journal.entries()]))
      );
      const reopened = await resumed.run();
      expect(observe).not.toHaveBeenCalled();
      expect(reopened).toEqual(prepared);
      expect(reopened).not.toHaveProperty("editorialAffinity");
      expect(resumed.journal.get("selection_input")).not.toHaveProperty(
        "editorialAffinity"
      );
    });
  }
);

it("preserves the optional receipt and prepared state through real PostgreSQL JSONB persistence and database reopen", async () => {
  const state = setup(2, async () => scoredReceipt());
  const prepared = await state.run();
  const receipt = selectionInputReceiptSchema.parse(
    state.journal.get("selection_input")
  );
  const directory = await mkdtemp(
    join(tmpdir(), "postspark-affinity-journal-")
  );
  let pg: PGlite | undefined;
  try {
    pg = await generationReleasePostgresFixture({ dataDir: directory });
    const scalar = async (sql: string, args: unknown[] = []) =>
      (await pg!.query<{ value: any }>(sql, args)).rows[0]?.value;
    const requestId = randomUUID();
    await scalar(
      "SELECT postspark.generation_admit($1::uuid,$2::uuid,$3,$4,$5::jsonb,true,now()+interval '10 minutes') AS value",
      [
        requestId,
        releaseOwner,
        input.idempotencyKey,
        arsenalHash(input),
        JSON.stringify(input),
      ]
    );
    const lease = await scalar(
      "SELECT postspark.generation_v5_claim('affinity-persistence-test') AS value"
    );
    const args = [requestId, lease.lease_token];
    await scalar(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection_input','begin',NULL) AS value",
      args
    );
    await scalar(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection_input','complete',$3::jsonb) AS value",
      [...args, JSON.stringify(receipt)]
    );
    await scalar(
      "SELECT postspark.generation_v5_lease_update($1::uuid,$2::uuid,'prepared',$3::jsonb) AS value",
      [...args, JSON.stringify(prepared)]
    );
    await pg.close();
    pg = new PGlite(directory);

    const stored = await scalar(
      "SELECT postspark.generation_v5_operation($1::uuid,$2::uuid,'prepare:selection_input','begin',NULL) AS value",
      args
    );
    expect(stored.state).toBe("completed");
    const reopenedReceipt = selectionInputReceiptSchema.parse(stored.result);
    expect(reopenedReceipt).toEqual(receipt);
    expect(arsenalHash(reopenedReceipt)).toBe(arsenalHash(receipt));
    const reopenedPrepared = await scalar(
      "SELECT prepared AS value FROM postspark.generation_v5_requests WHERE id=$1::uuid",
      [requestId]
    );
    expect(reopenedPrepared.editorialAffinity).toEqual(
      prepared.editorialAffinity
    );
    expect(reopenedPrepared.planning.hash).toBe(prepared.planning!.hash);
    await expect(
      verifyPreparedEligibility(reopenedPrepared, true, state.deps.hydrate)
    ).resolves.toBeUndefined();
  } finally {
    await pg?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
