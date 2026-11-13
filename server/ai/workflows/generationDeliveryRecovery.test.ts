import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { assemblyIdentity, compactComponentCard, componentHash, createComponentDefinition, type ComponentDefinitionV1 } from "@shared/componentAssembly";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { DELIVERY_RECOVERY_KEY, sealGenerationPlanningReceipt, type ViableGenerationPlan } from "@shared/generationPlan";
import { GenerationFailureError } from "@shared/generationFailure";
import { resolveGenerationModelConfig } from "../generationModel";
import { resolveReviewExecutionConfigV10, reviewContractHashV10, assertReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import { editorialContextV9 } from "./editorialContextV9";
import { executeProposalWorkflow, type ProposalExecutionInput, type ProposalGraphDeps } from "./proposalGraph";
import { recoverGenerationDelivery, deliveryRecoveryHistory } from "./generationDeliveryRecovery";
import { GenerationCoordinator } from "./generationCoordinator";
import { compactCopyPrompt } from "./compactProposalCopy";

vi.mock("./proposalReview", async original => ({
  ...(await original<typeof import("./proposalReview")>()),
  reviewProposal: vi.fn(async (_input, _deps, _definitions, compositions, _copy, round) => ({
    policyVersion: 1, round, inputHash: "a".repeat(64), status: "passed", findings: [], limitation: "",
    reviewedSlides: compositions.map((_composition: unknown, index: number) => index),
  })),
}));
const actor = "00000000-0000-4000-8000-000000000001";
const source = completeDesignTestDefinitions()[0];
const originalCopy = { caption: "Legenda preservada", hashtags: ["#original"], slides: [{
  values: [{ fieldId: "field-0", value: "Café artesanal" }, { fieldId: "field-1", value: "Conheça a cafeteria" }], mediaPrompts: [],
}] };
const measureText: NonNullable<ProposalGraphDeps["measureText"]> = value => ({
  height: 20, lines: [{ width: 100 }], runs: [{ fill: value.fill, fontSize: value.fontSize, fontStyle: value.fontStyle }],
});

describe("bounded delivery progression", () => {
  function sized(name: string, width: number) {
    const d = design(name);
    return createComponentDefinition({ ...d, fragment: { ...d.fragment,
      instances: d.fragment.instances.map((instance, index) => index ? instance : { ...instance, width }),
      relations: d.fragment.relations.map(relation => relation.kind === "textFit" && relation.outputs.some(output => output.targetId === d.fragment.instances[0].id)
        ? { ...relation, parameters: { ...relation.parameters, maxWidth: width } } : relation),
    } });
  }
  async function journey(options: { exhausted?: boolean; uncertain?: boolean; quota?: boolean; loseDelivery?: boolean } = {}) {
    const narrow = sized("narrow-reserve", 901), wide = sized("wide-reserve", 940);
    const s = fixture([narrow, wide]);
    const readyDefs = [design("ready-one"), design("ready-two")];
    const response = (copy: unknown) => ({ choices: [{ message: { content: JSON.stringify(copy) } }] });
    const saved = await Promise.all(readyDefs.map((definition, index) => executeProposalWorkflow({ ...s.args.input,
      proposalId: `p-${actor}-${index + 1}`, slot: index + 1, selectedDefinitions: [definition],
    }, { actor, measureText, generateText: vi.fn(async () => response(originalCopy)) })));
    const healthy = structuredClone(originalCopy), oversized = structuredClone(originalCopy);
    oversized.slides[0].values[0].value = "LONG café artesanal";
    const generateText = vi.fn(async (params: Parameters<ProposalGraphDeps["generateText"]>[0]) => {
      if (options.quota) throw new GenerationFailureError("provider_rejected", "copy");
      const prompt = JSON.parse(String(params.messages[1].content));
      if (prompt.recovery) {
        expect(prompt.recovery.previousCopy).toEqual(oversized);
        expect(JSON.stringify(prompt.editorial ?? prompt)).toContain(s.args.input.prompt);
        return response(healthy);
      }
      return response(oversized);
    });
    const graphMeasure: typeof measureText = value => ({ ...measureText(value),
      height: value.text.includes("LONG") || value.text === "Café artesanal" && (options.exhausted || value.width < 920) ? 5000 : 20,
    });
    const journal = new Map<string, any>();
    const records = () => Array.from(journal, ([operationKey, result]) => ({ operationKey, result, state: "completed" }));
    const allDefs = [source, narrow, wide];
    const args = { ...s.args.input, actor, selectedDefinitions: [[source], ...readyDefs.map(d => [d])],
      planning: s.args.planning, savedProposals: saved };
    const deliver = vi.fn(async () => { if (options.loseDelivery) { options.loseDelivery = false; throw Error("lost delivery response"); } });
    const deps = {
      actor, generateText, measureText: graphMeasure, deliver,
      uncertainOperations: async () => Boolean(options.uncertain),
      operationForProposal: (id: string) => async ({ operationKey }: { operationKey: string }, work: () => Promise<unknown>) => {
        const key = `${id}:${operationKey}`;
        if (!journal.has(key)) journal.set(key, await work());
        return journal.get(key);
      },
      recoverDelivery: async (input: ProposalExecutionInput, reuseOriginal: boolean, context?: Parameters<NonNullable<import("./generationCoordinator").GenerationCoordinatorDeps["recoverDelivery"]>>[2]) => {
        const history = deliveryRecoveryHistory(records(), input.proposalId, context!.recoveryAttempt);
        const previous = history.previous;
        return recoverGenerationDelivery({ ...context, planning: s.args.planning, input, reuseOriginal,
          sourceDefinitions: previous ? previous.plan.pages.map(page => allDefs.find(d => d.id === page.componentId)!) : context!.sourceDefinitions,
          excludedCandidateIds: [...context!.excludedCandidateIds, ...history.candidateIds],
          readOriginalCopy: async () => {
            const op = journal.get(`${previous?.attemptId ?? context!.sourceAttemptId}:copy`);
            return op ? JSON.parse(op.choices[0].message.content) : previous?.copy;
          },
          hydrate: async ids => allDefs.filter(d => ids.includes(d.id)), graphDeps: { measureText: graphMeasure },
          operation: async (key, work) => {
            const full = `${input.proposalId}:${key}`;
            if (!journal.has(full)) journal.set(full, await work());
            return journal.get(full);
          },
        });
      },
    };
    const snapshot = await new GenerationCoordinator(args, deps).start();
    return { snapshot, args, deps, saved, generateText, journal, deliver, wide };
  }
  it("delivers three with two existing ready documents, adapting once then moving to a measured fitting reserve", async () => {
    const s = await journey();
    expect(s.snapshot.overallStatus).toBe("completed");
    expect(s.snapshot.proposals.map(p => p.status)).toEqual(["ready", "ready", "ready"]);
    expect(s.snapshot.proposals.slice(1)).toEqual(s.saved);
    expect(s.snapshot.proposals[0].bundle?.family).toBe(s.wide.completeDesign!.family);
    expect(s.snapshot.proposals[0].proposalId).toBe(`p-${actor}-0`);
    expect(s.snapshot.proposals[0].attempt?.index).toBe(2);
    expect(s.generateText).toHaveBeenCalledTimes(2); // original + one semantic adaptation; transfer is local
    expect(s.deliver).toHaveBeenCalledTimes(1);
  });
  it("replays fb2 after a lost delivery without another inference or revisiting a failed candidate", async () => {
    const s = await journey({ loseDelivery: true });
    expect(s.snapshot.proposals[0].status).toBe("delivery_pending");
    const resumed = await new GenerationCoordinator({ ...s.args, savedProposals: s.snapshot.proposals }, s.deps).start();
    expect(resumed.overallStatus).toBe("completed");
    expect(resumed.proposals.slice(1)).toEqual(s.saved);
    expect(s.generateText).toHaveBeenCalledTimes(2);
    expect(s.journal.size).toBeGreaterThan(2);
  });
  it.each(["exhausted", "uncertain", "quota"] as const)("stops safely for %s without changing the two ready documents", async reason => {
    const s = await journey({ [reason]: true });
    expect(s.snapshot.overallStatus).not.toBe("completed");
    expect(s.snapshot.proposals.slice(1)).toEqual(s.saved);
    expect(s.generateText.mock.calls.length).toBeLessThanOrEqual(3);
    if (reason === "exhausted") expect(s.generateText).toHaveBeenCalledTimes(3);
    if (reason !== "exhausted") expect(s.generateText).toHaveBeenCalledTimes(1);
  });
});
function design(name: string, media: "deferred" | "authored" | "missing" | false = false) {
  const base = completeDesignTestDefinitions()[1];
  const piece = { ...Object.values(base.pieces)[0], kind: "media" as const, fixedText: null,
    ...(media === "authored" ? { imageAssetId: "photo" } : {}),
  };
  const hash = arsenalHash(piece);
  return createComponentDefinition({ ...base, id: assemblyIdentity(name), completeDesign: { ...base.completeDesign!, family: name },
    pieces: media ? { ...base.pieces, [hash]: piece } : base.pieces,
    assets: media === "authored" ? [...base.assets, { id: "photo", kind: "bundled", sha256: "f".repeat(64), mimeType: "image/png", bytes: 10 }] : base.assets,
    fragment: { ...base.fragment,
      instances: media ? [...base.fragment.instances, { id: "reaction-slot", pieceHash: hash, parentId: null, zIndex: 1, x: 800, y: 900, width: 100, height: 100, rotation: 0, opacity: 1 }] : base.fragment.instances,
      assetIds: media === "authored" ? [...base.fragment.assetIds, "photo"] : base.fragment.assetIds,
      mediaSlots: media === "deferred" ? [{ id: "reaction-slot", label: "Reaction", function: "Editorial", prompt: "Café", deferred: true, policy: "cover" }] : [],
    },
  });
}
function fixture(reserves: ComponentDefinitionV1[], options: { historical?: boolean; manual?: boolean; reuse?: boolean; preserved?: unknown; automaticReviewVersion?: 2 | 3 | 4 } = {}) {
  const generationConfig = resolveGenerationModelConfig({ generationModel: options.manual ? "gemini" : "auto", postMode: "static" });
  const { configurationHash: _hash, ...reviewConfig } = resolveReviewExecutionConfigV10(generationConfig.model, generationConfig.taskRouting?.copy);
  if (options.historical) delete reviewConfig.automaticReviewVersion;
  else if (!options.manual) reviewConfig.automaticReviewVersion = options.automaticReviewVersion ?? 3;
  if (reviewConfig.automaticReviewVersion !== 4) {
    delete reviewConfig.localContrastPolicyVersion;
    delete reviewConfig.textFlexibilityVersion;
    delete reviewConfig.visualTextRepairVersion;
    delete reviewConfig.profileHandlePolicyVersion;
    delete reviewConfig.nativeGlyphProjection;
    delete reviewConfig.nativeGlyphManifestHash;
  }
  reviewConfig.contractHash = reviewContractHashV10(false, Boolean(reviewConfig.taskModelConfig), reviewConfig.nativeInventoryVersion, reviewConfig.automaticReviewVersion);
  const reviewExecutionConfig = assertReviewExecutionConfigV10({ ...reviewConfig, configurationHash: arsenalHash(reviewConfig) });
  const input: ProposalExecutionInput = {
    requestId: actor, runId: actor, proposalId: "reserve-test", slot: 0, selectedDefinition: source,
    postMode: "static", prompt: "Apresente a cafeteria. Prefiro uma arte sem foto.", generationConfig,
    reviewPolicyVersion: 10, reviewExecutionConfig,
    imageObligation: { policy: "optional", required: false, purpose: "none", slotTargets: 0, reason: "Nenhuma imagem solicitada" },
  };
  input.editorialContext = editorialContextV9(input); input.editorialContextHash = input.editorialContext.hash;
  const offer = (definition: ComponentDefinitionV1) => resolveDesignFamilyRepertoires([compactComponentCard(definition)], { slideCount: 1, contentMode: "compose" })[0].defaultOffer;
  const plan = (definition: ComponentDefinitionV1): ViableGenerationPlan => ({
    slot: 0, status: "viable", candidateId: offer(definition).offerId, reason: "Reserva compatível", editorialApproach: "Apresentação", captionContentIds: [],
    pages: [{ slideIndex: 0, componentId: definition.id, purpose: "Apresentar", rhythm: "highlight", assignments: [
      { fieldId: "field-0", contentIds: [], itemCount: null, instruction: "Apresentar" },
      { fieldId: "field-1", contentIds: [], itemCount: null, instruction: "Apoiar" },
    ] }],
  });
  const planning = sealGenerationPlanningReceipt({ version: 1, proposalSelectionVersion: 1,
    intent: { version: 1, objective: input.prompt, adaptation: "controlled", tone: { description: "Claro", origin: "inferred", rationale: "Apresentação" }, requirements: [], content: [] },
    slots: [plan(source), ...[1, 2].map(slot => ({ slot, status: "insufficient_fit" as const, reason: "Sem outra proposta", unmetRequirementIds: [] }))],
    offers: [offer(source), null, null], catalogReceiptHash: null, candidates: [], selectorIds: [], ranking: [], recoveryRepertoires: [[], [], []],
    deliveryReserves: [reserves.map(definition => ({ family: definition.completeDesign!.family, plan: plan(definition), componentHashes: [definition.hash] })), [], []],
  });
  const snapshots = JSON.stringify({ input, planning, source, reserves, originalCopy });
  const journal = new Map<string, unknown>();
  if (options.preserved) journal.set(DELIVERY_RECOVERY_KEY, options.preserved);
  const performed = vi.fn();
  const hydrate = vi.fn(async (ids: string[]) => [source, ...reserves].filter(definition => ids.includes(definition.id)));
  const readOriginalCopy = vi.fn(async () => structuredClone(originalCopy));
  const args: Parameters<typeof recoverGenerationDelivery>[0] = {
    planning, sourceDefinitions: [source], input, reuseOriginal: options.reuse ?? true, readOriginalCopy, hydrate,
    graphDeps: { measureText },
    operation: async (key, work) => {
      if (!journal.has(key)) { performed(key); journal.set(key, await work()); }
      return journal.get(key) as any;
    },
  };
  return { args, journal, performed, hydrate, readOriginalCopy, plan, assertImmutable: () => expect(JSON.stringify({ input, planning, source, reserves, originalCopy })).toBe(snapshots) };
}

describe("local reserve preflight pinned to automatic review v2/v3", () => {
  it("adapts the message to different native roles instead of repeating the failed design", async () => {
    const next = createComponentDefinition({ ...design("different-roles"), fragment: {
      ...source.fragment, bindings: source.fragment.bindings.map((binding, index) => index ? {
        ...binding, source: "block:label:0:text",
      } : binding),
    } });
    const s = fixture([next], { automaticReviewVersion: 4 });
    const recovered = await recoverGenerationDelivery({ ...s.args, excludedCandidateIds: [s.plan(source).candidateId] });
    expect(recovered?.definitions).toEqual([next]);
    expect(recovered?.recoveryCopy).toBeUndefined();
    expect(recovered?.recoverySourceCopy).toEqual(originalCopy);
    expect(recovered?.rewriteForRecovery).toBe(true);
    const prompt = JSON.parse(compactCopyPrompt({ ...s.args.input, ...recovered }, [next]));
    expect(prompt.recovery.previousCopy).toEqual(originalCopy);
    expect(JSON.stringify(prompt.editorial)).toContain(s.args.input.prompt);
    expect(prompt.recovery.instruction).toContain("Preserve fatos");
    s.assertImmutable();
  });

  it("journals progress separately and skips failed/claimed candidates without buying copy", async () => {
    const first = design("first"), second = design("second");
    const s = fixture([first, second], { reuse: false });
    const alias = structuredClone(s.args.planning.deliveryReserves![0][0]);
    alias.plan.candidateId = "alias-of-the-same-native-pages";
    s.args.planning.deliveryReserves![0].splice(1, 0, alias);
    const one = await recoverGenerationDelivery({ ...s.args, recoveryAttempt: 1 });
    const two = await recoverGenerationDelivery({ ...s.args, recoveryAttempt: 2,
      excludedCandidateIds: [s.plan(first).candidateId], excludedFamilies: [source.completeDesign!.family] });
    expect(one?.definitions).toEqual([first]);
    expect(two?.definitions).toEqual([second]);
    expect(s.journal.has("delivery_recovery:2:candidate")).toBe(true);
    expect(await recoverGenerationDelivery({ ...s.args, recoveryAttempt: 2 })).toEqual(two);
    expect(s.performed).toHaveBeenCalledTimes(2);
  });

  it("claims a replacement synchronously after async probes so two slots cannot duplicate a family", async () => {
    const shared = design("shared"), other = design("other");
    const a = fixture([shared, other], { reuse: false }), b = fixture([shared, other], { reuse: false });
    const owners = new Map<string, number>();
    const claim = (slot: number) => (family: string) => {
      const owner = owners.get(family);
      if (owner !== undefined && owner !== slot) return false;
      owners.set(family, slot); return true;
    };
    const result = await Promise.all([a, b].map((s, slot) => recoverGenerationDelivery({ ...s.args, claimFamily: claim(slot) })));
    // The second slot scans past a reserve claimed while it was hydrating.
    expect(result.filter(Boolean)).toHaveLength(2);
    expect(result.map(r => r!.definitions[0].completeDesign!.family).sort()).toEqual(["other", "shared"]);
  });
  it("skips an impossible raster reserve before recording a candidate or buying copy", async () => {
    const impossible = design("missing-raster", "deferred"), next = design("typographic");
    const s = fixture([impossible, next], { reuse: false });
    const result = await recoverGenerationDelivery(s.args);
    expect(result?.definitions).toEqual([next]);
    expect(result?.rewriteForRecovery).toBe(true);
    expect(s.readOriginalCopy).not.toHaveBeenCalled();
    expect(s.journal.get(DELIVERY_RECOVERY_KEY)).toMatchObject({ mode: "write_for_design", localPreflightVersion: 1, plan: s.plan(next) });
    expect(s.performed).toHaveBeenCalledTimes(1);
    s.assertImmutable();
  });

  it.each([2, 3, 4] as const)("reuses healthy copy after skipping impossible reserves and replays without another provider call (review v%s)", async automaticReviewVersion => {
    const s = fixture([design("missing-raster", "deferred"), design("typographic")], { automaticReviewVersion });
    const recovered = await recoverGenerationDelivery(s.args);
    expect(recovered?.recoveryCopy).toEqual(originalCopy);
    expect(recovered?.rewriteForRecovery).toBe(false);
    const generateText = vi.fn().mockRejectedValue(new Error("unexpected_provider_call"));
    const result = await executeProposalWorkflow({ ...s.args.input, ...recovered, selectedDefinitions: recovered!.definitions, deliveryRecoveryEnabled: true }, { actor, generateText, measureText });
    expect(result.status, result.errorReason).toBe("ready");
    expect(result.bundle?.caption).toBe(originalCopy.caption);
    expect(generateText).not.toHaveBeenCalled();
    expect(await recoverGenerationDelivery(s.args)).toEqual(recovered);
    expect(s.performed).toHaveBeenCalledTimes(1);
    expect(s.readOriginalCopy).toHaveBeenCalledTimes(1);
    s.assertImmutable();
  });

  it("continues measuring later reserves when the existing copy cannot fit the first", async () => {
    const narrow = design("narrow"), wide = design("wide");
    const s = fixture([narrow, wide]);
    s.args.graphDeps.measureText = value => ({ ...measureText(value), height: value.width === 901 ? 5000 : 20 });
    narrow.fragment.instances[0].width = 901; narrow.hash = componentHash(narrow);
    s.args.planning.deliveryReserves![0][0].componentHashes[0] = narrow.hash;
    const result = await recoverGenerationDelivery(s.args);
    expect(result?.definitions).toEqual([wide]);
    expect(result?.recoveryCopy).toEqual(originalCopy);
  });

  it.each(["missing-asset", "broken-binding", "unverified"] as const)("skips %s without choosing it for a rewrite", async invalid => {
    const broken = design("broken", invalid === "missing-asset" ? "authored" : false), next = design("next");
    const s = fixture([broken, next], { reuse: false });
    if (invalid === "missing-asset") broken.assets = broken.assets.filter(asset => asset.id !== "photo");
    if (invalid === "broken-binding") broken.fragment.bindings[0].targetIds = ["unknown-instance"];
    if (invalid === "unverified") broken.completeDesign!.baselineVerified = false;
    broken.hash = componentHash(broken); s.args.planning.deliveryReserves![0][0].componentHashes[0] = broken.hash;
    expect((await recoverGenerationDelivery(s.args))?.definitions).toEqual([next]);
  });

  it("allows an authored image without purchasing media or applying a photographic style filter", async () => {
    const authored = design("authored", "authored");
    const s = fixture([authored], { reuse: false });
    s.args.input.imageObligation!.policy = "forbidden";
    s.args.planning.visualRequirements = { version: 1, chromaticPortal: { quote: "Quero um portal cromático" } };
    expect((await recoverGenerationDelivery(s.args))?.definitions).toEqual([authored]);
  });

  it("allows deferred slots for a genuine required image task", async () => {
    const deferred = design("required-photo", "deferred"), s = fixture([deferred], { reuse: false });
    s.args.input.imageObligation = { policy: "required", required: true, purpose: "editorial-photo", slotTargets: 1, reason: "Foto solicitada" };
    expect((await recoverGenerationDelivery(s.args))?.definitions).toEqual([deferred]);
  });

  it.each([{ historical: true }, { manual: true }])("preserves historical/manual decisions for %j", async options => {
    const deferred = design("old-optional-photo", "deferred"), s = fixture([deferred, design("next")], { ...options, reuse: false });
    expect((await recoverGenerationDelivery(s.args))?.definitions).toEqual([deferred]);
    expect(s.journal.get(DELIVERY_RECOVERY_KEY)).not.toHaveProperty("localPreflightVersion");
    s.assertImmutable();
  });

  it("fails a persisted incompatible candidate explicitly without selecting another or rerunning work", async () => {
    const impossible = design("persisted-impossible", "deferred"), s = fixture([impossible, design("next")]);
    const decision = { localPreflightVersion: 1, mode: "write_for_design", plan: s.plan(impossible) };
    s.journal.set(DELIVERY_RECOVERY_KEY, decision);
    const result = recoverGenerationDelivery(s.args);
    await expect(result).rejects.toBeInstanceOf(GenerationFailureError);
    await expect(result).rejects.toMatchObject({ failure: { code: "catalog_component_ineligible", stage: "selection", retryable: false } });
    expect(s.journal.get(DELIVERY_RECOVERY_KEY)).toBe(decision);
    expect(s.performed).not.toHaveBeenCalled();
    expect(s.readOriginalCopy).not.toHaveBeenCalled();
    expect(s.hydrate).toHaveBeenCalledTimes(1);
    s.assertImmutable();
  });
});
