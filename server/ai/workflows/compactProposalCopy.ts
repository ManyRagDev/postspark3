import { buildCompactEditorialContract, positiveEditorialInstructions, usesCompactEditorialContract, usesCopyInstructionsV2, usesTextFlexibility } from "./compactEditorialContract";
import { AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2 } from "@shared/affirmativeSocialPlaybook";
import { z } from "zod";
import { ENV } from "../../_core/env";
import {
  compactComponentCard,
  type ComponentDefinitionV1,
} from "@shared/componentAssembly";
import { arsenalTextLayoutBox, measureArsenalElement, type ArsenalTextMeasurer } from "@shared/arsenalGeometry";
import type { ArsenalComposition } from "@shared/designArsenal";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import { designTextBudgetsV3 } from "@shared/designSelection";
import { authoredTextBoxes, compactTextFieldFlexibility } from "@shared/textFieldFlexibility";
import { projectEditorialDefaults } from "@shared/projectEditorial";
import type { ProposalReviewRecord } from "@shared/proposalReview";
import { isBlockingReviewFinding } from "@shared/proposalReview";
import { effectiveContentRequirements } from "@shared/contentRequirements";
import type { CopyResponse, ProposalExecutionInput } from "./proposalGraph";
import { resolvedEditorialContext } from "./editorialContextV8";
import { artworkCopyInstructions, artworkFieldBrief, usesArtworkBriefCopy } from "./artworkBriefCopy";

/** Only the new immutable admission policy changes the provider protocol. */
export function usesCompactProposalCopy(input: ProposalExecutionInput) {
  return Boolean(input.generationConfig?.taskRouting);
}

function nativeGlyphProjectionFor(input: ProposalExecutionInput): 1 | undefined {
  const config = input.reviewExecutionConfig;
  return config?.version === 5 && "nativeGlyphProjection" in config && config.nativeGlyphProjection === 1 ? 1 : undefined;
}

function requirements(input: ProposalExecutionInput) {
  return input.editorialContext
    ? resolvedEditorialContext(input.editorialContext).requirements
    : effectiveContentRequirements(input.executionBrief);
}

/** A constant item grammar avoids the provider's field×page union expansion.
 * Canonical JSON stays unchanged; the exact native contract is checked locally. */
export function compactCopyTransportSchema(definitions: ComponentDefinitionV1[], nativeGlyphProjection?: 1) {
  if (!definitions.length) throw new Error("copy_requires_definitions");
  return z.object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    slides: z.array(z.object({
      values: z.array(z.object({ fieldId: z.string(), value: z.union([z.string(), z.array(z.string())]) }).strict()).max(Math.max(...definitions.map(definition => completeDesignFields(definition, nativeGlyphProjection).length))),
      mediaPrompts: z.array(z.object({ slotId: z.string(), prompt: z.string().min(1).max(2000) }).strict()),
    }).strict()).length(definitions.length),
  }).strict();
}

export function compactCopyValidationSchema(definitions: ComponentDefinitionV1[], nativeGlyphProjection?: 1) {
  return compactCopyTransportSchema(definitions, nativeGlyphProjection).extend({caption:z.string().default(""),hashtags:z.array(z.string()).default([])}).superRefine((copy, context) => {
    copy.slides.forEach((slide, slideIndex) => {
      if (!definitions[slideIndex]) { context.addIssue({code:"custom",path:["slides",slideIndex],message:"unexpected_native_slide"}); return; }
      const fields = completeDesignFields(definitions[slideIndex], nativeGlyphProjection);
      const ids = new Set(slide.values.map(row => row.fieldId));
      const issue = (message: string) => context.addIssue({code:"custom",path:["slides",slideIndex],message});
      if (slide.values.length !== fields.length || ids.size !== fields.length || fields.some(field => !ids.has(field.id))) issue("native_field_set_mismatch");
      for (const row of slide.values) {
        const field = fields.find(field => field.id === row.fieldId);
        if (!field) { issue("unknown_native_field"); continue; }
        if (field.kind === "list") {
          if (!Array.isArray(row.value)) { issue("native_list_requires_array"); continue; }
          if ((!field.required && row.value.length === 0)) continue;
          if (row.value.length < (field.cardinality?.min ?? 0) || row.value.length > (field.cardinality?.max ?? 1000)) issue("native_list_cardinality_mismatch");
        } else if (typeof row.value !== "string") issue("native_text_requires_string");
      }
      const slots = definitions[slideIndex].fragment.mediaSlots ?? [];
      if (new Set(slide.mediaPrompts.map(prompt => prompt.slotId)).size !== slide.mediaPrompts.length || slide.mediaPrompts.some(prompt => !slots.some(slot => slot.id === prompt.slotId))) issue("native_media_slot_mismatch");
    });
  });
}

/** Normalizes benign provider drift (omitted optional fields, array-valued text, non-existent trailing fields) before strict local validation. */
export function normalizeCompactCopyPayload(
  parsed: unknown,
  definitions: ComponentDefinitionV1[],
  nativeGlyphProjection?: 1,
  reflowFragmentArrays = false,
): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.slides)) return parsed;
  return {
    ...obj,
    slides: obj.slides.map((rawSlide, slideIndex) => {
      const def = definitions[slideIndex];
      if (!def || !rawSlide || typeof rawSlide !== "object" || Array.isArray(rawSlide)) return rawSlide;
      const slide = rawSlide as Record<string, unknown>;
      if (!Array.isArray(slide.values)) return rawSlide;
      const fields = completeDesignFields(def, nativeGlyphProjection);
      const fieldById = new Map(fields.map((f) => [f.id, f]));
      const unprojectedIds = new Set(completeDesignFields(def, undefined).map((f) => f.id));
      const fragmentedSources = new Set(reflowFragmentArrays ? def.fragment.bindings.filter(binding =>
        binding.kind === "text" && binding.targetIds.some(id => {
          const instance = def.fragment.instances.find(target => target.id === id);
          return instance && def.pieces[instance.pieceHash].contentFragment;
        })
      ).map(binding => binding.source) : []);
      const seen = new Set<string>();
      const normalizedValues: unknown[] = [];
      for (const item of slide.values) {
        if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.fieldId !== "string") {
          normalizedValues.push(item);
          continue;
        }
        const { fieldId, value } = item;
        // Only generated field-N surplus is repairable. Keep writes to protected
        // template fields, malformed rows and duplicates for strict validation.
        if (/^field-\d+$/.test(fieldId) && !fieldById.has(fieldId) && !unprojectedIds.has(fieldId)) continue;
        seen.add(fieldId);
        const field = fieldById.get(fieldId);
        if (field?.kind === "text" && Array.isArray(value) && value.every(v => typeof v === "string")) {
          // Preserve line breaks when the array represents distinct items/alternatives;
          // join with space only when distributing a single continuous phrase across fragments.
          const looksLikeDistinctItems = value.length >= 2 && value.every(entry =>
            /^(?:[-•*]\s+|\S[^:\n]{0,40}:\s+\S)/.test(entry.trim()) || /[.!?]$/.test(entry.trim())
          );
          const separator = fragmentedSources.has(field.source) && !looksLikeDistinctItems ? " " : "\n";
          normalizedValues.push({ ...item, value: value.join(separator) });
        } else {
          normalizedValues.push(item);
        }
      }
      for (const field of fields) {
        if (!field.required && !seen.has(field.id)) {
          normalizedValues.push({ fieldId: field.id, value: field.kind === "list" ? [] : "" });
        }
      }
      return {
        ...slide,
        values: normalizedValues,
      };
    }),
  };
}

/** This is a transport projection. Native definitions remain authoritative locally. */
function writingBox(width: number, height: number, size: number, lineHeight = 1.25) {
  return { width: Math.floor(width), height: Math.floor(height),
    maxLines: Math.floor((height + 1e-8) / (size * lineHeight)) };
}

export function editorialDesignReading(input: ProposalExecutionInput) {
  const plan = input.narrativePlan;
  if (!plan?.editorialDesign || input.generationIntent?.adaptation === "literal" ||
      input.executionBrief?.interventionLevel === "visual_only") return undefined;
  return { approach: plan.editorialApproach, readerPriority: plan.editorialDesign.readerPriority };
}

export const editorialDesignWritingInstruction =
  "Use a leitura escolhida para organizar o que a pessoa vê primeiro e como avança pelos campos nativos. Siga a função de escrita de cada campo quando compatível com o pedido. Preserve nomes, números, condições, requisitos literais e a associação de cada fato à entidade correta. A direção orienta a hierarquia e nunca é fonte de dados nem autorização para mudar o briefing.";

export function editorialDesignReviewContext(input: ProposalExecutionInput) {
  const reading = editorialDesignReading(input);
  return reading ? { designReading: { ...reading, advisory: true,
    instruction: "Esta direção contextualiza a hierarquia escolhida. Aplique os critérios de revisão habituais e use o briefing e as fontes para verificar fatos e requisitos." } } : {};
}

export function editorialFieldAssignments(input: ProposalExecutionInput, slideIndex: number, componentId: string) {
  if (!editorialDesignReading(input) && !input.generationIntent?.designRequirements) return undefined;
  return input.narrativePlan?.pages.find(page => page.slideIndex === slideIndex && page.componentId === componentId)?.assignments;
}

export function compactWritableSlides(
  input: ProposalExecutionInput,
  definitions: ComponentDefinitionV1[],
) {
  return definitions.map((definition, slideIndex) => {
    const fields = completeDesignFields(definition, nativeGlyphProjectionFor(input));
    const budgets = designTextBudgetsV3(compactComponentCard(definition));
    const page = input.narrativePlan?.pages.find(
      (page) => page.slideIndex === slideIndex,
    );
    const editorialAssignments = editorialFieldAssignments(input, slideIndex, definition.id);
    const guidance = definition.completeDesign?.designGuidance;
    return {
      slideIndex,
      narrativeRole:
        definitions.length === 1
          ? "static"
          : slideIndex === 0
            ? "cover"
            : slideIndex === definitions.length - 1
              ? "closing"
              : "development",
      ...(page ? { purpose: page.purpose, rhythm: page.rhythm, advisory: true,
        ideas: Array.from(new Set(page.assignments.flatMap(assignment => assignment.contentIds))).flatMap(id => input.generationIntent?.content.filter(content => content.id === id).map(content => content.meaning) ?? []),
      } : {}),
      design: {
        ...(!ENV.catalogLabelSanitization && definition.label ? { name: definition.label } : {}),
        description:
          guidance?.selection?.description ||
          definition.description ||
          guidance?.summary,
      },
      fields: fields.map((field) => {
        const writingPurpose = editorialAssignments?.find(assignment => assignment.fieldId === field.id)?.instruction;
        const budget = budgets.find((budget) => budget.source === field.source);
        const flexibility = usesTextFlexibility(input) ? compactTextFieldFlexibility(definition, field) : undefined;
        const capacity = flexibility ? {
          chars: [flexibility.characters.min, flexibility.characters.max],
          lines: [flexibility.lines.min, flexibility.lines.max],
          scope: flexibility.scope,
          ...(budget ? { distribution: budget.distribution } : {}),
        } : budget ? {
          estimatedCharacters: budget.estimatedCharacters,
          advisory: true,
          distribution: budget.distribution,
          ...("perItemCharacters" in budget ? {perItemCharacters: budget.perItemCharacters} : {}),
        } : undefined;
        return {
          fieldId: field.id,
          role: field.role,
          kind: field.kind,
          required: field.required,
          ...artworkFieldBrief(input, slideIndex, field),
          ...(writingPurpose ? { writingPurpose } : {}),
          ...(field.kind === "list" ? { cardinality: field.cardinality } : {}),
          ...(capacity ? {capacity} : {}),
          ...(input.generationConfig?.trioDeliveryVersion === 1 || editorialAssignments ? {
            boxes: authoredTextBoxes(definition, field.source).map(box => ({
              ...writingBox(box.width, box.height, box.sizes.min, box.lineHeight),
              ...(box.fragment ? {fragment: box.fragment.index + 1, fragments: box.fragment.count} : {}),
            })),
          } : {}),
        };
      }),
      ...(guidance?.fieldRelationships?.length
        ? {
            relationships: guidance.fieldRelationships.map((relation) => ({
              kind: relation.kind,
              fields: fields
                .filter((field) => relation.sources.includes(field.source))
                .map((field) => field.id),
              meaning: relation.label,
            })),
          }
        : {}),
      mediaPrompts: (definition.fragment.mediaSlots ?? []).map((slot) => ({
        slotId: slot.id,
        purpose: slot.function,
        guidance:
          guidance?.mediaRules.find((rule) => rule.slotId === slot.id)
            ?.instructions ?? [],
      })),
    };
  });
}

export const compactCopySystemPrompt = [
  "Redija a proposta completa em português natural e entregue somente o JSON solicitado, com todos os slides na ordem e cada fieldId exatamente uma vez.",
  "Marcadores [factsRef:request] remetem ao pedido original; [factsRef:source-N] e sources.factsRef remetem ao texto dessa fonte. Não mudam origem, purpose ou autoridade da fonte.",
  "O pedido original é a autoridade. Contexto e imagens fonte de conteúdo sustentam fatos; fontes visual_reference são apenas orientação visual; a descrição do design e ideias editoriais não comprovam fatos. Preserve nomes, números, condições e requisitos explícitos. Não invente garantias ou dados.",
  "Adapte a redação aos campos selecionados. Capacidade é estimativa consultiva, não limite de caracteres ou palavras. O servidor mede o texto nas fontes e caixas reais. Preserve linguagem natural, sentido e utilidade; não mutile frases para atingir uma contagem.",
  "Distribua a mensagem entre os campos, sem colocar todas as ideias em cada um. Rótulos são apoios curtos; campos opcionais, índices e espaços mínimos podem ficar vazios. Não transforme cada rótulo em uma chamada para ação. Uma ideia editorial da página não é obrigação de nenhum campo individual.",
  "Cada campo textual recebe uma string canônica, inclusive quando distribuída em fragmentos. Listas recebem arrays sem repetir os prefixos do design. Opcionais podem ficar vazios. A cardinalidade se aplica a itens, não a palavras. Estilo e ritmo sugeridos são orientações, nunca novas obrigações.",
  "Mantenha na arte o que o pedido destina à arte; a legenda pode aprofundar conteúdo sem substituir itens ou condições obrigatórios. Respeite contagens explícitas e o papel de cada página sem repetir a história inteira em cada slide.",
  "Intervenção visual_only exige preservar literalmente a fonte. Não reescreva nem acrescente hashtags. Gere prompts apenas para os slots de mídia indicados.",
].join("\n");

export function compactCopySystemPromptFor(input: ProposalExecutionInput) {
  const copyV2 = usesCopyInstructionsV2(input);
  const opening = copyV2
    ? AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2
    : "Redija a proposta completa em português natural.";
  return usesCompactEditorialContract(input) ? [
    positiveEditorialInstructions,
    usesTextFlexibility(input)
      ? `${opening} Distribua a mensagem pelos papéis dos campos e páginas, com frases completas e alternativas expressivas.`
      : `${opening} Distribua a mensagem pelos papéis dos campos e páginas, com frases completas e alternativas expressivas. Capacidades são estimativas consultivas; o servidor mede o encaixe real. Campos opcionais podem ficar vazios.`,
    "Entregue somente o JSON: todos os slides na ordem, cada fieldId exatamente uma vez. Texto usa uma string canônica, inclusive quando repartido em fragmentos; listas usam arrays de itens, com prefixos aplicados pelo design. Gere prompts de imagem somente para os slots indicados, como propostas visuais subordinadas ao pedido original. Em visual_only mantenha o texto literal e as hashtags existentes.",
    ...(usesArtworkBriefCopy(input) ? [artworkCopyInstructions] : []),
    ...(input.generationConfig?.trioDeliveryVersion === 1 ? ["Use boxes para decidir o que cabe. Cada caixa informa largura e altura úteis e o teto de linhas na menor fonte legível. Fragmentos recebem só uma parte da string canônica. Em listas, considere as caixas por item. Prefira rótulos e chamadas que caibam em uma linha quando maxLines for 1."] : []),
  ].join("\n") : copyV2 ? `${AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2}\n${compactCopySystemPrompt}` : compactCopySystemPrompt;
}

export function targetedRepairSystemPromptFor(input: ProposalExecutionInput, version: TargetedCopyRepairVersion) {
  const copyV2 = usesCopyInstructionsV2(input);
  if (!usesCompactEditorialContract(input)) {
    const base = version === 2 ? targetedRepairSystemPromptV2 : targetedRepairSystemPrompt;
    return copyV2 ? `${AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2}\n${base}` : base;
  }
  return [positiveEditorialInstructions,
    ...(copyV2 ? [AFFIRMATIVE_COPY_LANGUAGE_ANCHOR_V2] : []),
    "Corrija somente os alvos autorizados. Retorne value como a melhor redação e até duas alternativas naturais e distintas; quando houver overflow, use as linhas e proporções medidas em fit para reduzir substancialmente a extensão do texto atual, oferecendo também uma opção ainda mais curta que preserve o objetivo e os fatos usados." + (usesTextFlexibility(input) ? "" : " As capacidades são estimativas: a medição local escolhe o texto que cabe."),
    "Preserve frases completas no conjunto dos alvos e das continuações congeladas indicadas. Uma string canônica pode ocupar vários fragmentos tipográficos. Cobertura considera somente campos/itens congelados e seu destino; conteúdo na legenda comprova apenas presença na legenda. Preserve a entidade em um alvo pertinente quando ela identifica o assunto e falta cobertura congelada na arte. Campos opcionais podem ficar vazios se o conteúdo material continua preservado no destino adequado.",
    ...(usesArtworkBriefCopy(input) ? ["Mantenha as quebras de linha que separam as alternativas de um comparativo. Preserve a ação pedida no CTA da lâmina de encerramento."] : []),
    "Entregue apenas os patches autorizados, mantendo o restante da proposta intacto. A revisão final verifica fatos, sentido e requisitos no resultado completo.",
  ].join("\n");
}

/** Exact text factoring only. Surrounding context and source authority survive.
 * References expand back to the original context without semantic trimming. */
export function compactSourceContext(input: ProposalExecutionInput) {
  const known = new Map<string,string>([[input.prompt,"request"]]);
  const sources = (input.sourceReferences ?? []).filter(source => source.facts?.trim()).map((source,index) => {
    const ref = `source-${index + 1}`, facts = source.facts!;
    const prior = known.get(facts);
    if (!prior) known.set(facts,ref);
    return {ref,id:source.id,kind:source.kind,purpose:source.purpose,origin:source.origin,url:source.url,title:source.title,...(prior ? {factsRef:prior} : {facts})};
  });
  let factualContext = input.contextContent;
  if (factualContext && !factualContext.includes("[factsRef:")) {
    const entries=Array.from(known).filter(([text])=>text.length>0).sort((a,b)=>b[0].length-a[0].length);
    let offset=0, compact="";
    while(offset<factualContext.length) {
      let next: {at:number;text:string;ref:string}|undefined;
      for(const [text,ref] of entries) {
        const at=factualContext.indexOf(text,offset);
        if(at>=0&&(!next||at<next.at||(at===next.at&&text.length>next.text.length)))next={at,text,ref};
      }
      if(!next) {compact+=factualContext.slice(offset);break;}
      compact+=factualContext.slice(offset,next.at)+`[factsRef:${next.ref}]`;
      offset=next.at+next.text.length;
    }
    factualContext=compact;
  }
  return {...(factualContext ? {factualContext} : {}),sources};
}

export function compactCopyPrompt(
  input: ProposalExecutionInput,
  definitions: ComponentDefinitionV1[],
) {
  const reading = editorialDesignReading(input);
  const readingContext = reading ? { designReading: { ...reading, instruction: editorialDesignWritingInstruction } } : {};
  const legacyApproach = input.narrativePlan?.editorialDesign ? undefined : input.editorialApproach;
  const recovery = input.rewriteForRecovery ? { recovery: {
    instruction: "Adapte a redação a estas caixas do novo design. Preserve fatos, sentido, condições e obrigações do pedido e da cópia anterior. Redistribua listas e textos nos campos compatíveis ou na legenda conforme o briefing, sem cortar fatos para fazer caber. Não copie fieldIds da composição anterior: use somente os campos e capacidades deste design. Nenhuma geometria ou regra de legibilidade foi relaxada.",
    ...(input.recoverySourceCopy ? { previousCopy: input.recoverySourceCopy } : {}),
  } } : {};
  if (usesCompactEditorialContract(input)) return JSON.stringify({
    version: 2,
    editorial: buildCompactEditorialContract(input),
    ...(input.editorialSourceQuotes?.length ? { selectedSourceExcerpts: input.editorialSourceQuotes } : {}),
    ...(input.platform ? {platform: input.platform} : {}),
    ...(legacyApproach ? {approach: {text: legacyApproach, advisory: true}} : {}),
    ...readingContext,
    ...recovery,
    slides: compactWritableSlides(input, definitions).map(({ideas: _ideas, ...slide}) => slide),
  });
  const project = projectEditorialDefaults(
    input.projectDossier,
    input.projectSnapshot,
  );
  const resolved = input.editorialContext
    ? resolvedEditorialContext(input.editorialContext)
    : undefined;
  return JSON.stringify({
    version: 1,
    request: input.prompt,
    ...(input.executionBrief?.rawInput &&
    input.executionBrief.rawInput !== input.prompt
      ? { originalSource: input.executionBrief.rawInput }
      : {}),
    platform: input.platform ?? input.executionBrief?.platform,
    intervention: input.executionBrief?.interventionLevel,
    brand: {
      name: project.name,
      niche: project.niche,
      ...project.structuredData,
    },
    guidance: resolved?.instructions ?? {
      tone: input.tone ?? input.executionBrief?.tone,
      audience: input.executionBrief?.audience,
      objective: input.executionBrief?.objective,
      callToAction: input.executionBrief?.callToAction,
    },
    requirements: requirements(input).map(({ kind, scope, value }) => ({
      kind,
      scope,
      value,
    })),
    ...compactSourceContext(input),
    ...(input.executionBrief?.notes
      ? { notes: input.executionBrief.notes }
      : {}),
    ...(legacyApproach ? { approach: legacyApproach } : {}),
    ...readingContext,
    ...recovery,
    slides: compactWritableSlides(input, definitions),
  });
}

export type TargetedCopyRepairVersion = 1 | 2;
export type TargetedCopyRepairTarget = {
  slideIndex: number;
  fieldId: string;
  itemIndex: number | null;
  current: string | string[];
  reason: string[];
  sourceQuotes?: string[];
  /** Only set after a measured local overflow; never a general copy veto. */
  maxCharacters?: number;
  fit?: {
    widthRatio: number;
    heightRatio: number;
    measuredLines?: number;
    boxes?: Array<ReturnType<typeof writingBox> & { currentLines: number; fragment?: number; fragments?: number }>;
  };
  coverage?: { advisory: true; otherFieldIds: string[]; caption: boolean; terms: string[] };
  /** A declared sequence still has a nonempty, immutable following field. */
  frozenContinuation?: boolean;
};
const targetKey = (
  target: Pick<
    TargetedCopyRepairTarget,
    "slideIndex" | "fieldId" | "itemIndex"
  >,
) => `${target.slideIndex}:${target.fieldId}:${target.itemIndex ?? "all"}`;

export function editorialRepairTargets(
  copy: CopyResponse,
  review: ProposalReviewRecord,
  skipTextSpacing = false,
): TargetedCopyRepairTarget[] {
  const targets = new Map<string, TargetedCopyRepairTarget>();
  for (const finding of review.findings.filter(
    (finding) =>
      isBlockingReviewFinding(finding) &&
      (!skipTextSpacing || !isTextSpacingReviewFinding(finding)) &&
      (finding.authority === "source_grounded" ||
        finding.authority === "contract_grounded"),
  )) {
    if (finding.fieldId === null) continue;
    const itemIndex =
      "itemIndex" in finding && typeof finding.itemIndex === "number"
        ? finding.itemIndex
        : null;
    // Hashtags are a list of independently authorized items, not a whole-list rewrite.
    if (finding.fieldId === "$hashtags" && itemIndex === null) continue;
    const row = copy.slides[finding.slideIndex]?.values.find(
      (row) => row.fieldId === finding.fieldId,
    );
    const value =
      finding.fieldId === "$caption"
        ? copy.caption
        : finding.fieldId === "$hashtags"
          ? copy.hashtags
          : row?.value;
    const current =
      itemIndex !== null && Array.isArray(value) ? value[itemIndex] : value;
    if (current === undefined) continue;
    const target = {
      slideIndex: finding.fieldId.startsWith("$") ? 0 : finding.slideIndex,
      fieldId: finding.fieldId,
      itemIndex,
      current,
      reason: [finding.explanation],
      sourceQuotes: finding.sourceQuote ? [finding.sourceQuote] : [],
    };
    const key = targetKey(target),
      previous = targets.get(key);
    if (previous) {
      previous.reason.push(...target.reason);
      previous.sourceQuotes!.push(...target.sourceQuotes);
    } else targets.set(key, target);
  }
  return Array.from(targets.values());
}

export function isTextSpacingReviewFinding(finding: ProposalReviewRecord["findings"][number]) {
  if (finding.category !== "visible_text_loss" || ("scope" in finding && finding.scope !== "art")) return false;
  const evidence = (finding.explanation + " " + finding.expected).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /sobrepo(?:s|e|n)|colisao|se sobrep|entrelinha|espacamento entre (?:as )?linhas?|linhas? (?:muito )?(?:coladas?|apertadas?)|quebr\w*[^.!?]{0,30}\blinhas?\b|espaco de respiracao|(?:overlap|collid|collision)|line (?:spacing|height)|leading/i.test(evidence) &&
    !/\b(?:omit(?:e|iu|id|ted|s)|falt(?:a|am|ando)|ausent|missing (?:word|fact|benefit)|omissao|remov(?:id|eu)|supressao)/i.test(evidence);
}

/** Compact evidence from the actual Fontkit result; raw geometry stays local. */
export function enrichTargetedCopyRepairTargets(
  input: ProposalExecutionInput,
  definitions: ComponentDefinitionV1[],
  copy: CopyResponse,
  targets: TargetedCopyRepairTarget[],
  compositions: ArsenalComposition[],
  measureText: ArsenalTextMeasurer,
  version: TargetedCopyRepairVersion = 1,
): TargetedCopyRepairTarget[] {
  const slots = compactWritableSlides(input, definitions);
  const terms = (text: string) => Array.from(new Set(text.toLocaleLowerCase().match(/[a-zà-ÿ0-9]{2,}/g) ?? []));
  const mutable = (slideIndex: number, fieldId: string, itemIndex: number | null) => targets.some(target =>
    target.slideIndex === slideIndex && target.fieldId === fieldId &&
    (target.itemIndex === null || target.itemIndex === itemIndex));
  const frozenFields = copy.slides.flatMap((slide, slideIndex) => slide.values.flatMap(row =>
    (Array.isArray(row.value) ? row.value.map((value, itemIndex) => ({ value, itemIndex })) : [{ value: row.value, itemIndex: null }])
      .filter(item => !mutable(slideIndex, row.fieldId, item.itemIndex))
      .map(item => ({ slideIndex, fieldId: row.fieldId, itemIndex: item.itemIndex,
        id: `${slideIndex}:${row.fieldId}${item.itemIndex === null ? "" : `[${item.itemIndex}]`}`,
        terms: terms(item.value), nonempty: Boolean(item.value.trim()) }))));
  return targets.map(target => {
    const definition = definitions[target.slideIndex];
    const field = completeDesignFields(definition, nativeGlyphProjectionFor(input)).find(field => field.id === target.fieldId);
    if (!field) return version === 1 ? target : { ...target, maxCharacters: undefined };
    const bindingIds = definition.fragment.bindings.filter(binding => binding.source === field.source).map(binding => binding.id);
    const elements = compositions[target.slideIndex].elements.filter(element => element.kind === "text" && bindingIds.includes(element.bindingId ?? "") &&
      (!usesTextFlexibility(input) || field.kind !== "list" || target.itemIndex === null || element.itemId === `item-${target.itemIndex}`));
    let widthRatio = 0, heightRatio = 0;
    const measuredLineCounts: number[] = [];
    const boxes: NonNullable<NonNullable<TargetedCopyRepairTarget["fit"]>["boxes"]> = [];
    const authored = input.generationConfig?.trioDeliveryVersion === 1 ? authoredTextBoxes(definition, field.source) : [];
    for (const element of elements) {
      const box = definition.fragment.instances.find(instance => instance.id === element.id);
      const measuredElement = version === 2 ? { ...element, ...arsenalTextLayoutBox(compositions[target.slideIndex], element) }
        : box ? { ...element, width: box.width, height: box.height } : element;
      const measured = measureArsenalElement(measuredElement, measureText);
      if (authored.length) {
        const budget = authored.find(box => box.id === element.id) ?? authored[0];
        boxes.push({
          ...writingBox(measuredElement.width, measuredElement.height, budget.sizes.min, element.lineHeight),
          currentLines: measured.lines.length,
          ...(element.contentFragment ? {fragment: element.contentFragment.index + 1, fragments: element.contentFragment.count} : {}),
        });
      }
      measuredLineCounts.push(measured.lines.length);
      widthRatio = Math.max(widthRatio, ...measured.lines.map(line => line.width / Math.max(1, measuredElement.width)));
      heightRatio = Math.max(heightRatio, measured.height / Math.max(1, measuredElement.height));
    }
    const hasOverflow = target.reason.some(reason => reason.startsWith("overflow:")) && Math.max(widthRatio, heightRatio) > 1.01;
    const capacity = slots[target.slideIndex].fields.find(slot => slot.fieldId === target.fieldId)?.capacity;
    const estimate = capacity && "estimatedCharacters" in capacity ? capacity.estimatedCharacters : undefined;
    const measuredLines = capacity?.distribution === "typographic_fragments"
      ? measuredLineCounts.reduce((sum, count) => sum + count, 0)
      : Math.max(0, ...measuredLineCounts);
    const maxCharacters = version === 1 && typeof target.current === "string" && hasOverflow && estimate !== undefined
      ? Math.max(1, Math.min(target.current.length - 1, estimate)) : undefined;
    const targetTerms = terms(Array.isArray(target.current) ? target.current.join(" ") : target.current);
    const otherFields = version === 2 ? frozenFields : copy.slides.flatMap((slide, index) => slide.values.filter(row => index !== target.slideIndex || row.fieldId !== target.fieldId).map(row => ({ id: `${index}:${row.fieldId}`, terms: terms(Array.isArray(row.value) ? row.value.join(" ") : row.value) })));
    const matching = otherFields.filter(row => row.terms.some(term => targetTerms.includes(term)));
    const captionTerms = version === 2 && mutable(0, "$caption", null) ? [] : terms(copy.caption);
    const frozenContinuation = version === 2 && Boolean(definition.completeDesign?.designGuidance?.fieldRelationships?.some(relation => {
      if (relation.kind !== "sequence") return false;
      const index = relation.sources.indexOf(field.source);
      const next = index >= 0 ? completeDesignFields(definition, nativeGlyphProjectionFor(input)).find(candidate => candidate.source === relation.sources[index + 1]) : undefined;
      return next && frozenFields.some(row => row.slideIndex === target.slideIndex && row.fieldId === next.id && row.nonempty);
    }));
    const { maxCharacters: _oldLimit, ...unboundedTarget } = target;
    const maxRatio = Math.max(1, widthRatio, heightRatio);
    const currentLengths = Array.isArray(target.current) ? target.current.map(item => item.length) : [target.current.length];
    const currentMaxLength = Math.max(0, ...currentLengths);
    const suggestedPrincipal = hasOverflow && maxRatio > 1.01 && currentMaxLength > 0
      ? Math.max(1, Math.min(currentMaxLength - 1, Math.floor(currentMaxLength / maxRatio)))
      : undefined;
    return { ...(version === 2 ? unboundedTarget : target), ...(maxCharacters === undefined ? {} : { maxCharacters }),
      ...(version === 2 ? { frozenContinuation } : {}),
      fit: { widthRatio: Math.round(widthRatio * 100) / 100, heightRatio: Math.round(heightRatio * 100) / 100,
        ...(usesTextFlexibility(input) ? { measuredLines } : {}), ...(boxes.length ? {boxes} : {}),
        ...(suggestedPrincipal !== undefined ? { suggestedLengths: { value: suggestedPrincipal, alternatives: [Math.max(1, Math.floor(suggestedPrincipal * 0.75)), Math.max(1, Math.floor(suggestedPrincipal * 0.5))], advisory: true } } : {}) },
      coverage: { advisory: true, otherFieldIds: matching.map(row => row.id), caption: targetTerms.some(term => captionTerms.includes(term)), terms: targetTerms.filter(term => captionTerms.includes(term) || matching.some(row => row.terms.includes(term))) },
    };
  });
}

/** A constant patch item grammar avoids provider compiled-grammar blowup on multi-target repairs;
 * exact target allowlist, requiredness, cardinality, and legacy maxCharacters are enforced locally. */
export function targetedCopyRepairSchema(
  targets: TargetedCopyRepairTarget[],
  definitions?: ComponentDefinitionV1[],
  version: TargetedCopyRepairVersion = 1,
  nativeGlyphProjection?: 1,
) {
  if (!targets.length) throw new Error("copy_repair_requires_targets");
  const targetByKey = new Map<string, { target: TargetedCopyRepairTarget; field: ReturnType<typeof completeDesignFields>[number] | undefined }>();
  for (const target of targets) {
    const definition = definitions?.[target.slideIndex];
    const field =
      definition &&
      completeDesignFields(definition, nativeGlyphProjection).find(
        (f) => f.id === target.fieldId,
      );
    if (nativeGlyphProjection === 1 && definition && !field && target.fieldId !== "$caption" && target.fieldId !== "$hashtags") {
      throw new Error("copy_repair_unknown_native_field");
    }
    targetByKey.set(targetKey(target), { target, field });
  }
  const valueSchema = z.union([z.string(), z.array(z.string())]);
  return z
    .object({
      patches: z
        .array(
          z
            .object({
              slideIndex: z.number().int().min(0),
              fieldId: z.string(),
              itemIndex: z.number().int().min(0).nullable(),
              value: valueSchema,
              alternatives: z.array(valueSchema).max(2).optional(),
            })
            .strict(),
        )
        .length(targets.length),
    })
    .strict()
    .superRefine((result, context) => {
      const seenKeys = new Set<string>();
      result.patches.forEach((patch, index) => {
        const key = targetKey(patch as unknown as TargetedCopyRepairTarget);
        const entry = targetByKey.get(key);
        if (!entry) {
          context.addIssue({
            code: "custom",
            path: ["patches", index],
            message: "unknown_repair_target",
          });
          return;
        }
        seenKeys.add(key);
        const { target, field } = entry;
        const validateValue = (val: string | string[], path: Array<string | number>) => {
          if (Array.isArray(target.current)) {
            if (!Array.isArray(val)) {
              context.addIssue({ code: "custom", path, message: "repair_list_requires_array" });
              return;
            }
            if (field?.cardinality) {
              const min = field.required ? field.cardinality.min : 0;
              if (val.length < min || val.length > field.cardinality.max) {
                context.addIssue({ code: "custom", path, message: "repair_list_cardinality_mismatch" });
              }
            } else if (val.length !== target.current.length) {
              context.addIssue({ code: "custom", path, message: "repair_list_length_mismatch" });
            }
            return;
          }
          if (typeof val !== "string") {
            context.addIssue({ code: "custom", path, message: "repair_text_requires_string" });
            return;
          }
          if (field?.required && val.length < 1) {
            context.addIssue({ code: "custom", path, message: "repair_required_text_empty" });
          }
          if (version !== 2 && target.maxCharacters !== undefined && val.length > target.maxCharacters) {
            context.addIssue({ code: "custom", path, message: "repair_text_exceeds_max_characters" });
          }
        };
        validateValue(patch.value, ["patches", index, "value"]);
        patch.alternatives?.forEach((alt, altIndex) =>
          validateValue(alt, ["patches", index, "alternatives", altIndex]),
        );
      });
      if (seenKeys.size !== targets.length) {
        context.addIssue({
          code: "custom",
          message: "duplicate_or_missing_repair_target",
        });
      }
    });
}

/** Only relevant factual excerpts are sent, never the original prompt graph or healthy copy. */
function repairFacts(
  input: ProposalExecutionInput,
  target: TargetedCopyRepairTarget,
  version: TargetedCopyRepairVersion = 1,
) {
  const current = Array.isArray(target.current)
    ? target.current.join(" ")
    : target.current;
  const words = new Set(
    current.toLocaleLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) ?? [],
  );
  const explicit = target.sourceQuotes ?? [];
  const project = projectEditorialDefaults(
    input.projectDossier,
    input.projectSnapshot,
  );
  const sources = [
    ...(version === 2 ? [input.prompt] : []),
    input.contextContent,
    ...(input.sourceReferences ?? [])
      .filter(
        (source) =>
          source.purpose !== "visual_reference" &&
          source.purpose !== "guidance",
      )
      .map((source) => source.facts),
    project.structuredData.offerAndTransformation,
    project.structuredData.factualDifferentials,
    input.executionBrief?.rawInput !== input.prompt
      ? input.executionBrief?.rawInput
      : undefined,
  ].filter((text): text is string => Boolean(text));
  const related = sources
    .flatMap((source) => source.split(/(?<=[.!?])\s+|\n+/))
    .map((text) => ({
      text,
      score: (text.toLocaleLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) ?? []).filter(
        (word) => words.has(word),
      ).length,
    }))
    .filter((item) => item.score >= (version === 2 ? 1 : 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.text);
  return Array.from(new Set([...explicit, ...related]));
}

export const targetedRepairSystemPrompt =
  "Corrija somente os alvos autorizados e retorne os patches JSON. Preserve fatos, nomes, números, condições, grafia e naturalidade. maxCharacters, quando presente, limita apenas este reparo após overflow medido e consta no schema; não trunque palavras. Retorne value e até duas alternatives naturais, incluindo uma mais concisa quando houver overflow. Campos opcionais podem receber string vazia quando seu conteúdo material já estiver coberto nos outros campos/legenda indicados; a cobertura lexical é apenas indício, não prova semântica. Campos obrigatórios continuam obrigatórios. Não repita todos os fatos em cada alvo. Não transforme benefício plausível em garantia. Não altere nem devolva campos saudáveis, mídia, plano ou geometria. A medição local escolhe uma alternativa que caiba e a revisão factual verifica o resultado completo.";
export const TARGETED_REPAIR_MAX_TOKENS = 2048;
export const targetedRepairSystemPromptV2 =
  "Corrija somente os alvos autorizados e retorne patches JSON. Preserve o objetivo, entidades, fatos usados, condições e a naturalidade. As capacidades são estimativas consultivas, nunca limites de caracteres; reescreva de forma concisa e completa, sem cortar palavras ou deixar uma preposição/artigo sem complemento. Retorne value como a melhor redação completa e até duas alternativas realmente distintas e naturais, incluindo outra formulação mais curta quando houver overflow; não repita a mesma opção. Títulos podem ser breves e expressivos, sem fórmula editorial obrigatória. Quando o texto atravessa fragmentos tipográficos, mantenha uma única frase canônica completa; a divisão visual é local. Campos opcionais podem ficar vazios se o conteúdo material estiver preservado em destino adequado. A cobertura lista somente campos/itens congelados; não use outro alvo deste lote como garantia de preservação. Cobertura na legenda não prova presença na arte. Se um nome presente nos alvos identifica o assunto, preserve-o em pelo menos um alvo pertinente quando não existir cobertura congelada na arte; não o repita mecanicamente em todos. Não transforme benefício plausível em garantia. Não devolva campos saudáveis, mídia, planos ou geometria. A medição local escolhe texto que cabe, e a revisão completa verifica o sentido e os fatos.";

export function targetedCopyRepairPrompt(
  input: ProposalExecutionInput,
  definitions: ComponentDefinitionV1[],
  targets: TargetedCopyRepairTarget[],
  version: TargetedCopyRepairVersion = 1,
) {
  const slots = compactWritableSlides(input, definitions);
  const reading = editorialDesignReading(input);
  const readingContext = reading ? { designReading: { ...reading, instruction: "Preserve a leitura escolhida e a função de escrita ao corrigir os alvos autorizados, respeitando os fatos e os requisitos do pedido." } } : {};
  if (version === 2 && usesCompactEditorialContract(input)) return JSON.stringify({
    version: 3,
    editorial: buildCompactEditorialContract(input),
    ...readingContext,
    targets: targets.map(target => {
      const field = slots[target.slideIndex]?.fields.find(field => field.fieldId === target.fieldId);
      return {slideIndex: target.slideIndex, fieldId: target.fieldId, itemIndex: target.itemIndex,
        current: target.current, reason: target.reason, role: field?.role, required: field?.required,
        ...(field?.writingPurpose ? { writingPurpose: field.writingPurpose } : {}),
        fit: target.fit, capacity: field?.capacity, coverage: target.coverage,
        frozenContinuation: target.frozenContinuation ?? false,
        ...(target.sourceQuotes?.length ? {sourceQuotes: target.sourceQuotes} : {}),
      };
    }),
  });
  const project = projectEditorialDefaults(input.projectDossier, input.projectSnapshot);
  const factsByTarget = targets.map(target => repairFacts(input, target, version));
  const firstRequestSentence = input.prompt.split(/(?<=[.!?])\s+|\n+/).find(sentence => sentence.trim());
  const facts = Array.from(new Set([...(version === 2 && firstRequestSentence ? [firstRequestSentence] : []), ...factsByTarget.flat()]));
  return JSON.stringify({
    version,
    ...readingContext,
    ...(version === 2 ? { context: {
      objective: input.generationIntent?.objective || input.executionBrief?.objective || firstRequestSentence,
      ...(project.name ? { entity: { name: project.name, ...(project.niche ? { niche: project.niche } : {}) } } : {}),
      facts: facts.map((text, index) => ({ id: `f${index + 1}`, text })),
      requirements: requirements(input).map(({ kind, scope, value }) => ({ kind, scope, value })),
    } } : {}),
    targets: targets.map((target, targetIndex) => ({
      slideIndex: target.slideIndex,
      fieldId: target.fieldId,
      itemIndex: target.itemIndex,
      current: target.current,
      reason: target.reason,
      role: slots[target.slideIndex]?.fields.find(field => field.fieldId === target.fieldId)?.role,
      ...(reading ? { writingPurpose: slots[target.slideIndex]?.fields.find(field => field.fieldId === target.fieldId)?.writingPurpose } : {}),
      required: slots[target.slideIndex]?.fields.find(field => field.fieldId === target.fieldId)?.required,
      canBeEmpty: slots[target.slideIndex]?.fields.find(field => field.fieldId === target.fieldId)?.required === false,
      ...(version === 1 && target.maxCharacters !== undefined ? { maxCharacters: target.maxCharacters } : {}),
      fit: target.fit,
      coverage: target.coverage,
      capacity: slots[target.slideIndex]?.fields.find(
        (field) => field.fieldId === target.fieldId,
      )?.capacity,
      ...(version === 2 ? {
        page: { role: slots[target.slideIndex]?.narrativeRole, purpose: slots[target.slideIndex]?.purpose },
        factIds: factsByTarget[targetIndex].map(text => `f${facts.indexOf(text) + 1}`),
        frozenContinuation: target.frozenContinuation ?? false,
      } : { facts: factsByTarget[targetIndex] }),
      protectedRequirements: requirements(input)
        .filter(
          (requirement) =>
            requirement.kind === "forbidden" ||
            (Array.isArray(target.current)
              ? target.current.join(" ")
              : target.current
            ).includes(requirement.value),
        )
        .map(({ kind, value }) => ({ kind, value })),
    })),
  });
}

function usesVisualTextRepair(input: ProposalExecutionInput) {
  const config = input.reviewExecutionConfig;
  return config?.version === 5 && "visualTextRepairVersion" in config && config.visualTextRepairVersion === 1;
}

/** One visual repair call, with three editorial options for local measurement.
 * This instruction is pinned independently from historical text-only repairs. */
export function visualTextRepairSystemPrompt(input: ProposalExecutionInput) {
  if (!usesVisualTextRepair(input)) return targetedRepairSystemPromptFor(input, 2);
  return [positiveEditorialInstructions,
    "Observe a composição anexada junto às medidas de encaixe. Reescreva somente os alvos autorizados para tornar a mensagem legível no mesmo design, preservando objetivo, marca, fatos usados e condições materiais.",
    "Para cada alvo, entregue três opções naturais e distintas: value é a versão principal reformulada; alternatives[0] é uma versão sintética; alternatives[1] é a expressão mínima completa que ainda cumpre o objetivo. Em overflow, procure reduzir progressivamente a extensão e as linhas nas três opções. suggestedLengths orienta esses três graus de concisão; são estimativas consultivas, e o encaixe real é conferido localmente.",
    "Leia cada opção junto dos frozenFields e da legenda congelada quando presentes. Preserve o sentido completo, inclusive quando uma string atravessa fragmentos tipográficos. Identidade já preservada em campo congelado dispensa repetição; a legenda preserva apenas conteúdo destinado à legenda. Campos opcionais podem ficar vazios quando seu conteúdo material continua no destino adequado.",
    "A imagem é um rascunho de encaixe anterior à mídia: slots ainda vazios podem aguardar sua imagem. Concentre a correção no texto autorizado. Mantenha campos saudáveis, mídia, geometria, fatos e requisitos congelados; retorne somente os patches JSON solicitados.",
  ].join("\n");
}

/** Exact, page-scoped context; never a second complete copy/catalogue payload. */
export function visualTextRepairPrompt(
  input: ProposalExecutionInput,
  definitions: ComponentDefinitionV1[],
  targets: TargetedCopyRepairTarget[],
  copy: CopyResponse,
) {
  const base = targetedCopyRepairPrompt(input, definitions, targets, 2);
  if (!usesVisualTextRepair(input)) return base;
  const data = JSON.parse(base);
  const selectedSlides = new Set(targets.filter(target => !target.fieldId.startsWith("$")).map(target => target.slideIndex));
  const mutable = (slideIndex: number, fieldId: string, itemIndex: number | null) => targets.some(target => target.slideIndex === slideIndex && target.fieldId === fieldId &&
    (target.itemIndex === null || target.itemIndex === itemIndex));
  const frozenFields = copy.slides.flatMap((slide, slideIndex) => {
    if (!selectedSlides.has(slideIndex)) return [];
    const fields = completeDesignFields(definitions[slideIndex], nativeGlyphProjectionFor(input));
    return slide.values.flatMap(row => (Array.isArray(row.value) ? row.value.map((text, itemIndex) => ({text,itemIndex})) : [{text:row.value,itemIndex:null}])
      .filter(item => item.text.trim() && !mutable(slideIndex, row.fieldId, item.itemIndex))
      .map(item => ({slideIndex,fieldId:row.fieldId,...(item.itemIndex === null ? {} : {itemIndex:item.itemIndex}),role:fields.find(field => field.id === row.fieldId)?.role,text:item.text})));
  });
  return JSON.stringify({
    ...data,
    version: 4,
    visualContext: {stage: "text_fit_draft", media: "pending_if_unfilled"},
    targets: data.targets.map((projected: Record<string, any>, index: number) => {
      const target = targets[index];
      const lengths = Array.isArray(target.current) ? target.current.map(text => text.length) : [target.current.length];
      const currentLength = Math.max(0, ...lengths);
      const ratio = Math.max(1, target.fit?.widthRatio ?? 1, target.fit?.heightRatio ?? 1);
      const capacityMaximum = projected.capacity?.chars?.[1];
      const principal = Math.max(projected.required ? 1 : 0, Math.min(currentLength, Math.floor(currentLength / ratio),
        typeof capacityMaximum === "number" ? capacityMaximum : Infinity));
      return {...projected,
        fit: {...target.fit, characters: Array.isArray(target.current) ? lengths : currentLength},
        suggestedLengths: {value: principal, alternatives: [Math.max(projected.required ? 1 : 0, Math.floor(principal * .7)), Math.max(projected.required ? 1 : 0, Math.floor(principal * .45))],
          scope: Array.isArray(target.current) || target.itemIndex !== null ? "item" : "field", advisory: true},
      };
    }),
    frozenFields,
    ...(copy.caption.trim() && targets.some(target => target.coverage?.caption) && !targets.some(target => target.fieldId === "$caption")
      ? {frozenCaption: {scope:"caption",text:copy.caption}} : {}),
  });
}

export type TargetedCopyRepairFitContext = { pendingTargets: TargetedCopyRepairTarget[] };

export function applyTargetedCopyRepair(
  copy: CopyResponse,
  targets: TargetedCopyRepairTarget[],
  response: unknown,
  definitions?: ComponentDefinitionV1[],
  fits?: (copy: CopyResponse, target: TargetedCopyRepairTarget, context?: TargetedCopyRepairFitContext) => boolean,
  version: TargetedCopyRepairVersion = 1,
  normalizeValue?: (value: string | string[]) => string | string[],
  nativeGlyphProjection?: 1,
  preferConciseUnfitted = false,
  keepCurrentWhenUnfitted = false,
  scoreCandidate?: (copy: CopyResponse, target: TargetedCopyRepairTarget) => number,
): CopyResponse {
  const parsed = targetedCopyRepairSchema(targets, definitions, version, nativeGlyphProjection).parse(response);
  const result = structuredClone(copy);
  const patches = parsed.patches as Array<{
    slideIndex: number;
    fieldId: string;
    itemIndex: number | null;
    value: string | string[];
    alternatives?: Array<string | string[]>;
  }>;
  for (let patchIndex = 0; patchIndex < patches.length; patchIndex++) {
    const patch = patches[patchIndex];
    const apply = (value: string | string[]) => {
      if (patch.fieldId === "$caption") result.caption = value as string;
      else if (patch.fieldId === "$hashtags") result.hashtags[patch.itemIndex!] = value as string;
      else {
        const row = result.slides[patch.slideIndex].values.find(row => row.fieldId === patch.fieldId)!;
        if (patch.itemIndex !== null && Array.isArray(row.value)) row.value[patch.itemIndex] = value as string;
        else row.value = value;
      }
    };
    const target = targets.find(target => targetKey(target) === targetKey(patch))!;
    // Schema validation fixes the finite patch set; provider order determines which
    // fields are still mutable when this alternative is measured.
    const context = version === 2 ? { pendingTargets: patches.slice(patchIndex + 1).map(next => targets.find(target => targetKey(target) === targetKey(next))!) } : undefined;
    let chosen = false;
    const candidates = targetedRepairAlternatives(target, [patch.value, ...(patch.alternatives ?? [])].map(value => normalizeValue ? normalizeValue(value) : value), version);
    for (const value of candidates) {
      apply(value);
      if (!fits || (version === 2 ? fits(result, target, context) : fits(result, target))) { chosen = true; break; }
    }
    if (!chosen) {
      // Retain a supplied candidate for the next local design fit, not approval.
      // Historical receipts retain the primary value when every option fails.
      const length = (value: string | string[]) => Array.isArray(value) ? value.reduce((sum, item) => sum + item.length, 0) : value.length;
      if (keepCurrentWhenUnfitted && scoreCandidate) {
        apply(target.current);
        let bestValue: string | string[] = target.current;
        let bestScore = scoreCandidate(result, target);
        for (const value of candidates) {
          apply(value);
          const candidateScore = scoreCandidate(result, target);
          if (Number.isFinite(candidateScore) && candidateScore < bestScore) {
            bestScore = candidateScore;
            bestValue = value;
          }
        }
        apply(bestValue);
      } else {
        apply(keepCurrentWhenUnfitted ? target.current : preferConciseUnfitted
          ? candidates.reduce((shortest, value) => length(value) < length(shortest) ? value : shortest)
          : normalizeValue ? normalizeValue(patch.value) : patch.value);
      }
    }
  }
  return result;
}

/** A soft, local tie-break, never a grammar veto or a synthesized rewrite. */
export function targetedRepairAlternatives(target: TargetedCopyRepairTarget, values: Array<string | string[]>, version: TargetedCopyRepairVersion = 1) {
  if (version === 1) return values;
  const seen = new Set<string>();
  const normalized = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ");
  const unique = values.filter(value => {
    const key = JSON.stringify(Array.isArray(value) ? value.map(normalized) : normalized(value));
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  // Capitalized final letters may be names/labels (e.g. "Plano A"); leave their order alone.
  const openEnding = (value: string | string[]) => !target.frozenContinuation && typeof value === "string" &&
    /\s(?:a|à|ao|aos|às|de|do|da|dos|das|em|no|na|nos|nas|para|por|com|sem|e|ou|que)[\s,;:]*$/.test(value);
  return unique.sort((a, b) => Number(openEnding(a)) - Number(openEnding(b)));
}
