import { copyInstructionsV9 } from "./reviewExecutionConfigV9";
import { validatedEditorialContextV9 } from "./editorialContextV9";
import { copyInstructionsV8 } from "./reviewExecutionConfigV8";
import { assertPinnedReviewConfig } from "./pinnedReviewConfig";
import { resolvedEditorialContext, validatedEditorialContextV8 } from "./editorialContextV8";
import type { GenerationProjectSnapshot } from "@shared/projectEditorial";
import { GenerationFailureError } from "@shared/generationFailure";
import { effectiveContentRequirements, requirementMatches } from "@shared/contentRequirements";
import { editorialContextV7, validatedEditorialContext } from "./editorialContextV7";
import { assertReviewExecutionConfigV7, copyInstructionsV7 } from "./reviewExecutionConfigV7";
import { failureFromError } from "@shared/generationFailure";
import { isBlockingReviewFinding } from "@shared/proposalReview";
import { reviewFailureCode } from "@shared/proposalReviewFailure";
import { z } from "zod";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { CreativeExecutionBrief } from "@shared/postspark";
import {
  completeDesignFields,
  completeDesignVariationV1Schema,
  instantiateCompleteDesign,
  type CompleteDesignVariationV1,
} from "@shared/completeDesignGeneration";
import {
  arsenalWorldGeometry,
  measureArsenalElement,
  resolveArsenalGeometry,
  type ArsenalTextMeasurer,
} from "@shared/arsenalGeometry";
import {
  arsenalFontMatches,
  type ArsenalComposition,
} from "@shared/designArsenal";
import { arsenalHash } from "@shared/arsenalContent";
import {
  defaultStudioPreferences,
  studioPreferencesSchema,
  type StudioPreferences,
} from "@shared/studioPreferences";
import type { InvokeParams, InvokeResult } from "../../_core/llm";
import { extractTextContent, safeJsonParse } from "../llmJson";
import { recordGenerationEvent } from "../generationTrace";
import { createComponentTextMeasurer } from "../componentTextMeasurer";
import {
  imagePostContextSchema,
  type ImagePostContext,
} from "@shared/imageGeneration";
import type { ProposalMediaRequest } from "./proposalMedia";
import {
  applyReviewCorrections,
  reviewProposal,
  type RenderReviewScenes,
} from "./proposalReview";
import type { ProposalReviewRecord } from "@shared/proposalReview";
import {
  canonicalizeEditorialNames,
  editorialPlanSchema,
  narrativeEditorialPlanSchema,
  editorialInstructions,
  protectedEditorialEntities,
  validateEditorialPlan,
  type EditorialPlan,
} from "./proposalEditorial";
import { carouselNarrativeContract } from "@shared/carouselNarrative";
import { partitionArsenalReadinessIssues } from "@shared/arsenalReadiness";
import {
  proposalDeliverySchema,
  imageTaskContractSchema,
  type ImageObligation,
  type ImageTaskContract,
  type ProposalDelivery,
  type ProposalDiagnostic,
  type TechnicalFinding,
} from "@shared/generationContracts";

export interface ProposalMediaAdapter {
  generate: (input: ProposalMediaRequest) => Promise<{ url: string }>;
}

export interface ProposalGraphDeps {
  /** Relative review operation keys and their durable results, scoped to this proposal. */
  reviewOperations?: (proposalId: string) => Promise<import("./generationStore").GenerationOperationRecord[]>;
  /** Non-durable harnesses only; production always supplies reviewOperations. */
  reviewOperationCache?: Map<string, import("./generationStore").GenerationOperationRecord>;
  reviewRepairOperationKeys?: (proposalId: string) => Promise<string[]>;
  reviewRepairBudget?: Set<string>;
  persistReviewExpectation?:(key:string,expectation:unknown)=>Promise<void>;
  generateText: (params: InvokeParams) => Promise<InvokeResult>;
  /** Relative durable recovery keys already purchased for this proposal. */
  recoveryOperationKeys?: (proposalId: string,attemptId?:string) => Promise<string[]>;
  /** Tests may inject a measured implementation; production defaults to Fontkit-backed assets. */
  measureText?: ArsenalTextMeasurer;
  createTextMeasurer?: typeof createComponentTextMeasurer;
  mediaAdapter?: ProposalMediaAdapter;
  /** Defaults to the real CanvasPostStage renderer; tests inject fixture pixels. */
  renderReviewScenes?: RenderReviewScenes;
  executeOperation?: <T>(
    input: {
      operationKey: string;
      stage: string;
      deadlineMs?: number;
      signal?: AbortSignal;
    },
    work: () => Promise<T>
  ) => Promise<T>;
  checkpoint?: (
    stage: string,
    context?: Record<string, unknown>
  ) => Promise<void>;
  actor: string;
}

import { type ReviewExecutionConfigV1 } from "./proposalReviewV6";

export interface ProposalSourceReference {
  id?:string;kind?:string;purpose?:string;origin?:string;
  url?: string;
  title?: string;
  facts?: string;
}

export interface ProposalExecutionInput {
  reviewPolicyVersion?: 5 | 6 | 7 | 8 | 9;
  reviewExecutionConfig?: ReviewExecutionConfigV1 | import("@shared/proposalReviewV7").ReviewExecutionConfigV2 | import("@shared/proposalReviewV8").ReviewExecutionConfigV3 | import("@shared/proposalReviewV9").ReviewExecutionConfigV4;
  editorialContextHash?: string;
  previousReviewContext?: { previous: ProposalReviewRecord; changedTargets: Array<{slideIndex:number;fieldId:string}> };
  requestId: string;
  runId: string;
  proposalId: string;
  slot: number;
  revision?: number;
  prompt: string;
  contextContent?: string;
  projectSnapshot?: GenerationProjectSnapshot;
  projectDossier?: string;
  editorialContext?: import("./editorialContextV8").EditorialContext;
  sourceReferences?: ProposalSourceReference[];
  referenceImages?: string[];
  sourceImages?: string[];
  selectedDefinition?: ComponentDefinitionV1;
  selectedDefinitions?: ComponentDefinitionV1[];
  visualPreference?: StudioPreferences;
  executionBrief?: CreativeExecutionBrief;
  creationMode?: "ideation" | "execution";
  platform?: string;
  tone?: string;
  model?: InvokeParams["model"];
  postMode?: "static" | "carousel";
  experimental?: boolean;
  selectionReason?: string;
  editorialApproach?: string | null;
  imageObligation?: ImageObligation;
  deadlineMs?: number;
  signal?: AbortSignal;
}

type CopySlide = {
  values: Array<{ fieldId: string; value: string | string[] }>;
  mediaPrompts: Array<{ slotId: string; prompt: string }>;
};
type CopyResponse = {
  caption: string;
  hashtags: string[];
  slides: CopySlide[];
  editorialPlan?: EditorialPlan;
};

const sourceReferenceSchema = z
  .object({
    id:z.string().optional(),kind:z.string().optional(),purpose:z.string().optional(),origin:z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    facts: z.string().optional(),
  })
  .strict();

function abortError(input: ProposalExecutionInput): Error | undefined {
  if (
    (input.deadlineMs !== undefined && Date.now() >= input.deadlineMs) ||
    (input.signal?.aborted &&
      input.signal.reason instanceof Error &&
      input.signal.reason.message === "generation_deadline_exceeded")
  )
    return new Error("proposal_deadline_expired");
  if (input.signal?.aborted) {
    const error = new Error("proposal_cancelled");
    error.name = "AbortError";
    return error;
  }
}

function proposalErrorStatus(
  error: unknown
): "failed" | "cancelled" | "expired" {
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  if (error instanceof Error && error.message === "proposal_deadline_expired")
    return "expired";
  return "failed";
}

function checkedDelivery(value: unknown): ProposalDelivery {
  return proposalDeliverySchema.parse(value);
}

function copyResponseSchema(
  definitions: ComponentDefinitionV1[],
  narrative = false,
  creative = false,
  allowOptionalEmptyLists = false
) {
  const slides = definitions.map(definition => {
    const fields = completeDesignFields(definition);
    const valueOptions = fields.map(field =>
      z
        .object({
          fieldId: z.literal(field.id),
          value:
            field.kind === "list"
              ? (allowOptionalEmptyLists && !field.required
                  ? z.union([z.tuple([]), z.array(z.string()).min(field.cardinality?.min ?? 0).max(field.cardinality?.max ?? 1000)])
                  : z.array(z.string()).min(field.cardinality?.min ?? 0).max(field.cardinality?.max ?? 1000))
              : z.string(),
        })
        .strict()
    );
    return z
      .object({
        values: z
          .array(
            z.union(
              valueOptions as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]
            )
          )
          .length(fields.length),
        mediaPrompts: z.array(
          z
            .object({
              slotId: z.string(),
              prompt: z.string().min(1).max(2000),
            })
            .strict()
        ),
      })
      .strict()
      .superRefine((slide, ctx) => {
        const seen = new Set<string>();
        const values = slide.values as Array<{
          fieldId: string;
          value: string | string[];
        }>;
        const prompts = slide.mediaPrompts as Array<{
          slotId: string;
          prompt: string;
        }>;
        for (const value of values) {
          if (seen.has(value.fieldId))
            ctx.addIssue({
              code: "custom",
              path: ["values"],
              message: `fieldId duplicado: ${value.fieldId}`,
            });
          seen.add(value.fieldId);
          const field = fields.find(
            candidate => candidate.id === value.fieldId
          )!;
          if (field.kind === "list" && !Array.isArray(value.value))
            ctx.addIssue({
              code: "custom",
              path: ["values"],
              message: `Lista deve ser array: ${field.id}`,
            });
          if (field.kind !== "list" && typeof value.value !== "string")
            ctx.addIssue({
              code: "custom",
              path: ["values"],
              message: `Campo textual deve ser string: ${field.id}`,
            });
        }
        if (new Set(prompts.map(item => item.slotId)).size !== prompts.length)
          ctx.addIssue({
            code: "custom",
            path: ["mediaPrompts"],
            message: "Slot de mídia duplicado",
          });
        for (const item of prompts)
          if (
            !(definition.fragment.mediaSlots ?? []).some(
              slot => slot.id === item.slotId
            )
          )
            ctx.addIssue({
              code: "custom",
              path: ["mediaPrompts"],
              message: `Slot de mídia desconhecido: ${item.slotId}`,
            });
      });
  });
  const schema = z
    .object({
      caption: z.string().default(""),
      hashtags: z.array(z.string()).default([]),
      editorialPlan: narrative
        ? narrativeEditorialPlanSchema
        : editorialPlanSchema.optional(),
      slides: z
        .array(z.union(slides as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]))
        .length(definitions.length),
    })
    .strict();
  return creative ? schema.omit({editorialPlan:true}) : schema;
}

function jsonSchemaFormat(
  schema: z.ZodType,
  name: string
): InvokeParams["response_format"] {
  const json = z.toJSONSchema(schema);
  delete json.$schema;
  return {
    type: "json_schema",
    json_schema: { name, strict: true, schema: json },
  };
}

function usesAffirmativeContext(input: ProposalExecutionInput) {
  return (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) || (input.reviewPolicyVersion === 7 && input.reviewExecutionConfig?.version === 2 && input.reviewExecutionConfig.editorialGuidanceVersion === 6);
}
function proposalContentRequirements(input: ProposalExecutionInput) {
  return usesAffirmativeContext(input) ? resolvedEditorialContext(input.editorialContext ?? editorialContextV7(input, 6)).requirements : effectiveContentRequirements(input.executionBrief);
}

function executionInstructions(input: ProposalExecutionInput): string {
  if ((input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) return "Orientações, requisitos e suas origens estão referenciados no contexto editorial único. Resolva essas referências antes de compor.";
  if (usesAffirmativeContext(input)) {
    const context = input.editorialContext ?? editorialContextV7(input, 6);
    return `Orientações efetivas: ${JSON.stringify(context.instructions)}\nOrigens: ${JSON.stringify(context.instructionOrigins)}\nObrigações efetivas: ${JSON.stringify(context.requirements)}`;
  }
  const brief = input.executionBrief;
  if (!brief)
    return "Crie copy adequada ao pedido e ao contexto factual, sem inventar fatos.";
  const level = brief.interventionLevel;
  if (input.reviewPolicyVersion === 7) {
    const config = input.reviewExecutionConfig as import("@shared/proposalReviewV7").ReviewExecutionConfigV2 | undefined;
    const isProfile5 = config?.editorialGuidanceVersion === 5;
    const brandElements = isProfile5 ? [
      brief.audience ? `público: ${brief.audience}` : null,
      brief.brandEssence ? `essência: ${brief.brandEssence}` : null,
    ].filter(Boolean) : [];
    const brandSuffix = brandElements.length > 0 ? `; ${brandElements.join("; ")}` : "";
    return [`Intervenção: ${brief.interventionLevel}; objetivo: ${brief.objective}; tom: ${brief.tone ?? input.tone ?? "não especificado"}; CTA: ${brief.callToAction ?? "não especificado"}${brandSuffix}.`, `Obrigações efetivas: ${JSON.stringify(effectiveContentRequirements(brief))}`, `Notas: ${brief.notes ?? "nenhuma"}`].join("\n");
  }
  const levelInstruction =
    level === "visual_only"
      ? "Intervenção visual_only: preserve literalmente o texto-fonte. Não reescreva, resuma, corrija, expanda ou mude seu sentido. Distribua o texto existente pelos campos nativos; se não couber, sinalize a limitação em vez de alterar o texto."
      : level === "light_optimize"
        ? "Intervenção light_optimize: faça somente ajustes leves de clareza e concisão, preservando fatos e intenção."
        : "Intervenção optimize_structure: reorganize a estrutura quando necessário, preservando todos os fatos e obrigações literais.";
  return [
    `Modo de criação: ${brief.creationMode}; formato: ${brief.format}; plataforma: ${brief.platform}; objetivo: ${brief.objective}.`,
    levelInstruction,
    `Tom: ${brief.tone ?? input.tone ?? "não especificado"}. CTA: ${brief.callToAction ?? "não especificado"}.`,
    `Trechos obrigatórios literais (mustKeep): ${JSON.stringify(brief.mustKeep ?? [])}.`,
    `Conteúdos que devem aparecer (mustInclude): ${JSON.stringify(brief.mustInclude ?? [])}.`,
    `Termos proibidos: ${JSON.stringify(brief.forbiddenTerms ?? [])}.`,
    `Notas: ${brief.notes ?? "nenhuma"}.`,
    `Marca e origem: ${JSON.stringify(brief.brandInput ?? {})}.`,
  ].join("\n");
}

function combinedCopyText(copy: CopyResponse): string {
  return [
    copy.caption,
    ...copy.slides.flatMap(slide =>
      slide.values.flatMap(row =>
        Array.isArray(row.value) ? row.value : [row.value]
      )
    ),
    ...copy.hashtags,
  ].join("\n");
}

function checkBriefConstraints(
  copy: CopyResponse,
  input: ProposalExecutionInput
): string[] {
  const brief = input.executionBrief;
  if (!brief && !usesAffirmativeContext(input)) return [];
  const text = combinedCopyText(copy);
  const issues: string[] = [];
  if (brief?.interventionLevel === "visual_only") {
    const normalizeWhitespace = (value: string) =>
      value.trim().replace(/\s+/g, " ");
    const source = normalizeWhitespace(brief.rawInput);
    const definitions =
      input.selectedDefinitions ??
      (input.selectedDefinition ? [input.selectedDefinition] : []);
    const visibleText = copy.slides
      .flatMap((slide, index) => {
        // A provider may return values in any order; the authored field order is
        // the reading order installed by instantiateCompleteDesign.
        const fields = definitions[index]
          ? completeDesignFields(definitions[index])
          : [];
        return fields.flatMap(field => {
          const value =
            slide.values.find(row => row.fieldId === field.id)?.value ?? "";
          return Array.isArray(value) ? value : [value];
        });
      })
      .join(" ");
    if (!source || normalizeWhitespace(visibleText) !== source)
      issues.push("visual_only_source_not_preserved_literally");
    if (copy.caption.trim() && normalizeWhitespace(copy.caption) !== source)
      issues.push("visual_only_caption_expands_source");
    if (copy.hashtags.some(tag => !brief.rawInput.includes(tag)))
      issues.push("visual_only_hashtags_expand_source");
  }
  if((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) {
    const art=copy.slides.flatMap(s=>s.values.flatMap(v=>Array.isArray(v.value)?v.value:[v.value]));
    const caption=[copy.caption,...copy.hashtags];
    for(const r of proposalContentRequirements(input).filter(r=>r.kind!=="meaning")) {
      const values=r.scope==="art"?[art.join("\n")]:r.scope==="caption"?[caption.join("\n")]:[art.join("\n"),caption.join("\n")];
      const matched=values.some(v=>requirementMatches(v,r));
      if(r.kind==="forbidden"?matched:!matched) issues.push(`requirement_unmet:${r.id}`);
    }
    return issues;
  }
  for (const required of [
    ...(brief?.mustKeep ?? []),
    ...(brief?.mustInclude ?? []),
  ])
    if (required && !text.includes(required))
      issues.push(`missing_required_literal:${required}`);
  for (const forbidden of brief?.forbiddenTerms ?? [])
    if (
      forbidden &&
      text.toLocaleLowerCase().includes(forbidden.toLocaleLowerCase())
    )
      issues.push(`forbidden_term:${forbidden}`);
  return issues;
}

function mediaReferences(
  input: ProposalExecutionInput
): NonNullable<ProposalMediaRequest["references"]> {
  const brand = input.executionBrief?.brandInput;
  const references = Array.from(
    new Set([
      ...(input.referenceImages ?? []),
      ...(brand?.referenceImageUrl ? [brand.referenceImageUrl] : []),
      ...(brand?.logoUrl ? [brand.logoUrl] : []),
    ])
  );
  return references.map(reference =>
    reference.startsWith("data:image/")
      ? { dataUri: reference }
      : { url: reference }
  );
}

function mediaPostContext(
  input: ProposalExecutionInput,
  definition: ComponentDefinitionV1,
  slide: CopySlide,
  caption: string
): ImagePostContext {
  const values = slide.values.flatMap(item =>
    Array.isArray(item.value) ? item.value : [item.value]
  );
  const brand = input.executionBrief?.brandInput;
  return imagePostContextSchema.parse({
    headline: values[0]?.slice(0, 180),
    body: values.slice(1).join(" ").slice(0, 500),
    caption: caption.slice(0, 1500),
    familyName: definition.completeDesign?.family.slice(0, 80),
    compositionGuidance: [
      input.executionBrief?.objective &&
        `Objetivo: ${input.executionBrief.objective}`,
      input.executionBrief?.tone && `Tom: ${input.executionBrief.tone}`,
      brand?.adaptationMode && `Adaptação de marca: ${brand.adaptationMode}`,
      brand?.brandColors?.length &&
        `Cores de marca: ${brand.brandColors.join(", ").slice(0, 300)}`,
    ]
      .filter(Boolean)
      .join(". ")
      .slice(0, 1200),
  });
}

function postModeRole(
  index: number,
  count: number
): "static" | "cover" | "development" | "closing" {
  if (count === 1) return "static";
  if (index === 0) return "cover";
  if (index === count - 1) return "closing";
  return "development";
}

function inspectScenes(
  compositions: ArsenalComposition[],
  definitions: ComponentDefinitionV1[],
  measureText: ArsenalTextMeasurer
) {
  const inspected = compositions.map((source, index) => {
    const composition = resolveArsenalGeometry(source, {
      measureText,
      allowReduction: true,
      elasticReduction: true,
    });
    // Persist the already authored, bounded fit as an explicit resolved override.
    // Canvas edits/reopening may resolve relations again with reduction disabled.
    for (const element of composition.elements) {
      const repeatedBaseId = composition.base.bindings.find(
        binding =>
          binding.id === element.bindingId &&
          binding.kind === "list" &&
          binding.listMode !== "native-slots"
      )?.targetIds[0];
      const instance = composition.base.instances.find(
        instance => instance.id === element.id || instance.id === repeatedBaseId
      );
      const piece = instance && composition.pieces[instance.pieceHash];
      if (
        element.kind === "text" &&
        piece &&
        element.fontSize < piece.fontSize &&
        !Object.hasOwn(source.overrides[element.id] ?? {}, "fontSize")
      )
        composition.overrides[element.id] = {
          ...composition.overrides[element.id],
          fontSize: element.fontSize,
        };
    }
    const diagnostics: ProposalDiagnostic[] = [];
    const { diagnostics: nonBlocking, blocking } =
      partitionArsenalReadinessIssues(composition.issues);
    for (const issue of nonBlocking) {
      const contrast = issue.startsWith("contrast:unknown:");
      diagnostics.push({
        code: contrast ? "contrast_unknown" : "authored_text_media_overlap",
        target: `slide-${index + 1}:${issue.slice(issue.indexOf(":", issue.indexOf(":") + 1) + 1)}`,
        evidence: contrast
          ? "Não há amostragem confiável da superfície raster da imagem para medir contraste."
          : "Sobreposição de texto e mídia faz parte da composição autorada e não há requisito explícito que a proíba.",
      });
    }
    // Only explicit authored targets create an occupation requirement. Optional
    // fields and undeclared empty fragments remain valid; no visual heuristic.
    const requiredTextTargets =
      definitions[index].completeDesign?.designGuidance?.requiredTextTargets ??
      [];
    for (const target of requiredTextTargets) {
      const element = composition.elements.find(
        element => element.id === target
      );
      if (element?.kind === "text" && !element.text?.trim())
        blocking.push(`required_text_fragment:${target}`);
    }
    for (const element of composition.elements) {
      if (element.kind !== "text") continue;
      const authoredBox = definitions[index].fragment.instances.find(
        instance => instance.id === element.id
      );
      const measuredElement = authoredBox
        ? { ...element, width: authoredBox.width, height: authoredBox.height }
        : element;
      const measured = measureArsenalElement(measuredElement, measureText);
      if (
        (measured.height > measuredElement.height + 0.01 ||
          measured.lines.some(
            line => line.width > measuredElement.width + 0.01
          )) &&
        !blocking.some(
          issue => issue.includes(element.id) && issue.startsWith("overflow:")
        )
      )
        blocking.push(`overflow:${element.id}`);
    }
    const findings: TechnicalFinding[] = blocking.map(issue => ({
      rule: issue.split(":", 2)[0] ?? "geometry_integrity",
      target: `slide-${index + 1}:${issue.split(":").at(-1)}`,
      severity: "fatal",
      evidence: `Defeito técnico mensurável no layout resolvido: ${issue}`,
    }));
    const normalized = composition.issues.length
      ? { ...composition, issues: [], state: "applied" as const }
      : composition;
    return { composition: normalized, findings, diagnostics };
  });
  return {
    slides: inspected,
    findings: inspected.flatMap(item => item.findings),
    diagnostics: inspected.flatMap(item => item.diagnostics),
  };
}

/**
 * Per-proposal lifecycle. Copy is generated once for all slide compositions;
 * each required image is then generated and persisted for its own native slot.
 */
export async function executeProposalWorkflow(
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps
): Promise<ProposalDelivery> {
  deps = { ...deps, reviewRepairBudget: new Set<string>(), reviewOperationCache: new Map() };
  const { runId, proposalId, slot } = input;
  const revision = input.revision ?? 1;
  const findings: TechnicalFinding[] = [];
  const diagnostics: ProposalDiagnostic[] = [];
  const reviews: ProposalReviewRecord[] = [];
  let executionStage: "copy" | "media" | "review" = "copy";
  let recoveryUsed = false;
  const priorRecoveryKeys = new Set<string>();
  const base = {
    contractVersion: 1 as const,
    proposalId,
    runId,
    slot,
    revision,
    findings,
    diagnostics,
    reviews,
  };
  const rawDefinitions =
    input.selectedDefinitions ??
    (input.selectedDefinition ? [input.selectedDefinition] : []);
  const definitions = rawDefinitions;

  try {
    console.info(
      `[proposal:${proposalId}] 🎨 Iniciando geração (slot ${slot}, família: ${definitions[0]?.completeDesign?.family ?? "unknown"})...`
    );
    if (deps.recoveryOperationKeys)
      for (const key of await deps.recoveryOperationKeys(proposalId))
        priorRecoveryKeys.add(key);
    if (deps.reviewRepairOperationKeys) for (const key of await deps.reviewRepairOperationKeys(proposalId)) deps.reviewRepairBudget!.add(key);
    recoveryUsed = priorRecoveryKeys.size > 0;
    if((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) {
      const pinnedConfig = assertPinnedReviewConfig(input.reviewExecutionConfig);
      if(pinnedConfig.policyVersion !== input.reviewPolicyVersion) throw new GenerationFailureError("preparation_contract_incompatible","copy");
      const guidanceVersion = (input.reviewExecutionConfig as import("@shared/proposalReviewV7").ReviewExecutionConfigV2 | undefined)?.editorialGuidanceVersion;
      try { input.reviewPolicyVersion === 9 ? validatedEditorialContextV9(input) : input.reviewPolicyVersion === 8 ? validatedEditorialContextV8(input) : validatedEditorialContext(input, guidanceVersion); } catch { throw new GenerationFailureError("preparation_contract_incompatible", "copy"); }
    }
    if (!definitions.length || definitions.length > 10)
      throw new Error("proposal_definitions_required");
    if (!runId || !z.string().uuid().safeParse(runId).success)
      throw new Error("proposal_run_id_must_be_uuid");
    if (input.postMode === "static" && definitions.length !== 1)
      throw new Error("static_proposal_requires_one_slide");
    if (input.postMode === "carousel" && definitions.length < 2)
      throw new Error("carousel_proposal_requires_multiple_slides");
    const families = new Set(
      definitions.map(definition => definition.completeDesign?.family)
    );
    if (
      families.size !== 1 ||
      definitions.some(
        definition => !definition.completeDesign?.baselineVerified
      )
    )
      throw new Error("proposal_design_family_or_baseline_invalid");

    // Load and verify real font metrics before any provider call.
    const loadMeasurer = async () => {
      const remaining = (input.deadlineMs ?? Date.now() + 30_000) - Date.now();
      if (remaining <= 0) throw new Error("proposal_deadline_expired");
      const deadline = AbortSignal.timeout(Math.min(remaining, 30_000));
      const signal = input.signal
        ? AbortSignal.any([input.signal, deadline])
        : deadline;
      signal.throwIfAborted();
      let stop: () => void = () => undefined;
      const aborted = new Promise<never>((_, reject) => {
        stop = () =>
          reject(
            deadline.aborted && !input.signal?.aborted
              ? new Error(
                  remaining <= 30_000
                    ? "proposal_deadline_expired"
                    : "proposal_font_preflight_timeout"
                )
              : (signal.reason ?? new Error("proposal_cancelled"))
          );
        signal.addEventListener("abort", stop, { once: true });
      });
      try {
        // The race also bounds injected loaders that ignore cooperative cancellation.
        return await Promise.race([
          (deps.createTextMeasurer ?? createComponentTextMeasurer)(
            Array.from(
              new Map(
                definitions
                  .flatMap(definition => definition.assets)
                  .map(asset => [asset.id, asset])
              ).values()
            ),
            undefined,
            signal
          ),
          aborted,
        ]);
      } finally {
        signal.removeEventListener("abort", stop);
      }
    };
    const measureText = deps.measureText ?? (await loadMeasurer());
    if ((input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) deps = {...deps,measureText};
    for (const definition of definitions) {
      for (const [pieceHash, piece] of Object.entries(definition.pieces)) {
        if (piece.kind !== "text") continue;
        if (
          piece.fontAssetId &&
          !definition.assets.some(asset => arsenalFontMatches(asset, piece))
        )
          throw new Error(`component_font_manifest_mismatch:${pieceHash}`);
        measureText({
          text: "PostSpark",
          width: 1000,
          fontSize: piece.fontSize,
          fontFamily: piece.fontFamily,
          fontStyle: String(piece.fontWeight),
          fill: piece.fill,
          align: piece.align,
          lineHeight: piece.lineHeight,
          letterSpacing: piece.letterSpacing,
        });
      }
    }

    await deps.checkpoint?.("feasibility_checked", {
      slideCount: definitions.length,
    });
    const allFields = definitions.map(definition =>
      completeDesignFields(definition)
    );
    const mediaSlots = definitions.map(
      definition => definition.fragment.mediaSlots ?? []
    );
    const narrativeContract = (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? null : carouselNarrativeContract(
      definitions.length,
      input.executionBrief?.interventionLevel
    );
    const copySchema = copyResponseSchema(definitions, false, (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)), usesAffirmativeContext(input));
    const freshCopySchema = copyResponseSchema(
      definitions,
      Boolean(narrativeContract),
      (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)),
      usesAffirmativeContext(input)
    );
    const fieldSchemaNotes = definitions.map((definition, index) => ({
      slide: index,
      ...((input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? {artboard:definition.fragment.artboard,authoredGroups:definition.fragment.groups} : {}),
      narrative: narrativeContract?.slides[index] ?? null,
      designName: definition.label,
      family: definition.completeDesign!.family,
      designGuidance: definition.completeDesign?.designGuidance,
      fields: allFields[index].map(field => {
        const targets = definition.fragment.bindings
          .filter(binding => binding.source === field.source)
          .flatMap(binding => binding.targetIds)
          .map(id => {
            const instance = definition.fragment.instances.find(
              candidate => candidate.id === id
            );
            const piece = instance && definition.pieces[instance.pieceHash];
            const maxLines =
              instance && piece
                ? Math.max(
                    1,
                    Math.floor(
                      instance.height /
                        (piece.fontSize * (piece.lineHeight ?? 1.2))
                    )
                  )
                : undefined;
            const charsPerLine =
              instance && piece
                ? Math.floor(instance.width / (piece.fontSize * 0.55))
                : undefined;
            return {
              id,
              ...((input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? {x:instance?.x,y:instance?.y,rotation:instance?.rotation,parentId:instance?.parentId,fontWeight:piece?.fontWeight,align:piece?.align,lineHeight:piece?.lineHeight,letterSpacing:piece?.letterSpacing} : {}),
              width: instance?.width,
              height: instance?.height,
              fontFamily: piece?.fontFamily,
              fontSize: piece?.fontSize,
              maxLines,
              maxChars:
                maxLines !== undefined && charsPerLine !== undefined
                  ? maxLines * charsPerLine
                  : undefined,
              minWords: piece?.contentFragment?.count ?? 1,
              contentFragment: piece?.contentFragment ?? null,
              textFit: definition.fragment.relations
                .filter(
                  relation =>
                    relation.kind === "textFit" &&
                    relation.outputs.some(output => output.targetId === id)
                )
                .map(relation => relation.parameters),
              occupationRequired:
                definition.completeDesign?.designGuidance?.requiredTextTargets?.includes(
                  id
                ) ?? false,
            };
          });
        const fragments = targets.flatMap(target =>
          target.contentFragment ? [target.contentFragment] : []
        );
        const spans = fragments.map(fragment => {
          const weights = fragment.weights ?? Array(fragment.count).fill(1);
          return {
            start: weights
              .slice(0, fragment.index)
              .reduce((sum, w) => sum + w, 0),
            end: weights
              .slice(0, fragment.index + 1)
              .reduce((sum, w) => sum + w, 0),
            total: weights.reduce((sum, w) => sum + w, 0),
            last: fragment.index + 1 === fragment.count,
          };
        });
        // Advisory occupation guidance, never a new readiness veto. The actual
        // word partition, rather than target count alone, determines empty slices.
        let wordsForAllFragments: number | null = fragments.length
          ? Math.max(...fragments.map(fragment => fragment.count))
          : null;
        if (wordsForAllFragments !== null) {
          while (
            wordsForAllFragments <= 10000 &&
            spans.some(
              span =>
                (span.last
                  ? wordsForAllFragments!
                  : Math.floor(
                      (wordsForAllFragments! * span.end) / span.total
                    )) -
                  Math.floor(
                    (wordsForAllFragments! * span.start) / span.total
                  ) <
                1
            )
          )
            wordsForAllFragments++;
          if (wordsForAllFragments > 10000) wordsForAllFragments = null;
        }
        const partitionChars = targets
          .filter(target => target.contentFragment)
          .reduce((sum, target) => sum + (target.maxChars ?? 0), 0);
        const wholeValueChars = targets
          .filter(target => !target.contentFragment)
          .map(target => target.maxChars ?? 0);
        const estimatedMaxChars = fragments.length
          ? Math.min(partitionChars, ...wholeValueChars)
          : Math.min(...wholeValueChars);
        return {
          id: field.id,
          role: field.role,
          kind: field.kind,
          required: field.required,
          cardinality: field.cardinality,
          ...(usesAffirmativeContext(input) ? {textContract: field.kind === "list" ? "native_list: array de itens; prefixos e distribuição seguem os bindings" : fragments.length ? "word_partition: frase canônica contínua dividida por palavras entre caixas; quebras explícitas integram cada fragmento e consomem altura" : "continuous_text: valor inteiro na caixa; quebras autoradas consomem linhas e seguem o orçamento físico", authoredLines: targets.map(t => ({targetId:t.id, maxLines:t.maxLines, height:t.height})), optionalEmpty:!field.required} : {}),
          bindings: definition.fragment.bindings
            .filter(binding => binding.source === field.source)
            .map(binding => ({
              id: binding.id,
              kind: binding.kind,
              listMode: binding.listMode ?? null,
              prefix: binding.prefix,
              gap: binding.gap,
              targetIds: binding.targetIds,
            })),
          capacity: {
            distribution: fragments.length
              ? "word_partition"
              : "whole_value_per_target",
            minWords: Math.max(...targets.map(target => target.minWords), 1),
            wordsForAllFragments,
            estimatedMaxChars: Number.isFinite(estimatedMaxChars)
              ? estimatedMaxChars
              : null,
            advisory: true,
          },
          targets,
        };
      }),
      mediaSlots: mediaSlots[index],
    }));
    const execution = executionInstructions(input);
    const affirmative = usesAffirmativeContext(input);
    const userCopyPrompt = affirmative ? [
      `Contexto editorial congelado (projeto, playbook e pedido):\n${JSON.stringify(input.editorialContext ?? editorialContextV7(input, 6))}`,
      (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? `Abordagem editorial da proposta ${slot + 1}: ${input.editorialApproach ?? "Preserve a distribuição literal e as escolhas expressas da peça."}` : `Direção da proposta ${slot + 1}: ${input.selectionReason ?? "composição compatível"}. Desenvolva uma abordagem própria a partir desta direção.`,
      `Condições de composição dos templates reais:\n${JSON.stringify(fieldSchemaNotes)}`,
      "Entregue os campos nativos na ordem dos slides. Cada fieldId aparece uma vez, com string vazia ou lista vazia nos campos opcionais que dispensarem texto. Listas usam arrays; linhas autoradas seguem a distribuição e os limites de cada caixa.",
    ].join("\n\n") : [
      `Modo: ${input.creationMode ?? "ideation"}; plataforma: ${input.platform ?? input.executionBrief?.platform ?? "não especificada"}; tom: ${input.tone ?? input.executionBrief?.tone ?? "não especificado"}; formato: ${input.postMode ?? input.executionBrief?.format ?? (definitions.length > 1 ? "carousel" : "static")}.`,
      `Briefing original do usuário:\n${input.executionBrief?.rawInput ?? input.prompt}`,
      `Contexto factual extraído:\n${input.contextContent ?? "nenhum contexto factual adicional"}`,
      `Fontes e fatos com origem:\n${JSON.stringify(sourceReferenceSchema.array().parse(input.sourceReferences ?? []))}`,
      `Brief de execução e controles:\n${execution}`,
      `Pedido textual complementar:\n${input.prompt}`,
      `Grafias canônicas protegidas (não separar, abreviar ou inserir espaços dentro dos nomes): ${JSON.stringify(protectedEditorialEntities(input))}`,
      `Direção selecionada para esta proposta (${slot + 1}): ${input.selectionReason ?? "composição compatível com o pedido"}. Essa justificativa orienta a direção; não é fonte de fatos sobre o produto.`,
      `Composições nativas, capacidade, cardinalidade e alvos reais:\n${JSON.stringify(fieldSchemaNotes, null, 2)}`,
      ...(narrativeContract
        ? [
            `CONTRATO DA SEQUÊNCIA:\n${JSON.stringify({ version: narrativeContract.version, slides: narrativeContract.slides })}`,
            "Antes de preencher os campos, planeje a história em editorialPlan version=2: role, purpose, readerTakeaway, bridgeFromPrevious e factIds para cada slide. No primeiro, bridgeFromPrevious=''; nos demais, explique a ligação com a ideia anterior. Use o plano para distribuir os fatos e evitar uma capa que conte a história inteira.",
          ]
        : []),
      `Retorne uma entrada em slides para cada composição, na mesma ordem. Cada values deve preencher cada fieldId exatamente uma vez. Para listas, retorne array dentro de value. Não altere a estrutura das composições.`,
    ].join("\n\n");
    const copySystemPrompt = affirmative ? [
      "Você redige diretamente nas composições visuais autoradas do PostSpark. Entregue JSON no schema nativo fornecido.",
      (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? (input.reviewPolicyVersion === 9 ? copyInstructionsV9 : copyInstructionsV8) : copyInstructionsV7(6),
      "Os contratos textContract e bindings descrevem a distribuição real: continuous_text mantém a frase inteira; word_partition reparte um valor canônico por palavras com index/count/weights; native_list recebe arrays; linhas autoradas preservam as quebras intencionais compatíveis com a altura. Componha frases compatíveis com essa distribuição. Em campos repartidos, uma frase contínua costuma aproveitar melhor o espaço. Quebras explícitas consomem linhas no fragmento em que recaem.",
      "maxChars é uma estimativa física; maxLines e altura se aplicam a cada alvo. minWords e wordsForAllFragments descrevem ocupação, e a contribuição da página define a extensão. Campos opcionais e fragmentos dispensáveis podem permanecer vazios. Apenas occupationRequired exige ocupação. Nomes preservam sua grafia integral.",
      "Listas nativas recebem o conteúdo de cada item; o renderer aplica os prefixos autorados. designGuidance, contentRules e mediaRules especificam hierarquia e autoria. Gere mediaPrompts para os slots obrigatórios, preservando mídia e geometria contratadas.",
      execution,
    ].join("\n") : [
      "Você gera copy para composições visuais já autoradas e imutáveis do PostSpark.",
      "Retorne somente o objeto JSON conforme o schema de resposta fornecido.",
      "Preencha os campos nativos respeitando capacidade tipográfica, cardinalidade, fatos e restrições explícitas.",
      "O texto deve caber nas caixas autoradas. maxChars é estimativa por alvo; a medição real com Fontkit confere overflow. Quando capacity.distribution=word_partition, um único valor canônico é dividido por palavras conforme contentFragment.index/count/weights: maxChars de cada alvo vale para sua fatia, não para o valor inteiro; capacity.estimatedMaxChars agrega as caixas.",
      "contentFragment.count é o número de caixas, NÃO um limite de palavras. minWords/wordsForAllFragments são apenas mínimos de ocupação, nunca a extensão desejada. Use o espaço disponível para frases que expliquem os fatos; não reduza cada campo a duas palavras por haver dois fragmentos. Nunca separe nomes canônicos para atingir um mínimo de palavras: acrescente palavras factuais ao redor do nome, quando a intervenção permitir, ou preserve o fragmento vazio permitido.",
      "Quando a intervenção permitir redação, use capacity.wordsForAllFragments/minWords para evitar fragmentos vazios involuntários de um campo distribuído; reformule apenas o campo dentro dos fatos fornecidos, sem inventar conteúdo nem alterar a cena. Apenas targets.occupationRequired=true/designGuidance.requiredTextTargets exigem ocupação por contrato. Os demais fragmentos, campos opcionais e linhas vazias intencionais permanecem legítimos. Preserve o sentido do trecho de ênfase conforme contentRules, não apenas a contagem de palavras. Em visual_only preserve literalmente a fonte; não amplie nem reformule texto para preencher fragmentos.",
      "bindings descrevem o formato nativo: kind/listMode/cardinality/prefix. O renderer aplica prefix a cada item da lista: retorne apenas o conteúdo do item, sem repetir esse prefix. Não suprima marcadores editoriais pertencentes à informação quando não forem prefix autorado. As mesmas regras valem na recuperação.",
      (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? "Não invente fatos, números ou propriedades do produto; benefício inferido deve ser limitado e sustentado." : "Não invente fatos, nomes, números, benefícios ou propriedades visuais.",
      (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? copyInstructionsV7((input.reviewExecutionConfig as import("@shared/proposalReviewV7").ReviewExecutionConfigV2).editorialGuidanceVersion ?? 1) : editorialInstructions,
      ...(narrativeContract
        ? [
            narrativeContract.instructions,
            "Neste carrossel compose use editorialPlan version=2. A instrução geral de version=1 só se aplica a estáticos, modo literal e compatibilidade histórica.",
          ]
        : []),
      "Regras de autoria em designGuidance são contratos do modelo: preserve/contentRules orientam hierarquia, listas e destaques; mediaRules orientam a fotografia de cada slot. knownLimitations descrevem lacunas, não autorização para inventar detalhes. Use as regras específicas junto ao briefing.",
      "Gere um prompt editorial para cada slot de mídia obrigatório; use mediaPrompts[].slotId correspondente.",
      execution,
    ].join("\n");

    let copyDispatched = false;
    await deps.checkpoint?.("copy_started", { operationKey: "copy" });
    const textResult = await (deps.executeOperation
      ? deps.executeOperation(
          {
            operationKey: "copy",
            stage: "copy",
            deadlineMs: input.deadlineMs,
            signal: input.signal,
          },
          async () => {
            copyDispatched = true;
            const aborted = abortError(input);
            if (aborted) throw aborted;
            return deps.generateText({
              traceLabel: `proposal_${proposalId}_copy`,
              taskRoute:
                definitions.length > 1
                  ? "carousel_generation"
                  : "static_generation",
              model: input.model,
              ...((input.reviewExecutionConfig?.version === 2 || input.reviewExecutionConfig?.version === 3 || input.reviewExecutionConfig?.version === 4) && input.reviewExecutionConfig.textModel ? {pinnedModel:input.reviewExecutionConfig.textModel, disableFallback:true} : {}),
              deadlineMs: input.deadlineMs,
              maxTransportAttempts: 1,
              forceTextSchema: true,
              disableStructuredRepair: true,
              maxCompletionTokens: 5000,
              response_format: jsonSchemaFormat(
                freshCopySchema,
                (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? "proposal_copy_v3" : narrativeContract ? "proposal_copy_v2" : "proposal_copy_v1"
              ),
              messages: [
                { role: "system", content: copySystemPrompt },
                { role: "user", content: userCopyPrompt },
              ],
            });
          }
        )
      : (async () => {
          copyDispatched = true;
          const aborted = abortError(input);
          if (aborted) throw aborted;
          return deps.generateText({
            traceLabel: `proposal_${proposalId}_copy`,
            taskRoute:
              definitions.length > 1
                ? "carousel_generation"
                : "static_generation",
            model: input.model,
              ...((input.reviewExecutionConfig?.version === 2 || input.reviewExecutionConfig?.version === 3 || input.reviewExecutionConfig?.version === 4) && input.reviewExecutionConfig.textModel ? {pinnedModel:input.reviewExecutionConfig.textModel, disableFallback:true} : {}),
            deadlineMs: input.deadlineMs,
            maxTransportAttempts: 1,
            forceTextSchema: true,
            disableStructuredRepair: true,
            maxCompletionTokens: 5000,
            response_format: jsonSchemaFormat(
              freshCopySchema,
              (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? "proposal_copy_v3" : narrativeContract ? "proposal_copy_v2" : "proposal_copy_v1"
            ),
            messages: [
              { role: "system", content: copySystemPrompt },
              { role: "user", content: userCopyPrompt },
            ],
          });
        })());
    const afterCopy = abortError(input);
    if (afterCopy) throw afterCopy;
    await deps.checkpoint?.("copy_completed", { operationKey: "copy" });
    const parsed = safeJsonParse(
      extractTextContent(textResult.choices?.[0]?.message?.content),
      null
    );
    let copy = copySchema.parse(parsed) as CopyResponse;
    // Historical journals remain readable; a fresh paid copy must satisfy the new
    // contract. Do not change its operation key and accidentally rebill an old run.
    if ((input.reviewPolicyVersion !== 7 && (input.reviewPolicyVersion !== 8 && input.reviewPolicyVersion !== 9)) && copyDispatched && !copy.editorialPlan)
      throw new Error("editorial_plan_required");
    if (
      copyDispatched &&
      narrativeContract &&
      copy.editorialPlan?.version !== 2
    )
      throw new Error("editorial_narrative_plan_required");
    if (input.reviewPolicyVersion === 5 || input.reviewPolicyVersion === 6) {
      const normalized = canonicalizeEditorialNames(copy, input);
      copy = normalized.copy;
      if (normalized.patches.length) {
        const patches = normalized.patches.map(({before,after,...target}) => ({...target,beforeHash:arsenalHash(before),afterHash:arsenalHash(after)}));
        recordGenerationEvent({stage:"copy_name_normalization",status:"completed",detail:"local_source_backed_spacing",data:{paidEffect:false,patches}});
        diagnostics.push({code:"canonical_name_normalized",target:"proposal",evidence:JSON.stringify(patches)});
      }
    }
    const constraintIssues = [
      ...checkBriefConstraints(copy, input),
      ...((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? [] : validateEditorialPlan(copy, input)),
    ];
    if (constraintIssues.length) {
      if(input.reviewPolicyVersion===7)for(const issue of constraintIssues)diagnostics.push({code:"content_requirement_unmet",target:issue.startsWith("requirement_unmet:")?issue.slice("requirement_unmet:".length):"literal_intervention",evidence:JSON.stringify({policyVersion:7,stage:"copy",rule:issue.startsWith("requirement_unmet:")?"typed_requirement":"literal_intervention"})});
      throw new Error(`execution_brief_constraints_failed:${constraintIssues.join("|")}`);
    }
    await deps.checkpoint?.("copy_validated", {
      slideCount: copy.slides.length,
    });

    const preference = studioPreferencesSchema.parse(
      input.visualPreference ?? defaultStudioPreferences
    );
    let compositions: ArsenalComposition[] = definitions.map(
      (definition, index) =>
        instantiateCompleteDesign({
          definition,
          values: copy.slides[index].values,
          mediaPrompts: copy.slides[index].mediaPrompts,
          runId,
          slot,
          slide: index,
          planHash: arsenalHash({
            prompt: input.prompt,
            slot,
            slide: index,
            defId: definition.id,
          }),
          experimental: input.experimental ?? true,
        })
    );

    let preflight = inspectScenes(compositions, definitions, measureText);
    // Raster slots are not fulfilled yet. Their placeholder cannot prove a
    // contrast defect; the final inspection evaluates the completed surface.
    let preflightFindings = preflight.findings.filter(
      finding => finding.rule !== "contrast"
    );

    if (preflightFindings.length) {
      const isFixable = preflightFindings.every(f =>
        ["overflow", "collision", "required_text_fragment"].includes(f.rule)
      );
      if (
        isFixable &&
        (!recoveryUsed || priorRecoveryKeys.has("copy_recovery")) &&
        input.executionBrief?.interventionLevel !== "visual_only"
      ) {
        recoveryUsed = true;
        await deps.checkpoint?.("recovering", {
          reason: "authored_text_contract_recovery",
          findings: preflightFindings,
        });

        const affectedCopyTargets = copy.slides.flatMap((slide, slideIndex) =>
          allFields[slideIndex].flatMap(field => {
            const fieldBindings = definitions[slideIndex].fragment.bindings.filter(binding => binding.source === field.source);
            const targetIds = Array.from(new Set([
              ...fieldBindings.flatMap(binding => binding.targetIds),
              ...(affirmative ? preflight.slides[slideIndex].composition.elements.filter(element => fieldBindings.some(binding => binding.id === element.bindingId)).map(element => element.id) : []),
            ]));
            return preflightFindings.some(f => f.target.startsWith(`slide-${slideIndex + 1}:`) &&
              (f.target.slice(f.target.indexOf(":") + 1) === field.id ||
                targetIds.includes(f.target.slice(f.target.indexOf(":") + 1))))
              ? [{ slideIndex, pageNumber: slideIndex + 1, fieldId: field.id,
                  value: slide.values.find(value => value.fieldId === field.id)?.value,
                  targetIds }]
              : [];
          })
        );
        // Camada 2: Diagnósticos precisos de caracteres e largura para guiar a IA na redução
        const capacityGuidance = preflightFindings.flatMap(f => {
          const match = f.target.match(/^slide-(\d+):(.+)$/);
          if (!match) return [];
          const slideIdx = parseInt(match[1], 10) - 1;
          const targetId = match[2];
          const definition = definitions[slideIdx];
          if (!definition) return [];
          const instance = definition.fragment.instances.find(i => i.id === targetId);
          const piece = instance && definition.pieces[instance.pieceHash];
          if (!instance || !piece) return [];
          const fontSize = piece.fontSize ?? 24;
          // Estimativa conservadora de largura de caractere (unidades normais da fonte ~0.55 * fontSize)
          const charWidth = Math.max(1, fontSize * 0.55);
          const maxSafeChars = Math.max(3, Math.floor(instance.width / charWidth));
          if (f.evidence.includes("overflow:token")) {
            return [`- CAIXA ESTREITA [${f.target}]: largura disponível de ${Math.round(instance.width)}px. Cada palavra deve ter NO MÁXIMO ${maxSafeChars} caracteres para não transbordar horizontalmente. Substitua ou encurte palavras longas.`];
          }
          if (f.rule === "overflow") {
            return [`- ALTURA EXCEDIDA [${f.target}]: reduza a extensão do texto total deste campo para caber na altura autorada de ${Math.round(instance.height)}px.`];
          }
          return [];
        });
        const resolvedFragments = affirmative ? affectedCopyTargets.map(target => ({
          ...target,
          fragments: preflight.slides[target.slideIndex].composition.elements.filter(element => element.kind === "text" && target.targetIds.includes(element.id)).map(element => {
            const measured = measureArsenalElement(element, measureText);
            return {targetId:element.id, text:element.text, width:element.width, height:element.height, fontSize:element.fontSize, measuredHeight:measured.height, measuredLines:measured.lines, maxLines:Math.floor(element.height / (element.fontSize * (element.lineHeight ?? 1.2)))};
          }),
        })) : undefined;
        const recoveryPrompt = [
          ...(affirmative ? [`CONTEXTO EDITORIAL EFETIVO: ${JSON.stringify(input.editorialContext ?? editorialContextV7(input,6))}`, `FRAGMENTOS RESOLVIDOS E MEDIDOS: ${JSON.stringify(resolvedFragments)}`, "Repare exclusivamente os campos autorizados, considerando o fragmento efetivamente problemático e seu orçamento de linhas/altura. Preserve os demais textos, a mídia e a geometria. Em partição por palavras componha a frase canônica conforme as caixas; em listas preserve os itens e a estrutura nativa. Conteúdo literal permanece protegido."] : []),
          "REVISÃO TÉCNICA OBRIGATÓRIA DO CONTRATO DE TEXTO AUTORADO.",
          "A inspeção constatou overflow, colisão ou fragmento declarado essencial sem texto nas seguintes caixas autoradas:",
          ...preflightFindings.map(
            f => `- Alvo: ${f.target} | Evidência: ${f.evidence}`
          ),
          ...(capacityGuidance.length ? ["\nDIRETRIZES FÍSICAS DE CAPACIDADE PARA ESTES ALVOS:", ...capacityGuidance] : []),
          `ALVOS NATIVOS EXATOS A CORRIGIR (slideIndex começa em zero; pageNumber em um):\n${JSON.stringify(affectedCopyTargets)}`,
          "Altere efetivamente os values dos fieldIds listados nos slides indicados. Encurtar outro slide não corrige este defeito. Campos saudáveis devem permanecer idênticos; o servidor só incorpora os alvos autorizados.",
          "Reescreva APENAS os campos problemáticos. Para overflow/colisão, seja conciso sem perder fatos e respeite o limite de caracteres por palavra. Para required_text_fragment, complete ou reformule o valor canônico conforme a partição real de palavras, preenchendo os alvos essenciais; não apenas encurte. Não preencha campos opcionais sem necessidade.",
          "Preserve o sentido de citações, palavras de ênfase e destaques indicado nas contentRules: pesos distribuem palavras, mas não decidem qual trecho merece destaque. A cena, caixas e estilos permanecem imutáveis.",
          (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? "Preserve núcleo pedido, fatos usados, condições materiais e obrigações; não amplie promessas nem altere campos saudáveis." : "Preserve estritamente todos os fatos, nomes, números e obrigações literais do briefing original. Mantenha os demais campos inalterados.",
          (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? "Pedido original: referência em editorialContext.request.prompt." : `BRIEFING ORIGINAL:\n${input.prompt}`,
          (input.reviewPolicyVersion !== 8 && input.reviewPolicyVersion !== 9) && input.executionBrief?.rawInput
            ? `DADOS DE ENTRADA DO BRIEFING:\n${input.executionBrief.rawInput}`
            : null,
          (input.reviewPolicyVersion !== 8 && input.reviewPolicyVersion !== 9) && input.executionBrief?.notes
            ? `NOTAS CONTEXTUAIS:\n${input.executionBrief.notes}`
            : null,
          ((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) && (input.reviewExecutionConfig as import("@shared/proposalReviewV7").ReviewExecutionConfigV2 | undefined)?.editorialGuidanceVersion === 5 && (input.executionBrief?.audience || input.executionBrief?.brandEssence))
            ? `ORIENTAÇÃO DE MARCA E PÚBLICO:\n${[input.executionBrief.audience ? `Público: ${input.executionBrief.audience}` : null, input.executionBrief.brandEssence ? `Essência: ${input.executionBrief.brandEssence}` : null].filter(Boolean).join("\n")}`
            : null,
          `TEXTO ATUAL GERADO (SUJEITO A AJUSTE):\n${JSON.stringify(copy.slides, null, 2)}`,
          (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? "Obrigações congeladas: referências no contexto editorial único." : input.reviewPolicyVersion === 7 ? `OBRIGAÇÕES CONGELADAS: ${JSON.stringify(proposalContentRequirements(input))}` : `PLANO EDITORIAL CONGELADO: preserve mensagem, fatos atribuídos e propósito de cada slide; não elimine diferenciais para encurtar.\n${JSON.stringify(copy.editorialPlan ?? null)}`,
          (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9) ? null : `CONTEXTO FACTUAL COMPLETO:\n${input.contextContent ?? ""}\n${JSON.stringify(input.sourceReferences ?? [])}`,
          `LEGENDA / CONTEXTO:\n${copy.caption}`,
          `COMPOSIÇÕES NATIVAS E LIMITES DE CARACTERES:\n${JSON.stringify(fieldSchemaNotes, null, 2)}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        try {
          const recoveryWork = async () => {
            const aborted = abortError(input);
            if (aborted) throw aborted;
            return deps.generateText({
              traceLabel: `proposal_${proposalId}_copy_recovery`,
              taskRoute:
                definitions.length > 1
                  ? "carousel_generation"
                  : "static_generation",
              model: input.model,
              ...((input.reviewExecutionConfig?.version === 2 || input.reviewExecutionConfig?.version === 3 || input.reviewExecutionConfig?.version === 4) && input.reviewExecutionConfig.textModel ? {pinnedModel:input.reviewExecutionConfig.textModel, disableFallback:true} : {}),
              deadlineMs: input.deadlineMs,
              maxTransportAttempts: 1,
              forceTextSchema: true,
              disableStructuredRepair: true,
              maxCompletionTokens: 5000,
              response_format: jsonSchemaFormat(
                copySchema,
                "proposal_copy_recovery_v1"
              ),
              messages: [
                { role: "system", content: copySystemPrompt },
                { role: "user", content: recoveryPrompt },
              ],
            });
          };

          const recoveryResult = await (deps.executeOperation
            ? deps.executeOperation(
                {
                  operationKey: "copy_recovery",
                  stage: "recovery",
                  deadlineMs: input.deadlineMs,
                  signal: input.signal,
                },
                recoveryWork
              )
            : recoveryWork());

          const recoveredParsed = safeJsonParse(
            extractTextContent(recoveryResult.choices?.[0]?.message?.content),
            null
          );
          const recoveredCandidate = copySchema.parse(
            recoveredParsed
          ) as CopyResponse;

          // Preserve caption, plan and fields outside the failed authored text targets.
          const surgicalCopy: CopyResponse = {
            ...((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? {} : {editorialPlan:copy.editorialPlan}),
            caption: copy.caption,
            hashtags: copy.hashtags,
            slides: copy.slides.map((origSlide, slideIdx) => {
              const recSlide = recoveredCandidate.slides[slideIdx];
              const definition = definitions[slideIdx];
              const fields = completeDesignFields(definition);
              return {
                values: origSlide.values.map(origVal => {
                  const field = fields.find(f => f.id === origVal.fieldId);
                  const bindings = definition.fragment.bindings.filter(
                    b => b.source === field?.source
                  );
                  const targetInstanceIds = bindings.flatMap(
                    b => b.targetIds ?? [(b as any).target].filter(Boolean)
                  );
                  const isAffected = preflightFindings.some(f => {
                    const prefix = `slide-${slideIdx + 1}:`;
                    if (!f.target.startsWith(prefix)) return false;
                    const idPart = f.target.slice(prefix.length);
                    return (
                      idPart === origVal.fieldId ||
                      targetInstanceIds.includes(idPart)
                    );
                  });
                  if (isAffected) {
                    const recVal = recSlide?.values.find(
                      v => v.fieldId === origVal.fieldId
                    );
                    return recVal ?? origVal;
                  }
                  return origVal;
                }),
                mediaPrompts: origSlide.mediaPrompts,
              };
            }),
          };

          const recoveredConstraints = [
            ...checkBriefConstraints(surgicalCopy, input),
            ...((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? [] : validateEditorialPlan(surgicalCopy, input)),
          ];
          if (recoveredConstraints.length === 0) {
            const recoveredCompositions = definitions.map((definition, index) =>
              instantiateCompleteDesign({
                definition,
                values: surgicalCopy.slides[index].values,
                mediaPrompts: surgicalCopy.slides[index].mediaPrompts,
                runId,
                slot,
                slide: index,
                planHash: arsenalHash({
                  prompt: input.prompt,
                  slot,
                  slide: index,
                  defId: definition.id,
                }),
                experimental: input.experimental ?? true,
              })
            );
            const recheck = inspectScenes(
              recoveredCompositions,
              definitions,
              measureText
            );
            const recheckFindings = recheck.findings.filter(
              f => f.rule !== "contrast"
            );
            if (recheckFindings.length === 0) {
              compositions = recoveredCompositions;
              preflight = recheck;
              preflightFindings = recheckFindings;
              copy = surgicalCopy;
              await deps.checkpoint?.("preflight_recovery_succeeded", {
                slideCount: compositions.length,
              });
            } else {
              await deps.checkpoint?.("preflight_recovery_failed", {
                findings: recheckFindings.length,
              });
              preflightFindings = recheckFindings;
            }
          }
        } catch {
          // If recovery fails or throws, preflightFindings remains the original fatal defect
        }
      }

      if (preflightFindings.length) {
        await deps.checkpoint?.("preflight_rejected", {
          findings: preflightFindings.length,
        });
        return checkedDelivery({
          ...base,
          status: "failed",
          findings: preflightFindings,
          diagnostics: preflight.diagnostics,
          errorReason:
            "Composição contém defeito técnico comprovado antes da geração de mídia.",
          ...((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? {failure:{code:"artwork_unusable" as const, stage:"copy" as const, retryable:false}} : {}),
          completedAt: Date.now(),
        });
      }
    }
    await deps.checkpoint?.("preflight_passed", {
      slideCount: compositions.length,
    });

    const references = mediaReferences(input);
    const mediaTasks: Array<{
      slideIndex: number;
      slotDef: { id: string; deferred: boolean; prompt?: string };
      taskContract: ImageTaskContract;
    }> = [];

    const isImageForbidden =
      input.imageObligation?.policy === "forbidden" ||
      (input.imageObligation?.purpose === "none" &&
        input.imageObligation?.policy !== "optional");

    if (!isImageForbidden) {
      for (let slideIndex = 0; slideIndex < definitions.length; slideIndex++) {
        const requiredSlots = mediaSlots[slideIndex].filter(
          mediaSlot => mediaSlot.deferred
        );
        for (const slotDef of requiredSlots) {
          const authoredMediaRules =
            definitions[
              slideIndex
            ].completeDesign?.designGuidance?.mediaRules.find(
              rule => rule.slotId === slotDef.id
            )?.instructions ?? [];
          const prompt = [
            copy.slides[slideIndex].mediaPrompts.find(
              item => item.slotId === slotDef.id
            )?.prompt ||
              slotDef.prompt ||
              input.prompt,
            authoredMediaRules.length
              ? `REQUISITOS AUTORADOS DESTE SLOT: ${authoredMediaRules.join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

          const taskContract = imageTaskContractSchema.parse({
            slotId: slotDef.id,
            slideIndex,
            purpose: input.imageObligation?.purpose ?? "editorial-photo",
            prompt,
            aspectRatio: "4:5",
            required: true,
            scene: input.prompt,
            requiredCapabilities: ["image-output"],
            status: "pending",
          });

          mediaTasks.push({ slideIndex, slotDef, taskContract });
        }
      }
    }

    if (input.imageObligation?.required && mediaTasks.length === 0) {
      throw new Error(
        `proposal_missing_required_media_slots:${input.imageObligation.purpose}`
      );
    }

    if (mediaTasks.length > 0) {
      const mediaAbortController = new AbortController();
      if (input.signal?.aborted) {
        mediaAbortController.abort(input.signal.reason);
      } else {
        input.signal?.addEventListener(
          "abort",
          () => mediaAbortController.abort(input.signal?.reason),
          { once: true }
        );
      }

      // Three active slots per proposal (at most nine for the request's fanout).
      const mediaWork = mediaTasks.map(
        ({ slideIndex, slotDef, taskContract }) =>
          async () => {
            try {
              const aborted = abortError(input);
              if (aborted) throw aborted;
              if (mediaAbortController.signal.aborted) {
                throw (
                  mediaAbortController.signal.reason ??
                  new Error("media_generation_aborted")
                );
              }
              if (!deps.mediaAdapter)
                throw new Error(
                  `required_media_adapter_unavailable:${slideIndex}:${slotDef.id}`
                );
              const composition = compositions[slideIndex];
              const instance = definitions[slideIndex].fragment.instances.find(
                candidate => candidate.id === slotDef.id
              );
              const piece =
                instance && definitions[slideIndex].pieces[instance.pieceHash];
              if (!instance || piece?.kind !== "media")
                throw new Error(
                  `required_media_slot_geometry_unavailable:${slideIndex}:${slotDef.id}`
                );
              const world = arsenalWorldGeometry(
                { ...instance, kind: "media" } as any,
                composition.groups
              );
              const imageSlot = {
                id: slotDef.id,
                x: world.x,
                y: world.y,
                width: instance.width * world.scale,
                height: instance.height * world.scale,
              };
              const prompt = taskContract.prompt;
              const operationKey = `image:${slideIndex}:${slotDef.id}`;
              const operationId = `${proposalId}:${revision}:${operationKey}`;
              await deps.checkpoint?.("image_started", {
                operationKey,
                slideIndex,
                slotId: slotDef.id,
                taskContract,
              });
              const generateForSlot = async () => {
                const beforeEffect = abortError(input);
                if (beforeEffect) throw beforeEffect;
                if (mediaAbortController.signal.aborted) {
                  throw (
                    mediaAbortController.signal.reason ??
                    new Error("media_generation_aborted")
                  );
                }
                const generated = await deps.mediaAdapter!.generate({
                  ownerId: deps.actor,
                  slot: imageSlot,
                  prompt,
                  purpose: taskContract.purpose,
                  postContext: mediaPostContext(
                    input,
                    definitions[slideIndex],
                    copy.slides[slideIndex],
                    copy.caption
                  ),
                  references,
                  operationId,
                  signal: mediaAbortController.signal,
                });
                const afterEffect = abortError(input);
                if (afterEffect) throw afterEffect;
                return generated;
              };
              const mediaResult = await (deps.executeOperation
                ? deps.executeOperation(
                    {
                      operationKey,
                      stage: "image",
                      deadlineMs: input.deadlineMs,
                      signal: mediaAbortController.signal,
                    },
                    generateForSlot
                  )
                : generateForSlot());
              const privateAssetPattern = new RegExp(
                `^/api/post-media/${deps.actor}/[a-f0-9]{64}$`,
                "i"
              );
              if (!privateAssetPattern.test(mediaResult.url))
                throw new Error(
                  `required_media_not_persisted_privately:${slideIndex}:${slotDef.id}`
                );

              taskContract.status = "fulfilled";
              await deps.checkpoint?.("image_completed", {
                operationKey,
                slideIndex,
                slotId: slotDef.id,
                taskContract,
              });
              return {
                slideIndex,
                slotId: slotDef.id,
                url: mediaResult.url,
              };
            } catch (err) {
              taskContract.status = "failed";
              mediaAbortController.abort(err);
              throw err;
            }
          }
      );
      const settled: PromiseSettledResult<{
        slideIndex: number;
        slotId: string;
        url: string;
      }>[] = new Array(mediaWork.length);
      let nextMedia = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, mediaWork.length) }, async () => {
          while (nextMedia < mediaWork.length) {
            const index = nextMedia++;
            try {
              mediaAbortController.signal.throwIfAborted();
              settled[index] = {
                status: "fulfilled",
                value: await mediaWork[index](),
              };
            } catch (reason) {
              settled[index] = { status: "rejected", reason };
            }
          }
        })
      );

      const rejected = settled.find(
        (s): s is PromiseRejectedResult => s.status === "rejected"
      );
      if (rejected) {
        throw rejected.reason;
      }

      const mediaResults = settled.map(
        s =>
          (
            s as PromiseFulfilledResult<{
              slideIndex: number;
              slotId: string;
              url: string;
            }>
          ).value
      );

      for (const res of mediaResults) {
        compositions[res.slideIndex] = {
          ...compositions[res.slideIndex],
          media: {
            ...compositions[res.slideIndex].media,
            [res.slotId]: {
              kind: "user",
              url: res.url,
              focalX: 0.5,
              focalY: 0.5,
            },
          },
        };
      }
    }

    await deps.checkpoint?.("technical_check_started", {
      slideCount: compositions.length,
    });
    let finalInspection = inspectScenes(compositions, definitions, measureText);
    findings.push(...finalInspection.findings);
    diagnostics.splice(0, diagnostics.length, ...finalInspection.diagnostics);
    if (findings.length) {
      await deps.checkpoint?.("technical_check_rejected", {
        findings: findings.length,
      });
      return checkedDelivery({
        ...base,
        status: "failed",
        findings,
        diagnostics,
        errorReason: "Composição contém defeito técnico comprovado.",
        ...((input.reviewPolicyVersion===7 || input.reviewPolicyVersion===9)?{failure:{code:"artwork_unusable",stage:"copy",retryable:false}}:{}),
      });
    }
    executionStage = "review";
    await deps.checkpoint?.("review_check_started", {
      round: "initial",
      slideCount: compositions.length,
    });
    if(input.reviewPolicyVersion===9 && deps.executeOperation) await deps.executeOperation({operationKey:"candidate",stage:"review",deadlineMs:input.deadlineMs,signal:input.signal},async()=>({version:1,proposalId:input.proposalId,copy,compositions}));
    const initialReview = await reviewProposal(
      input,
      deps,
      definitions,
      finalInspection.slides.map(slide => slide.composition),
      copy,
      "initial"
    );
    reviews.push(initialReview);
    if (
      initialReview.status === "correction_required" &&
      ((input.reviewPolicyVersion !== 7 && (input.reviewPolicyVersion !== 8 && input.reviewPolicyVersion !== 9)) || initialReview.findings.some(f=>isBlockingReviewFinding(f)&&f.fieldId!==null)) &&
      (!recoveryUsed ||
        priorRecoveryKeys.has(`review_correction:${initialReview.inputHash}`))
    ) {
      recoveryUsed = true;
      await deps.checkpoint?.("recovering", {
        reason: "corroborated_review_correction",
        inputHash: initialReview.inputHash,
      });
      const correctionWork = async () => {
        const stopped = abortError(input);
        if (stopped) throw stopped;
        const numericCorrected = applyReviewCorrections(copy, initialReview);
        const editorialFindings = initialReview.findings.filter(
          f =>
            isBlockingReviewFinding(f) && (f.authority === "source_grounded" ||
            f.authority === "contract_grounded")
        );
        if (!editorialFindings.length) {
          recordGenerationEvent({
            stage: "review_correction",
            status: "completed",
            detail: "deterministic_local",
            data: { paidEffect: false },
          });
          return numericCorrected;
        }
        // Semantic findings authorize a bounded rewrite, never a blind patch of
        // a detector's suggested text. Media and healthy fields remain pinned.
        const response = await deps.generateText({
          traceLabel: `proposal_${proposalId}_editorial_recovery`,
          taskRoute:
            definitions.length > 1
              ? "carousel_generation"
              : "static_generation",
          model: input.model,
              ...((input.reviewExecutionConfig?.version === 2 || input.reviewExecutionConfig?.version === 3 || input.reviewExecutionConfig?.version === 4) && input.reviewExecutionConfig.textModel ? {pinnedModel:input.reviewExecutionConfig.textModel, disableFallback:true} : {}),
          signal: input.signal,
          deadlineMs: input.deadlineMs,
          maxTransportAttempts: 1,
          disableFallback: true,
          disableStructuredRepair: true,
          forceTextSchema: true,
          maxCompletionTokens: 6000,
          response_format: jsonSchemaFormat(
            copySchema,
            "proposal_editorial_recovery_v1"
          ),
          messages: [
            { role: "system", content: copySystemPrompt },
            {
              role: "user",
              content: [
                userCopyPrompt,
                (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? `COPY ATUAL E CAMPOS SAUDÁVEIS CONGELADOS:\n${JSON.stringify(numericCorrected)}` : `COPY ATUAL E PLANO CONGELADO:\n${JSON.stringify(numericCorrected)}`,
                `PERDA EDITORIAL IDENTIFICADA COM FONTE:\n${JSON.stringify(editorialFindings)}`,
                (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? "Corrija somente os alvos indicados, preservando criatividade, fatos usados e condições materiais; $caption só legenda, $hashtags só os itens indicados, fieldId=null indica problema visual sem autorização para inventar texto. Não imponha fórmula narrativa, não altere campos saudáveis, mídia ou estrutura. Não elimine ressalvas para caber." : "Recupere informação e progressão somente nos campos indicados (fieldId=null permite campos do slide indicado; $caption permite somente a legenda). Cumpra o papel narrativo: capa como gancho, desenvolvimento explicativo e fechamento que resolve a ideia. Preserve fatos, ressalvas, nomes e propósito de todos os slides. Não troque explicação por slogan para caber. Não altere campos saudáveis, hashtags, prompts de mídia nem plano. Se o espaço não comportar o pedido, não elimine o diferencial para simular sucesso.",
              ].join("\n\n"),
            },
          ],
        });
        const stoppedAfter = abortError(input);
        if (stoppedAfter) throw stoppedAfter;
        const candidate = copySchema.parse(
          safeJsonParse(
            extractTextContent(response.choices?.[0]?.message?.content),
            null
          )
        ) as CopyResponse;
        return {
          ...numericCorrected,
          caption: editorialFindings.some(f => f.fieldId === "$caption")
            ? candidate.caption
            : numericCorrected.caption,
          hashtags: (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? numericCorrected.hashtags.flatMap((tag,index)=>editorialFindings.some(f=>f.fieldId==="$hashtags"&&"itemIndex" in f&&f.itemIndex===index) ? (candidate.hashtags[index]?.trim() ? [candidate.hashtags[index]] : []) : [tag]) : numericCorrected.hashtags,
          slides: numericCorrected.slides.map((slide, slideIndex) => ({
            ...slide,
            values: slide.values.map(row =>
              editorialFindings.some(
                f =>
                  f.slideIndex === slideIndex &&
                  (f.fieldId === null || f.fieldId === row.fieldId)
              )
                ? (candidate.slides[slideIndex].values.find(
                    value => value.fieldId === row.fieldId
                  ) ?? row)
                : row
            ),
          })),
        };
      };
      const corrected = await (deps.executeOperation
        ? deps.executeOperation(
            {
              operationKey: `review_correction:${initialReview.inputHash}`,
              stage: "recovery",
              deadlineMs: input.deadlineMs,
              signal: input.signal,
            },
            correctionWork
          )
        : correctionWork());
      copySchema.parse(corrected);
      const constraintIssues = [
        ...checkBriefConstraints(corrected, input),
        ...((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? [] : validateEditorialPlan(corrected, input)),
      ];
      if (constraintIssues.length)
        throw new Error("proposal_review_correction_violates_brief");
      compositions = definitions.map((definition, index) => ({
        ...instantiateCompleteDesign({
          definition,
          values: corrected.slides[index].values,
          mediaPrompts: copy.slides[index].mediaPrompts,
          runId,
          slot,
          slide: index,
          planHash: arsenalHash({
            prompt: input.prompt,
            slot,
            slide: index,
            defId: definition.id,
          }),
          experimental: input.experimental ?? true,
        }),
        media: compositions[index].media,
      }));
      finalInspection = inspectScenes(compositions, definitions, measureText);
      if (finalInspection.findings.length) {
        return checkedDelivery({
          ...base,
          status: "failed",
          findings: finalInspection.findings,
          diagnostics: finalInspection.diagnostics,
          errorReason:
            "Correção localizada não passou pela conferência técnica.",
          ...((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) ? {failure:{code:"artwork_unusable" as const, stage:"review" as const, retryable:false}} : {}),
          completedAt: Date.now(),
        });
      }
      if (input.reviewPolicyVersion === 5 || input.reviewPolicyVersion === 6 || (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) input = { ...input, previousReviewContext: { previous: initialReview, changedTargets: corrected.slides.flatMap((slide,slideIndex) => slide.values.filter(v => arsenalHash(v.value) !== arsenalHash(copy.slides[slideIndex].values.find(p => p.fieldId === v.fieldId)?.value)).map(v => ({slideIndex,fieldId:v.fieldId}))) } };
      if(input.reviewPolicyVersion===7 && input.previousReviewContext) {
        if(corrected.caption!==copy.caption)input.previousReviewContext.changedTargets.push({slideIndex:0,fieldId:"$caption"});
        if(arsenalHash(corrected.hashtags)!==arsenalHash(copy.hashtags))input.previousReviewContext.changedTargets.push({slideIndex:0,fieldId:"$hashtags"});
      }
      copy = corrected;
      diagnostics.splice(0, diagnostics.length, ...finalInspection.diagnostics);
      await deps.checkpoint?.("review_check_started", {
        round: "recheck",
        slideCount: compositions.length,
      });
      reviews.push(
        await reviewProposal(
          input,
          deps,
          definitions,
          finalInspection.slides.map(slide => slide.composition),
          copy,
          "recheck"
        )
      );
    }
    if ((input.reviewPolicyVersion === 5 || input.reviewPolicyVersion === 6 || (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) && reviews.length === 2) {
      const previous = reviews[0], current = reviews[1];
      for (const coverage of current.sourceCoverage ?? []) {
        const old = previous.sourceCoverage?.find(c => c.sourceQuote === coverage.sourceQuote);
        if (old?.status === "covered" && coverage.status !== "covered" && old.evidence.every(e => !input.previousReviewContext?.changedTargets.some(t=>t.slideIndex===e.slideIndex&&t.fieldId===e.fieldId))) {
          diagnostics.push({code:"review_unchanged_evidence_divergence",target:"proposal",evidence:`${coverage.factId}:covered→${coverage.status}; política material aplicada à sequência completa.`});
        }
      }
    }
    for (const review of reviews) {
      for (const finding of review.findings.filter(
        finding => !isBlockingReviewFinding(finding)
      )) {
        diagnostics.push({
          code: `review_${finding.category}`,
          target: `slide-${finding.slideIndex + 1}:${finding.fieldId ?? "scene"}`,
          evidence: finding.explanation,
        });
      }
    }
    const lastReview = reviews.at(-1)!;
    await deps.checkpoint?.("review_check_completed", {
      round: lastReview.round,
      status: lastReview.status,
      inputHash: lastReview.inputHash,
    });
    if (lastReview.status !== "passed") {
      return checkedDelivery({
        ...base,
        status: "failed",
        findings: lastReview.findings
          .filter(isBlockingReviewFinding)
          .map(finding => ({
            rule:
              finding.authority === "contract_grounded"
                ? "carousel_narrative_structure"
                : finding.authority === "source_grounded"
                  ? `source_backed_${finding.category}`
                  : "source_backed_contradiction",
            target: `slide-${finding.slideIndex + 1}:${finding.fieldId}`,
            severity: "fatal",
            evidence: `${finding.observed} → ${finding.expected}`,
          })),
        diagnostics: [
          ...diagnostics,
          ...(lastReview.status === "inconclusive"
            ? [
                {
                  code: "review_inconclusive",
                  target: "proposal",
                  evidence: lastReview.limitation,
                },
              ]
            : []),
        ],
        failure: {
          code: (input.reviewPolicyVersion === 6 || (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) ? reviewFailureCode(lastReview.status, lastReview.limitation) : lastReview.status === "correction_required"
            ? "review_content_rejected"
            : /timeout/.test(lastReview.limitation)
              ? "review_deadline_exceeded"
              : /truncated|length|max_token/.test(lastReview.limitation)
                ? "review_response_truncated"
                : /reconciliation/.test(lastReview.limitation)
                  ? "review_reconciliation_required"
                  : /response_invalid|invalid_json|schema_mismatch|malformed/.test(lastReview.limitation)
                    ? "review_response_invalid"
                    : /evidence_invalid|repair_exhausted|invalid_.*evidence|unknown_evidence/.test(lastReview.limitation)
                      ? "review_evidence_invalid"
                      : "review_inconclusive",
          stage: "review",
          retryable: false,
        },
        errorReason:
          lastReview.status === "inconclusive"
            ? "Revisão obrigatória inconclusiva; proposta não verificada."
            : "Perda factual/editorial fundamentada; limite único de correção esgotado.",
        completedAt: Date.now(),
      });
    }

    const readySlides = finalInspection.slides.map((slide, index) => ({
      id: `slide-${index + 1}`,
      role: postModeRole(index, finalInspection.slides.length),
      composition: slide.composition,
    }));

    if (input.imageObligation?.required) {
      const fulfilledMedia = readySlides.flatMap(s =>
        Object.values(s.composition.media)
      );
      if (fulfilledMedia.length === 0) {
        throw new Error("proposal_required_media_not_fulfilled");
      }
    }

    const family = definitions[0].completeDesign!.family;
    const bundle = completeDesignVariationV1Schema.parse({
      schemaVersion: 1,
      pipeline: "complete-design-v1",
      traceId: runId,
      runId,
      slot,
      name: definitions[0].label,
      reason:
        input.selectionReason?.trim() ||
        `Composição autorada da família ${family} para ${input.executionBrief?.objective ?? "o pedido"}.`,
      family,
      visualPreference: preference,
      caption: copy.caption,
      hashtags: copy.hashtags,
      slides: readySlides,
    }) as CompleteDesignVariationV1;
    await deps.checkpoint?.("bundle_validated", {
      slideCount: bundle.slides.length,
    });
    console.info(
      `[proposal:${proposalId}] ✅ Proposta concluída com sucesso (status: ready)!`
    );
    return checkedDelivery({
      ...base,
      status: "ready",
      bundle,
      findings,
      diagnostics,
      completedAt: Date.now(),
    });
  } catch (error) {
    const failure = abortError(input) ?? error;
    const reason =
      failure instanceof Error
        ? failure.message
        : "Erro desconhecido na execução da proposta";
    console.error(`[proposal:${proposalId}] ❌ Proposta falhou:`, reason);
    const status = proposalErrorStatus(failure);
    const publicFailure = (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9)) && reason.startsWith("execution_brief_constraints_failed:")
      ? {code:"content_requirement_unmet" as const,stage:executionStage,retryable:false}
      : failureFromError(failure, executionStage);
    if((input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) {
      const evidence=JSON.stringify({policyVersion:7,stage:executionStage,code:publicFailure.code,detailHash:arsenalHash(reason)});
      diagnostics.push({code:publicFailure.code,target:"proposal",evidence});
      recordGenerationEvent({stage:"proposal_failure",status:"failed",detail:publicFailure.code,data:{policyVersion:7,proposalId,stage:executionStage,detailHash:arsenalHash(reason)}});
    }
    await deps
      .checkpoint?.("proposal_ended", { status, reason })
      .catch(() => undefined);
    return checkedDelivery({
      ...base,
      status,
      findings: [
        {
          rule: "execution_safety",
          target: "proposal",
          severity: "fatal",
          evidence: (input.reviewPolicyVersion === 5 || input.reviewPolicyVersion === 6 || (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) ? publicFailure.code : reason,
        },
      ],
      diagnostics,
      failure: publicFailure,
      errorReason: (input.reviewPolicyVersion === 5 || input.reviewPolicyVersion === 6 || (input.reviewPolicyVersion === 7 || (input.reviewPolicyVersion === 8 || input.reviewPolicyVersion === 9))) ? publicFailure.code : reason,
      completedAt: Date.now(),
    });
  }
}
