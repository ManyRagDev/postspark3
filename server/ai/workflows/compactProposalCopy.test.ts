import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
import { readArsenalComposition } from "@shared/designArsenal";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { resolveGenerationModelConfig } from "../generationModel";
import { createComponentTextMeasurer } from "../componentTextMeasurer";
import {
  executeProposalWorkflow,
  type CopyResponse,
  type ProposalExecutionInput,
  type ProposalGraphDeps,
} from "./proposalGraph";
import { editorialContextV9 } from "./editorialContextV9";
import { resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";
import {
  applyTargetedCopyRepair,
  compactCopyPrompt,
  compactSourceContext,
  compactCopyTransportSchema,
  compactCopyValidationSchema,
  compactWritableSlides,
  targetedCopyRepairPrompt,
  targetedCopyRepairSchema,
  type TargetedCopyRepairTarget,
} from "./compactProposalCopy";
import { reviewProposal } from "./proposalReview";

vi.mock("./proposalReview", async (original) => ({
  ...(await original<typeof import("./proposalReview")>()),
  reviewProposal: vi.fn(),
}));
const definition = completeDesignTestDefinitions()[0];
const actor = "00000000-0000-4000-8000-000000000001";
function review(round = "initial", findings: unknown[] = []) {
  return {
    policyVersion: 1,
    round,
    inputHash: "a".repeat(64),
    status: findings.length ? "correction_required" : "passed",
    reviewedSlides: [0],
    findings,
    limitation: "",
  } as any;
}
function input(
  overrides: Partial<ProposalExecutionInput> = {},
): ProposalExecutionInput {
  const value: ProposalExecutionInput = {
    requestId: "compact-test",
    runId: actor,
    proposalId: "compact-proposal",
    slot: 0,
    prompt: "Apresente a cafeteria com naturalidade",
    contextContent: "A cafeteria serve café artesanal.",
    selectedDefinition: definition,
    postMode: "static",
    reviewPolicyVersion: 10,
    reviewExecutionConfig: resolveReviewExecutionConfigV10(),
    generationConfig: resolveGenerationModelConfig({
      generationModel: "auto",
      postMode: "static",
    }),
    ...overrides,
  };
  value.editorialContext = editorialContextV9(value);
  value.editorialContextHash = value.editorialContext.hash;
  return value;
}
function copy(title = "Café artesanal"): CopyResponse {
  return {
    caption: "Legenda saudável exclusiva",
    hashtags: ["#cafe"],
    slides: [
      {
        values: [
          { fieldId: "field-0", value: title },
          { fieldId: "field-1", value: "Apoio saudável exclusivo" },
        ],
        mediaPrompts: [],
      },
    ],
  };
}
function response(value: unknown): any {
  return {
    choices: [
      { message: { content: JSON.stringify(value) }, finish_reason: "stop" },
    ],
  };
}
const target: TargetedCopyRepairTarget = {
  slideIndex: 0,
  fieldId: "field-0",
  itemIndex: null,
  current: "Título extenso",
  reason: ["overflow medido"],
};
function contradiction() {
  return {
    category: "factual_contradiction",
    slideIndex: 0,
    fieldId: "field-0",
    observed: "Café gratuito",
    expected: "Remova gratuidade não sustentada",
    sourceQuote: "A cafeteria serve café artesanal.",
    explanation: "Gratuidade não foi informada",
    action: "none",
    authority: "source_grounded",
  };
}
beforeEach(() => {
  vi.mocked(reviewProposal).mockReset();
  vi.mocked(reviewProposal).mockImplementation(
    async (_i, _d, _defs, compositions, _copy, round) => ({
      ...review(round),
      reviewedSlides: compositions.map((_scene, index) => index),
    }),
  );
});

describe("automatic compact copy transport", () => {
  it("sends original source, selected slots and advisory capacities without native geometry, assets, bindings or unselected designs", () => {
    const value = input({
      sourceReferences: [
        { title: "Fonte", facts: "Abre às oito horas", purpose: "content" },
      ],
    });
    const payload = JSON.parse(compactCopyPrompt(value, [definition]));
    expect(payload.request).toBe(value.prompt);
    expect(payload.sources[0].facts).toBe("Abre às oito horas");
    expect(payload.slides[0].fields[0]).toMatchObject({
      fieldId: "field-0",
      role: "headline",
      capacity: { advisory: true },
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      "instances",
      "pieces",
      "assets",
      "bindings",
      "targetIds",
      "artboard",
      "fontSize",
      "authoredGroups",
      "pieceHash",
      "sourceHash",
    ])
      expect(serialized).not.toContain(`"${forbidden}"`);
    expect(serialized).not.toContain(completeDesignTestDefinitions()[1].id);
    expect(serialized).not.toContain(definition.fragment.bindings[0].source);
  });

  it("keeps page ideas advisory once and removes heuristic assignments from individual writable fields", () => {
    const value = input({ narrativePlan: { pages: [{ slideIndex: 0, purpose: "Mensagem", rhythm: "opening", assignments: [{fieldId:"field-0",contentIds:["idea-1"],instruction:"Repita tudo e CTA",itemCount:null},{fieldId:"field-1",contentIds:["idea-1"],instruction:"Repita tudo e CTA",itemCount:null}] }] } as any, generationIntent: {content:[{id:"idea-1",meaning:"Uma ideia editorial"}]} as any });
    const payload=JSON.parse(compactCopyPrompt(value,[definition]));
    expect(payload.slides[0].ideas).toEqual(["Uma ideia editorial"]);
    expect(payload.slides[0].advisory).toBe(true);
    for(const field of payload.slides[0].fields) { expect(field).not.toHaveProperty("instruction"); expect(field).not.toHaveProperty("ideas"); }
    expect(payload.slides[0].fields.map((field:any)=>field.required)).toEqual(compactWritableSlides(input(),[definition])[0].fields.map(field=>field.required));
  });

  it("bounds only confirmed repair targets and permits a bounded set of local alternatives", () => {
    const bounded={...target,maxCharacters:8};
    const schema=targetedCopyRepairSchema([bounded]);
    expect(schema.safeParse({patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:"123456789"}]}).success).toBe(false);
    expect(schema.safeParse({patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:"Café",alternatives:["Lume",""]}]}).success).toBe(true);
    expect(schema.safeParse({patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:"Café",alternatives:["a","b","c"]}]}).success).toBe(false);
    expect(targetedCopyRepairSchema([target]).safeParse({patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:"123456789"}]}).success).toBe(true);
  });

  it("uses one compact native item grammar but validates exact fields, types and list cardinality on their own page", () => {
    const listDefinition=structuredClone(definition);
    listDefinition.fragment.bindings[1].kind="list";
    listDefinition.fragment.bindings[1].cardinality={min:2,max:3};
    const definitions=[definition,listDefinition];
    const payload=copy();payload.slides.push({values:[{fieldId:"field-0",value:"Lume"},{fieldId:"field-1",value:["Café","Horário"]}],mediaPrompts:[]});
    const schema=compactCopyValidationSchema(definitions);
    expect(compactCopyTransportSchema(definitions).safeParse(payload).success).toBe(true);
    expect(schema.safeParse(payload).success).toBe(true);
    const swapped=structuredClone(payload);swapped.slides.reverse();expect(schema.safeParse(swapped).success).toBe(false);
    const duplicate=structuredClone(payload);duplicate.slides[0].values[1].fieldId="field-0";expect(schema.safeParse(duplicate).success).toBe(false);
    const excessive=structuredClone(payload);excessive.slides[1].values[1].value=["a","b","c","d"];expect(schema.safeParse(excessive).success).toBe(false);
    const extra=structuredClone(payload);extra.slides.push(structuredClone(extra.slides[0]));expect(()=>schema.safeParse(extra)).not.toThrow();expect(schema.safeParse(extra).success).toBe(false);
    const unknown=structuredClone(payload);unknown.slides[0].values[0].fieldId="unknown";expect(schema.safeParse(unknown).success).toBe(false);
  });

  it.each(["url","image"])("factors exact %s source text while preserving provenance, purpose and every residual uncertainty", kind => {
    const prompt="Crie um post para a Lume.";
    const facts="A Lume abre às 8h. O encerramento não foi confirmado.";
    const unique="Observação independente: o cartaz está parcialmente cortado.";
    const context=`ORIGEM: piece_request\n${prompt}\nORIGEM: fonte-externa\n${facts}\n${unique}\nDuplicata literal: ${facts}`;
    const value=input({prompt,contextContent:context,sourceReferences:[{id:"source-original",kind,purpose:"content",origin:"external",url:"https://example.test/lume",facts},{id:"same-text-visual",kind:"image",purpose:"visual_reference",facts},{kind:"request",purpose:"content",facts:prompt}]});
    const payload=compactSourceContext(value);
    expect(payload.sources[0]).toMatchObject({id:"source-original",kind,purpose:"content",origin:"external",url:"https://example.test/lume",facts});
    expect(payload.sources[1]).toMatchObject({purpose:"visual_reference",factsRef:"source-1"});
    expect(payload.sources[2].factsRef).toBe("request");
    const references=new Map<string,string>([["request",prompt]]);
    for(const source of payload.sources)references.set(source.ref,source.facts??references.get(source.factsRef!)!);
    const reconstructed=payload.factualContext!.replace(/\[factsRef:([^\]]+)\]/g,(_marker,ref)=>references.get(ref)!);
    expect(reconstructed).toBe(context);
    expect(payload.factualContext).toContain(unique);
    expect(JSON.stringify(payload).split(facts)).toHaveLength(2);
    expect(JSON.stringify(payload)).not.toContain(prompt);
  });

  it("writes all carousel pages once and preserves original source images for the writer", async () => {
    const sourceImage = "data:image/png;base64,original-factual-image";
    const value = input({
      postMode: "carousel",
      selectedDefinition: undefined,
      selectedDefinitions: [definition, definition],
      sourceImages: [sourceImage],
      generationConfig: resolveGenerationModelConfig({
        generationModel: "auto",
        postMode: "carousel",
        slideCount: 2,
      }),
    });
    const responseCopy = copy();
    responseCopy.slides.push(structuredClone(responseCopy.slides[0]));
    const generateText = vi.fn(async (_params: any) => response(responseCopy));
    const result = await executeProposalWorkflow(value, {
      actor,
      generateText,
    });
    expect(result.status, result.errorReason).toBe("ready");
    expect(generateText).toHaveBeenCalledTimes(1);
    const user = generateText.mock.calls[0][0].messages[1]
      .content as Array<any>;
    expect(user[1]).toEqual({
      type: "image_url",
      image_url: { url: sourceImage },
    });
    expect(
      JSON.parse(user[0].text).slides.map((slide: any) => slide.narrativeRole),
    ).toEqual(["cover", "closing"]);
    expect(result.bundle!.slides).toHaveLength(2);
  });

  it("encodes an exact patch allowlist and preserves every healthy field", () => {
    const original = copy(target.current as string);
    const repaired = applyTargetedCopyRepair(original, [target], {
      patches: [
        {
          slideIndex: 0,
          fieldId: "field-0",
          itemIndex: null,
          value: "Café artesanal",
        },
      ],
    });
    expect(repaired.caption).toBe(original.caption);
    expect(repaired.hashtags).toEqual(original.hashtags);
    expect(repaired.slides[0].values[1]).toEqual(original.slides[0].values[1]);
    expect(repaired.slides[0].mediaPrompts).toEqual(
      original.slides[0].mediaPrompts,
    );
    expect(() =>
      applyTargetedCopyRepair(original, [target], {
        patches: [
          {
            slideIndex: 0,
            fieldId: "field-1",
            itemIndex: null,
            value: "Invadido",
          },
        ],
      }),
    ).toThrow();
    expect(
      targetedCopyRepairSchema([target]).safeParse({ patches: [] }).success,
    ).toBe(false);
    const prompt = targetedCopyRepairPrompt(input(), [definition], [target]);
    expect(prompt).not.toContain(input().prompt);
    expect(prompt).not.toContain(original.caption);
    expect(prompt).not.toContain(original.slides[0].values[1].value);
  });

  it("pays copy and one narrow recovery once, replays the durable patch, and resolves real Fontkit geometry unchanged on reopen", async () => {
    const original = copy("W".repeat(300));
    const generateText = vi.fn(async (params) =>
      params.traceLabel?.endsWith("_copy_recovery")
        ? response({
            patches: [
              {
                slideIndex: 0,
                fieldId: "field-0",
                itemIndex: null,
                value: "Café artesanal",
              },
            ],
          })
        : response(original),
    );
    const journal = new Map<string, unknown>();
    const deps: ProposalGraphDeps = {
      actor,
      generateText,
      executeOperation: async (operation, work) => {
        if (journal.has(operation.operationKey))
          return journal.get(operation.operationKey) as any;
        const result = await work();
        journal.set(operation.operationKey, result);
        return result;
      },
      recoveryOperationKeys: async () =>
        journal.has("copy_recovery") ? ["copy_recovery"] : [],
    };
    const first = await executeProposalWorkflow(input(), deps);
    expect(first.status, first.errorReason).toBe("ready");
    expect(generateText).toHaveBeenCalledTimes(2);
    const repairCall = generateText.mock.calls[1][0];
    expect(repairCall.pinnedModel).toContain("deepseek");
    expect(repairCall.maxCompletionTokens).toBe(2048);
    expect(repairCall.forceTextSchema).toBe(false);
    expect(JSON.stringify(repairCall.messages)).not.toContain(original.caption);
    expect(JSON.stringify(repairCall.messages)).not.toContain(
      original.slides[0].values[1].value,
    );
    expect(generateText.mock.calls[0][0].pinnedModel).toContain("haiku");
    const second = await executeProposalWorkflow(input(), deps);
    expect(second.status, second.errorReason).toBe("ready");
    expect(generateText).toHaveBeenCalledTimes(2);
    const composed = second.bundle!.slides[0].composition;
    expect(composed.pieces).toEqual(definition.pieces);
    expect(composed.base.instances).toEqual(definition.fragment.instances);
    const measureText = await createComponentTextMeasurer(definition.assets);
    const reopened = resolveArsenalGeometry(
      readArsenalComposition(JSON.parse(JSON.stringify(composed))),
      { measureText },
    );
    expect(
      reopened.elements.map((element) => ({
        id: element.id,
        text: element.text,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      })),
    ).toEqual(
      composed.elements.map((element) => ({
        id: element.id,
        text: element.text,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      })),
    );
  });

  it("does not purchase a repair for text beyond the character estimate when the real font fits", async () => {
    const estimate = compactWritableSlides(input(), [definition])[0].fields[0]
      .capacity!.estimatedCharacters;
    const title = "i ".repeat(Math.ceil((estimate + 9) / 2)).trim();
    const generateText = vi.fn(async () => response(copy(title)));
    const result = await executeProposalWorkflow(input(), {
      actor,
      generateText,
    });
    expect(result.status, result.errorReason).toBe("ready");
    expect(title.length).toBeGreaterThan(estimate);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("uses the material review finding to repair only the authorized text and rechecks it", async () => {
    vi.mocked(reviewProposal)
      .mockResolvedValueOnce(review("initial", [contradiction()]))
      .mockResolvedValueOnce(review("recheck"));
    const generateText = vi.fn(async (params) =>
      params.traceLabel?.endsWith("_editorial_recovery")
        ? response({
            patches: [
              {
                slideIndex: 0,
                fieldId: "field-0",
                itemIndex: null,
                value: "Café artesanal",
              },
            ],
          })
        : response(copy("Café gratuito")),
    );
    const result = await executeProposalWorkflow(input(), {
      actor,
      generateText,
    });
    expect(result.status, result.errorReason).toBe("ready");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(vi.mocked(reviewProposal)).toHaveBeenCalledTimes(2);
    const messages = JSON.stringify(generateText.mock.calls[1][0].messages);
    expect(messages).toContain("Gratuidade não foi informada");
    expect(messages).toContain("A cafeteria serve café artesanal");
    expect(messages).not.toContain("Legenda saudável exclusiva");
    expect(result.bundle!.caption).toBe(copy().caption);
  });

  it.each([false, true])("journals the raw targeted editorial receipt before validation and never repurchases it (malformed=%s)", async (malformed) => {
    vi.mocked(reviewProposal).mockImplementation(async (_i, _d, _defs, _compositions, _copy, round) => review(round, round === "initial" ? [contradiction()] : []));
    const rawRepair = malformed ? { choices: [{ message: { content: "{invalid" }, finish_reason: "stop" }] } : response({ patches: [{ slideIndex: 0, fieldId: "field-0", itemIndex: null, value: "Café artesanal" }] });
    const generateText = vi.fn(async (params: any) => params.traceLabel?.endsWith("_editorial_recovery") ? rawRepair : response(copy("Café gratuito")));
    const journal = new Map<string, any>();
    const deps: ProposalGraphDeps = {
      actor, generateText,
      executeOperation: async (operation, work) => {
        if (journal.has(operation.operationKey)) return journal.get(operation.operationKey);
        const result = await work(); journal.set(operation.operationKey, result); return result;
      },
      recoveryOperationKeys: async () => Array.from(journal.keys()).filter(key => key.startsWith("review_correction:")),
    };
    const value = input({ deliveryRecoveryEnabled: true });
    const first = await executeProposalWorkflow(value, deps);
    expect(first.status).toBe(malformed ? "failed" : "ready");
    const repair = generateText.mock.calls[1][0];
    expect(repair).toMatchObject({ structuredValidationOwner: "caller", durableProposalCopyReceipt: true, forceTextSchema: false, maxCompletionTokens: 2048, transportTimeoutMs: 60000, taskModelConfig: { model: "deepseek/deepseek-v4.1-flash", providerEndpoint: "deepinfra", allowProviderFallbacks: true, reasoningEnabled: false } });
    expect(journal.get(`review_correction:${"a".repeat(64)}`)).toEqual({ version: 1, kind: "targeted_editorial_repair", response: rawRepair });
    const replay = await executeProposalWorkflow(value, deps);
    expect(replay.status).toBe(first.status);
    expect(generateText).toHaveBeenCalledTimes(2);
    if (!malformed) expect(replay.bundle).toEqual(first.bundle);
  });

  it("keeps factual failure visible when the one automatic recovery has already been spent on fit", async () => {
    vi.mocked(reviewProposal).mockResolvedValue(
      review("initial", [contradiction()]),
    );
    const generateText = vi.fn(async (params) =>
      params.traceLabel?.endsWith("_copy_recovery")
        ? response({
            patches: [
              {
                slideIndex: 0,
                fieldId: "field-0",
                itemIndex: null,
                value: "Café gratuito",
              },
            ],
          })
        : response(copy("W".repeat(300))),
    );
    const result = await executeProposalWorkflow(input(), {
      actor,
      generateText,
    });
    expect(result.status).toBe("failed");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.reviews?.[0].findings[0].category).toBe(
      "factual_contradiction",
    );
  });
});


describe("automatic media contract", () => {
  function mediaDefinition() {
    const mediaPiece = { ...Object.values(definition.pieces)[0], kind: "media" as const, fixedText: null };
    const pieceHash = arsenalHash(mediaPiece);
    return createComponentDefinition({ ...definition, pieces: { ...definition.pieces, [pieceHash]: mediaPiece }, fragment: {
      ...definition.fragment,
      instances: [...definition.fragment.instances, { id: "reaction-slot", pieceHash, parentId: null, zIndex: -1, x: 0, y: 0, width: 1080, height: 700, rotation: 0, opacity: 1 }],
      mediaSlots: [{ id: "reaction-slot", label: "Reaction", function: "Editorial", prompt: "Café", deferred: true, policy: "cover" }],
    } });
  }
  it.each([false, true])("never purchases an image for purpose:none; native dependency=%s fails locally", async hasMedia => {
    const selectedDefinition = hasMedia ? mediaDefinition() : definition;
    const generate = vi.fn();
    const journal = vi.fn(async (_operation, work) => work());
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    vi.mocked(reviewProposal).mockResolvedValue(review());
    const result = await executeProposalWorkflow(input({ selectedDefinition, imageObligation: {
      policy: "optional", required: false, purpose: "none", reason: "Nenhuma imagem solicitada", slotTargets: 0,
    } }), {
      actor, generateText: vi.fn(async () => response(copy())), mediaAdapter: { generate }, executeOperation: journal, checkpoint,
      measureText: value => ({height:20,lines:[{width:100}],runs:[{fill:value.fill,fontSize:value.fontSize,fontStyle:value.fontStyle}]}),
    });
    expect(result.status).toBe(hasMedia ? "failed" : "ready");
    if (hasMedia) expect(result.failure).toEqual({ code: "artwork_unusable", stage: "media", retryable: false });
    expect(generate).not.toHaveBeenCalled();
    expect(journal.mock.calls.some(([operation]) => operation.stage === "image")).toBe(false);
    expect(checkpoint.mock.calls.some(([phase]) => phase === "image_started")).toBe(false);
  });
  it("uses the same V4 editorial contract for creation and origin-aware image context", async () => {
    const selectedDefinition = mediaDefinition();
    const generationConfig = resolveGenerationModelConfig({generationModel:"auto",postMode:"static"});
    const value = input({selectedDefinition,generationConfig,reviewExecutionConfig:resolveReviewExecutionConfigV10(undefined,generationConfig.taskRouting!.copy),imageObligation:{policy:"required",required:true,purpose:"editorial-photo",reason:"Foto solicitada",slotTargets:1}});
    const content = copy(); content.caption = "Contexto ".repeat(220) + "Condição material final: aos sábados.";
    const generate = vi.fn(async (_request: unknown) => ({url:`/api/post-media/${actor}/${"c".repeat(64)}`}));
    const generateText = vi.fn(async()=>response(content));
    const result = await executeProposalWorkflow(value,{actor,generateText,mediaAdapter:{generate},measureText:element=>({height:20,lines:[{width:100}],runs:[{fill:element.fill,fontSize:element.fontSize,fontStyle:element.fontStyle}]})});
    expect(result.status,result.errorReason).toBe("ready");
    const sent = generateText.mock.calls[0][0] as any;
    expect(sent.messages[0].content).toContain("Garantias, quantidades, causalidade");
    expect(JSON.parse(sent.messages[1].content)).toHaveProperty("editorial.request",value.prompt);
    expect(generate.mock.calls[0][0]).toMatchObject({postContext:{editorialPromptVersion:1,originalRequest:value.prompt,finalCopy:{caption:content.caption}}});
    expect(generateText).toHaveBeenCalledTimes(1);
  });
  it("still fulfills an actual required image obligation", async () => {
    const selectedDefinition = mediaDefinition();
    const generate = vi.fn(async (_request: unknown) => ({url:`/api/post-media/${actor}/${"c".repeat(64)}`}));
    vi.mocked(reviewProposal).mockResolvedValue(review());
    const result = await executeProposalWorkflow(input({ selectedDefinition, imageObligation: {
      policy: "required", required: true, purpose: "editorial-photo", reason: "Foto solicitada", slotTargets: 1,
    } }), {
      actor, generateText: vi.fn(async () => response(copy())), mediaAdapter: { generate },
      measureText: value => ({height:20,lines:[{width:100}],runs:[{fill:value.fill,fontSize:value.fontSize,fontStyle:value.fontStyle}]}),
    });
    expect(result.status, result.errorReason).toBe("ready");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({purpose:"editorial-photo"}));
  });
});

describe("targeted repair V2 local integration", () => {
  const measureText: NonNullable<ProposalGraphDeps["measureText"]> = value => {
    const natural = value.text.length * 10;
    const count = Math.max(1, Math.ceil(natural / value.width));
    return { height: count * 20, lines: Array.from({ length: count }, () => ({ width: Math.min(value.width, natural) })), runs: [] };
  };
  function collisionDefinition() {
    return createComponentDefinition({ ...definition, fragment: { ...definition.fragment,
      instances: definition.fragment.instances.map((element, index) => ({ ...element, x: 72, y: index ? 130 : 72, width: index ? 200 : 100, height: 100 })),
      relations: [{ id: "fit-title", version: 1, enabled: true, kind: "textFit", inputs: [], outputs: [{ targetId: definition.fragment.instances[0].id, properties: ["x", "width", "height", "fontSize"] }], parameters: { anchor: "left", maxWidth: 100, maxHeight: 100, minFontSize: 20 } }],
    } });
  }
  const long = "Uma ideia longa para escrever hoje";
  const patch = (fieldId: string, value: string, alternatives: string[] = []) => ({ slideIndex: 0, fieldId, itemIndex: null, value, alternatives });
  const writtenTitle = (result: Awaited<ReturnType<typeof executeProposalWorkflow>>) => result.bundle?.slides[0].composition.elements.find(element => element.bindingId === "title")?.text;

  it.each(["adaptive_v2", "subpixel_v1"] as const)("chooses the collision-free alternative only for the new policy (%s)", async layoutFitPolicy => {
    vi.mocked(reviewProposal).mockImplementation(async (_i, _d, _defs, _scenes, _copy, round) => review(round, round === "initial" ? [contradiction()] : []));
    const original = copy("Olá"); original.slides[0].values[1].value = "Apoio";
    const generateText = vi.fn(async (params: any) => response(params.traceLabel.endsWith("_editorial_recovery") ? { patches: [patch("field-0", long, ["Breve"])] } : original));
    const value = input({ selectedDefinition: collisionDefinition() }); value.generationConfig = { ...value.generationConfig!, layoutFitPolicy };
    const result = await executeProposalWorkflow(value, { actor, generateText, measureText });
    expect(result.status, result.errorReason).toBe(layoutFitPolicy === "adaptive_v2" ? "ready" : "failed");
    if (layoutFitPolicy === "adaptive_v2") expect(writtenTitle(result)).toBe("Breve");
    else expect(result.findings.some(finding => finding.rule === "collision")).toBe(true);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(original.slides[0].values[0].value).toBe("Olá");
  });

  it.each([false, true])("uses provider patch order when the neighboring target is already applied=%s", async neighborApplied => {
    // Findings deliberately use the opposite order from the provider response.
    const findings = [contradiction(), { ...contradiction(), fieldId: "field-1" }];
    vi.mocked(reviewProposal).mockImplementation(async (_i, _d, _defs, _scenes, _copy, round) => review(round, round === "initial" ? (neighborApplied ? findings : [...findings].reverse()) : []));
    const original = copy("Olá"); original.slides[0].values[1].value = "Apoio";
    const title = patch("field-0", long, ["Breve"]), neighbor = patch("field-1", neighborApplied ? "Novo" : "");
    const patches = neighborApplied ? [neighbor, title] : [title, neighbor];
    const generateText = vi.fn(async (params: any) => response(params.traceLabel.endsWith("_editorial_recovery") ? { patches } : original));
    const result = await executeProposalWorkflow(input({ selectedDefinition: collisionDefinition() }), { actor, generateText, measureText });
    expect(result.status, result.errorReason).toBe("ready");
    expect(writtenTitle(result)).toBe(neighborApplied ? "Breve" : long);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("preserves frozen editorial continuation in both the provider prompt and durable replay", async () => {
    const selectedDefinition = createComponentDefinition({ ...definition, completeDesign: { ...definition.completeDesign!, designGuidance: {
      version: 1, summary: "Convite e destino", motifs: [], preserve: [], contentRules: [], mediaRules: [], knownLimitations: [],
      fieldRelationships: [{ kind: "sequence", sources: ["block:headline:0:text", "block:body:0:text"], label: "Convite seguido pela marca" }],
    } } });
    const original = copy("Venha a"); original.slides[0].values[1].value = "Lume";
    vi.mocked(reviewProposal).mockImplementation(async (_i, _d, _defs, _scenes, _copy, round) => review(round, round === "initial" ? [contradiction()] : []));
    const generateText = vi.fn(async (params: any) => response(params.traceLabel.endsWith("_editorial_recovery") ? { patches: [patch("field-0", "Venha à", ["Conheça"])] } : original));
    const journal = new Map<string, any>();
    const deps: ProposalGraphDeps = { actor, generateText, measureText,
      executeOperation: async (operation, work) => { if (journal.has(operation.operationKey)) return journal.get(operation.operationKey); const result = await work(); journal.set(operation.operationKey, result); return result; },
      recoveryOperationKeys: async () => Array.from(journal.keys()).filter(key => key.startsWith("review_correction:")),
    };
    const value = input({ selectedDefinition, deliveryRecoveryEnabled: true });
    const first = await executeProposalWorkflow(value, deps);
    expect(first.status, first.errorReason).toBe("ready");
    expect(writtenTitle(first)).toBe("Venha à");
    const prompt = JSON.parse(generateText.mock.calls[1][0].messages[1].content);
    expect(prompt.targets[0].frozenContinuation).toBe(true);
    expect(prompt.targets[0].fit).toEqual(expect.objectContaining({ widthRatio: expect.any(Number), heightRatio: expect.any(Number) }));
    expect(prompt.targets[0].coverage).toBeDefined();
    const replay = await executeProposalWorkflow(value, deps);
    expect(replay.status, replay.errorReason).toBe("ready");
    expect(replay.bundle).toEqual(first.bundle);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(original.slides[0].values[1].value).toBe("Lume");
  });
});


it("normalizes invented profile handles before geometry and the actual review handoff only for new admissions",async()=>{
  const generationConfig=resolveGenerationModelConfig({generationModel:"auto",postMode:"static"});
  const value=input({generationConfig,reviewExecutionConfig:resolveReviewExecutionConfigV10(undefined,generationConfig.taskRouting!.copy)});
  const generated=copy("@lume_inventada");
  const result=await executeProposalWorkflow(value,{actor,generateText:vi.fn(async()=>response(generated)),measureText:element=>({height:20,lines:[{width:100}],runs:[{fill:element.fill,fontSize:element.fontSize,fontStyle:element.fontStyle}]})});
  expect(result.status,result.errorReason).toBe("ready");
  expect(vi.mocked(reviewProposal).mock.calls[0][4].slides[0].values[0].value).toBe("@seuperfil");
  expect(generated.slides[0].values[0].value).toBe("@lume_inventada");
});


it("accepts copy beyond the new advisory range when the actual Fontkit layout fits, without purchasing a repair",async()=>{
  const generationConfig=resolveGenerationModelConfig({generationModel:"auto",postMode:"static"});
  const value=input({generationConfig,reviewExecutionConfig:resolveReviewExecutionConfigV10(undefined,generationConfig.taskRouting!.copy)});
  const capacity=compactWritableSlides(value,[definition])[0].fields[0].capacity!;
  if(!("chars" in capacity))throw Error("text flexibility marker missing");
  const upper=capacity.chars![1];
  const title="i ".repeat(Math.ceil((upper+9)/2)).trim();
  const generateText=vi.fn(async()=>response(copy(title)));
  const result=await executeProposalWorkflow(value,{actor,generateText});
  expect(title.length).toBeGreaterThan(upper);
  expect(result.status,result.errorReason).toBe("ready");
  expect(generateText).toHaveBeenCalledTimes(1);
  expect(vi.mocked(reviewProposal).mock.calls[0][4].slides[0].values[0].value).toBe(title);
});
