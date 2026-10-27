import { describe, it, expect, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignVariationV1Schema } from "@shared/completeDesignGeneration";
import { proposalDeliverySchema } from "@shared/generationContracts";
import {
  executeProposalWorkflow as executeRawProposalWorkflow,
  type ProposalGraphDeps,
  type ProposalExecutionInput,
} from "./proposalGraph";
import { GenerationCoordinator } from "./generationCoordinator";
import { createComponentTextMeasurer } from "../componentTextMeasurer";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { editorialContextV7 } from "./editorialContextV7";

// These tests exercise deterministic geometry/copy/media guards. Real required-review
// integration is exercised separately in proposalGraphReview.test.ts.
vi.mock("./proposalReview", async importOriginal => ({
  ...(await importOriginal<typeof import("./proposalReview")>()),
  reviewProposal: vi.fn(
    async (_input, _deps, _definitions, compositions, _copy, round) => ({
      policyVersion: 1,
      round,
      inputHash: "a".repeat(64),
      status: "passed",
      reviewedSlides: compositions.map(
        (_scene: unknown, index: number) => index
      ),
      findings: [],
      limitation: "",
    })
  ),
}));

import {
  attachEditorialPlanFixture,
  editorialPlanFixture,
} from "./proposalEditorial.fixture";

// Geometry/review fixtures supply the new writing contract; explicit editorial tests use raw workflow.
const executeProposalWorkflow = (
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps
) =>
  executeRawProposalWorkflow(input, {
    ...deps,
    generateText: async params =>
      attachEditorialPlanFixture(await deps.generateText(params), input),
  });

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

function withWordPartition(required = true, count = 2, essential = false) {
  const base = completeDesignTestDefinitions()[0],
    title = base.fragment.instances[0],
    style = base.pieces[title.pieceHash];
  const pieces = Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const piece = {
        ...style,
        fontSize: 40,
        contentFragment: {
          index,
          count,
          unit: "words" as const,
          weights: count === 2 ? [2, 1] : Array(count).fill(1),
        },
      };
      return [arsenalHash(piece), piece];
    })
  );
  const hashes = Object.keys(pieces);
  return createComponentDefinition({
    ...base,
    pieces: { ...base.pieces, ...pieces },
    completeDesign: essential
      ? {
          ...base.completeDesign!,
          designGuidance: {
            version: 1,
            summary: "Título distribuído em regiões de ênfase essenciais.",
            motifs: [],
            preserve: [],
            contentRules: [
              "Mantenha o sentido do destaque do título; não use palavra isolada sem ênfase significativa.",
            ],
            mediaRules: [],
            knownLimitations: [],
            requiredTextTargets: Array.from(
              { length: count },
              (_, i) => `part-${i}`
            ),
          },
        }
      : base.completeDesign,
    fragment: {
      ...base.fragment,
      instances: [
        ...base.fragment.instances.filter(instance => instance.id !== title.id),
        ...hashes.map((pieceHash, index) => ({
          ...title,
          id: `part-${index}`,
          pieceHash,
          y: 72 + index * 120,
          height: 100,
        })),
      ],
      bindings: base.fragment.bindings.map(binding =>
        binding.required
          ? {
              ...binding,
              required,
              targetIds: Array.from({ length: count }, (_, i) => `part-${i}`),
            }
          : binding
      ),
    },
  });
}

describe("Proposal Graph Workflow (canonical V1 delivery)", () => {
  it.each(["light_optimize", "visual_only"] as const)("handles authored newlines surgically in affirmative %s", async interventionLevel => {
    const base = withWordPartition(true, 3);
    const definition = createComponentDefinition({...base, fragment:{...base.fragment, instances:base.fragment.instances.map(i => i.id.startsWith("part-") ? {...i,height:55} : i)}});
    const initial = copyFor(definition, "Preço inflado\nOscilação\nFrete e envio");
    initial.slides[0].values[1].value = "";
    initial.caption = ""; initial.hashtags = [];
    const repaired = copyFor(definition,"Preço histórico vendedor");
    repaired.caption = "Alteração indevida";
    const input = workflowInput(definition, {platform:"instagram", postMode:"static", reviewPolicyVersion:7, reviewExecutionConfig:resolveReviewExecutionConfigV7(6), executionBrief:{creationMode:"execution",format:"static",platform:"instagram",objective:"engage",interventionLevel,contentSourceType:"freeform",rawInput:initial.slides[0].values[0].value}});
    input.editorialContextHash = editorialContextV7(input,6).hash;
    const generateText = vi.fn().mockResolvedValueOnce({choices:[{message:{content:JSON.stringify(initial)}}]}).mockResolvedValueOnce({choices:[{message:{content:JSON.stringify(repaired)}}]});
    const deps = textDeps(initial,{generateText,measureText:e => ({height:e.text.split("\n").length*e.fontSize*1.2, lines:e.text.split("\n").map(text => ({width:text.length*e.fontSize*.25})), runs:[{fontSize:e.fontSize,fontStyle:e.fontStyle,fill:e.fill}]})});
    const result = await executeRawProposalWorkflow(input,deps);
    if (interventionLevel === "visual_only") {
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("failed");
      expect(result.failure).toMatchObject({code:"artwork_unusable",stage:"copy"});
    } else {
      expect(result.status,result.errorReason).toBe("ready");
      expect(generateText).toHaveBeenCalledTimes(2);
      expect(result.bundle!.caption).toBe(initial.caption);
      expect(result.bundle!.slides[0].composition.content.blocks[1].text).toBe("");
      const recovery = generateText.mock.calls[1][0].messages[1].content;
      expect(recovery).toContain("FRAGMENTOS RESOLVIDOS E MEDIDOS");
      expect(recovery).toContain('"measuredHeight":96');
      expect(recovery).toContain('"maxLines":1');
      expect(recovery).toContain("word_partition");
    }
  });
  it.each([
    ["Café", ["", "Café"]],
    ["Café com calma", ["Café com ", "calma"]],
  ])(
    "describes native weighted copy capacity without turning empty slices into a veto: %s",
    async (title, expected) => {
      const definition = withWordPartition(),
        response = copyFor(definition, title as string),
        deps = textDeps(response);
      const result = await executeProposalWorkflow(
        workflowInput(definition),
        deps
      );
      expect(result.status, result.errorReason).toBe("ready");
      expect(
        result
          .bundle!.slides[0].composition.elements.filter(element =>
            element.id.startsWith("part-")
          )
          .map(element => element.text)
      ).toEqual(expected);
      const messages = (deps.generateText as any).mock.calls[0][0].messages;
      const user = messages[1].content as string,
        marker =
          "Composições nativas, capacidade, cardinalidade e alvos reais:\n";
      const notes = JSON.parse(user.split(marker)[1].split("\n\nRetorne")[0]);
      const field = notes[0].fields[0];
      expect(
        field.targets.map((target: any) => target.contentFragment)
      ).toEqual([
        { index: 0, count: 2, unit: "words", weights: [2, 1] },
        { index: 1, count: 2, unit: "words", weights: [2, 1] },
      ]);
      expect(field.capacity).toMatchObject({
        distribution: "word_partition",
        minWords: 2,
        wordsForAllFragments: 2,
        advisory: true,
      });
      expect(field.capacity.estimatedMaxChars).toBe(
        field.targets.reduce(
          (sum: number, target: any) => sum + target.maxChars,
          0
        )
      );
      expect(messages[0].content).toContain("não para o valor inteiro");
      expect(messages[0].content).toContain("NÃO um limite de palavras");
    }
  );

  it.each([2, 4])(
    "recovers an empty explicitly essential fragment once, preserving healthy copy (%i targets)",
    async count => {
      const definition = withWordPartition(true, count, true);
      const initial = copyFor(
        definition,
        count === 2 ? "Café" : "Café com cuidado"
      );
      initial.slides[0].values[1].value = ""; // optional body remains legitimately empty
      const repaired = copyFor(
        definition,
        count === 2 ? "Café com calma" : "Café artesanal com cuidado"
      );
      repaired.caption = "changed caption";
      repaired.slides[0].values[1].value = "unrequested body";
      const generateText = vi
        .fn()
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify(initial) } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: JSON.stringify(repaired) } }],
        });
      const result = await executeProposalWorkflow(
        workflowInput(definition),
        textDeps(initial, { generateText })
      );
      expect(result.status, result.errorReason).toBe("ready");
      expect(generateText).toHaveBeenCalledTimes(2);
      expect(result.bundle!.caption).toBe(initial.caption);
      const scene = result.bundle!.slides[0].composition;
      expect(
        scene.elements
          .filter(e => e.id.startsWith("part-"))
          .every(e => e.text?.trim())
      ).toBe(true);
      expect(scene.content.blocks[1].text).toBe("");
      expect(generateText.mock.calls[1][0].messages[1].content).toContain(
        "não apenas encurte"
      );
      expect(generateText.mock.calls[0][0].messages[1].content).toContain(
        '"occupationRequired": true'
      );
    }
  );

  it("fails an unfilled essential fragment after the single repair and never rewrites visual_only to fill it", async () => {
    const definition = withWordPartition(true, 4, true),
      initial = copyFor(definition, "Café com cuidado");
    initial.caption = "";
    initial.hashtags = [];
    initial.slides[0].values[1].value = "";
    for (const literal of [false, true]) {
      const deps = textDeps(initial);
      const input = workflowInput(
        definition,
        literal
          ? {
              executionBrief: {
                rawInput: "Café com cuidado",
                interventionLevel: "visual_only",
                mustKeep: [],
                mustInclude: [],
                forbiddenTerms: [],
              } as any,
            }
          : {}
      );
      const result = await executeProposalWorkflow(input, deps);
      expect(result.status).toBe("failed");
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "required_text_fragment" }),
        ])
      );
      expect(deps.generateText).toHaveBeenCalledTimes(literal ? 1 : 2);
      expect(result.bundle).toBeUndefined();
    }
  });

  it("keeps optional authored fragments empty and visual_only text literal", async () => {
    for (const visualOnly of [false, true]) {
      const definition = withWordPartition(visualOnly),
        response = {
          ...copyFor(definition, visualOnly ? "Café" : ""),
          caption: "",
          hashtags: [],
        };
      response.slides[0].values[1].value = "";
      const deps = textDeps(response);
      const result = await executeProposalWorkflow(
        workflowInput(
          definition,
          visualOnly
            ? {
                executionBrief: {
                  rawInput: "Café",
                  interventionLevel: "visual_only",
                  mustKeep: [],
                  mustInclude: [],
                  forbiddenTerms: [],
                } as any,
              }
            : {}
        ),
        deps
      );
      expect(result.status, result.errorReason).toBe("ready");
      expect(deps.generateText).toHaveBeenCalledTimes(1);
      expect(result.bundle!.slides[0].composition.content).toMatchObject({
        blocks: [{ text: visualOnly ? "Café" : "" }, { text: "" }],
      });
    }
  });
  it("applies only an authored bounded font fit, persists it through reopening, and respects minimum sizes and explicit overrides", async () => {
    const base = completeDesignTestDefinitions()[0],
      title = base.fragment.instances[0];
    const oldPiece = base.pieces[title.pieceHash],
      piece = { ...oldPiece, fontSize: 53 },
      pieceHash = arsenalHash(piece);
    const measure = await createComponentTextMeasurer(base.assets);
    const originalWidth = measure({
      text: "04",
      width: 10000,
      fontSize: 53,
      fontFamily: piece.fontFamily,
      fontStyle: String(piece.fontWeight),
      fill: piece.fill,
      letterSpacing: piece.letterSpacing,
    }).lines[0].width;
    const width = originalWidth - 1;
    const definition = createComponentDefinition({
      ...base,
      pieces: { ...base.pieces, [pieceHash]: piece },
      fragment: {
        ...base.fragment,
        instances: base.fragment.instances.map(instance =>
          instance.id === title.id
            ? { ...instance, pieceHash, width, height: 70 }
            : instance
        ),
        relations: [
          {
            id: "authored-title-fit",
            kind: "textFit",
            version: 1,
            enabled: true,
            inputs: [],
            outputs: [{ targetId: title.id, properties: ["fontSize"] }],
            parameters: {
              anchor: "left",
              maxWidth: width,
              maxHeight: 70,
              minFontSize: 37.1,
            },
          },
        ],
      },
    });
    const result = await executeProposalWorkflow(
      workflowInput(definition, { prompt: "04" }),
      textDeps(copyFor(definition, "04"), { measureText: measure })
    );
    expect(result.status, result.errorReason).toBe("ready");
    const scene = result.bundle!.slides[0].composition;
    const fitted = scene.elements.find(element => element.id === title.id)!;
    expect(fitted.fontSize).toBeLessThan(53);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(37.1);
    expect(scene.overrides[title.id].fontSize).toBe(fitted.fontSize);
    expect(fitted).toMatchObject({
      x: title.x,
      y: title.y,
      width,
      height: 70,
      text: "04",
    });
    const reopened = resolveArsenalGeometry(scene, { measureText: measure });
    expect(reopened.elements.find(element => element.id === title.id)).toEqual(
      fitted
    );
    const explicit = structuredClone(scene);
    explicit.overrides[title.id].fontSize = 53;
    const pinned = resolveArsenalGeometry(explicit, {
      measureText: measure,
      allowReduction: true,
    });
    expect(
      pinned.elements.find(element => element.id === title.id)!.fontSize
    ).toBe(53);
    expect(pinned.issues).toContain(`overflow:token:${title.id}`);
    const constrained = structuredClone(scene);
    delete constrained.overrides[title.id].fontSize;
    const fit = constrained.relations[0];
    if (fit.kind !== "textFit") throw new Error("expected fit");
    fit.parameters.minFontSize = 53;
    const limited = resolveArsenalGeometry(constrained, {
      measureText: measure,
      allowReduction: true,
    });
    expect(
      limited.elements.find(element => element.id === title.id)!.fontSize
    ).toBe(53);
    expect(limited.issues).toContain(`overflow:token:${title.id}`);
    const repeating = createComponentDefinition({
      ...definition,
      fragment: {
        ...definition.fragment,
        bindings: definition.fragment.bindings.map(binding =>
          binding.required
            ? {
                ...binding,
                kind: "list" as const,
                source: "items" as const,
                cardinality: { min: 1, max: 2 },
              }
            : binding
        ),
      },
    });
    const repeatCopy = copyFor(repeating, "04");
    repeatCopy.slides[0].values[0].value = ["04", "04"] as any;
    const repeated = await executeProposalWorkflow(
      workflowInput(repeating, { prompt: "04" }),
      textDeps(repeatCopy, { measureText: measure })
    );
    expect(repeated.status, repeated.errorReason).toBe("ready");
    const repeatedScene = repeated.bundle!.slides[0].composition;
    const repeatElements = repeatedScene.elements.filter(
      element => element.bindingId === "title"
    );
    expect(repeatElements).toHaveLength(2);
    expect(
      repeatElements.every(
        element =>
          element.id.includes("~") &&
          repeatedScene.overrides[element.id].fontSize === element.fontSize &&
          element.fontSize < 53
      )
    ).toBe(true);
    const repeatedReopened = resolveArsenalGeometry(repeatedScene, {
      measureText: measure,
    });
    expect(
      repeatedReopened.elements.filter(element => element.bindingId === "title")
    ).toEqual(repeatElements);
  });

  it("transports native list markers and format to copy without inserting or removing markers heuristically", async () => {
    const base = completeDesignTestDefinitions()[0];
    const definition = createComponentDefinition({
      ...base,
      fragment: {
        ...base.fragment,
        bindings: base.fragment.bindings.map(binding =>
          binding.required
            ? binding
            : {
                ...binding,
                kind: "list" as const,
                listMode: "native-slots" as const,
                source: "items" as const,
                cardinality: { min: 1, max: 1 },
                prefix: "- ",
              }
        ),
      },
    });
    const response = copyFor(definition);
    response.slides[0].values[1].value = ["Promoções verificadas"] as any;
    const deps = textDeps(response);
    const result = await executeProposalWorkflow(
      workflowInput(definition),
      deps
    );
    expect(result.status, result.errorReason).toBe("ready");
    expect(
      result.bundle!.slides[0].composition.elements.find(
        element => element.id === "support"
      )!.text
    ).toBe("- Promoções verificadas");
    const messages = (deps.generateText as any).mock.calls[0][0].messages;
    expect(messages[1].content).toContain('"prefix": "- "');
    expect(messages[1].content).toContain('"listMode": "native-slots"');
    expect(messages[0].content).toContain("sem repetir esse prefix");

    // Optional means absent is valid; the cardinality still governs a populated list.
    const emptyResponse = structuredClone(response);
    emptyResponse.slides[0].values[1].value = [] as any;
    const input = workflowInput(definition, {platform:"instagram",postMode:"static",reviewPolicyVersion:7,reviewExecutionConfig:resolveReviewExecutionConfigV7(6)});
    input.editorialContextHash = editorialContextV7(input,6).hash;
    const emptyDeps = textDeps(emptyResponse);
    const empty = await executeRawProposalWorkflow(input, emptyDeps);
    expect(empty.status,empty.errorReason).toBe("ready");
    expect(empty.bundle!.slides[0].composition.content.blocks[1]).toMatchObject({type:"list",items:[]});
    expect(emptyDeps.generateText).toHaveBeenCalledTimes(1);
  });

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
    const response = copyFor(definition, "Café artesanal");
    response.slides[0].values[1].value = "";
    response.caption = "Café artesanal";
    response.hashtags = [];
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

  it("cancels font preflight even when the font loader ignores its signal", async () => {
    const definition = completeDesignTestDefinitions()[0],
      controller = new AbortController();
    let fontSignal: AbortSignal | undefined;
    const deps = textDeps(copyFor(definition), {
      measureText: undefined,
      createTextMeasurer: vi.fn((_assets, _loader, signal) => {
        fontSignal = signal;
        return new Promise(() => undefined);
      }),
    });
    const pending = executeProposalWorkflow(
      workflowInput(definition, { signal: controller.signal }),
      deps
    );
    controller.abort(new Error("generation_cancelled"));
    const result = await pending;
    expect(fontSignal?.aborted).toBe(true);
    expect(result.status).toBe("cancelled");
    expect(deps.generateText).not.toHaveBeenCalled();
  });

  it("bounds font preflight by the request deadline even without an external signal", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const deps = textDeps(copyFor(definition), {
      measureText: undefined,
      createTextMeasurer: vi.fn(() => new Promise(() => undefined)),
    });
    const result = await executeProposalWorkflow(
      workflowInput(definition, { deadlineMs: Date.now() + 25 }),
      deps
    );
    expect(result.status).toBe("expired");
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

  it("carries authored content and per-slot media requirements into copy and image execution", async () => {
    const { definition: base, slot } = withMediaSlot(
      completeDesignTestDefinitions()[0],
      "photo-guidance"
    );
    const definition = createComponentDefinition({
      ...base,
      completeDesign: {
        ...base.completeDesign!,
        designGuidance: {
          version: 1,
          summary: "Produto iluminado em fundo escuro",
          motifs: ["contraste"],
          preserve: ["Título junto ao produto"],
          contentRules: ["Destaque a função do produto"],
          mediaRules: [
            {
              slotId: slot.id,
              instructions: [
                "Fundo escuro; produto com luz lateral e área livre para o título.",
              ],
            },
          ],
          knownLimitations: [],
        },
      },
    });
    const mediaAdapter = {
      generate: vi.fn(async () => ({
        url: `/api/post-media/${actor}/${"b".repeat(64)}`,
      })),
    };
    const d = textDeps(copyFor(definition), { mediaAdapter });
    const result = await executeProposalWorkflow(
      workflowInput(definition, {
        selectionReason: "Produto como foco desta proposta",
      }),
      d
    );
    expect(result.status).toBe("ready");
    expect(
      JSON.stringify(vi.mocked(d.generateText).mock.calls[0][0].messages)
    ).toContain("Destaque a função do produto");
    expect(
      JSON.stringify(vi.mocked(d.generateText).mock.calls[0][0].messages)
    ).toContain("Produto como foco desta proposta");
    expect(mediaAdapter.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Fundo escuro; produto com luz lateral e área livre para o título."
        ),
      })
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
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...copyFor(defA),
              editorialPlan: editorialPlanFixture(
                { prompt: "Teste de independência" } as ProposalExecutionInput,
                copyFor(defA)
              ),
            }),
          },
        },
      ],
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
    const firstResponse = copyFor(
      definition,
      "Título excessivamente longo que causará overflow físico"
    );
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
        runs: [
          {
            fill: input.fill,
            fontSize: input.fontSize,
            fontStyle: input.fontStyle,
          },
        ],
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
      expect.objectContaining({ reason: "authored_text_contract_recovery" })
    );
    expect(checkpoint).toHaveBeenCalledWith(
      "preflight_recovery_succeeded",
      expect.objectContaining({ slideCount: 1 })
    );
    const recoveryCall = vi.mocked(generateText).mock.calls[1][0];
    const userMessage = recoveryCall.messages.find((m: any) => m.role === "user")?.content;
    expect(userMessage).toContain("DIRETRIZES FÍSICAS DE CAPACIDADE");
  });

  it("coordinates template fallback up to 3 times when a proposal fails preflight layout", async () => {
    const definitions = completeDesignTestDefinitions();
    const badDef = {
      ...definitions[0],
      completeDesign: {
        ...definitions[0].completeDesign,
        baselineVerified: false,
      },
    };
    const goodDef = definitions[1];

    const mockGenerateText = vi.fn().mockImplementation(async (params: any) => {
      const def = goodDef;
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...copyFor(def, "Texto"),
                editorialPlan: editorialPlanFixture(
                  { prompt: "Teste de fallback de template" } as ProposalExecutionInput,
                  copyFor(def, "Texto")
                ),
              }),
            },
          },
        ],
      };
    });

    const measureText = () => ({
      height: 20,
      lines: [{ width: 50 }],
      runs: [],
    });

    const coordinator = new GenerationCoordinator(
      {
        requestId: "req-coord-fb",
        runId,
        prompt: "Teste de fallback de template",
        selectedDefinitions: [[badDef], [goodDef], [definitions[2]]],
        alternativeDefinitions: [[[goodDef]], [], []],
        actor,
      },
      {
        generateText: mockGenerateText,
        actor,
        measureText,
      } as any
    );
    const snapshot = await coordinator.start();
    expect(snapshot.proposals[0].status).toBe("ready");
    expect(snapshot.proposals[1].status).toBe("ready");
    expect(snapshot.proposals[2].status).toBe("ready");
    expect(snapshot.overallStatus).toBe("completed");
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
      runs: [
        {
          fill: input.fill,
          fontSize: input.fontSize,
          fontStyle: input.fontStyle,
        },
      ],
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
    expect(result.errorReason).toContain(
      "proposal_missing_required_media_slots:editorial-photo"
    );
  });

  it("strictly preserves caption, hashtags and healthy slide fields when recovering overflow in another field", async () => {
    const definition = completeDesignTestDefinitions()[0];
    const firstResponse = {
      caption: "Legenda original saudável e perfeita",
      hashtags: ["#artesanal", "#cafe"],
      slides: [
        {
          values: [
            {
              fieldId: "field-0",
              value: "Título excessivamente longo que causará overflow físico",
            },
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
            {
              fieldId: "field-1",
              value: "APOIO ALTERADO QUE DEVE SER DESCARTADO",
            },
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
        runs: [
          {
            fill: input.fill,
            fontSize: input.fontSize,
            fontStyle: input.fontStyle,
          },
        ],
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

  it("keeps at most three native image providers active per proposal", async () => {
    let definition = completeDesignTestDefinitions()[0];
    for (let i = 0; i < 7; i++)
      definition = withMediaSlot(definition, `pool-${i}`).definition;
    let active = 0,
      peak = 0;
    const release: Array<() => void> = [];
    const generate = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      return await new Promise<{ url: string }>(resolve =>
        release.push(() => {
          active--;
          resolve({ url: `/api/post-media/${actor}/${"d".repeat(64)}` });
        })
      );
    });
    const pending = executeProposalWorkflow(
      workflowInput(definition),
      textDeps(copyFor(definition), { mediaAdapter: { generate } })
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3));
    release.splice(0).forEach(done => done());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(6));
    release.splice(0).forEach(done => done());
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(7));
    release.splice(0).forEach(done => done());
    const result = await pending;
    expect(peak).toBe(3);
    expect(result.status, result.errorReason).toBe("ready");
  });

  it("never starts queued image operations after cancellation", async () => {
    let definition = completeDesignTestDefinitions()[0];
    for (let i = 0; i < 7; i++)
      definition = withMediaSlot(definition, `cancel-pool-${i}`).definition;
    const controller = new AbortController();
    const generate = vi.fn(
      async (request: any) =>
        new Promise<{ url: string }>((_resolve, reject) =>
          request.signal.addEventListener(
            "abort",
            () => reject(request.signal.reason),
            { once: true }
          )
        )
    );
    const pending = executeProposalWorkflow(
      workflowInput(definition, { signal: controller.signal }),
      textDeps(copyFor(definition), { mediaAdapter: { generate } })
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3));
    controller.abort(new Error("generation_cancelled"));
    expect((await pending).status).toBe("cancelled");
    expect(generate).toHaveBeenCalledTimes(3);
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
    const result = await executeProposalWorkflow(workflowInput(def2), deps);
    expect(result.status).toBe("failed");
    expect(result.errorReason).toContain("provider_connection_failed");
    expect(slot2Aborted).toBe(true);
  });
});
