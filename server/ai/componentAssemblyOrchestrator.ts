import { validateCompleteDesignSelection,normalizeDesignColor,normalizeDesignFont,completeDesignPalette } from "../../shared/completeDesigns";
import { z } from "zod";
import type { StudioPreferences } from "../../shared/studioPreferences";
import { auditAssemblyArtDirection, buildArtDirectionInstructions } from "./assemblyArtDirection";
import {
  assemblyPlanV1Schema,
  assemblySlidePlanV1Schema,
  assemblyComponentRefV1Schema,
  assemblyDirectionV1Schema,
  assemblyArtIntentV1Schema,
  compactComponentCard,
  validateAssemblyPlan,
  materializeAssemblyPlan,
  materializeAssemblySlide,
  materializeEditorialAssemblySlide,
  compositionFromAssemblyBundle,
  generationAssemblyBundleV1Schema,
  preflightAssemblyGeneration,
  type AssemblyPlanV1,
  type ComponentDefinitionV1,
  type ComponentCardV1,
  type GenerationAssemblyBundleV1,
} from "@shared/componentAssembly";
import {
  projectContentHeadline,
  projectContentBody,
  readContentSource,
  arsenalHash,
  contentCoverageIssues,
} from "@shared/arsenalContent";
import { bindAssemblyContent, completeDesignClosingBodySource } from "@shared/assemblyContentBindings";
import {
  validateVariableContent,
  contentBlockTypes,
  contentTextRoles,
} from "@shared/variableContent";
import type { ArsenalAsset } from "@shared/designArsenal";
import type { ArsenalTextMeasurer } from "@shared/arsenalGeometry";
import {
  resolveArsenalGeometry,
  arsenalWorldGeometry,
} from "@shared/arsenalGeometry";
import { readArsenalComposition } from "@shared/designArsenal";
import type { PostVariation } from "@shared/postspark";
import {
  createMetrics,
  finishMetrics,
  addCallMetrics,
  buildUserPrompt,
  type OrchestratorInput,
  type OrchestratorDeps,
  type GenerationOutcome,
} from "./generationOrchestrator";
import { extractTextContent, safeJsonParse } from "./llmJson";
import { findInstructionLeakage } from "./briefInterpretation";
import { createComponentTextMeasurer } from "./componentTextMeasurer";
import type { InvokeParams } from "../_core/llm";
import { StructuredOutputError } from "../_core/llm";

export type ComponentAssemblyOrchestratorInput = OrchestratorInput & {
  studioPreferences?: StudioPreferences;
  offered: Array<ComponentDefinitionV1 | ComponentCardV1>;
  resolve?: (ids: string[]) => Promise<ComponentDefinitionV1[]>;
  slideCount?: number;
  aspectRatio?: AssemblyPlanV1["aspectRatio"];
  brandPalette?: z.infer<typeof assemblyDirectionV1Schema>["palette"];
  experimental: boolean;
  completeDesignsOnly?: boolean;
};
export type ComponentAssemblyOrchestratorDeps = OrchestratorDeps & {
  measureText?: ArsenalTextMeasurer;
  createTextMeasurer?: (assets: ArsenalAsset[]) => Promise<ArsenalTextMeasurer>;
};
function responseFormat(
  input: ComponentAssemblyOrchestratorInput,
  count: number
): InvokeParams["response_format"] {
  const typography = input.offered
    .filter(c => c.kind === "typography")
    .map(c => c.id);
  const refFor = (kind: ComponentCardV1["kind"]) => {
    const cards = input.offered.filter(c => c.kind === kind);
    return cards.length
      ? assemblyComponentRefV1Schema.omit({ hash: true }).extend({
          id: z.enum(cards.map(c => c.id) as [string, ...string[]]),
        })
      : null;
  };
  const baseContentRef = input.completeDesignsOnly ? refFor("content")?.pick({id:true}) : refFor("content"),
    backgroundRef = refFor("background"),
    mediaRef = refFor("media"),
    ornamentRef = refFor("ornament"),
    baseTypographyRef = refFor("typography"),
    typographyRef = baseTypographyRef?.pick({ id: true });
  // Per-ID density compatibility is checked against the authoritative cards
  // below; repeating the full reference schema per density inflated transport.
  const contentRef = baseContentRef
    ? baseContentRef.extend({density:z.enum(["quiet","balanced","expressive"])})
    : z.null();
  // Provider transport makes the one-content invariant structural. Persisted plans keep their canonical reference array.
  const slide = assemblySlidePlanV1Schema.omit({ density: true }).extend({
    components: z
      .object({
        content: contentRef,
        background: backgroundRef ? backgroundRef.nullable() : z.null(),
        media: z.array(mediaRef ?? z.null()).max(mediaRef ? 3 : 0),
        ornament: z.array(ornamentRef ?? z.null()).max(ornamentRef ? 4 : 0),
        typography: z
          .array(typographyRef ?? z.null())
          .max(typographyRef ? 3 : 0),
      })
      .strict(),
  });
  const directionBase = input.completeDesignsOnly
    ? assemblyDirectionV1Schema.omit({ palette: true })
    : assemblyDirectionV1Schema;
  const direction = directionBase.extend({
    intent: assemblyArtIntentV1Schema,
    typographyComponentId: typography.length
      ? z.enum(typography as [string, ...string[]]).nullable()
      : z.null(),
  });
  const schema = assemblyPlanV1Schema.extend({
    postMode: z.literal(input.request.postMode),
    ...(input.aspectRatio ? { aspectRatio: z.literal(input.aspectRatio) } : {}),
    variations: z
      .array(
        assemblyPlanV1Schema.shape.variations.element.extend({
          direction,
          slides: z.array(slide).length(count),
        })
      )
      .length(3),
  });
  const json = z.toJSONSchema(schema);
  delete json.$schema;
  const strictObjects = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(strictObjects);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.properties && typeof node.properties === "object") {
      const properties = node.properties as Record<
          string,
          Record<string, unknown>
        >,
        required = new Set((node.required ?? []) as string[]);
      for (const [key, property] of Object.entries(properties)) {
        strictObjects(property);
        if (!required.has(key))
          properties[key] = { anyOf: [property, { type: "null" }] };
      }
      node.required = Object.keys(properties);
      node.additionalProperties = false;
    }
    for (const [key, child] of Object.entries(node))
      if (key !== "properties") strictObjects(child);
  };
  strictObjects(json);
  return {
    type: "json_schema",
    json_schema: { name: "component_assembly_v1", strict: true, schema: json },
  };
}
function projection(
  plan: AssemblyPlanV1,
  slot: number,
  input: ComponentAssemblyOrchestratorInput
): PostVariation {
  const v = plan.variations[slot],
    cover = v.slides[0],
    last = v.slides[v.slides.length - 1],
    palette = input.completeDesignsOnly ? v.direction.palette : input.brandPalette ?? v.direction.palette;
  return {
    id: `components-${slot}`,
    headline: projectContentHeadline(cover.content),
    body: projectContentBody(cover.content),
    caption: v.caption,
    hashtags: v.hashtags,
    callToAction: String(readContentSource(last.content, "callToAction")),
    tone: input.request.tone ?? input.executionBrief?.tone ?? "Profissional",
    imagePrompt: cover.mediaPrompts[0]?.prompt ?? "",
    platform: input.request.platform,
    postMode: input.request.postMode,
    aspectRatio: plan.aspectRatio,
    layout: "left-aligned",
    backgroundColor: palette.background,
    textColor: palette.text,
    accentColor: palette.accent,
    copyAngle: {
      type: "beneficio",
      label: v.direction.label,
      badge: "",
      stickerText: "",
    },
    ...(input.request.postMode === "carousel"
      ? {
          slides: v.slides.map((slide, index) => ({
            headline: projectContentHeadline(slide.content),
            body: projectContentBody(slide.content),
            slideNumber: index + 1,
            isTitleSlide: index === 0,
            isCtaSlide: index === v.slides.length - 1,
          })),
        }
      : {}),
  };
}
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
/** A single logical generative call and at most one repair. Geometry is approved before delivery/commit. */
export async function generateComponentAssemblyPostVariations(
  input: ComponentAssemblyOrchestratorInput,
  deps: ComponentAssemblyOrchestratorDeps
): Promise<GenerationOutcome> {
  const metrics = createMetrics(input.deadlineMs, deps.clock()),
    count = input.request.postMode === "static" ? 1 : (input.slideCount ?? 5);
  const emit = (
    stage: string,
    status: "started" | "completed" | "failed" | "rejected" | "fallback",
    data: unknown
  ) => deps.trace.recordEvent({ stage, status, detail: stage, data });
  const fail = (
    kind: "deadline" | "provider" | "parse" | "internal",
    message: string
  ): GenerationOutcome => ({
    status: "failed",
    runId: deps.trace.id,
    error: { kind, message },
    metrics: finishMetrics(metrics, deps.clock()),
  });
  const expired = () =>
    input.deadlineMs !== null && deps.clock() >= input.deadlineMs;
  if (!input.offered.some(c => c.kind === "content"))
    return fail(
      "internal",
      "O acervo de componentes não está disponível para esta geração."
    );
  if (input.request.postMode === "carousel" && (count < 2 || count > 10))
    return fail("parse", "O carrossel deve ter de 2 a 10 slides.");
  const evidence = Array.from(
    new Set(
      [
        ...(input.briefInterpretation?.contentSpans ?? []),
        input.executionBrief?.rawInput ?? input.request.content,
        ...(input.siteIntelligence?.anchors?.facts.map(f =>
          JSON.stringify(f)
        ) ?? []),
      ].filter(Boolean)
    )
  ).map((text, index) => ({ id: `source-${index + 1}`, text }));
  const hint = input.executionBrief?.brandInput?.fontHint;
  const rawBrief = input.executionBrief?.rawInput ?? input.request.content;
  const artBrief = rawBrief
    .split(/[.!;\n]/)
    .filter(
      clause =>
        !/(?:\bna|\bpara a|\bsomente (?:na|a)|\bapenas (?:na|a))\s+(?:legenda|caption)\b|\b(?:legenda|caption)\s+(?:com|contendo|deve)/i.test(
          clause
        ) &&
        !/(?:\bsem|\bn[aã]o (?:inclua|use|traga))\s+(?:uma?\s+)?(?:frase de apoio|texto de apoio|subt[ií]tulo|convite|cta|chamada para a[cç][aã]o)/i.test(
          clause
        )
    )
    .join("\n");
  const bodyOnArt =
    /(?:uma?\s+)?(?:frase de apoio|texto de apoio|subt[ií]tulo|texto de corpo|apoio leg[ií]vel|apoio vis[ií]vel)\b/i.test(
      artBrief
    ) ||
    /(?:inclua|incluindo|tenha|use|traga|com)\b[^.!\n]{0,180}(?:frase de apoio|texto de apoio|subt[ií]tulo|texto de corpo|body)/i.test(
      artBrief
    );
  const ctaOnArt =
    /(?:e|um|uma)\s+(?:convite|cta|chamada para a[cç][aã]o)\b/i.test(
      artBrief
    ) ||
    /(?:inclua|incluindo|tenha|use|traga|com)\b[^.!\n]{0,180}(?:convite|\bcta\b|chamada para a[cç][aã]o)/i.test(
      artBrief
    );
  const explicitMediaMix =
    /(?:duas|2)\s+(?:propostas?\s+|varia[cç][oõ]es?\s+|artes?\s+)?com\s+(?:espa[cç]o para\s+)?(?:foto|imagem|m[ií]dia)/i.test(
      rawBrief
    ) &&
    /(?:uma|1)\s+(?:(?:proposta\s+|varia[cç][aã]o\s+|arte\s+|tipogr[aá]fica\s+)?sem(?:\s+(?:foto|imagem|m[ií]dia)|\s*(?:[.;,!]|$))|tipogr[aá]fica\b)/i.test(
      rawBrief
    );
  const brandFonts = {
    heading: hint || input.siteIntelligence?.brand.typography.headingFont,
    body: hint || input.siteIntelligence?.brand.typography.bodyFont,
  };
  const offeredCards = input.offered.map(c =>
    "fragment" in c ? compactComponentCard(c) : c
  );
  const promptCards = offeredCards.map(card => {
    const {hash: _hash, regions, capacity, fields, ...metadata} = card;
    // Typography donates fonts only. It never paints the source's text regions.
    if (card.kind === "typography") return metadata;
    return {
      ...metadata,
      ...(input.completeDesignsOnly ? { closingCallToActionBodySource: completeDesignClosingBodySource(fields) ?? null } : {}),
      fields:Array.from(new Map(fields.map(field=>[JSON.stringify(field),field])).values()),
      regions:regions?.map(({id:_id,...region})=>Object.fromEntries(Object.entries(region).map(([key,value])=>[key,typeof value === "number"?Number(value.toFixed(4)):value]))),
      capacity:{...capacity,textRegions:capacity.textRegions.map(region=>Object.fromEntries(Object.entries(region).map(([key,value])=>[key,typeof value === "number"?Number(value.toFixed(2)):value])))},
    };
  });
  const offeredFont = (name: string) =>
    offeredCards.filter(c =>
      [...c.fontFamilies, ...(c.sourceFontFamilies ?? [])].some(
        f => normalized(f) === normalized(name)
      )
    );
  for (const [role, font] of Object.entries(brandFonts))
    if (font && !offeredFont(font).length)
      emit("assembly.brand_font", "fallback", {
        role,
        requestedFont: font,
        reason: "font_not_in_verified_offered_components",
      });
  const userContent = buildUserPrompt({
    request: input.request,
    executionBrief: input.executionBrief,
    contextContent: input.request.content,
    briefInterpretation: input.briefInterpretation ?? null,
  }).content;
  const system = input.completeDesignsOnly ? `Você personaliza três propostas a partir de designs COMPLETOS do catálogo PostSpark. Cada proposta tem exatamente ${count} slide(s), postMode ${input.request.postMode}, formato ${input.aspectRatio}.
Escolha um único design content por slide e mantenha sua geometria nativa. Use components {content:{id,density},background:null,media:[],ornament:[],typography:[]}, sem placement/layoutRelation. direction.typographyComponentId=null. A paleta e fontes da receita são preservadas pelo motor: não redesenhe, não combine doadores, não invente slots. Para marca solicitada, escolha receita compatível; nunca prometa trocar fontes/cores automaticamente.
Em carrosséis, primeiro slide cover, último closing, demais development/example. Todos os slides de uma proposta pertencem à mesma completeDesign.family; podem reutilizar o mesmo modelo. Só use os papéis declarados. Diferencie as três propostas entre famílias quando disponíveis.
Escreva conteúdo V3 nos papéis declarados em fields. Observe capacity, minWords e orçamento tipográfico: sintetize a copy ANTES de congelar, preservando literais e termos obrigatórios. Não crie blocos que o design não comporta. Campos opcionais podem ficar vazios. Título é obrigatório. ${bodyOnArt ? "Inclua apoio visível na arte." : ""} ${ctaOnArt ? "Inclua CTA visível na arte de CADA proposta, com um bloco text role=callToAction no slide solicitado no briefing; não basta escrever o convite como body ou na caption." : ""}
No slide closing, se o cartão declara closingCallToActionBodySource, seu campo body opcional pode receber o bloco callToAction: deixe esse body vazio no conteúdo e escreva o convite como role=callToAction. O motor vincula o convite à mesma caixa nativa, preservando fonte, efeitos e geometria. Essa alternativa vale só no encerramento, não ocupa body já preenchido e não cria campo extra. Se houver campo callToAction nativo, use-o.
Nunca invente métricas/citações: use sourceSpanIds e valores literais das evidências. Não copie textos de demonstração, nomes das camadas ou instruções para a arte. Copy personalizada, caption e hashtags respeitam o pedido e o idioma. Imagens permanecem slots para preenchimento posterior: mediaPrompts devem referenciar componentId do próprio design e slotId nativo.
Não retorne direction.palette: o servidor obtém as cores do design escolhido. Direction.intent descreve a seleção; rhythm espelha os slides e densidades. Não precisa impor mudança de ritmo a modelos fixos. Preferências explícitas: ${JSON.stringify(input.studioPreferences ?? {})}.
Cartões de designs completos: ${JSON.stringify(promptCards)}
Fontes autorizadas: ${JSON.stringify(evidence)}` : `Você dirige a arte de três propostas de posts do PostSpark. Selecione componentes reais oferecidos e componha planos estruturados; o motor preservará suas peças e relações e medirá a copy. Gere exatamente três variações, cada uma com ${count} slide(s), em ${input.request.postMode}. ${input.aspectRatio ? `Formato obrigatório: ${input.aspectRatio}.` : "Escolha um formato compartilhado compatível com os componentes."}
Use somente IDs oferecidos. Cada slide retorna components como objeto {content: referência única obrigatória com density compatível, background: referência ou null, media: referências de slots, ornament: referências decorativas, typography: referências tipográficas opcionais}. Não retorne arrays livres nem coloque mais de um conjunto content. Todos os IDs devem pertencer ao kind do seu campo; não produza hashes, eles serão resolvidos pelo servidor a partir do ID oferecido. components.content.density deve pertencer a densities daquele componente; slide não tem campo density no transporte. Referências typography contêm apenas id e nunca placement/layoutRelation: são estilos de fonte, não elementos posicionáveis. Contornos, extrusões, tarjas e fragmentos tipográficos pertencem aos conjuntos content que os preservam; a doadora typography transfere família e peso. Ornamentos independentes usam placement sobre a área real do motivo. Use-os em áreas livres e não duplique motivos já incorporados ao content. Nunca use uma typography como relativeTo de geometria. A seleção direction.typographyComponentId também permanece disponível como doadora de fonte. Density indica a intensidade do conjunto content e ornament; fundo e mídia podem conservar as densidades próprias de suas receitas. Fundo, tipografia, mídia e ornamentos são escolhas suas. Considere campos semânticos, capacidade, minWords, regiões intrínsecas normalizadas, formatos, funções e densidades dos cartões. Você dirige também a montagem: placement opcional delimita caixa x/y/width/height em frações 0..1; preserve área suficiente para leitura. layoutRelation opcional posiciona beside/below em relação a relativeTo (outro componente selecionado), gap em fração da menor dimensão, ou overlay para sobreposição deliberada. Native mantém a geometria da receita. Beside/below requer que a caixa do componente de referência deixe espaço. Não reduza as fontes até ficarem ilegíveis e não sobreponha mídia e texto acidentalmente; para foto deliberada atrás de texto escolha overlay e garanta superfícies de contraste. Relações não podem formar ciclos. Um source block:body:1:text exige segundo bloco body; content:<id>:text exige aquele ID exato em content.blocks. A copy canônica é V3 e deve cobrir todos os campos visuais realmente escritos. Evite inventar blocos que não cabem nos componentes. Não copie palavras das receitas, nomes de camadas ou instruções operacionais para a copy.
Carrosséis: primeiro cover, último closing, demais development/list/comparison/example conforme o conteúdo. Planeje progressão e ritmo; capas podem ser distintas e expressivas, com equilíbrio visual, e slides internos devem manter leitura clara e variar o ritmo. Use componentes autorados/source-style e o papel example nos slides internos quando conteúdo e capacidade forem compatíveis, preservando efeitos, superfícies e linguagem nativos. Fontes, paleta e linguagem coerentes dentro da proposta. Fontes da marca prevalecem quando oferecidas e verificadas: ${JSON.stringify(brandFonts)}. Selecione content ou typography que contenha a família em fontFamilies/sourceFontFamilies. Famílias ausentes são indisponíveis; mantenha uma fonte oferecida. Não repetir a capa inteira nos slides internos. CTA final quando apropriado ao pedido; preserve qualquer distribuição explícita solicitada.
Prefira duas propostas com regiões de mídia e uma sem quando conteúdo e acervo comportarem. Adapte essa preferência às necessidades do briefing. Mídia é reservada para edição posterior, não será gerada agora. Escreva um prompt editorial específico para cada slot efetivamente selecionado em mediaPrompts, componentId e slotId exatos. Um carrossel não precisa ter imagem em todos os slides.
As três propostas devem usar direções visuais distintas, com conteúdo fiel às fontes e ao modo de intervenção. ${bodyOnArt ? "Cada proposta precisa de frase de apoio visível na arte: content.blocks text role body; não transfira para caption." : ""} ${ctaOnArt ? "Cada proposta precisa de convite visível na arte: content.blocks text role callToAction; não transfira para caption." : ""} ${explicitMediaMix ? "Pedido explícito: exatamente duas propostas com slots de mídia e uma sem. Selecione componentes de slots oferecidos em duas propostas." : ""} Dados/quotes exigem IDs de evidência e valores literais verificáveis. Respeite literalmente textos travados e termos obrigatórios; não omita, encurte ou altere conteúdo requerido para caber. No reparo, preserve o idioma visual e os componentes escolhidos sempre que uma recomposição geométrica do espaço de mídia resolver a colisão; não simplifique automaticamente para quiet. Use quiet apenas quando a geometria e a auditoria de contraste/conteúdo não puderem aprovar a direção original. ${input.brandPalette ? `Paleta da marca prevalece: ${JSON.stringify(input.brandPalette)}. Não invente cores para contornar contraste.` : "Paleta deve assegurar contraste e legibilidade."}
${input.studioPreferences?.enabled ? `Preferência visual explicitamente salva pelo usuário: ${JSON.stringify(input.studioPreferences)}. Use-a como direção preferida entre recursos compatíveis; preserve diversidade nas três propostas e variação de ritmo. Briefing atual e identidade de marca prevalecem. Não invente recursos para satisfazer a preferência.` : ""}
Escolha content com campos para TODOS os papéis de texto que você escrever. Um design só com headline/CTA não recebe body automaticamente. Parágrafos repetidos do mesmo papel podem fluir juntos no último campo compatível, sem cortar texto; respeite a capacidade e a área disponíveis. Não preencha campos opcionais com conteúdo inventado só porque a receita os possui. No rhythm, density deve espelhar components.content.density do mesmo slide.
${buildArtDirectionInstructions(offeredCards, 3, false)}
Cartões de componentes: ${JSON.stringify(promptCards)}
Fontes autorizadas: ${JSON.stringify(evidence)}`;
  let measure = deps.measureText,
    bundle: GenerationAssemblyBundleV1 | undefined,
    parsed: AssemblyPlanV1 | undefined,
    frozenPlan: AssemblyPlanV1 | undefined,
    lastErrors: string[] = [];
  const resolvedCache = new Map<string, ComponentDefinitionV1>();
  const copyHash = (p: AssemblyPlanV1) =>
    arsenalHash(
      p.variations.map(v => ({
        caption: v.caption,
        hashtags: v.hashtags,
        slides: v.slides.map(s => ({ id: s.id, content: s.content })),
      }))
    );
  const hydrate = async (ids: string[]) => {
    const missing = ids.filter(id => !resolvedCache.has(id));
    if (missing.length) {
      const definitions = input.resolve
        ? await input.resolve(missing)
        : input.offered.filter(
            (c): c is ComponentDefinitionV1 =>
              "fragment" in c && missing.includes(c.id)
          );
      for (const id of missing) {
        const definition = definitions.find(c => c.id === id);
        if (
          !definition ||
          !input.offered.some(
            card => card.id === id && card.hash === definition.hash
          )
        )
          throw new Error("resolved_component_hash_mismatch");
        resolvedCache.set(id, definition);
      }
    }
    return ids.map(id => resolvedCache.get(id)!);
  };
  const validate = async (transport: unknown): Promise<string[]> => {
    // Provider strict objects encode optional layout choices as required nullable values.
    const raw = structuredClone(transport);
    const assignedHashes = new Map<
      string,
      { id: string; hash: string; kind: string }
    >();
    if (
      raw &&
      typeof raw === "object" &&
      "variations" in raw &&
      Array.isArray(raw.variations)
    )
      for (const v of raw.variations) {
        if (!v || !Array.isArray(v.slides)) continue;
        for (const slide of v.slides) {
          if (!slide) continue;
          const selection = slide.components;
          if (
            selection &&
            typeof selection === "object" &&
            !Array.isArray(selection) &&
            Object.keys(selection).length === 5 &&
            ["content", "background", "media", "ornament", "typography"].every(
              key => Object.prototype.hasOwnProperty.call(selection, key)
            ) &&
            ["media", "ornament", "typography"].every(key =>
              Array.isArray(selection[key])
            )
          ) {
            if (
              selection.content &&
              typeof selection.content === "object" &&
              "density" in selection.content
            ) {
              slide.density = selection.content.density;
              delete selection.content.density;
            }
            slide.components = [
              selection.background,
              selection.content,
              ...selection.media,
              ...selection.ornament,
              ...selection.typography,
            ].filter(ref => ref !== null);
            for (const ref of slide.components) {
              if (!ref || typeof ref !== "object" || ref.hash !== undefined)
                continue;
              const offered = input.offered.find(card => card.id === ref.id);
              if (offered) {
                ref.hash = offered.hash;
                assignedHashes.set(offered.id, {
                  id: offered.id,
                  hash: offered.hash,
                  kind: offered.kind,
                });
              }
            }
          }
          if (!Array.isArray(slide.components)) continue;
          for (const ref of slide.components) {
            if (!ref || typeof ref !== "object") continue;
            if (ref.placement === null) delete ref.placement;
            if (ref.layoutRelation === null) delete ref.layoutRelation;
            else if (ref.layoutRelation?.gap === null)
              delete ref.layoutRelation.gap;
          }
        }
      }
    if (assignedHashes.size)
      emit("assembly.authoritative_hashes", "completed", {
        source: "offered-component-manifest",
        components: Array.from(assignedHashes.values()),
      });
    // Density is declared once by the selected content in transport. The rhythm
    // mirrors that value; never repair missing, duplicate or out-of-order IDs here.
    if (raw && typeof raw === "object" && "variations" in raw && Array.isArray(raw.variations))
      for (const variation of raw.variations) {
        const rhythm = variation?.direction?.intent?.rhythm;
        if (Array.isArray(variation?.slides) && Array.isArray(rhythm) && rhythm.length === variation.slides.length && rhythm.every((r, i) => r?.slideId === variation.slides[i]?.id))
          rhythm.forEach((r, i) => { r.density = variation.slides[i].density; });
      }
    // Palette is server-owned for complete designs, including before canonical
    // validation. It is absent from the provider contract, never model-authored.
    if (input.completeDesignsOnly && raw && typeof raw === "object" && "variations" in raw && Array.isArray(raw.variations)) {
      for (const variation of raw.variations) {
        const id = variation?.slides?.[0]?.components?.[0]?.id;
        if (variation?.direction && offeredCards.some(c => c.id === id && c.completeDesign)) {
          const [design] = await hydrate([id]);
          variation.direction.palette = completeDesignPalette(design);
        }
      }
    }
    const errors = validateAssemblyPlan(raw, input.offered, {
      postMode: input.request.postMode,
      slideCount: count,
    });
    const result = assemblyPlanV1Schema.safeParse(raw);
    if (!result.success) return errors;
    const p = result.data;
    errors.push(...p.variations.flatMap((v,slot)=>v.direction.intent?[]:[`slot:${slot}:art_direction_intent_required`]));
    if(input.completeDesignsOnly) errors.push(...validateCompleteDesignSelection(p, offeredCards));
    else errors.push(...auditAssemblyArtDirection(p, offeredCards));
    if (frozenPlan && copyHash(p) !== copyHash(frozenPlan))
      errors.push("repair_changed_frozen_content");
    if (input.aspectRatio && p.aspectRatio !== input.aspectRatio)
      errors.push("aspect_ratio_mismatch");
    for (const [slot, v] of Array.from(p.variations.entries())) {
      if(input.completeDesignsOnly){
        const requiredColors=input.executionBrief?.brandInput?.brandColors??[];
        const requiredFonts=[input.executionBrief?.brandInput?.fontHint].filter((f):f is string=>Boolean(f));
        for(const slide of v.slides)for(const ref of slide.components){
          const card=offeredCards.find(c=>c.id===ref.id);
          if(requiredColors.some(color=>!card?.completeDesign?.colors?.some(c=>normalizeDesignColor(c)===normalizeDesignColor(color))))errors.push(`slot:${slot}:complete_design_brand_colors_unavailable`);
          if(requiredFonts.some(font=>!card?.fontFamilies.concat(card.sourceFontFamilies??[]).some(f=>normalizeDesignFont(f)===normalizeDesignFont(font))))errors.push(`slot:${slot}:complete_design_brand_font_unavailable`);
        }
      }
      if (
        bodyOnArt &&
        !v.slides.some(s =>
          s.content.blocks.some(
            b => b.type === "text" && b.role === "body" && b.text.trim()
          )
        )
      )
        errors.push(`slot:${slot}:body_required_on_art`);
      if (
        ctaOnArt &&
        !v.slides.some(s =>
          s.content.blocks.some(
            b => b.type === "text" && b.role === "callToAction" && b.text.trim()
          )
        )
      )
        errors.push(`slot:${slot}:cta_required_on_art`);
      for (const name of Array.from(
        new Set(Object.values(brandFonts).filter((s): s is string => !!s))
      )) {
        const compatible = offeredFont(name);
        if (
          compatible.length &&
          !compatible.some(
            c =>
              c.id === v.direction.typographyComponentId ||
              v.slides.every(s => s.components.some(ref => ref.id === c.id))
          )
        )
          errors.push(`slot:${slot}:brand_font_priority:${name}`);
      }
      const projected = projection(p, slot, input),
        fields = [
          projected.caption,
          ...v.slides.flatMap(s => [
            projectContentHeadline(s.content),
            projectContentBody(s.content),
          ]),
        ];
      for (const literal of input.briefInterpretation?.verbatimSpans ?? [])
        if (
          !(
            input.request.content
              .split(/[;\n]/)
              .some(
                clause =>
                  clause.includes(literal) &&
                  /(?:no|como|para o)\s+(?:t[ií]tulo|headline)/i.test(clause)
              )
              ? v.slides.map(s => projectContentHeadline(s.content))
              : fields
          ).some(f => f.includes(literal))
        )
          errors.push(`slot:${slot}:verbatim_missing:${literal}`);
      for (const term of [
        ...(input.executionBrief?.mustKeep ?? []),
        ...(input.executionBrief?.mustInclude ?? []),
      ])
        if (
          term.trim() &&
          !fields.some(f => normalized(f).includes(normalized(term)))
        )
          errors.push(`slot:${slot}:required_term:${term}`);
      for (const term of input.executionBrief?.forbiddenTerms ?? [])
        if (
          term.trim() &&
          fields.some(f => normalized(f).includes(normalized(term)))
        )
          errors.push(`slot:${slot}:forbidden_term:${term}`);
      if (
        findInstructionLeakage(projected, input.briefInterpretation ?? null)
          .length
      )
        errors.push(`slot:${slot}:instruction_leakage`);
      for (const source of input.executionBrief?.slides ?? [])
        if (source.locked && !v.slides[source.slideNumber - 1])
          errors.push(
            `slot:${slot}:locked_slide_missing:${source.slideNumber}`
          );
        else if (source.locked) {
          const s = v.slides[source.slideNumber - 1],
            literal = source.rawText;
          if (
            literal &&
            !`${projectContentHeadline(s.content)}\n${projectContentBody(s.content)}`.includes(
              literal
            )
          )
            errors.push(
              `slot:${slot}:locked_slide_changed:${source.slideNumber}`
            );
        }
      for (const [index, s] of Array.from(v.slides.entries())) {
        errors.push(
          ...validateVariableContent(s.content, {
            version: 2,
            blocks: null,
            allowedTypes: [...contentBlockTypes],
            requiredTypes: [],
            allowedTextRoles: [...contentTextRoles],
            requiredTextRoles: [],
            listItems: null,
          }).map(e => `slot:${slot}/slide:${index}:${e}`)
        );
        const supported = (ids: string[], values: string[]) =>
          ids.length > 0 &&
          ids.every(id => evidence.some(e => e.id === id)) &&
          values.every(
            value =>
              value.trim() &&
              evidence
                .filter(e => ids.includes(e.id))
                .some(e => e.text.includes(value))
          );
        for (const fact of s.content.blocks) {
          if (
            fact.type === "metric" &&
            !supported(fact.sourceSpanIds, [fact.value])
          )
            errors.push(`slot:${slot}/slide:${index}:unsupported_metric`);
          if (
            fact.type === "quote" &&
            !supported(fact.sourceSpanIds, [
              fact.text,
              ...(fact.author ? [fact.author] : []),
            ])
          )
            errors.push(`slot:${slot}/slide:${index}:unsupported_quote`);
        }
      }
    }
    const fingerprint = p.variations.map(v =>
      normalized(
        v.slides
          .map(
            s =>
              projectContentHeadline(s.content) +
              "\n" +
              projectContentBody(s.content)
          )
          .join("\n")
      )
    );
    if (explicitMediaMix && offeredCards.some(c => c.mediaSlots.length)) {
      const mediaCount = p.variations.filter(v =>
        v.slides.some(s =>
          s.components.some(
            ref => offeredCards.find(c => c.id === ref.id)?.mediaSlots.length
          )
        )
      ).length;
      if (mediaCount !== 2)
        errors.push(`media_mix_required:expected2:actual${mediaCount}`);
    }
    const literals = input.briefInterpretation?.verbatimSpans ?? [];
    const literalOnly =
      literals.length > 0 &&
      fingerprint.every(copy => copy === normalized(literals.join("\n")));
    if (
      new Set(fingerprint).size !== 3 &&
      input.executionBrief?.interventionLevel !== "visual_only" &&
      !literalOnly
    )
      errors.push("duplicate_proposal_content");
    if (errors.length) return Array.from(new Set(errors));
    try {
      const chosenIds = Array.from(
        new Set(
          p.variations.flatMap(v => [
            ...(v.direction.typographyComponentId
              ? [v.direction.typographyComponentId]
              : []),
            ...v.slides.flatMap(s => s.components.map(ref => ref.id)),
          ])
        )
      );
      const resolved = await hydrate(chosenIds);
      if(input.completeDesignsOnly)for(const variation of p.variations){
        const design=resolved.find(c=>c.id===variation.slides[0].components[0].id)!;
        variation.direction.palette=completeDesignPalette(design);
      }
      if (input.brandPalette)
        emit("assembly.brand_palette", "completed", {
          policy: "explicit-brand-functional-v1",
          palette: input.brandPalette,
          components: chosenIds,
          preserveOverrides: resolved.reduce(
            (sum, c) =>
              sum +
              Object.values(c.colorRoles ?? {}).filter(
                role => role === "preserve"
              ).length,
            0
          ),
          fields: ["fill", "stroke", "textFragments.color", "extrusion.color"],
        });
      if (!frozenPlan) {
        frozenPlan = structuredClone(p);
        // Geometry is safe to replay without storing another copy of private text
        // or enabling full provider prompt/response retention.
        emit("assembly.requested_layout", "completed", {
          aspectRatio: p.aspectRatio,
          variations: p.variations.map((v, slot) => ({
            slot, typographyComponentId: v.direction.typographyComponentId,
            slides: v.slides.map(s => ({id:s.id,role:s.role,density:s.density,components:s.components})),
          })),
        });
      }
      const b = materializeAssemblyPlan(p, resolved, {
        traceId: deps.trace.id,
        runId: deps.trace.id,
        experimental: input.experimental,
        brandPalette: input.brandPalette,
        brandFonts,
      });
      if (!deps.measureText) {
        const assets = Array.from(
          new Map(
            b.variations
              .flatMap(v => v.slides.flatMap(s => s.bundle.assets))
              .map(a => [a.id, a])
          ).values()
        );
        measure = await (
          deps.createTextMeasurer ?? createComponentTextMeasurer
        )(assets);
      }
      const preflight = preflightAssemblyGeneration(b, {
        measureText: measure!,
        allowReduction: true,
      });
      for (const v of preflight)
        for (const s of v.slides) {
          if (s.issues.length)
            errors.push(
              ...s.issues.map(issue => `slot:${v.slot}/slide:${s.id}:${issue}`)
            );
          emit(
            "assembly.preflight",
            s.issues.length ? "rejected" : "completed",
            {
              slot: v.slot,
              slideId: s.id,
              issues: s.issues,
              pendingMedia: s.pendingMedia.length,
              userContentHash: s.composition.userContentHash,
              measurement: "verified-font-shared-v1",
            }
          );
        }
      if (!errors.length) {
        bundle = b;
        parsed = p;
      }
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "invalid_assembly_materialization"
      );
    }
    return Array.from(new Set(errors));
  };
  emit("assembly.generate", "started", {
    components: input.offered.length,
    slideCount: count,
    postMode: input.request.postMode,
    fullCardChars: JSON.stringify(offeredCards).length,
    promptCardChars: JSON.stringify(promptCards).length,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (expired()) {
      metrics.exceededDeadline = true;
      return fail("deadline", "Prazo encerrado antes da montagem.");
    }
    if (
      attempt &&
      input.deadlineMs !== null &&
      deps.clock() + 60000 > input.deadlineMs
    )
      break;
    metrics.generativeCalls++;
    if (attempt) metrics.repairCalls++;
    try {
      const response = await deps.generate({
        traceLabel: attempt
          ? "component_assembly_repair"
          : "component_assembly_generation",
        taskRoute: attempt
          ? "quality_revision"
          : input.request.postMode === "carousel"
            ? "carousel_generation"
            : "static_generation",
        model: input.request.model,
        deadlineMs: input.deadlineMs ?? undefined,
        maxTransportAttempts: 1,
        forceTextSchema: true,
        disableStructuredRepair: true,
        maxCompletionTokens: Math.min(24000, Math.max(6000, count * 3 * 900)),
        response_format: responseFormat(input, count),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              typeof userContent === "string"
                ? userContent +
                  (attempt
                    ? `\n${input.completeDesignsOnly ? "Escolha outro design completo compatível da mesma família ou corrija bindings. Não componha peças nem altere geometria. " : ""}Corrija estes defeitos técnicos sem omitir conteúdo solicitado, preservando as fontes. ${input.completeDesignsOnly ? "Mantenha o design inteiro e o texto integral; relate incompatibilidade se não couber:" : "Ajuste primeiro os espaços e relações mantendo a linguagem e os componentes escolhidos; use quiet somente se essa direção não passar na auditoria:"} ${JSON.stringify(lastErrors.slice(0, 48))}. ${frozenPlan ? `Copy congelada: preserve integralmente caption, hashtags, slides IDs e content deste plano: ${JSON.stringify(frozenPlan)}` : ""}`
                    : "")
                : [
                    ...(Array.isArray(userContent)
                      ? userContent
                      : [userContent]),
                    ...(attempt
                      ? [
                          {
                            type: "text" as const,
                            text: `Corrija estes defeitos técnicos sem omitir conteúdo solicitado: ${JSON.stringify(lastErrors.slice(0, 48))}. ${frozenPlan ? `Preserve integralmente caption, hashtags, slide IDs e content: ${JSON.stringify(frozenPlan)}` : ""}`,
                          },
                        ]
                      : []),
                  ],
          },
        ],
      });
      addCallMetrics(metrics, response);
      const raw = safeJsonParse<unknown>(
        extractTextContent(response.choices?.[0]?.message?.content),
        null
      );
      lastErrors = await validate(raw);
      if (!lastErrors.length) break;
      emit("assembly.validate", "rejected", {
        attempt,
        issues: lastErrors.slice(0, 48),
        repairAvailable: attempt === 0,
      });
    } catch (e) {
      // Transport already owns bounded failover. A provider failure without a
      // plan is not a technical repair and must not restart the same request.
      if (expired()) {
        metrics.exceededDeadline = true;
        return fail("deadline", "Prazo encerrado na chamada de montagem.");
      }
      const structuredError = e instanceof StructuredOutputError ? e
        : e instanceof Error && e.cause instanceof StructuredOutputError ? e.cause : undefined;
      if (attempt === 0 && structuredError && ["invalid_json","schema_mismatch"].includes(structuredError.failureType)) {
        lastErrors = [structuredError.message];
        continue; // One orchestrator repair, never an extra provider-owned repair.
      }
      if (structuredError && !frozenPlan)
        return fail("parse", structuredError.message);
      if (!frozenPlan)
        return fail(
          "provider",
          "Não foi possível concluir a montagem pelo provedor."
        );
      lastErrors = [e instanceof Error ? e.message : "provider_failure"];
      break;
    }
  }
  if (!input.completeDesignsOnly && (!parsed || !bundle) && frozenPlan && !expired()) {
    const frozen = frozenPlan;
    const run = {
      traceId: deps.trace.id,
      runId: deps.trace.id,
      experimental: input.experimental,
      brandPalette: input.brandPalette,
      brandFonts,
    };
    const planHash = arsenalHash(frozen);
    try {
      const variations = [];
      const usedCoverSources = new Set<string>();
      for (const [slot, variation] of Array.from(frozen.variations.entries())) {
        const slides = [];
        for (const [index, slide] of Array.from(variation.slides.entries())) {
          const reasons: string[] = [];
          const inspect = async (
            candidate: ReturnType<typeof materializeAssemblySlide>
          ) => {
            const textMeasure =
              deps.measureText ??
              (await (deps.createTextMeasurer ?? createComponentTextMeasurer)(
                candidate.assets
              ));
            const composition = readArsenalComposition(
              resolveArsenalGeometry(compositionFromAssemblyBundle(candidate), {
                measureText: textMeasure,
                allowReduction: true,
              })
            );
            return composition;
          };
          let selected: ReturnType<typeof materializeAssemblySlide> | undefined;
          let selectedDensity = slide.density;
          const originalIds = [
            ...slide.components.map(c => c.id),
            ...(variation.direction.typographyComponentId
              ? [variation.direction.typographyComponentId]
              : []),
          ];
          const definitions = await hydrate(originalIds);
          const originalSlots = definitions.flatMap(component =>
            (component.fragment.mediaSlots ?? []).map(metadata => ({
              metadata,
              prompt:
                slide.mediaPrompts.find(
                  p =>
                    p.componentId === component.id && p.slotId === metadata.id
                )?.prompt ?? metadata.prompt,
            }))
          );
          try {
            const candidate = materializeAssemblySlide(
                frozen,
                slot,
                index,
                definitions,
                run
              ),
              issues = (await inspect(candidate)).issues;
            if (!issues.length) selected = candidate;
            else reasons.push(...issues);
          } catch (e) {
            reasons.push(
              e instanceof Error
                ? e.message
                : "invalid_assembly_materialization"
            );
          }
          if (!selected && reasons.length && reasons.every(issue => issue.startsWith("collision:text_media:"))) {
            try {
              const adjusted = structuredClone(frozen),
                target = adjusted.variations[slot].slides[index],
                original = materializeAssemblySlide(
                  frozen,
                  slot,
                  index,
                  definitions,
                  run
                ),
                composition = await inspect(original),
                contentIndex = target.components.findIndex(
                  ref => input.offered.find(c => c.id === ref.id)?.kind === "content"
                ),
                contentRoot = `c${contentIndex}-root`,
                belongsToContent = (parentId: string | null): boolean => {
                  if (parentId === contentRoot) return true;
                  const parent = composition.groups.find(g => g.id === parentId);
                  return !!parent && belongsToContent(parent.parentId);
                },
                corners = composition.elements
                  .filter(e => e.opacity > 0 && belongsToContent(e.parentId) && (e.kind !== "text" || e.text.trim()))
                  .flatMap(e => {
                    const w = arsenalWorldGeometry(e, composition.groups),
                      angle = (w.rotation * Math.PI) / 180;
                    return [[0, 0], [e.width, 0], [e.width, e.height], [0, e.height]].map(
                      ([x, y]) => w.y + w.scale * (x * Math.sin(angle) + y * Math.cos(angle))
                    );
                  }),
                H = composition.base.artboard.height,
                top = Math.max(0, ...corners) + 36,
                height = H - top - 72;
              if (height >= H * 0.18) {
                for (const ref of target.components)
                  if (input.offered.find(c => c.id === ref.id)?.kind === "media") {
                    ref.placement = { x: 0.08, y: top / H, width: 0.84, height: height / H };
                    delete ref.layoutRelation;
                  }
                const moved = materializeAssemblySlide(adjusted, slot, index, definitions, run),
                  issues = (await inspect(moved)).issues;
                emit("assembly.layout_candidate", issues.length ? "rejected" : "completed", {
                  slot,
                  slideId: slide.id,
                  componentIds: target.components.map(c => c.id),
                  issues,
                });
                if (!issues.length) {
                  moved.candidates[0].componentAssembly!.planHash = planHash;
                  moved.candidates[0].componentAssembly!.resolution = {
                    kind: "layout-adaptation",
                    reasons: ["media_region_repositioned_below_measured_content"],
                    requestedComponentIds: slide.components.map(c => c.id),
                  };
                  selected = moved;
                }
              }
            } catch (e) {
              reasons.push(e instanceof Error ? e.message : "layout_adaptation_failed");
            }
          }
          if (!selected) {
            const retainedFields = slide.components.flatMap(ref => {
              const card = input.offered.find(c => c.id === ref.id);
              return card && card.kind !== "content"
                ? ("fragment" in card ? compactComponentCard(card) : card).fields : [];
            });
            const eligible = input.offered
              .filter(
                c =>
                  c.kind === "content" &&
                  c.roles.includes(slide.role) &&
                  (c.densities.includes("quiet") || c.densities.includes("expressive")) &&
                  !slide.components.some(ref => ref.id === c.id) &&
                  c.aspectRatios.includes(frozen.aspectRatio) &&
                  // Spend the bounded geometry attempts on candidates that can
                  // actually bind the frozen content, using compact cards only.
                  !contentCoverageIssues(slide.content, bindAssemblyContent(slide.content, [
                    ...("fragment" in c ? compactComponentCard(c) : c).fields,
                    ...retainedFields,
                  ])).length &&
                  Object.values(brandFonts)
                    .filter(
                      (font): font is string =>
                        !!font && offeredFont(font).length > 0
                    )
                    .every(font => {
                      const supports = (
                        card: ComponentDefinitionV1 | ComponentCardV1
                      ) => offeredFont(font).some(c => c.id === card.id);
                      const donor = input.offered.find(
                        c => c.id === variation.direction.typographyComponentId
                      );
                      return (donor && supports(donor)) || supports(c);
                    })
              );
            const source = (c: ComponentDefinitionV1 | ComponentCardV1) => ("fragment" in c ? compactComponentCard(c) : c).visualTraits?.sourceKey ?? c.id;
            const score = (c: ComponentDefinitionV1 | ComponentCardV1) => {
              const traits = ("fragment" in c ? compactComponentCard(c) : c).visualTraits;
              return (usedCoverSources.has(source(c)) && slide.role === "cover" ? 100 : 0)
                + (variation.direction.intent && !traits?.languages.includes(variation.direction.intent.language) ? 10 : 0)
                + (traits?.treatments.includes("assembly-authored") ? 0 : 1);
            };
            const quiet = eligible.filter(c => c.densities.includes("quiet")).slice(0, slide.density === "quiet" ? 5 : 2);
            const expressive = slide.density === "quiet" ? [] : eligible.filter(c => c.densities.includes("expressive")).sort((a,b) => score(a)-score(b)).slice(0,3);
            for (const card of [...expressive, ...quiet]) {
              try {
                const substitute = structuredClone(frozen),
                  target = substitute.variations[slot].slides[index];
                target.density = expressive.includes(card)
                  ? (card.densities.includes(slide.density) ? slide.density : "expressive")
                  : "quiet";
                target.components = [
                  { id: card.id, hash: card.hash },
                  ...structuredClone(slide.components).filter(
                    ref =>
                      input.offered.find(c => c.id === ref.id)?.kind !==
                      "content"
                  ),
                ];
                if (target.components.some(ref => {
                  const c = input.offered.find(c => c.id === ref.id);
                  return c?.kind === "ornament" && !c.densities.includes(target.density);
                })) continue;
                target.mediaPrompts = target.mediaPrompts.filter(p =>
                  target.components.some(c => c.id === p.componentId)
                );
                const ids = [
                  ...target.components.map(c => c.id),
                  ...(variation.direction.typographyComponentId
                    ? [variation.direction.typographyComponentId]
                    : []),
                ];
                const candidateRun = {...run, compactContentComponentId: undefined as string | undefined};
                let candidate = materializeAssemblySlide(
                  substitute,
                  slot,
                  index,
                  await hydrate(ids),
                  candidateRun
                );
                if (
                  (candidate.candidates[0].variant.mediaSlots?.length ?? 0) <
                  originalSlots.length
                )
                  continue;
                for (const [mediaIndex, metadata] of Array.from(
                  (candidate.candidates[0].variant.mediaSlots ?? []).entries()
                ))
                  if (originalSlots[mediaIndex])
                    metadata.prompt = originalSlots[mediaIndex].prompt;
                candidate.candidates[0].variantHash = arsenalHash(
                  candidate.candidates[0].variant
                );
                candidate.candidates[0].definitionHash = arsenalHash({
                  pieces: candidate.pieces,
                  variant: candidate.candidates[0].variant,
                });
                let composition = await inspect(candidate);
                if (composition.issues.length && composition.issues.every(issue => issue.startsWith("collision:text_media:")) &&
                    ("fragment" in card ? compactComponentCard(card) : card).visualTraits?.treatments.includes("assembly-authored")) {
                  candidateRun.compactContentComponentId = card.id;
                  candidate = materializeAssemblySlide(substitute, slot, index, await hydrate(ids), candidateRun);
                  composition = await inspect(candidate);
                  reasons.push("authored_text_spacing_compacted_for_media");
                }
                if (
                  composition.issues.some(issue =>
                    issue.startsWith("collision:text_media:")
                  )
                ) {
                  const contentIndex = target.components.findIndex(
                      ref => ref.id === card.id
                    ),
                    contentRoot = `c${contentIndex}-root`;
                  const belongsToContent = (
                    parentId: string | null
                  ): boolean => {
                    if (parentId === contentRoot) return true;
                    const parent = composition.groups.find(
                      g => g.id === parentId
                    );
                    return !!parent && belongsToContent(parent.parentId);
                  };
                  const corners = composition.elements
                    .filter(
                      e =>
                        e.opacity > 0 &&
                        belongsToContent(e.parentId) &&
                        (e.kind !== "text" || e.text.trim())
                    )
                    .flatMap(e => {
                      const w = arsenalWorldGeometry(e, composition.groups),
                        angle = (w.rotation * Math.PI) / 180;
                      return [
                        [0, 0],
                        [e.width, 0],
                        [e.width, e.height],
                        [0, e.height],
                      ].map(
                        ([x, y]) =>
                          w.y +
                          w.scale * (x * Math.sin(angle) + y * Math.cos(angle))
                      );
                    });
                  const H = composition.base.artboard.height,
                    top = Math.max(0, ...corners) + 36,
                    height = H - top - 72;
                  if (height >= H * 0.18) {
                    for (const ref of target.components)
                      if (
                        input.offered.find(c => c.id === ref.id)?.kind ===
                        "media"
                      ) {
                        ref.placement = {
                          x: 0.08,
                          y: top / H,
                          width: 0.84,
                          height: height / H,
                        };
                        delete ref.layoutRelation;
                      }
                    candidate = materializeAssemblySlide(
                      substitute,
                      slot,
                      index,
                      await hydrate(ids),
                      candidateRun
                    );
                    // Rematerialization restores catalogue defaults; keep the
                    // original editorial prompts on the replacement slots.
                    for (const [mediaIndex, metadata] of Array.from(
                      (candidate.candidates[0].variant.mediaSlots ?? []).entries()
                    ))
                      if (originalSlots[mediaIndex])
                        metadata.prompt = originalSlots[mediaIndex].prompt;
                    candidate.candidates[0].variantHash = arsenalHash(candidate.candidates[0].variant);
                    candidate.candidates[0].definitionHash = arsenalHash({
                      pieces: candidate.pieces,
                      variant: candidate.candidates[0].variant,
                    });
                    composition = await inspect(candidate);
                    if (!composition.issues.length)
                      reasons.push(
                        "media_region_repositioned_below_measured_content"
                      );
                  }
                }
                const issues = composition.issues;
                emit(
                  target.density === "quiet" ? "assembly.quiet_candidate" : "assembly.compatible_candidate",
                  issues.length ? "rejected" : "completed",
                  {
                    slot,
                    slideId: slide.id,
                    componentId: card.id,
                    issues,
                    pendingMedia:
                      candidate.candidates[0].variant.mediaSlots?.length ?? 0,
                  }
                );
                if (issues.length) continue;
                for (const [mediaIndex, metadata] of Array.from((candidate.candidates[0].variant.mediaSlots ?? []).entries()))
                  if (originalSlots[mediaIndex]) metadata.prompt = originalSlots[mediaIndex].prompt;
                candidate.candidates[0].variantHash = arsenalHash(candidate.candidates[0].variant);
                candidate.candidates[0].definitionHash = arsenalHash({pieces:candidate.pieces,variant:candidate.candidates[0].variant});
                const origin = candidate.candidates[0].componentAssembly!;
                origin.planHash = planHash;
                origin.resolution = {
                  kind: target.density === "quiet" ? "quiet-adaptation" : "component-adaptation",
                  reasons: reasons.slice(0, 48).map(s => s.slice(0, 160)),
                  requestedComponentIds: slide.components.map(c => c.id),
                };
                selected = candidate;
                selectedDensity = target.density;
                break;
              } catch (e) {
                reasons.push(
                  e instanceof Error ? e.message : "quiet_adaptation_failed"
                );
              }
            }
          }
          if (!selected) {
            selected = materializeEditorialAssemblySlide(
              frozen,
              slot,
              index,
              definitions,
              run,
              reasons
            );
            const issues = (await inspect(selected)).issues;
            selected.candidates[0].componentAssembly!.resolution!.reasons = [
              ...reasons,
              ...issues,
            ]
              .slice(0, 48)
              .map(s => s.slice(0, 160));
          }
          const resolution =
            selected.candidates[0].componentAssembly?.resolution;
          if (resolution) {
            if (resolution.kind !== "layout-adaptation")
              metrics.fallbacks.push(
                `assembly:${slot}:${slide.id}:${resolution.kind}`
              );
            emit("assembly.slide_resolution", resolution.kind === "layout-adaptation" ? "completed" : "fallback", {
              slot,
              slideId: slide.id,
              kind: resolution.kind,
              reasons: resolution.reasons,
              userContentHash: selected.userContentHash,
              planHash,
            });
          }
          if (slide.role === "cover") {
            const contentId = selected.candidates[0].componentAssembly?.componentIds.find(id => input.offered.some(c => c.id === id && c.kind === "content"));
            const card = input.offered.find(c => c.id === contentId);
            if (card) usedCoverSources.add(("fragment" in card ? compactComponentCard(card) : card).visualTraits?.sourceKey ?? card.id);
          }
          slides.push({
            id: slide.id,
            role: slide.role,
            density: resolution && ["quiet-adaptation", "editorial-fallback"].includes(resolution.kind) ? "quiet" : selectedDensity,
            bundle: selected,
          });
        }
        variations.push({
          schemaVersion: 1 as const,
          traceId: run.traceId,
          runId: run.runId,
          slot,
          planHash,
          direction: {
            ...variation.direction,
            palette: input.brandPalette ?? variation.direction.palette,
          },
          caption: variation.caption,
          hashtags: variation.hashtags,
          slides,
        });
      }
      bundle = generationAssemblyBundleV1Schema.parse({
        schemaVersion: 1,
        traceId: run.traceId,
        runId: run.runId,
        planHash,
        variations,
      });
      parsed = frozen;
    } catch (e) {
      lastErrors.push(
        e instanceof Error ? e.message : "assembly_resolution_failed"
      );
    }
  }
  if (parsed && bundle) {
    for (const variation of bundle.variations) {
      const deviations = variation.slides.flatMap(slide => {
        const resolution = slide.bundle.candidates[0].componentAssembly?.resolution;
        return resolution && resolution.kind !== "layout-adaptation"
          ? [{slideId:slide.id, kind:resolution.kind, actualDensity:slide.density}]
          : [];
      });
      emit("assembly.art_direction", deviations.length ? "fallback" : "completed", {
        slot:variation.slot, intent:variation.direction.intent ?? null,
        actualSlides:variation.slides.map(slide => ({id:slide.id,role:slide.role,density:slide.density})),
        deviations, aestheticApproval:false,
      });
    }
  }
  if (!parsed || !bundle)
    return {
      status: "rejected",
      runId: deps.trace.id,
      issues: lastErrors
        .slice(0, 48)
        .map(detail => ({ slot: "set", type: "invalid_set", detail })),
      metrics: finishMetrics(metrics, deps.clock()),
    };
  if (expired()) {
    metrics.exceededDeadline = true;
    return fail("deadline", "Prazo encerrado antes da entrega da montagem.");
  }
  const snapshots = parsed.variations.map((_, slot) => ({
    ...projection(parsed!, slot, input),
    id: `components-${deps.trace.id}-${slot}`,
    componentAssemblyV1: bundle!.variations[slot],
  }));
  metrics.embeddingCalls++;
  const recentPosts = await deps
    .loadRecentPosts(input.userUuid, 20)
    .catch(() => []);
  const originality = await deps
    .assessOriginality({
      candidates: snapshots,
      siteIntelligence: input.siteIntelligence,
      recentPosts,
    })
    .catch(() => ({
      assessments: snapshots.map(() => ({
        score: 50,
        maxCandidateSimilarity: 0,
        maxSiteSimilarity: 0,
        maxHistorySimilarity: 0,
        closestSource: "none" as const,
        fallbackUsed: true,
      })),
      embeddings: [],
      fallbackUsed: true,
    }));
  if (originality.fallbackUsed) metrics.fallbacks.push("originality");
  for (const [slot, snapshot] of Array.from(snapshots.entries()))
    snapshot.generationMeta = {
      creationMode: input.request.creationMode,
      fidelity: input.executionBrief ? "high" : "medium",
      interventionLevel: input.executionBrief?.interventionLevel,
      strategyId: input.plan.strategies.selected[slot]?.id,
      revisionCount: metrics.repairCalls,
      revisionApplied: metrics.repairCalls > 0,
      originality: originality.assessments[slot],
    };
  emit("assembly.plan", "completed", {
    planHash: arsenalHash(parsed),
    variationCount: 3,
    slideCount: count,
    components: bundle.variations.map(v =>
      v.slides.map(s => s.bundle.candidates[0].componentAssembly?.componentIds)
    ),
    experimental: input.experimental,
  });
  return {
    status: "approved",
    runId: deps.trace.id,
    snapshots,
    evaluations: [],
    originality,
    plan: input.plan,
    metrics: finishMetrics(metrics, deps.clock()),
  };
}
