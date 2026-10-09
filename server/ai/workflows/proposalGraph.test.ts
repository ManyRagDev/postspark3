import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignVariationV1Schema } from "@shared/completeDesignGeneration";
import { proposalDeliverySchema } from "@shared/generationContracts";
import {
  executeProposalWorkflow,
  type ProposalGraphDeps,
  type ProposalExecutionInput,
} from "./proposalGraph";
import { GenerationCoordinator } from "./generationCoordinator";
import { createComponentTextMeasurer } from "../componentTextMeasurer";

const actor = "00000000-0000-4000-8000-000000000001";
const runId = "00000000-0000-4000-8000-000000000002";

function copyFor(
  definition: ReturnType<typeof completeDesignTestDefinitions>[number],
  title = "Café artesanal"
) {
  const fields = [
    { fieldId: "field-0", value: title },
    { fieldId: "field-1", value: "Visite nosso espaço hoje." },
  ];
  return {
    caption: "Café especial moído na hora",
    hashtags: ["#cafe", "#artesanal"],
    slides: [
      {
        values: fields,
        mediaPrompts: (definition.fragment.mediaSlots ?? []).map(slot => ({
          slotId: slot.id,
          prompt: "Xícara de café com latte art",
        })),
      },
    ],
  };
}

function copyForSlides(
  definitions: ReturnType<typeof completeDesignTestDefinitions>,
  titles: string[]
) {
  const first = copyFor(definitions[0]);
  return {
    ...first,
    slides: definitions.map((definition, index) => ({
      ...copyFor(definition, titles[index]).slides[0],
    })),
  };
}

function textDeps(
  response: unknown,
  overrides: Partial<ProposalGraphDeps> = {}
): ProposalGraphDeps {
  const generateText = vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(response) } }],
  });
  return {
    generateText,
    actor,
    // Explicit test measurement. Production defaults to createComponentTextMeasurer.
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
    ...overrides,
  };
}

function workflowInput(
  definition: ReturnType<typeof completeDesignTestDefinitions>[number],
  overrides: Partial<ProposalExecutionInput> = {}
): ProposalExecutionInput {
  return {
    requestId: "req-1",
    runId,
    proposalId: "proposal-1",
    slot: 0,
    prompt: "Post sobre cafeteria artesanal",
    selectedDefinition: definition,
    ...overrides,
  };
}

function withMediaSlot(
  base: ReturnType<typeof completeDesignTestDefinitions>[number],
  id: string
) {
  const mediaPiece = {
    kind: "media" as const,
    fill: "#D8D8D2",
    stroke: null,
    strokeWidth: 0,
    cornerRadius: 0,
    points: [],
    fontFamily: "Arial",
    fontAssetId: null,
    fontSize: 20,
    fontWeight: 400,
    align: "left" as const,
    lineHeight: 1.15,
    letterSpacing: 0,
    fixedText: null,
  };
  const mediaHash = arsenalHash(mediaPiece);
  const slot = {
    id,
    label: "Foto",
    function: "Imagem editorial",
    prompt: "Café",
    deferred: true,
    policy: "cover" as const,
  };
  const definition = createComponentDefinition({
    ...base,
    pieces: { ...base.pieces, [mediaHash]: mediaPiece },
    fragment: {
      ...base.fragment,
      instances: [
        ...base.fragment.instances,
        {
          id,
          pieceHash: mediaHash,
          parentId: null,
          zIndex: -1,
          x: 0,
          y: 0,
          width: 1080,
          height: 700,
          rotation: 0,
          opacity: 1,
        },
      ],
      mediaSlots: [...(base.fragment.mediaSlots ?? []), slot],
    },
  });
  return { definition, slot };
}

describe("Proposal Graph Workflow (canonical V1 delivery)", () => {
  it("round-trips ready through the canonical contract and defaults omitted preferences", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      textDeps(copyFor(definition))
    );

    expect(
      result.status,
      `${result.errorReason} ${JSON.stringify(result.findings)} ${JSON.stringify(result.diagnostics)}`
    ).toBe("ready");
    expect(result.contractVersion).toBe(1);
    expect(result.bundle?.visualPreference).toEqual({
      enabled: false,
      language: null,
      intensity: "auto",
    });
    const parsedDelivery = proposalDeliverySchema.parse(result);
    const parsedBundle = completeDesignVariationV1Schema.parse(
      parsedDelivery.bundle
    );
    expect(parsedBundle.runId).toBe(runId);
    expect(parsedBundle.traceId).toBe(runId);
    expect(parsedBundle.slot).toBe(0);
    expect(parsedBundle.slides).toHaveLength(1);
  });

  it("rejects a ready contract without a valid bundle or with a mismatched identity", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      textDeps(copyFor(definition))
    );
    expect(
      proposalDeliverySchema.safeParse({ ...result, bundle: undefined }).success
    ).toBe(false);
    expect(
      proposalDeliverySchema.safeParse({
        ...result,
        bundle: { ...result.bundle, runId: actor },
      }).success
    ).toBe(false);
  });

  it("preserves the full native scene and applies literal visual_only constraints", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const originalFragment = structuredClone(definition.fragment);
    const response = copyFor(definition, "Mantenha exatamente: Café artesanal");
    response.slides[0].values[1].value = "Visite nosso espaço hoje.";
    const deps = textDeps(response);
    const result = await executeProposalWorkflow(
      workflowInput(definition, {
        executionBrief: {
          creationMode: "execution",
          format: "static",
          platform: "instagram",
          objective: "engage",
          interventionLevel: "visual_only",
          contentSourceType: "text",
          rawInput: "Café artesanal",
          mustKeep: ["Café artesanal"],
          mustInclude: [],
          forbiddenTerms: ["imperdível"],
        } as any,
      }),
      deps
    );

    expect(result.status).toBe("ready");
    expect(deps.generateText).toHaveBeenCalledTimes(1);
    const messages = deps.generateText.mock.calls[0][0].messages;
    expect(JSON.stringify(messages)).toContain("visual_only");
    expect(JSON.stringify(messages)).toContain("Café artesanal");
    expect(definition.fragment).toEqual(originalFragment);
    const composition = result.bundle!.slides[0].composition;
    expect(composition.base).toEqual(
      expect.objectContaining({ artboard: originalFragment.artboard })
    );
    expect(composition.elements.length).toBeGreaterThan(0);
    expect(composition.pieces).toEqual(definition.pieces);
  });

  it("uses verified Fontkit measurement by default and rejects real overflow", async () => {
    const [base] = completeDesignTestDefinitions();
    const { definition } = withMediaSlot(base, "photo-overflow");
    const measurer = await createComponentTextMeasurer(definition.assets);
    const title = "W".repeat(300);
    const createTextMeasurer = vi.fn(async () => measurer);
    const mediaAdapter = {
      generate: vi.fn().mockResolvedValue({
        url: `/api/post-media/${actor}/${"c".repeat(64)}`,
      }),
    };
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      textDeps(copyFor(definition, title), {
        measureText: undefined,
        createTextMeasurer,
        mediaAdapter,
      })
    );
    expect(createTextMeasurer).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("failed");
    expect(
      result.findings.some(finding => finding.rule.startsWith("overflow"))
    ).toBe(true);
    expect(result.bundle).toBeUndefined();
    expect(mediaAdapter.generate).not.toHaveBeenCalled();
  });

  it("fails before copy generation when a component font cannot be loaded", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const deps = textDeps(copyFor(definition), {
      measureText: undefined,
      createTextMeasurer: vi
        .fn()
        .mockRejectedValue(new Error("component_font_unavailable")),
    });
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("component_font_unavailable");
    expect(deps.generateText).not.toHaveBeenCalled();
  });

  it("keeps contrast:unknown as a non-blocking diagnostic and persists media for its native slot", async () => {
    const [base] = completeDesignTestDefinitions();
    const { definition, slot } = withMediaSlot(base, "photo-1");
    const mediaAdapter = {
      generate: vi.fn().mockResolvedValue({
        url: `/api/post-media/${actor}/${"a".repeat(64)}`,
      }),
    };
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      textDeps(copyFor(definition), { mediaAdapter })
    );

    expect(mediaAdapter.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: actor,
        slot: expect.objectContaining({
          id: slot.id,
          width: 1080,
          height: 700,
        }),
      })
    );
    expect(
      result.status,
      `${result.errorReason} ${JSON.stringify(result.findings)} ${JSON.stringify(result.diagnostics)}`
    ).toBe("ready");
    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "contrast_unknown" })
    );
    expect(result.bundle?.slides[0].composition.media[slot.id].url).toBe(
      `/api/post-media/${actor}/${"a".repeat(64)}`
    );
  });

  it("preserves a three-slide native carousel with authored slide roles", async () => {
    const definitions = completeDesignTestDefinitions();
    const sameFamily = definitions.map((definition, index) => ({
      ...definition,
      completeDesign: {
        ...definition.completeDesign,
        family: "carousel-editorial",
      },
      label: `Slide ${index + 1}`,
    }));
    const response = copyForSlides(sameFamily, [
      "Capa",
      "Desenvolvimento",
      "Fechamento",
    ]);
    const result = await executeProposalWorkflow(
      workflowInput(sameFamily[0], {
        selectedDefinitions: sameFamily,
        selectedDefinition: undefined,
        postMode: "carousel",
      }),
      textDeps(response)
    );

    expect(result.status).toBe("ready");
    expect(result.bundle?.slides.map(slide => slide.role)).toEqual([
      "cover",
      "development",
      "closing",
    ]);
    expect(
      result.bundle?.slides.map(slide => slide.composition.content.blocks[0])
    ).toEqual([
      expect.objectContaining({ text: "Capa" }),
      expect.objectContaining({ text: "Desenvolvimento" }),
      expect.objectContaining({ text: "Fechamento" }),
    ]);
  });

  it("uses operation checkpoints and reuses completed copy and per-slot media on retry", async () => {
    const [base] = completeDesignTestDefinitions();
    const { definition } = withMediaSlot(base, "photo-1");
    const response = copyFor(definition);
    const values = new Map<string, unknown>();
    const executeOperation = vi.fn(
      async (
        { operationKey }: { operationKey: string },
        work: () => Promise<unknown>
      ) => {
        if (values.has(operationKey)) return values.get(operationKey);
        const value = await work();
        values.set(operationKey, value);
        return value;
      }
    );
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const mediaAdapter = {
      generate: vi.fn().mockResolvedValue({
        url: `/api/post-media/${actor}/${"b".repeat(64)}`,
      }),
    };
    const deps = textDeps(response, {
      mediaAdapter,
      executeOperation: executeOperation as any,
      checkpoint,
    });

    const first = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    const retried = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    expect(first.status).toBe("ready");
    expect(retried.status).toBe("ready");
    expect(
      executeOperation.mock.calls.map(([call]) => call.operationKey)
    ).toEqual(["copy", "image:0:photo-1", "copy", "image:0:photo-1"]);
    expect(deps.generateText).toHaveBeenCalledTimes(1);
    expect(mediaAdapter.generate).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledWith("copy_started", {
      operationKey: "copy",
    });
    expect(checkpoint).toHaveBeenCalledWith(
      "image_completed",
      expect.objectContaining({
        operationKey: "image:0:photo-1",
        slideIndex: 0,
        slotId: "photo-1",
      })
    );
  });

  it("reports deadline expiry before making a paid text call", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const deps = textDeps(copyFor(definition));
    const result = await executeProposalWorkflow(
      workflowInput(definition, { deadlineMs: Date.now() - 1 }),
      deps
    );
    expect(result.status).toBe("expired");
    expect(deps.generateText).not.toHaveBeenCalled();
  });

  it("distinguishes deadline abort from user cancellation during a paid text call", async () => {
    const definition = completeDesignTestDefinitions()[0];
    for (const [reason, expectedStatus] of [
      ["generation_deadline_exceeded", "expired"],
      ["generation_cancelled", "cancelled"],
    ] as const) {
      const controller = new AbortController();
      const deps = textDeps(copyFor(definition), {
        generateText: vi.fn(async () => {
          const error = new Error(reason);
          controller.abort(error);
          throw error;
        }),
      });
      const result = await executeProposalWorkflow(
        workflowInput(definition, { signal: controller.signal }),
        deps
      );
      expect(result.status).toBe(expectedStatus);
      expect(deps.generateText).toHaveBeenCalledTimes(1);
    }
  });

  it("coordinates independent proposals where proposal A succeeds even if proposal B fails", async () => {
    const definitions = completeDesignTestDefinitions();
    const defA = definitions[0];
    const defB = {
      ...definitions[1],
      completeDesign: {
        ...definitions[1].completeDesign,
        baselineVerified: false,
      },
    };
    const mockGenerateText = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(copyFor(defA)) } }],
    });
    const coordinator = new GenerationCoordinator(
      {
        requestId: "req-coord",
        runId,
        prompt: "Teste de independência",
        offeredDefinitions: [defA, defB as any, definitions[2]],
        actor,
      },
      {
        generateText: mockGenerateText,
        actor,
        measureText: input => ({
          height: input.fontSize,
          lines: [{ width: 10 }],
          runs: [],
        }),
      } as any
    );
    const snapshot = await coordinator.start();
    expect(snapshot.overallStatus).toBe("partial");
    expect(snapshot.proposals[0].status).toBe("ready");
    expect(snapshot.proposals[0].bundle).toBeDefined();
    expect(snapshot.proposals[1].status).toBe("failed");
  });

  it("recovers from measurable text overflow via technical recovery node and marks proposal ready", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const firstResponse = copyFor(definition, "Título excessivamente longo que causará overflow físico");
    const secondResponse = copyFor(definition, "Título curto");
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(firstResponse) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(secondResponse) } }],
      });
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const measureText = (input: any) => {
      const isOverflow = input.text.includes("excessivamente longo");
      return {
        height: isOverflow ? 800 : 20,
        lines: [{ width: isOverflow ? 2000 : 100 }],
        runs: [{ fill: input.fill, fontSize: input.fontSize, fontStyle: input.fontStyle }],
      };
    };
    const deps = textDeps(firstResponse, {
      generateText,
      checkpoint,
      measureText,
    });
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    expect(result.status).toBe("ready");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(checkpoint).toHaveBeenCalledWith(
      "recovering",
      expect.objectContaining({ reason: "text_overflow_technical_recovery" })
    );
    expect(checkpoint).toHaveBeenCalledWith(
      "preflight_recovery_succeeded",
      expect.objectContaining({ slideCount: 1 })
    );
  });

  it("fails proposal if text overflow persists after the single recovery attempt", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const firstResponse = copyFor(definition, "Título 1 que estoura");
    const secondResponse = copyFor(definition, "Título 2 que ainda estoura");
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(firstResponse) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(secondResponse) } }],
      });
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const measureText = (input: any) => ({
      height: 800,
      lines: [{ width: 2000 }],
      runs: [{ fill: input.fill, fontSize: input.fontSize, fontStyle: input.fontStyle }],
    });
    const deps = textDeps(firstResponse, {
      generateText,
      checkpoint,
      measureText,
    });
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    expect(result.status).toBe("failed");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(checkpoint).toHaveBeenCalledWith(
      "preflight_recovery_failed",
      expect.objectContaining({ findings: expect.any(Number) })
    );
    expect(result.findings.some(f => f.rule === "overflow")).toBe(true);
  });

  it("fails proposal immediately when image obligation is required but definition lacks media slots", async () => {
    const definition = completeDesignTestDefinitions()[0];
    // definition has no media slots in completeDesignTestDefinitions()[0]
    const response = copyFor(definition);
    const deps = textDeps(response);
    const result = await executeProposalWorkflow(
      workflowInput(definition, {
        imageObligation: {
          required: true,
          purpose: "editorial-photo",
          reason: "Foto de contexto obrigatória",
          slotTargets: 1,
        },
      }),
      deps
    );
    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("proposal_missing_required_media_slots:editorial-photo");
  });

  it("strictly preserves caption, hashtags and healthy slide fields when recovering overflow in another field", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const firstResponse = {
      caption: "Legenda original saudável e perfeita",
      hashtags: ["#artesanal", "#cafe"],
      slides: [
        {
          values: [
            { fieldId: "field-0", value: "Título excessivamente longo que causará overflow físico" },
            { fieldId: "field-1", value: "Apoio original e intocado" },
          ],
          mediaPrompts: [],
        },
      ],
    };
    const recoveryResponse = {
      caption: "LEGENDA INDEVIDA QUE NÃO DEVE SER USADA",
      hashtags: ["#errado"],
      slides: [
        {
          values: [
            { fieldId: "field-0", value: "Título curto" },
            { fieldId: "field-1", value: "APOIO ALTERADO QUE DEVE SER DESCARTADO" },
          ],
          mediaPrompts: [],
        },
      ],
    };
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(firstResponse) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(recoveryResponse) } }],
      });
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const measureText = (input: any) => {
      const isOverflow = input.text.includes("excessivamente longo");
      return {
        height: isOverflow ? 800 : 20,
        lines: [{ width: isOverflow ? 2000 : 100 }],
        runs: [{ fill: input.fill, fontSize: input.fontSize, fontStyle: input.fontStyle }],
      };
    };
    const deps = textDeps(firstResponse, {
      generateText,
      checkpoint,
      measureText,
    });
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    expect(result.status).toBe("ready");
    expect(result.bundle?.caption).toBe("Legenda original saudável e perfeita");
    expect(result.bundle?.hashtags).toEqual(["#artesanal", "#cafe"]);
    // Slide 1 text blocks: title is short, support is original
    const blocks = result.bundle?.slides[0].composition.content.blocks as any[];
    const titleBlock = blocks.find(b => b.id === "field-0");
    const supportBlock = blocks.find(b => b.id === "field-1");
    expect(titleBlock?.text).toBe("Título curto");
    expect(supportBlock?.text).toBe("Apoio original e intocado");
  });

  it("does not invoke media adapter when imageObligation policy is 'forbidden' even if design has media slots", async () => {
    const [base] = completeDesignTestDefinitions();
    const { definition } = withMediaSlot(base, "photo-slot-1");
    const response = copyFor(definition);
    const mediaAdapter = {
      generate: vi.fn().mockResolvedValue({
        url: `/api/post-media/${actor}/${"c".repeat(64)}`,
      }),
    };
    const deps = textDeps(response, { mediaAdapter });
    const result = await executeProposalWorkflow(
      workflowInput(definition, {
        imageObligation: {
          policy: "forbidden",
          required: false,
          purpose: "none",
          reason: "Pedido expressamente tipográfico / sem fotos.",
          slotTargets: 0,
        },
      }),
      deps
    );
    expect(result.status).toBe("ready");
    // Verify media adapter was NEVER called
    expect(mediaAdapter.generate).not.toHaveBeenCalled();
  });

  it("invokes media adapter and fulfills deferred slots when imageObligation policy is 'optional' and composition has media slots", async () => {
    const [base] = completeDesignTestDefinitions();
    const { definition } = withMediaSlot(base, "photo-slot-1");
    const response = copyFor(definition);
    const mediaAdapter = {
      generate: vi.fn().mockResolvedValue({
        url: `/api/post-media/${actor}/${"c".repeat(64)}`,
      }),
    };
    const deps = textDeps(response, { mediaAdapter });
    const result = await executeProposalWorkflow(
      workflowInput(definition, {
        imageObligation: {
          policy: "optional",
          required: false,
          purpose: "editorial-photo",
          reason: "Imagem opcional para enriquecer slots nativos",
          slotTargets: 0,
        },
      }),
      deps
    );
    expect(result.status).toBe("ready");
    expect(mediaAdapter.generate).toHaveBeenCalledTimes(1);
  });

  it("aborts sibling media operations when one media task fails and settles cleanly", async () => {
    const [base] = completeDesignTestDefinitions();
    // Two media slots
    const { definition: def1 } = withMediaSlot(base, "slot-1");
    const { definition: def2 } = withMediaSlot(def1, "slot-2");
    const response = {
      caption: "Post",
      hashtags: [],
      slides: [
        {
          values: [
            { fieldId: "field-0", value: "Título" },
            { fieldId: "field-1", value: "Apoio" },
          ],
          mediaPrompts: [
            { slotId: "slot-1", prompt: "Foto 1" },
            { slotId: "slot-2", prompt: "Foto 2" },
          ],
        },
      ],
    };
    let slot2Aborted = false;
    const mediaAdapter = {
      generate: vi.fn().mockImplementation(async (req: any) => {
        if (req.slot.id === "slot-1") {
          throw new Error("provider_connection_failed");
        }
        // slot 2 simulates ongoing work that listens to signal
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve({ url: `/api/post-media/${actor}/${"d".repeat(64)}` });
          }, 500);
          req.signal?.addEventListener("abort", () => {
            slot2Aborted = true;
            clearTimeout(timeout);
            reject(new Error("operation_aborted"));
          });
        });
      }),
    };
    const deps = textDeps(response, { mediaAdapter });
    const result = await executeProposalWorkflow(
      workflowInput(def2),
      deps
    );
    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("provider_connection_failed");
    expect(slot2Aborted).toBe(true);
  });
});

