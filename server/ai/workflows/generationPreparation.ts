import { z } from "zod";
import type {
  ComponentCardV1,
  ComponentDefinitionV1,
} from "@shared/componentAssembly";
import {
  defaultStudioPreferences,
  effectiveStudioPreferences,
} from "@shared/studioPreferences";
import {
  normalizeExecutionBrief,
  type OrchestratedGenerationInput,
} from "@shared/generationRequest";
import { buildUserPrompt } from "../generationOrchestrator";
import { extractTextContent, safeJsonParse } from "../llmJson";
import { invokeLLM } from "../../_core/llm";
import { retrieveCompleteDesignCards } from "../../designCatalog/completeDesignStore";
import { hydrateComponents } from "../../designCatalog/componentStore";
import { readStudioPreferences } from "../../designCatalog/studioPreferences";
import {
  designShortlistBrief,
  shortlistCompleteDesigns,
} from "../../designCatalog/designShortlist";
import { designSelectionCard } from "@shared/designSelection";

import { type ImageObligation } from "@shared/generationContracts";

export interface PreparedGeneration {
  selectedDefinitions: ComponentDefinitionV1[][];
  selectionReasons: string[];
  contextContent: string;
  visualPreference: ReturnType<typeof effectiveStudioPreferences>;
  executionBrief: ReturnType<typeof normalizeExecutionBrief> | null;
  imageObligation: ImageObligation;
}
export interface PreparationDeps {
  generate: typeof invokeLLM;
  retrieve: typeof retrieveCompleteDesignCards;
  hydrate: typeof hydrateComponents;
  preferences: typeof readStudioPreferences;
  shortlist: typeof shortlistCompleteDesigns;
  signal?: AbortSignal;
  loadContext: (
    input: OrchestratedGenerationInput,
    ownerId: string
  ) => Promise<string>;
  operation: <T>(key: string, work: () => Promise<T>) => Promise<T>;
}

/** Determine image contract obligations before design selection (Blueprint §6.1 / §21). */
export function determineImageObligation(
  input: OrchestratedGenerationInput,
  brief: ReturnType<typeof normalizeExecutionBrief> | null,
  preferences?: ReturnType<typeof effectiveStudioPreferences>
): ImageObligation {
  const hasUserImage =
    input.inputType === "image" ||
    Boolean(input.imageUrl) ||
    Boolean(brief?.brandInput?.referenceImageUrl);

  if (hasUserImage) {
    return {
      policy: "required",
      required: true,
      purpose:
        brief?.brandInput?.referenceImageUrl || input.imageUrl
          ? "product"
          : "editorial-photo",
      reason: "Referência de imagem fornecida pelo usuário ou marca.",
      slotTargets: 1,
    };
  }

  const combined = [input.content, brief?.rawInput, brief?.notes]
    .filter(Boolean)
    .join(" ");

  const textOnlyRegex =
    /\b(apenas texto|somente texto|sem foto[s]?|sem imagem|sem imagens|texto puro|tipogr[aá]fic[oa])\b/i;
  if (textOnlyRegex.test(combined) || preferences?.language === "typographic") {
    return {
      policy: "forbidden",
      required: false,
      purpose: "none",
      reason: "Pedido expressamente tipográfico / sem fotos.",
      slotTargets: 0,
    };
  }

  const photoRequestedRegex =
    /\b(foto[s]?|imagem|imagens|fotografia[s]?|ilustra[çc][ãa]o|ilustra[çc][õo]es|visual|produto[s]?|caf[eé]|x[ií]cara|comida|prato|ambiente|cen[aá]rio)\b/i;
  if (photoRequestedRegex.test(combined)) {
    return {
      policy: "required",
      required: true,
      purpose: "editorial-photo",
      reason: "Briefing contextual requer imagem ou fotografia editorial.",
      slotTargets: 1,
    };
  }

  return {
    policy: "optional",
    required: false,
    purpose: "editorial-photo",
    reason:
      "Imagem opcional para preencher slots nativos de mídia quando a composição selecionada os possuir.",
    slotTargets: 0,
  };
}

/** Validate the selector output against pinned cards before any native scene is instantiated. */
export function validateDesignSelection(
  options: Array<{ designIds: string[]; reason: string }>,
  cards: ComponentCardV1[],
  count: number,
  imageObligation?: ImageObligation
) {
  if (options.length !== 3) throw new Error("Três propostas são obrigatórias");
  const byId = new Map(cards.map(c => [c.id, c]));
  for (const option of options) {
    if (option.designIds.length !== count)
      throw new Error("Quantidade de slides divergente");
    const selected = option.designIds.map((id, i) => {
      const card = byId.get(id),
        role =
          count === 1
            ? "static"
            : i === 0
              ? "cover"
              : i === count - 1
                ? "closing"
                : "development";
      if (!card?.completeDesign?.baselineVerified || !card.roles.includes(role))
        throw new Error("Design ou função de slide não elegível");
      return card;
    });
    if (new Set(selected.map(c => c.completeDesign!.family)).size !== 1)
      throw new Error("Carrossel mistura famílias");

    if (imageObligation?.required) {
      const totalSlots = selected.reduce(
        (sum, card) => sum + (card.mediaSlots?.length ?? 0),
        0
      );
      if (totalSlots < Math.max(1, imageObligation.slotTargets || 1)) {
        throw new Error(
          `Composição selecionada (${selected[0]?.completeDesign?.family}) não possui slots de mídia nativos para cumprir a obrigação contratada (${imageObligation.purpose})`
        );
      }
    }
  }
  // Diversity guides selection, but repeated families are not a technical defect.
  // Do not veto otherwise valid proposals because of their siblings' appearance.
}

export async function prepareOrchestratedGeneration(
  input: OrchestratedGenerationInput,
  ownerId: string,
  experimental: boolean,
  deadlineMs: number,
  overrides: Partial<PreparationDeps>
): Promise<PreparedGeneration> {
  if (!overrides.loadContext || !overrides.operation)
    throw new Error("Dependências duráveis de preparação ausentes");
  const deps: PreparationDeps = {
    generate: invokeLLM,
    retrieve: retrieveCompleteDesignCards,
    hydrate: hydrateComponents,
    preferences: readStudioPreferences,
    shortlist: shortlistCompleteDesigns,
    ...overrides,
  } as PreparationDeps;
  const executionBrief = input.executionBrief
    ? normalizeExecutionBrief(input.executionBrief)
    : null;
  const contextContent = await deps.operation("context", () =>
    deps.loadContext(input, ownerId)
  );
  const preferences = await deps.operation("preferences", () =>
    deps.preferences(ownerId)
  );
  const visualPreference = effectiveStudioPreferences(
    preferences ?? defaultStudioPreferences,
    [input.content, executionBrief?.rawInput, executionBrief?.notes]
      .filter(Boolean)
      .join("\n")
  );
  const count = input.postMode === "static" ? 1 : (input.slideCount ?? 5);
  let cards = await deps.operation("catalog", () =>
    deps.retrieve({
      aspectRatio: input.aspectRatio,
      postMode: input.postMode,
      text: contextContent,
      styleText: input.content,
      slideCount: count,
      experimental,
      brandColors: executionBrief?.brandInput?.brandColors,
      brandFonts: executionBrief?.brandInput?.fontHint
        ? [executionBrief.brandInput.fontHint]
        : [],
    })
  );
  if (!cards.length)
    throw new Error(
      "Não há composições completas compatíveis com este pedido e formato."
    );
  const imageObligation = determineImageObligation(
    input,
    executionBrief,
    visualPreference
  );
  const brief = buildUserPrompt({
    request: input,
    executionBrief,
    contextContent,
  }).content;
  const shortlist = await deps.shortlist({
    cards,
    brief: designShortlistBrief(brief, {
      visualPreference,
      imageObligation,
      tone: input.tone,
      sourceEvidence:
        executionBrief || input.inputType === "image"
          ? contextContent
          : undefined,
    }),
    slideCount: count,
    deadlineMs,
    signal: deps.signal,
    operation: deps.operation,
  });
  cards = shortlist.cards;
  const schema = z
    .object({
      options: z
        .array(
          z
            .object({
              designIds: z
                .array(z.enum(cards.map(c => c.id) as [string, ...string[]]))
                .length(count),
              reason: z.string().min(1).max(600),
            })
            .strict()
        )
        .length(3),
    })
    .strict();
  const json = z.toJSONSchema(schema);
  delete json.$schema;
  const selected = await deps.operation("selection", async () => {
    const selectionSystemPrompt = `Contrato postspark.selection.v1. Selecione três composições COMPLETAS já calibradas para este briefing. Cada proposta usa ${count} designs, um por slide na ordem static ou cover/development/closing. Dentro de um carrossel mantenha a mesma família. Explore famílias diferentes se houver opções. Não combine pedaços, invente IDs ou altere o layout. Respeite restrições explícitas de cores, fontes, quantidade de fotos e textos do briefing.${
      imageObligation.policy === "forbidden"
        ? ` RESTRIÇÃO ESTRITA: Não utilize fotos ou slots de imagem (design puramente tipográfico).`
        : imageObligation.required
          ? ` OBRIGAÇÃO DE IMAGEM CONTRATADA: ${imageObligation.purpose} (${imageObligation.reason}). Cada proposta DEVE selecionar composições com slots de mídia nativos (mediaSlots) para comportar a imagem contratada. Não dispense slots de mídia.`
          : ` Não há obrigação estrita de imagem. Você pode selecionar composições com ou sem slots de mídia nativos conforme a estética.`
    } Retorne options com designIds e reason.`;

    const response = await deps.generate({
      traceLabel: "v5_selection_v1",
      taskRoute:
        input.postMode === "carousel"
          ? "carousel_generation"
          : "static_generation",
      model: input.model,
      deadlineMs,
      maxTransportAttempts: 1,
      disableStructuredRepair: true,
      forceTextSchema: true,
      messages: [
        {
          role: "system",
          content: selectionSystemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            brief,
            visualPreference,
            imageObligation,
            catalog: cards.map(designSelectionCard),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "selection_v1", strict: true, schema: json },
      },
      maxCompletionTokens: 2000,
    });
    const result = schema.parse(
      safeJsonParse(
        extractTextContent(response.choices?.[0]?.message?.content),
        null
      )
    );
    validateDesignSelection(result.options, cards, count, imageObligation);
    return result;
  });
  validateDesignSelection(selected.options, cards, count, imageObligation);
  const definitions = await deps.operation("definitions", () =>
    deps.hydrate(
      Array.from(new Set(selected.options.flatMap(o => o.designIds))),
      experimental
    )
  );
  const byId = new Map(definitions.map(d => [d.id, d]));
  for (const d of definitions)
    if (cards.find(c => c.id === d.id)?.hash !== d.hash)
      throw new Error(
        "Design selecionado mudou; publicação precisa de revisão"
      );
  return {
    selectedDefinitions: selected.options.map(o =>
      o.designIds.map(id => {
        const d = byId.get(id);
        if (!d) throw new Error("Design selecionado indisponível");
        return d;
      })
    ),
    selectionReasons: selected.options.map(o => o.reason),
    contextContent,
    visualPreference,
    executionBrief,
    imageObligation,
  };
}
