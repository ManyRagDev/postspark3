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
import { createComponentTextMeasurer } from "../componentTextMeasurer";
import {
  imagePostContextSchema,
  type ImagePostContext,
} from "@shared/imageGeneration";
import type { ProposalMediaRequest } from "./proposalMedia";
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
  generateText: (params: InvokeParams) => Promise<InvokeResult>;
  /** Tests may inject a measured implementation; production defaults to Fontkit-backed assets. */
  measureText?: ArsenalTextMeasurer;
  createTextMeasurer?: typeof createComponentTextMeasurer;
  mediaAdapter?: ProposalMediaAdapter;
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

export interface ProposalSourceReference {
  url?: string;
  title?: string;
  facts?: string;
}

export interface ProposalExecutionInput {
  requestId: string;
  runId: string;
  proposalId: string;
  slot: number;
  revision?: number;
  prompt: string;
  contextContent?: string;
  sourceReferences?: ProposalSourceReference[];
  referenceImages?: string[];
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
};

const sourceReferenceSchema = z
  .object({
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

function copyResponseSchema(definitions: ComponentDefinitionV1[]) {
  const slides = definitions.map(definition => {
    const fields = completeDesignFields(definition);
    const valueOptions = fields.map(field =>
      z
        .object({
          fieldId: z.literal(field.id),
          value:
            field.kind === "list"
              ? z
                  .array(z.string())
                  .min(field.cardinality?.min ?? 0)
                  .max(field.cardinality?.max ?? 1000)
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
  return z
    .object({
      caption: z.string().default(""),
      hashtags: z.array(z.string()).default([]),
      slides: z
        .array(z.union(slides as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]))
        .length(definitions.length),
    })
    .strict();
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

function executionInstructions(input: ProposalExecutionInput): string {
  const brief = input.executionBrief;
  if (!brief)
    return "Crie copy adequada ao pedido e ao contexto factual, sem inventar fatos.";
  const level = brief.interventionLevel;
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
  if (!brief) return [];
  const text = combinedCopyText(copy);
  const issues: string[] = [];
  if (brief.interventionLevel === "visual_only") {
    const normalizeWhitespace = (value: string) =>
      value.trim().replace(/\s+/g, " ");
    const source = normalizeWhitespace(brief.rawInput);
    if (source && !normalizeWhitespace(text).includes(source))
      issues.push("visual_only_source_not_preserved_literally");
  }
  for (const required of [
    ...(brief.mustKeep ?? []),
    ...(brief.mustInclude ?? []),
  ])
    if (required && !text.includes(required))
      issues.push(`missing_required_literal:${required}`);
  for (const forbidden of brief.forbiddenTerms ?? [])
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
    const composition = resolveArsenalGeometry(source, { measureText });
    const diagnostics: ProposalDiagnostic[] = [];
    const nonBlocking = composition.issues.filter(
      issue =>
        issue.startsWith("contrast:unknown:") ||
        issue.startsWith("collision:text_media:")
    );
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
    const blocking = composition.issues.filter(
      issue => !nonBlocking.includes(issue)
    );
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
  const { runId, proposalId, slot } = input;
  const revision = input.revision ?? 1;
  const findings: TechnicalFinding[] = [];
  const diagnostics: ProposalDiagnostic[] = [];
  const base = {
    contractVersion: 1 as const,
    proposalId,
    runId,
    slot,
    revision,
    findings,
    diagnostics,
  };
  const rawDefinitions =
    input.selectedDefinitions ??
    (input.selectedDefinition ? [input.selectedDefinition] : []);
  const definitions = rawDefinitions;

  try {
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
    const measureText =
      deps.measureText ??
      (await (deps.createTextMeasurer ?? createComponentTextMeasurer)(
        Array.from(
          new Map(
            definitions
              .flatMap(definition => definition.assets)
              .map(asset => [asset.id, asset])
          ).values()
        )
      ));
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
    const copySchema = copyResponseSchema(definitions);
    const fieldSchemaNotes = definitions.map((definition, index) => ({
      slide: index,
      designName: definition.label,
      family: definition.completeDesign!.family,
      fields: allFields[index].map(field => ({
        id: field.id,
        role: field.role,
        kind: field.kind,
        required: field.required,
        cardinality: field.cardinality,
        targets: definition.fragment.bindings
          .filter(binding => binding.source === field.source)
          .flatMap(binding => binding.targetIds)
          .map(id => {
            const instance = definition.fragment.instances.find(
              candidate => candidate.id === id
            );
            const piece = instance && definition.pieces[instance.pieceHash];
            const lineH = piece?.lineHeight ?? 1.2;
            const maxLines =
              instance && piece
                ? Math.max(1, Math.floor(instance.height / (piece.fontSize * lineH)))
                : undefined;
            const charsPerLine =
              instance && piece
                ? Math.floor(instance.width / (piece.fontSize * 0.55))
                : undefined;
            const maxChars =
              maxLines !== undefined && charsPerLine !== undefined
                ? maxLines * charsPerLine
                : undefined;
            return {
              id,
              width: instance?.width,
              height: instance?.height,
              fontFamily: piece?.fontFamily,
              fontSize: piece?.fontSize,
              maxLines,
              maxChars,
            };
          }),
      })),
      mediaSlots: mediaSlots[index],
    }));
    const execution = executionInstructions(input);
    const userCopyPrompt = [
      `Modo: ${input.creationMode ?? "ideation"}; plataforma: ${input.platform ?? input.executionBrief?.platform ?? "não especificada"}; tom: ${input.tone ?? input.executionBrief?.tone ?? "não especificado"}; formato: ${input.postMode ?? input.executionBrief?.format ?? (definitions.length > 1 ? "carousel" : "static")}.`,
      `Briefing original do usuário:\n${input.executionBrief?.rawInput ?? input.prompt}`,
      `Contexto factual extraído:\n${input.contextContent ?? "nenhum contexto factual adicional"}`,
      `Fontes e fatos com origem:\n${JSON.stringify(sourceReferenceSchema.array().parse(input.sourceReferences ?? []))}`,
      `Brief de execução e controles:\n${execution}`,
      `Pedido textual complementar:\n${input.prompt}`,
      `Composições nativas, capacidade, cardinalidade e alvos reais:\n${JSON.stringify(fieldSchemaNotes, null, 2)}`,
      `Retorne uma entrada em slides para cada composição, na mesma ordem. Cada values deve preencher cada fieldId exatamente uma vez. Para listas, retorne array dentro de value. Não altere a estrutura das composições.`,
    ].join("\n\n");
    const copySystemPrompt = [
      "Você gera copy para composições visuais já autoradas e imutáveis do PostSpark.",
      "Retorne somente o objeto JSON conforme o schema de resposta fornecido.",
      "Preencha os campos nativos respeitando capacidade tipográfica, cardinalidade, fatos e restrições explícitas.",
      "RESTRIÇÃO TIPOGRÁFICA RÍGIDA: O texto DEVE caber estritamente no espaço físico delimitado. Respeite os limites calculados de linhas (maxLines) e caracteres (maxChars) informados para cada campo. Textos que ultrapassarem os limites físicos da caixa causarão rejeição fatal por overflow no preflight real com Fontkit.",
      "Não invente fatos, nomes, números, benefícios ou propriedades visuais.",
      "Gere um prompt editorial para cada slot de mídia obrigatório; use mediaPrompts[].slotId correspondente.",
      execution,
    ].join("\n");

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
            const aborted = abortError(input);
            if (aborted) throw aborted;
            return deps.generateText({
              traceLabel: `proposal_${proposalId}_copy`,
              taskRoute:
                definitions.length > 1
                  ? "carousel_generation"
                  : "static_generation",
              model: input.model,
              deadlineMs: input.deadlineMs,
              maxTransportAttempts: 1,
              forceTextSchema: true,
              disableStructuredRepair: true,
              maxCompletionTokens: 5000,
              response_format: jsonSchemaFormat(copySchema, "proposal_copy_v1"),
              messages: [
                { role: "system", content: copySystemPrompt },
                { role: "user", content: userCopyPrompt },
              ],
            });
          }
        )
      : (async () => {
          const aborted = abortError(input);
          if (aborted) throw aborted;
          return deps.generateText({
            traceLabel: `proposal_${proposalId}_copy`,
            taskRoute:
              definitions.length > 1
                ? "carousel_generation"
                : "static_generation",
            model: input.model,
            deadlineMs: input.deadlineMs,
            maxTransportAttempts: 1,
            forceTextSchema: true,
            disableStructuredRepair: true,
            maxCompletionTokens: 5000,
            response_format: jsonSchemaFormat(copySchema, "proposal_copy_v1"),
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
    const constraintIssues = checkBriefConstraints(copy, input);
    if (constraintIssues.length)
      throw new Error(
        `execution_brief_constraints_failed:${constraintIssues.join("|")}`
      );
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
      const isFixable = preflightFindings.every(
        f => f.rule === "overflow" || f.rule === "collision"
      );
      if (isFixable) {
        await deps.checkpoint?.("recovering", {
          reason: "text_overflow_technical_recovery",
          findings: preflightFindings,
        });

        const recoveryPrompt = [
          "REVISÃO TÉCNICA OBRIGATÓRIA POR OVERFLOW TIPOGRÁFICO / COLISÃO DE TEXTO.",
          "A medição tipográfica real constatou que o texto gerado excedeu os limites físicos ou gerou colisão nas seguintes caixas autoradas:",
          ...preflightFindings.map(
            f => `- Alvo: ${f.target} | Evidência: ${f.evidence}`
          ),
          "Reescreva APENAS os campos problemáticos com textos mais concisos e curtos, garantindo que caibam rigorosamente nas caixas sem quebrar o layout.",
          "Preserve estritamente todos os fatos, nomes, números e obrigações literais do briefing original. Mantenha os demais campos inalterados.",
          `BRIEFING ORIGINAL:\n${input.prompt}`,
          input.executionBrief?.rawInput
            ? `DADOS DE ENTRADA DO BRIEFING:\n${input.executionBrief.rawInput}`
            : null,
          input.executionBrief?.notes
            ? `NOTAS CONTEXTUAIS:\n${input.executionBrief.notes}`
            : null,
          `TEXTO ATUAL GERADO (SUJEITO A AJUSTE):\n${JSON.stringify(copy.slides, null, 2)}`,
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
          const recoveredCandidate = copySchema.parse(recoveredParsed) as CopyResponse;

          // Merge cirúrgico: preserva legenda, hashtags e campos que NÃO tiveram overflow
          const surgicalCopy: CopyResponse = {
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
                    return idPart === origVal.fieldId || targetInstanceIds.includes(idPart);
                  });
                  if (isAffected) {
                    const recVal = recSlide?.values.find(v => v.fieldId === origVal.fieldId);
                    return recVal ?? origVal;
                  }
                  return origVal;
                }),
                mediaPrompts: origSlide.mediaPrompts,
              };
            }),
          };

          const recoveredConstraints = checkBriefConstraints(surgicalCopy, input);
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
            const recheck = inspectScenes(recoveredCompositions, definitions, measureText);
            const recheckFindings = recheck.findings.filter(f => f.rule !== "contrast");
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
          const prompt =
            copy.slides[slideIndex].mediaPrompts.find(
              item => item.slotId === slotDef.id
            )?.prompt ||
            slotDef.prompt ||
            input.prompt;

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

      // Parallel execution of all independent media slots within this proposal with cooperative abort
      const settled = await Promise.allSettled(
        mediaTasks.map(async ({ slideIndex, slotDef, taskContract }) => {
          try {
            const aborted = abortError(input);
            if (aborted) throw aborted;
            if (mediaAbortController.signal.aborted) {
              throw mediaAbortController.signal.reason ?? new Error("media_generation_aborted");
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
                throw mediaAbortController.signal.reason ?? new Error("media_generation_aborted");
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
        })
      );

      const rejected = settled.find(
        (s): s is PromiseRejectedResult => s.status === "rejected"
      );
      if (rejected) {
        throw rejected.reason;
      }

      const mediaResults = settled.map(
        s => (s as PromiseFulfilledResult<{ slideIndex: number; slotId: string; url: string }>).value
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
    const finalInspection = inspectScenes(
      compositions,
      definitions,
      measureText
    );
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
      });
    }
    const readySlides = finalInspection.slides.map((slide, index) => ({
      id: `slide-${index + 1}`,
      role: postModeRole(index, finalInspection.slides.length),
      composition: slide.composition,
    }));

    if (input.imageObligation?.required) {
      const fulfilledMedia = readySlides.flatMap(s => Object.values(s.composition.media));
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
    const status = proposalErrorStatus(failure);
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
          evidence: reason,
        },
      ],
      diagnostics,
      errorReason: reason,
      completedAt: Date.now(),
    });
  }
}
