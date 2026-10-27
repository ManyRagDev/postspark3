import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "../shared/completeDesignGeneration.fixture";
import { instantiateCompleteDesign } from "../shared/completeDesignGeneration";
import { createComponentDefinition } from "../shared/componentAssembly";
import { arsenalHash } from "../shared/arsenalContent";
import { resolveArsenalGeometry } from "../shared/arsenalGeometry";
import { defaultStudioPreferences } from "../shared/studioPreferences";
import { resolveReviewExecutionConfig } from "./ai/workflows/reviewExecutionConfig";
import {
  inspectGenerationEvidence,
  parseGenerationEvidenceArgs,
} from "./generationEvidence";

const id = "b8138b5d-aeca-4628-b752-91f550ffc104";
const owner = "00000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
function fixture(withMedia = false) {
  const proposals = completeDesignTestDefinitions().map((base, slot) => {
    let definition = base;
    if (withMedia && slot === 0) {
      const piece = {
        ...Object.values(base.pieces)[0],
        kind: "media" as const,
        fill: "#D8D8D2",
        fixedText: null,
      };
      const pieceHash = arsenalHash(piece);
      definition = createComponentDefinition({
        ...base,
        pieces: { ...base.pieces, [pieceHash]: piece },
        fragment: {
          ...base.fragment,
          instances: [
            ...base.fragment.instances,
            {
              ...base.fragment.instances[0],
              id: "photo",
              pieceHash,
              parentId: null,
              zIndex: -1,
              x: 0,
              y: 900,
              width: 1080,
              height: 200,
            },
          ],
          mediaSlots: [
            {
              id: "photo",
              label: "Photo",
              function: "Editorial",
              prompt: "Private prompt",
              deferred: true,
              policy: "cover",
            },
          ],
        },
      });
    }
    const composition = resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition,
        values: [
          { fieldId: "field-0", value: "Evento" },
          { fieldId: "field-1", value: "Hoje" },
        ],
        mediaPrompts: [],
        runId: id,
        slot,
        slide: 0,
        planHash: hash,
        experimental: false,
      }),
      {
        measureText: input => ({
          height: input.fontSize * 1.2,
          lines: [
            {
              width: Math.min(
                input.width,
                input.text.length * input.fontSize * 0.25
              ),
            },
          ],
          runs: [
            {
              fill: input.fill,
              fontSize: input.fontSize,
              fontStyle: input.fontStyle,
            },
          ],
        }),
      }
    );
    return {
      contractVersion: 1 as const,
      proposalId: `proposal-${slot}`,
      runId: id,
      slot,
      revision: 1,
      findings: [],
      diagnostics: [],
      status: "ready" as const,
      reviews: [
        {
          policyVersion: 1,
          round: "initial",
          inputHash: hash,
          status: "passed",
          reviewedSlides: [0],
          findings: [],
          limitation: "",
        },
      ],
      bundle: {
        schemaVersion: 1,
        pipeline: "complete-design-v1",
        traceId: id,
        runId: id,
        slot,
        name: definition.label,
        reason: "Fixture",
        family: definition.completeDesign!.family,
        visualPreference: defaultStudioPreferences,
        caption: "Privado",
        hashtags: [],
        slides: [{ id: `slide-${slot}`, role: "static", composition }],
      },
    };
  });
  const operations = [
    {
      operation_key: "prepare:selection",
      state: "completed",
      result: { options: [] },
    },
    ...proposals.flatMap(p =>
      ["copy", `review:initial:${hash}`].map(key => ({
        operation_key: `${p.proposalId}:${key}`,
        state: "completed",
        result: {
          id: `provider-${p.slot}-${key}`,
          model: "fixture-model",
          choices: [],
        },
      }))
    ),
  ];
  return {
    request: {
      id,
      owner_id: owner,
      status: "completed",
      prepared: { imageObligation: { required: false, policy: "optional" } },
      proposals,
      billing_mode: "unlimited",
      billing_debited: 0,
      billing_settled_at: "2026-10-09T12:00:00Z",
      billing_error: null,
    },
    operations,
  };
}
const failedCodes = (input: Parameters<typeof inspectGenerationEvidence>[0]) =>
  inspectGenerationEvidence(input)
    .checks.filter(c => !c.passed)
    .map(c => c.code);

describe("persisted generation evidence", () => {
  it("checks V6 configuration fingerprints and receipt context without rewriting historical readers",()=>{
    const data:any=fixture(); const config=resolveReviewExecutionConfig();
    Object.assign(data.request.prepared,{preparationVersion:2,reviewPolicyVersion:6,reviewExecutionConfig:config,selectedOffers:data.request.proposals.map((p:any)=>({slides:p.bundle.slides.map((s:any)=>({componentId:s.composition.origin.componentAssembly.componentIds[0],componentHash:s.composition.origin.componentAssembly.componentHashes[0]}))}))});
    for(const p of data.request.proposals){
      const key=`${p.proposalId}:review:initial:${hash}`;
      Object.assign(p.reviews[0],{policyVersion:6,factCoverage:[],sourceCoverage:[],operationKeys:[key]});
      data.operations.find((o:any)=>o.operation_key===key).result.__proposalReview={version:1,policyVersion:6,requestId:id,proposalId:p.proposalId,revision:1,round:"initial",inputHash:hash,configurationHash:config.configurationHash,renderHashes:[{slideIndex:0,hash}],anchorInventory:[],aliasMap:{},profile:"standard"};
    }
    expect(failedCodes(data)).toEqual([]);
    const context=data.operations.find((o:any)=>o.operation_key.includes(":review:")).result.__proposalReview;
    context.configurationHash="b".repeat(64);
    expect(failedCodes(data)).toContain("review_receipt_context_pinned");
    context.configurationHash=config.configurationHash;
    context.aliasMap={e1:"b".repeat(64)};
    expect(failedCodes(data)).toContain("review_evidence_alias_integrity");
    data.request.prepared.reviewExecutionConfig.configurationHash="f".repeat(64);
    expect(failedCodes(data)).toContain("review_execution_config_pinned");
  });
  it("checks V7 profile 5 configuration fingerprints and editorial context without altering pin", async () => {
    const { resolveReviewExecutionConfigV7 } = await import("./ai/workflows/reviewExecutionConfigV7");
    const { editorialContextV7 } = await import("./ai/workflows/editorialContextV7");
    const data: any = fixture();
    const config = resolveReviewExecutionConfigV7(5);
    const prompt = "Prompt com marca e público";
    data.request.input = {
      inputType: "text",
      content: prompt,
      executionBrief: {
        creationMode: "execution",
        format: "static",
        platform: "instagram",
        objective: "engage",
        interventionLevel: "optimize_structure",
        contentSourceType: "freeform",
        rawInput: prompt,
        audience: "Desenvolvedores",
        brandEssence: "Ferramentas rápidas",
      },
    };
    const context = editorialContextV7(
      { prompt, executionBrief: data.request.input.executionBrief, contextContent: "contexto" },
      5
    );
    Object.assign(data.request.prepared, {
      preparationVersion: 3,
      reviewPolicyVersion: 7,
      reviewExecutionConfig: config,
      editorialContextHash: context.hash,
      contextContent: "contexto",
      executionBrief: data.request.input.executionBrief,
      selectedOffers: data.request.proposals.map((p: any) => ({
        slides: p.bundle.slides.map((s: any) => ({
          componentId: s.composition.origin.componentAssembly.componentIds[0],
          componentHash: s.composition.origin.componentAssembly.componentHashes[0],
        })),
      })),
    });
    for (const p of data.request.proposals) {
      const key = `${p.proposalId}:review:initial:${hash}`;
      Object.assign(p.reviews[0], {
        policyVersion: 7,
        round: "initial",
        inputHash: hash,
        status: "passed",
        outcome: "reviewed",
        limitation: "",
        reviewedSlides: [0],
        checkedTextUnits: [],
        requirementChecks: [],
        messageAssessment: { status: "preserved", explanation: "" },
        findings: [],
        factCoverage: [],
        sourceCoverage: [],
        operationKeys: [key],
        discardedFields: [],
      });
      data.operations.find((o: any) => o.operation_key === key).result.__proposalReview = {
        version: 2,
        policyVersion: 7,
        requestId: id,
        proposalId: p.proposalId,
        revision: 1,
        round: "initial",
        inputHash: hash,
        configurationHash: config.configurationHash,
        sourceContextHash: context.hash,
        renderHashes: [{ slideIndex: 0, hash }],
        anchorInventory: [],
        aliasMap: {},
        textUnitInventory: [],
        profile: "standard",
      };
    }
    expect(failedCodes(data)).toEqual([]);

    // Tampering with editorialContextHash is caught
    data.request.prepared.editorialContextHash = "f".repeat(64);
    expect(failedCodes(data)).toContain("source_context_matches_prepared_input");
  });
  it("passes canonical three-ready data but honestly reports unavailable normalized provider IDs", () => {
    const evidence = inspectGenerationEvidence(fixture());
    expect(evidence.passed).toBe(true);
    expect(evidence.providerEvidence).toEqual({
      complete: false,
      missingOperationKeys: ["prepare:selection"],
    });
    expect(evidence.verification).toBe("persisted-generation-data-only");
    expect(JSON.stringify(evidence)).not.toContain("Privado");
    expect(JSON.stringify(evidence)).not.toContain(owner);
  });
  it("rejects historical ready deliveries without review, incomplete slide coverage and missing provider receipts", () => {
    const data = fixture();
    delete (data.request.proposals[0] as { reviews?: unknown }).reviews;
    data.request.proposals[1].bundle.slides.push(
      structuredClone(data.request.proposals[1].bundle.slides[0])
    );
    data.operations = data.operations.filter(
      op => op.operation_key !== "proposal-2:copy"
    );
    expect(failedCodes(data)).toEqual(
      expect.arrayContaining([
        "all_slides_review_passed",
        "canonical_delivery",
        "copy_provider_result_persisted",
      ])
    );
  });
  it("reads durable normalized-call receipts, checks every attempt and redacts trace content", () => {
    const data = fixture();
    const selection = data.operations.find(
      op => op.operation_key === "prepare:selection"
    )!;
    Object.assign(selection.result, {
      __generationTrace: {
        version: 1,
        calls: [
          {
            providerId: "actual-selection-id",
            effectiveModel: "actual-model",
            promptTokens: 5,
            completionTokens: 2,
            totalTokens: 7,
            estimatedCostUsd: 0.01,
            costSource: "provider",
            messages: ["private provider prompt"],
            response: { content: "private provider answer" },
          },
        ],
        events: [],
      },
    });
    let evidence = inspectGenerationEvidence(data);
    expect(evidence.providerEvidence.complete).toBe(true);
    expect(
      evidence.operations.find(op => op.key === "prepare:selection")
        ?.providerCalls
    ).toEqual([
      {
        providerId: "actual-selection-id",
        model: "actual-model",
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
        estimatedCostUsd: 0.01,
        costSource: "provider",
      },
    ]);
    expect(JSON.stringify(evidence)).not.toContain("private provider");
    (selection.result as any).__generationTrace.calls.push({
      effectiveModel: "failed-model",
    });
    evidence = inspectGenerationEvidence(data);
    expect(evidence.providerEvidence.missingOperationKeys).toContain(
      "prepare:selection"
    );
  });
  it("rejects partial/cancelled slots and settlement that is still pending", () => {
    const data = fixture();
    Object.assign(data.request, {
      status: "partial",
      billing_settled_at: null,
      billing_error: "retry",
    });
    Object.assign(data.request.proposals[2], { status: "cancelled" });
    expect(failedCodes(data)).toEqual(
      expect.arrayContaining([
        "terminal_completed",
        "three_ready_slots",
        "billing_terminal_settled",
      ])
    );
  });
  it("checks linked proportional reservation, not only a settlement timestamp", () => {
    const data = fixture();
    Object.assign(data.request, {
      billing_mode: "reserved",
      billing_reservation_id: "reservation",
      billing_reserved: 10,
      billing_preparation: 1,
      billing_per_proposal: 3,
      billing_debited: 10,
    });
    const reservation = {
      id: "reservation",
      user_uuid: owner,
      status: "committed",
      amount: 10,
    };
    expect(inspectGenerationEvidence({ ...data, reservation }).passed).toBe(
      true
    );
    expect(
      failedCodes({ ...data, reservation: { ...reservation, amount: 9 } })
    ).toContain("billing_reservation_terminal");
    Object.assign(data.request, { billing_debited: 9 });
    expect(failedCodes({ ...data, reservation })).toContain(
      "billing_amount_matches_deliveries"
    );
  });
  it("demands filled native media and the matching persisted slot operation", () => {
    const data = fixture(true);
    const scene = data.request.proposals[0].bundle.slides[0].composition;
    expect(failedCodes(data)).toEqual(
      expect.arrayContaining([
        "required_media_private",
        "media_operation_persisted",
      ])
    );
    const url = `/api/post-media/${owner}/${hash}`;
    scene.media.photo = { kind: "user", url, focalX: 0.5, focalY: 0.5 };
    data.operations.push({
      operation_key: "proposal-0:image:0:photo",
      state: "completed",
      result: { url },
    } as any);
    expect(inspectGenerationEvidence(data).passed).toBe(true);
    expect(JSON.stringify(inspectGenerationEvidence(data))).not.toContain(url);
    delete scene.media.photo;
    Object.assign(data.request.prepared, {
      perProposalImageObligations: [{ required: true, policy: "required" }],
    });
    expect(failedCodes(data)).toContain("image_obligation_filled");
  });
  it("reproduces a delivered 4:5 document saved as 1:1 and detects changed or unrelated compositions", () => {
    const data = fixture(),
      bundle = data.request.proposals[1].bundle;
    const canvas = {
      id: `cd-${id}-1`,
      modelVersion: 2,
      aspectRatio: "4:5",
      completeDesign: { runId: id, traceId: id, slot: 1 },
      slides: structuredClone(bundle.slides),
    };
    const post = { id: 123, user_uuid: owner, canvas_model: canvas };
    expect(inspectGenerationEvidence({ ...data, post }).passed).toBe(true);
    canvas.aspectRatio = "1:1";
    expect(failedCodes({ ...data, post })).toContain(
      "saved_aspect_matches_delivery"
    );
    canvas.aspectRatio = "4:5";
    canvas.slides[0].composition.artboard.background = "#111111";
    expect(failedCodes({ ...data, post })).toContain(
      "saved_compositions_match_delivery"
    );
    canvas.completeDesign.runId = owner;
    expect(failedCodes({ ...data, post })).toContain("saved_document_identity");
    expect(failedCodes({ ...data, post: null })).toContain(
      "saved_post_same_owner"
    );
  });
  it("requires one explicit UUID and validates optional post/output flags before DB access", () => {
    expect(
      parseGenerationEvidenceArgs([
        "--id",
        id,
        "--post-id",
        "123",
        "--output",
        "/tmp/evidence.json",
      ])
    ).toEqual({ id, postId: 123, output: "/tmp/evidence.json" });
    for (const args of [
      [],
      ["--prompt", "same content"],
      ["--id", "latest"],
      ["--id", id, "--id", id],
      ["--id", id, "--post-id", "0"],
      ["--id", id, "--post-id", "1.5"],
      ["--id", id, "--post-id", "99999999999999999999"],
      ["--id", id, "file.json"],
    ])
      expect(() => parseGenerationEvidenceArgs(args)).toThrow();
  });
  it("validates context-handoff-history pinned receipts against tampering", async () => {
    const historyFixture = (await import("./ai/workflows/fixtures/context-handoff-history.json")).default;
    const { resolveReviewExecutionConfigV7 } = await import("./ai/workflows/reviewExecutionConfigV7");

    const config = resolveReviewExecutionConfigV7(5);
    expect(config.contractHash).toBe(historyFixture.reviewContractHashes.v5);

    for (const [, policyData] of Object.entries(historyFixture.reviewPolicies)) {
      expect(policyData.policyVersion).toBeGreaterThanOrEqual(5);
    }
  });
});
