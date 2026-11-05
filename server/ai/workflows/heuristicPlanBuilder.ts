import { familyTie, type FamilyNeutrality } from "@shared/familyNeutrality";
import type { ComponentCardV1 } from "@shared/componentAssembly";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import {
  materializeDesignFamilyOffer,
  type DesignFamilyRepertoire,
} from "@shared/designRepertoire";
import type {
  GenerationIntent,
  GenerationSlotPlan,
  ViableGenerationPlan,
} from "@shared/generationPlan";
import { validateGenerationPlan } from "@shared/generationPlan";
import type { ImageObligation } from "@shared/generationContracts";
import type { DesignShortlistResult } from "../../designCatalog/designShortlist";
import {
  designHasPhotographicContent,
  designRecencyPenalty,
  designTextBudgetsV3,
  type RecentDesignSelection,
} from "@shared/designSelection";

export interface HeuristicPlanBuilderInput {
  intent: GenerationIntent;
  eligible: DesignFamilyRepertoire[];
  shortlist: DesignShortlistResult;
  imageObligation: ImageObligation;
  requestedPhotoMix?: boolean;
  slideCount: number;
  recentSelections?: RecentDesignSelection[];
  /** Pinned only by new selection receipts; omitted historical plans stay unchanged. */
  familyFirst?: boolean;
  neutrality?: FamilyNeutrality;
}

export interface HeuristicPlanResult {
  version: 1;
  slots: GenerationSlotPlan[];
}

/**
 * Constrói de forma determinística e em milissegundos o plano de geração de 3 propostas (slots 0, 1 e 2).
 * Substitui a antiga chamada LLM de 55.000 tokens e elimina alucinações de layout, garantindo conformidade total
 * com o contrato validateGenerationPlan e fidelidade com o catálogo do PostSpark.
 */
export function buildHeuristicGenerationPlan(
  input: HeuristicPlanBuilderInput
): HeuristicPlanResult {
  const {
    intent,
    eligible,
    shortlist,
    imageObligation,
    requestedPhotoMix,
    slideCount,
    recentSelections = [],
  } = input;

  if (!eligible.length) {
    return {
      version: 1,
      slots: [0, 1, 2].map(slot => ({
        slot,
        status: "insufficient_fit" as const,
        reason: "O catálogo não possui famílias elegíveis para este formato e mídia.",
        unmetRequirementIds: intent.requirements.map(r => r.id),
      })),
    };
  }

  if (input.familyFirst) return buildFamilyFirstGenerationPlan(input);

  // Mapa de pontuações e confianças do JEV
  const evalMap = new Map(shortlist.evaluated.map(e => [e.id, e]));

  const mediaCapable = (r: DesignFamilyRepertoire) =>
    r.slides.some(s => s.variants.some(c => c.mediaSlots.length > 0));

  // Nível 1: Ranqueamento e Eleição de Famílias
  interface ScoredRepertoire {
    repertoire: DesignFamilyRepertoire;
    effectiveScore: number;
    recencyPenalty: number;
    adjustedScore: number;
    hasMedia: boolean;
  }

  const scoredRepertoires: ScoredRepertoire[] = eligible.map(repertoire => {
    const ev = evalMap.get(repertoire.defaultOffer.offerId);
    const score = ev?.score ?? 2.5;
    const confidence = ev?.confidence ?? 0.8;
    const effectiveScore = score * (0.5 + 0.5 * confidence);
    const recencyPenalty = Math.max(
      0,
      ...repertoire.slides.flatMap(s =>
        s.variants.map(c => designRecencyPenalty(c, recentSelections))
      )
    );
    const adjustedScore = effectiveScore - recencyPenalty;
    const hasMedia = mediaCapable(repertoire);
    return {
      repertoire,
      effectiveScore,
      recencyPenalty,
      adjustedScore,
      hasMedia,
    };
  });

  // Ordenar por adjustedScore decrescente
  scoredRepertoires.sort((a, b) => b.adjustedScore - a.adjustedScore);

  const selectedSlots: GenerationSlotPlan[] = [];
  const chosenFamilies = new Set<string>();
  const rejectedCandidates = new Set<string>();

  for (let slot = 0; slot < 3; slot++) {
    // Definir requisito de mídia para este slot
    let slotRequiresPhoto = false;
    let slotForbidsPhoto = false;

    if (requestedPhotoMix) {
      if (slot < 2) {
        slotRequiresPhoto = true;
      } else {
        slotForbidsPhoto = true;
      }
    } else if (imageObligation.required) {
      slotRequiresPhoto = true;
    } else if (imageObligation.policy === "forbidden") {
      slotForbidsPhoto = true;
    }

    const mediaKey = `${slotRequiresPhoto}:${slotForbidsPhoto}`;

    // Filtrar candidatos compatíveis com a mídia do slot e ainda não rejeitados
    const mediaCompatible = scoredRepertoires.filter(sr => {
      if (slotRequiresPhoto && !sr.hasMedia) return false;
      if (slotForbidsPhoto && sr.hasMedia) return false;
      if (rejectedCandidates.has(`${sr.repertoire.defaultOffer.offerId}:${mediaKey}`)) {
        return false;
      }
      return true;
    });

    if (!mediaCompatible.length) {
      selectedSlots.push({
        slot,
        status: "insufficient_fit",
        reason: `Nenhuma família no catálogo atende à exigência de mídia e estrutura para o slot ${slot}.`,
        unmetRequirementIds: intent.requirements.map(r => r.id),
      });
      continue;
    }

    // Ordena priorizando famílias inéditas primeiro e, como fallback, famílias já utilizadas,
    // percorrendo todas as elegíveis até encontrar uma sequência estruturalmente válida.
    const orderedCandidates = [
      ...mediaCompatible.filter(sr => !chosenFamilies.has(sr.repertoire.family)),
      ...mediaCompatible.filter(sr => chosenFamilies.has(sr.repertoire.family)),
    ];

    let viablePlan: ViableGenerationPlan | null = null;
    for (const candidate of orderedCandidates) {
      const attemptPlan = buildSlotPagesAndAssignments({
        slot,
        repertoire: candidate.repertoire,
        intent,
        slideCount,
        slotRequiresPhoto,
        slotForbidsPhoto,
      });
      if (attemptPlan) {
        viablePlan = attemptPlan;
        chosenFamilies.add(candidate.repertoire.family);
        break;
      }
      rejectedCandidates.add(
        `${candidate.repertoire.defaultOffer.offerId}:${mediaKey}`
      );
    }

    if (viablePlan) {
      selectedSlots.push(viablePlan);
    } else {
      selectedSlots.push({
        slot,
        status: "insufficient_fit",
        reason: "Não foi possível compor uma sequência válida de lâminas com as capacidades das famílias elegíveis.",
        unmetRequirementIds: intent.requirements.map(r => r.id),
      });
    }
  }

  return {
    version: 1,
    slots: selectedSlots,
  };
}

/** A family gets one judgment, regardless of how many root compositions it owns.
 * Concrete sources and their children are only considered after that election. */
function buildFamilyFirstGenerationPlan(input: HeuristicPlanBuilderInput): HeuristicPlanResult {
  const { intent, eligible, shortlist, imageObligation, requestedPhotoMix, slideCount, recentSelections = [] } = input;
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const evaluations = new Map(shortlist.evaluated.map(e => [e.id, e]));
  const groups = new Map<string, DesignFamilyRepertoire[]>();
  for (const repertoire of eligible) {
    const members = groups.get(repertoire.family) ?? [];
    members.push(repertoire);
    groups.set(repertoire.family, members);
  }
  const families = Array.from(groups, ([family, members]) => {
    members.sort((a, b) => compare(a.defaultOffer.offerId, b.defaultOffer.offerId));
    // The family shortlist projects this same assessment onto every member.
    // Never sum/average member votes or use a member's exact-design recency here.
    const assessment = members.map(r => evaluations.get(r.defaultOffer.offerId)).find(Boolean);
    const effectiveScore = (assessment?.score ?? 2.5) * (0.5 + 0.5 * (assessment?.confidence ?? 0.8));
    const familyPenalty = recentSelections.slice(0, 5).reduce((penalty, run, index) =>
      Math.max(penalty, run.selections.some(choice => choice.family === family) ? 0.22 / (index + 1) : 0), 0);
    return { family, members, adjustedScore: effectiveScore - familyPenalty };
  }).sort((a, b) => b.adjustedScore - a.adjustedScore || (input.neutrality ? familyTie(input.neutrality.seed,a.family).localeCompare(familyTie(input.neutrality.seed,b.family)) : compare(a.family, b.family)));
  const chosenFamilies = new Set<string>();
  const rejected = new Set<string>();
  const slots: GenerationSlotPlan[] = [];

  for (let slot = 0; slot < 3; slot++) {
    const slotRequiresPhoto = requestedPhotoMix ? slot < 2 : imageObligation.required;
    const slotForbidsPhoto = requestedPhotoMix ? slot === 2 : imageObligation.policy === "forbidden";
    const mediaKey = `${slotRequiresPhoto}:${slotForbidsPhoto}`;
    const orderedFamilies = [
      ...families.filter(f => !chosenFamilies.has(f.family)),
      ...families.filter(f => chosenFamilies.has(f.family)),
    ];
    let selected: ViableGenerationPlan | null = null;
    for (const family of orderedFamilies) {
      const viable: Array<{ plan: ViableGenerationPlan; fit: number; recency: number }> = [];
      for (const repertoire of family.members) {
        const key = `${repertoire.defaultOffer.offerId}:${mediaKey}`;
        if (rejected.has(key)) continue;
        const hasMedia = repertoire.slides.some(s => s.variants.some(c => c.mediaSlots.length > 0));
        if (slotRequiresPhoto && !hasMedia) continue;
        if (slotForbidsPhoto && !repertoire.slides.every(s =>
          s.variants.some(c => !c.mediaSlots.length && !designHasPhotographicContent(c)))) continue;
        let fit = 0;
        const plan = buildSlotPagesAndAssignments({
          slot, repertoire, intent, slideCount, slotRequiresPhoto, slotForbidsPhoto,
          compositionSelection: {
            recentSelections,
            neutral: Boolean(input.neutrality),
            keepClosingSeparate: input.neutrality?.planningVersion===2,
            onFit: value => { fit = value; },
          },
        });
        if (!plan) { rejected.add(key); continue; }
        const selectedCards = plan.pages.map(page =>
          repertoire.slides[page.slideIndex].variants.find(card => card.id === page.componentId)!);
        // Only the concrete sequence receives an exact-component history penalty.
        const recency = Math.max(0, ...selectedCards.map(card => designRecencyPenalty(card, recentSelections)));
        viable.push({ plan, fit, recency });
      }
      viable.sort((a, b) => b.fit - a.fit || a.recency - b.recency || compare(a.plan.candidateId, b.plan.candidateId));
      if (viable.length) {
        selected = viable[0].plan;
        chosenFamilies.add(family.family);
        break;
      }
    }
    slots.push(selected ?? {
      slot,
      status: "insufficient_fit",
      reason: "Não foi possível compor uma sequência válida de lâminas com as capacidades das famílias elegíveis.",
      unmetRequirementIds: intent.requirements.map(r => r.id),
    });
  }
  return { version: 1, slots };
}

/**
 * Seleciona as melhores lâminas (Nível 2) e mapeia os campos/conteúdos (Nível 3) para um slot específico.
 */
function buildSlotPagesAndAssignments(input: {
  slot: number;
  repertoire: DesignFamilyRepertoire;
  intent: GenerationIntent;
  slideCount: number;
  slotRequiresPhoto: boolean;
  slotForbidsPhoto: boolean;
  compositionSelection?: {
    recentSelections: RecentDesignSelection[];
    onFit: (score: number) => void;
    neutral?: boolean;
    keepClosingSeparate?: boolean;
  };
}): ViableGenerationPlan | null {
  const {
    slot,
    repertoire,
    intent,
    slideCount,
    slotRequiresPhoto,
    slotForbidsPhoto,
    compositionSelection,
  } = input;

  const contentItems = intent.content;
  if (!contentItems.length) return null;

  // Distribuir os conteúdos por slide:
  // Slide 0 (Capa): primeiro item de conteúdo (gancho principal)
  // Slides intermediários: itens subsequentes
  // Slide final (Fechamento): último item ou síntese
  const contentPerSlide: string[][] = Array.from({ length: slideCount }, () => []);

  if (slideCount === 1) {
    // Post estático: todos os conteúdos pertencem ao único slide
    contentPerSlide[0] = contentItems.map(c => c.id);
  } else {
    // Carrossel:
    // Capa
    contentPerSlide[0] = [contentItems[0].id];

    // Slides intermediários
    const closing = compositionSelection?.keepClosingSeparate && contentItems.length > 2 ? contentItems.at(-1) : undefined;
    if (closing) contentPerSlide[slideCount - 1] = [closing.id];
    const remainingItems = contentItems.slice(1, closing ? -1 : undefined);
    const devSlideCount = Math.max(1, slideCount - 2);

    for (let i = 0; i < remainingItems.length; i++) {
      const targetSlide = 1 + (i % devSlideCount);
      contentPerSlide[targetSlide].push(remainingItems[i].id);
    }

    // Garantir que todo slide intermediário e o fechamento tenham ao menos 1 conteúdo de referência
    for (let sIdx = 1; sIdx < slideCount; sIdx++) {
      if (contentPerSlide[sIdx].length === 0) {
        contentPerSlide[sIdx] = [
          contentItems[Math.min(sIdx, contentItems.length - 1)].id,
        ];
      }
    }
  }

  const isIndependentContentId = (id: string) =>
    Boolean(
      contentItems
        .find(c => c.id === id)
        ?.requirementIds.some(r =>
          intent.requirements.some(
            requirement =>
              requirement.id === r && requirement.itemCount !== null
          )
        )
    );

  // Nível 2: Escolha da melhor lâmina para cada slide do repertório
  const chosenPages: Array<{
    slideIndex: number;
    componentId: string;
    card: ComponentCardV1;
  }> = [];
  let compositionFit = 0;

  for (let sIdx = 0; sIdx < slideCount; sIdx++) {
    const slideRepertoire = repertoire.slides[sIdx];
    if (!slideRepertoire || !slideRepertoire.variants.length) {
      return null;
    }

    const expectedRole =
      slideCount === 1
        ? "static"
        : sIdx === 0
        ? "cover"
        : sIdx === slideCount - 1
        ? "closing"
        : "development";

    const slideContents = contentPerSlide[sIdx] ?? [];
    const independentOnSlide = new Set(
      slideContents.filter(isIndependentContentId)
    ).size;

    // Pontuar variantes daquele slide
    const alternatives = compositionSelection && slotForbidsPhoto
      ? slideRepertoire.variants.filter(variant => !variant.mediaSlots.length && !designHasPhotographicContent(variant))
      : slideRepertoire.variants;
    if (!alternatives.length) return null;
    const scoredVariants = alternatives.map(variant => {
      let score = 0;

      // 1. Papel correto
      if (variant.roles.includes(expectedRole as any)) {
        score += 50;
      }

      // 2. Mídia
      const hasPhoto =
        variant.mediaSlots.length > 0 || designHasPhotographicContent(variant);
      if (slotRequiresPhoto) {
        if (hasPhoto) score += 30;
      }
      if (slotForbidsPhoto) {
        if (!hasPhoto) score += 30;
        else score -= 100;
      }

      // 3. Mecânica de Layout e cardinalidade de listas
      const allocatedContentCount = slideContents.length || 1;
      const listFields = variant.fields.filter(f => f.kind === "list");
      const hasCompatibleList = listFields.some(
        f => !f.cardinality || f.cardinality.max >= Math.max(allocatedContentCount, independentOnSlide)
      );
      const hasOverflowingList =
        independentOnSlide > 0 &&
        listFields.some(
          f => f.cardinality && independentOnSlide > f.cardinality.max
        );
      if (hasOverflowingList) {
        score -= 100;
      } else if (allocatedContentCount > 1 && hasCompatibleList) {
        score += 40;
      }

      // 4. Text-fit aproximado
      const budgets = designTextBudgetsV3(variant);
      const totalChars = budgets.reduce((sum, b) => sum + b.estimatedCharacters, 0);
      if (!compositionSelection?.neutral && totalChars >= 50 && totalChars <= 600) {
        score += 20;
      }

      return { variant, score };
    });

    scoredVariants.sort((a, b) => b.score - a.score || (compositionSelection
      ? designRecencyPenalty(a.variant, compositionSelection.recentSelections) - designRecencyPenalty(b.variant, compositionSelection.recentSelections)
      : 0));
    const bestVariant = scoredVariants[0].variant;
    compositionFit += scoredVariants[0].score;

    chosenPages.push({
      slideIndex: sIdx,
      componentId: bestVariant.id,
      card: bestVariant,
    });
  }

  // Nível 3: Mapeamento de Campos e Atribuições
  const pages: ViableGenerationPlan["pages"] = [];
  const usedContentIds = new Set<string>();

  for (let sIdx = 0; sIdx < slideCount; sIdx++) {
    const { componentId, card } = chosenPages[sIdx];
    const fields = completeDesignFields(card);
    const allocatedContents = contentPerSlide[sIdx] ?? [];
    const independentAllocated = allocatedContents.filter(isIndependentContentId);

    const assignments: ViableGenerationPlan["pages"][number]["assignments"] = [];

    // Separar campos por prioridade (headline, body, list, label, others)
    for (let fIdx = 0; fIdx < fields.length; fIdx++) {
      const field = fields[fIdx];
      const isHeadline =
        field.role === "headline" ||
        field.source.includes("headline") ||
        field.source.includes("title");
      const isList = field.kind === "list";

      // Determinar contentIds para este campo
      let fieldContentIds: string[] = [];

      if (isHeadline) {
        // Título usa o primeiro conteúdo do slide
        fieldContentIds = allocatedContents.slice(0, 1);
      } else if (isList) {
        // Se há itens independentes de lista alocados, prioriza-os no campo de lista
        fieldContentIds =
          independentAllocated.length > 0
            ? independentAllocated
            : allocatedContents;
      } else {
        // Campo de corpo ou detalhe
        fieldContentIds = allocatedContents;
      }

      // Se o campo for obrigatório e não houver conteúdo alocado, garante ao menos 1 ID válido de intent
      if (field.required && fieldContentIds.length === 0) {
        fieldContentIds = [contentItems[0].id];
      }

      // Registra os conteúdos utilizados na arte
      fieldContentIds.forEach(id => usedContentIds.add(id));

      let itemCount: number | null = null;
      if (field.kind === "list") {
        const minItems = field.cardinality?.min ?? 1;
        const maxItems = field.cardinality?.max ?? 5;
        itemCount = Math.max(minItems, Math.min(maxItems, fieldContentIds.length || minItems));
      }

      let instruction = "Apresente o texto de forma clara, concisa e atraente.";
      if (isHeadline) {
        instruction = "Título impactante e direto com alto apelo visual.";
      } else if (isList) {
        instruction = "Itens objetivos organizados em tópicos sequenciais.";
      } else if (sIdx === slideCount - 1) {
        instruction = "Síntese conclusiva e chamada para ação engajadora.";
      }

      assignments.push({
        fieldId: field.id,
        contentIds: fieldContentIds,
        itemCount,
        instruction,
      });
    }

    const rhythm: ViableGenerationPlan["pages"][number]["rhythm"] =
      sIdx === 0
        ? "opening"
        : sIdx === slideCount - 1
        ? "synthesis"
        : card.fields.some(f => f.kind === "list")
        ? "list"
        : card.mediaSlots.length > 0
        ? "image_commentary"
        : "reading";

    const purpose =
      sIdx === 0
        ? "Gancho visual e introdução do tema"
        : sIdx === slideCount - 1
        ? "Conclusão com síntese e direcionamento prático"
        : "Desenvolvimento e aprofundamento do conteúdo central";

    pages.push({
      slideIndex: sIdx,
      componentId,
      purpose,
      rhythm,
      assignments,
    });
  }

  // Conteúdos para a legenda (caption)
  // Inclui conteúdos não exibidos na arte e garante cobertura de requisitos explícitos
  const captionContentIds: string[] = [];
  for (const c of contentItems) {
    if (!usedContentIds.has(c.id)) {
      captionContentIds.push(c.id);
    }
  }

  // Garantir que todos os requisitos explícitos estejam cobertos (arte ou legenda)
  for (const req of intent.requirements.filter(r => r.origin === "explicit")) {
    const matching = contentItems.filter(c => c.requirementIds.includes(req.id));
    const alreadyCovered = matching.some(
      c => usedContentIds.has(c.id) || captionContentIds.includes(c.id)
    );
    if (!alreadyCovered && matching.length > 0) {
      captionContentIds.push(matching[0].id);
    }
  }

  // Abordagens editoriais diferenciadas por slot
  const editorialApproaches = [
    `Abordagem direta e contextual com ênfase no valor central: ${intent.objective.slice(0, 100)}.`,
    `Abordagem analítica e informativa, estruturando os fatos com máxima clareza e ritmo de leitura.`,
    `Abordagem prática e transformadora, destacando conclusões acionáveis e síntese de impacto.`,
  ];

  const plan: ViableGenerationPlan = {
    slot,
    status: "viable",
    candidateId: repertoire.defaultOffer.offerId,
    reason: `Família visual ${repertoire.family} com excelente harmonia tipográfica, suporte a mídia calibrado e distribuição equilibrada de espaço para o tema.`,
    editorialApproach: editorialApproaches[slot] ?? editorialApproaches[0],
    pages,
    captionContentIds,
  };

  // Validação estrita do contrato antes de retornar
  try {
    const offer = materializeDesignFamilyOffer(
      repertoire,
      pages.map(p => p.componentId)
    );
    const violations = validateGenerationPlan(plan, offer, intent);
    if (violations.length > 0) {
      console.warn(`[heuristicPlanBuilder] Violações no slot ${slot}:`, violations);
      return null;
    }
  } catch (error) {
    console.warn(`[heuristicPlanBuilder] Erro ao materializar oferta do slot ${slot}:`, error);
    return null;
  }

  compositionSelection?.onFit(compositionFit);
  return plan;
}
