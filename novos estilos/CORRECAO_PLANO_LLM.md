# Correção do Plano: Arquitetura de Seleção Automática de Estilos

**Data:** 2026-07-02
**Motivo:** O plano original não definia como paletas e receitas chegariam ao usuário. Forçar o LLM a conhecê-las infla tokens e gera o impasse "escolher antes ou depois?". A solução correta é um classificador determinístico pós-geração, com troca instantânea client-side.
**Princípio:** O LLM gera conteúdo. O sistema aplica estilo. O usuário confirma ou troca.

---

## Arquitetura Final

```
Usuário fornece input (texto/URL/imagem)
        │
        ▼
┌──────────────────────────────────────────┐
│  LLM (post.generate)                     │
│  Gera conteúdo PURO:                     │
│  headline, body, caption, sections,      │
│  hashtags, CTA, copyAngle, tone          │
│  NÃO gera cores, layout, textElements    │
│  (custo de tokens reduzido)              │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│  Classificador Determinístico            │
│  Analisa conteúdo → seleciona paleta     │
│  + receita ideais para cada variação     │
│  (30 linhas de switch, zero LLM)         │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│  Pós-processamento Determinístico        │
│  paletteToDesignTokens() → designTokens  │
│  injectContentIntoRecipe() → textElements│
│  + imageElements + template + layout     │
│  (funções puras, instantâneo)            │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│  HoloDeck                                │
│  3 variações JÁ ESTILIZADAS              │
│  Dropdown de paleta (10 opções)          │
│  Dropdown de receita (7 opções)          │
│  Troca instantânea (client-side,         │
│  sem round-trip)                         │
└──────────────────────────────────────────┘
        │
   [se usuário trocar receita e conteúdo
    não couber na nova estrutura]
        │
        ▼
┌──────────────────────────────────────────┐
│  Adaptador Rápido (Groq llama-scout)     │
│  Recebe conteúdo original + estrutura    │
│  da nova receita → redistribui conteúdo  │
│  (~0.1s, gratuito, ~200 tokens)          │
└──────────────────────────────────────────┘
        │
        ▼
     Workbench (refinamento final)
```

---

## Por que esta arquitetura é superior

| Dimensão | LLM conhece estilos | Classificador determinístico |
|---|---|---|
| Tokens no prompt | +800 tokens extra por chamada | Zero extra |
| Risco de alucinação de cores | Alto (LLM inventa hex) | Zero (cores pré-calculadas) |
| Tempo de resposta | Mais lento (prompt maior) | Instantâneo |
| Usuário discorda da escolha | Precisa regenerar (sparks) | Troca com 1 clique (grátis) |
| Escalabilidade | Cada paleta nova = prompt maior | Adicionar 1 linha no switch |
| Custo adicional | Sparks por tokens extras | Zero |

---

## Componente 1: Classificador Determinístico

**Novo arquivo:** `server/ai/styleClassifier.ts`

```typescript
import type { PostVariation } from "@shared/postspark";
import { PALETTE_PRESETS, type PalettePreset } from "../../client/src/lib/palettes";
import { COMPOSITION_RECIPES, type CompositionRecipe } from "../../client/src/lib/compositionRecipes";

interface StyleSelection {
  paletteId: string;
  recipeId: string;
  reason: string;
}

/**
 * Seleciona paleta e receita ideais baseado no conteúdo da variação.
 * Totalmente determinístico — zero custo, zero latência de rede.
 */
export function classifyVariationStyle(variation: PostVariation): StyleSelection {
  return {
    paletteId: classifyPalette(variation),
    recipeId: classifyRecipe(variation),
    reason: buildReason(variation),
  };
}

/**
 * Seleciona a paleta com base em:
 * - Tom do conteúdo (variação 0=profissional, 1=casual, 2=criativo)
 * - Indústria inferida das hashtags e copyAngle
 * - Temperatura emocional do headline
 */
function classifyPalette(v: PostVariation): string {
  const headline = (v.headline ?? "").toLowerCase();
  const body = (v.body ?? "").toLowerCase();
  const hashtags = (v.hashtags ?? []).join(" ").toLowerCase();
  const fullText = `${headline} ${body} ${hashtags}`;

  // Palavras de urgência → volcano-night (laranja = urgência, ação)
  if (matchAny(fullText, ["urgente", "última", "não perca", "hoje", "agora", "corre", "imperdível"])) {
    return "volcano-night";
  }

  // Palavras tech/futuro → cyber-lavender (neon = tech)
  if (matchAny(fullText, ["ia", "inteligência artificial", "tech", "startup", "inovação", "futuro", "crypto", "blockchain", "app", "software", "digital"])) {
    return "cyber-lavender";
  }

  // Palavras saúde/bem-estar → cream-mint (verde = calma, saúde)
  if (matchAny(fullText, ["saúde", "bem-estar", "wellness", "mente", "corpo", "equilíbrio", "meditação", "yoga", "nutrição", "fitness"])) {
    return "cream-mint";
  }

  // Palavras sustentabilidade/natureza → forest-bloom (verde floresta)
  if (matchAny(fullText, ["sustentável", "natureza", "orgânico", "eco", "verde", "planeta", "ambiental", "recicla"])) {
    return "forest-bloom";
  }

  // Palavras luxo/premium → mediterranean (turquesa = confiança, luxo)
  if (matchAny(fullText, ["luxo", "premium", "exclusivo", "sofisticado", "alta performance", "elite"])) {
    return "mediterranean";
  }

  // Palavras beleza/moda → blush-wine (rosa + vinho = sofisticação)
  if (matchAny(fullText, ["beleza", "moda", "estilo", "tendência", "look", "make", "pele", "cabelo", "fashion"])) {
    return "blush-wine";
  }

  // Palavras criatividade/energia → golden-hour (amarelo = energia)
  if (matchAny(fullText, ["criativo", "energia", "inspiração", "arte", "design", "música", "cultura"])) {
    return "golden-hour";
  }

  // Palavras gaming/esports → moss-silver (verde neon sobre escuro)
  if (matchAny(fullText, ["game", "gamer", "esports", "stream", "play", "jogo"])) {
    return "moss-silver";
  }

  // Palavras lifestyle/rotina → pink-blush (pink suave)
  if (matchAny(fullText, ["vida", "rotina", "dia a dia", "hábito", "produtividade", "organização", "casa"])) {
    return "pink-blush";
  }

  // Fallback (80%+ dos casos): tiffany-dark (mint = versátil, profissional)
  return "tiffany-dark";
}

/**
 * Seleciona a receita com base na estrutura do conteúdo.
 */
function classifyRecipe(v: PostVariation): string {
  const sections = v.sections ?? [];
  const template = v.template;

  // Se tem 3 seções/listas → mosaic-collage (grid visual)
  if (sections.length >= 3 || template === "feature-grid" || template === "numbered-list") {
    return "mosaic-collage";
  }

  const headline = (v.headline ?? "");
  const body = (v.body ?? "");

  // Headline muito curto (≤ 30 chars) → bold statement → brutal-split ou glitch
  if (headline.length <= 30 && body.length <= 60) {
    const isAggressive = matchAny(headline.toLowerCase(), ["pare", "chega", "basta", "nunca", "sempre"]);
    if (isAggressive) return "brutal-split";

    const isTech = matchAny((v.hashtags ?? []).join(" ").toLowerCase(), ["tech", "ia", "futuro", "cyber", "digital"]);
    if (isTech) return "glitch-text";

    return "editorial-poster";
  }

  // Headline médio (30-50 chars) → editorial-poster (hierarquia)
  if (headline.length <= 50) {
    return "editorial-poster";
  }

  // Headline longo (>50 chars) → kinetic-type (dinamismo para compensar densidade)
  if (headline.length > 50) {
    return "kinetic-type";
  }

  // Conteúdo emocional/aspiracional → glass-morphism (elegância)
  const emotionalWords = ["você merece", "transforme", "sinta", "imagine", "sonho", "realize"];
  if (matchAny(body.toLowerCase(), emotionalWords)) {
    return "glass-morphism";
  }

  // Fallback
  return "editorial-poster";
}

function matchAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

function buildReason(v: PostVariation): string {
  return `Selecionado com base no tom e estrutura do conteúdo: headline=${(v.headline ?? "").slice(0, 40)}...`;
}
```

---

## Componente 2: Adaptador de Conteúdo (Groq rápido)

**Novo arquivo:** `server/ai/styleContentAdapter.ts`

Este componente só é chamado se o usuário trocar de receita no HoloDeck e a nova receita exigir uma estrutura diferente (ex: de 1 parágrafo para 3 seções). Não bloqueia o fluxo principal.

```typescript
import { invokeLLM } from "../_core/llm";
import type { PostVariation } from "@shared/postspark";
import type { CompositionRecipe } from "../../client/src/lib/compositionRecipes";

interface AdaptationRequest {
  variation: PostVariation;
  targetRecipe: CompositionRecipe;
}

interface AdaptationResult {
  headline: string;
  body: string;
  sections?: { label: string; description: string }[];
}

/**
 * Adapta o conteúdo de uma variação para caber na estrutura da receita escolhida.
 * Usa Groq llama-scout (gratuito, ~0.1s) — só dispara quando necessário.
 */
export async function adaptContentForRecipe(
  request: AdaptationRequest
): Promise<AdaptationResult> {
  const { variation, targetRecipe } = request;

  // Se a receita não exige adaptação estrutural, retorna o conteúdo original
  if (!needsStructuralAdaptation(targetRecipe)) {
    return {
      headline: variation.headline ?? "",
      body: variation.body ?? "",
      sections: variation.sections,
    };
  }

  const systemPrompt = `Você é um assistente de formatação de conteúdo. Sua única tarefa é redistribuir o conteúdo recebido para caber na estrutura especificada. Não invente fatos. Não mude o tom. Não adicione informação nova. Apenas reorganize.`;

  const needsSections = targetRecipe.template === "feature-grid"
    || targetRecipe.template === "numbered-list"
    || targetRecipe.id === "mosaic-collage";

  const structureHint = needsSections
    ? `A receita "${targetRecipe.name}" exige 3 seções (label + description). Divida o body em 3 labels curtos (máx 24 chars) e 3 descriptions (máx 48 chars).`
    : `A receita "${targetRecipe.name}" usa texto livre. Mantenha headline e body, adaptando tamanho para caber no layout.`;

  const userPrompt = `
Conteúdo original:
Headline: ${variation.headline}
Body: ${variation.body}
${variation.sections ? `Seções atuais: ${JSON.stringify(variation.sections)}` : ""}

${structureHint}

Retorne APENAS JSON válido com headline, body, e sections (se aplicável).`;

  const response = await invokeLLM({
    taskRoute: "microcopy", // usa rota Groq gratuita (~0.1s, sem custo)
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    responseFormat: { type: "json_object" },
  });

  const parsed = JSON.parse(response.content);
  return {
    headline: parsed.headline ?? variation.headline ?? "",
    body: parsed.body ?? variation.body ?? "",
    sections: parsed.sections,
  };
}

function needsStructuralAdaptation(recipe: CompositionRecipe): boolean {
  return recipe.id === "mosaic-collage"
    || recipe.id === "layered-typography"
    || recipe.id === "glitch-text";
}
```

---

## Componente 3: Integração no Pipeline (server/routers.ts)

### Ponto de integração único: Fase 8 (montagem final)

**Local:** `server/routers.ts`, dentro do `variations.map()` ≈ linha 1566.

```typescript
// Substitui/adiciona APÓS a linha 1568 (normalizeCarouselSlides)
// e ANTES do return da montagem

import { classifyVariationStyle } from "../ai/styleClassifier";

const generatedVariations = variations.map((v: any, i: number) => {
  const chameleonPost = chameleonPosts[i];
  const normalizedSlides = isCarousel ? normalizeCarouselSlides(v) : undefined;

  // ========== NOVO: Classificação e aplicação de estilo ==========
  const style = classifyVariationStyle(v as PostVariation);
  const chosenPalette = PALETTE_PRESETS.find(p => p.id === style.paletteId);
  const chosenRecipe = COMPOSITION_RECIPES.find(r => r.id === style.recipeId);

  const paletteTokens = chosenPalette
    ? paletteToDesignTokens(chosenPalette)
    : undefined;

  const recipeElements = chosenRecipe
    ? injectContentIntoRecipe(chosenRecipe, v as PostVariation)
    : null;

  const effectiveColors = paletteTokens ? {
    backgroundColor: paletteTokens.colors.background,
    textColor: paletteTokens.colors.text,
    accentColor: paletteTokens.colors.primary,
  } : {};
  // ============================================================

  return {
    id: `var-${Date.now()}-${i}`,
    ...v,
    caption: v.caption || "",
    platform: input.platform,
    hashtags: v.hashtags || [],
    postMode: input.postMode,
    slides: normalizedSlides,

    // Cores aplicadas deterministicamente
    ...effectiveColors,

    // DesignTokens da paleta (precedência sobre Chameleon)
    ...(paletteTokens ? { designTokens: paletteTokens } : {}),

    // Elementos da receita
    ...(recipeElements?.textElements ? { textElements: recipeElements.textElements } : {}),
    ...(recipeElements?.imageElements ? { imageElements: recipeElements.imageElements } : {}),
    ...(chosenRecipe?.template ? { template: chosenRecipe.template } : {}),
    ...(chosenRecipe?.layoutSettings ? {
      layoutSettings: {
        ...(v.layoutSettings ?? {}),
        ...chosenRecipe.layoutSettings,
      }
    } : {}),

    // Metadata do estilo (para o HoloDeck saber o que foi escolhido)
    _styleSelection: {
      paletteId: style.paletteId,
      recipeId: style.recipeId,
      reason: style.reason,
    },

    // Chameleon Vision (se disponível e paleta não foi aplicada)
    ...(chameleonDesignTokens && !paletteTokens ? { designTokens: chameleonDesignTokens } : {}),
    ...(chameleonPost ? {
      copyAngle: {
        type: chameleonPost.angle,
        label: chameleonPost.label,
        badge: chameleonPost.badge,
        stickerText: chameleonPost.stickerText,
      },
    } : {}),

    generationMeta: {
      creationMode: input.creationMode,
      fidelity: normalizedExecutionBrief ? "high" : "medium",
      interventionLevel: normalizedExecutionBrief?.interventionLevel,
      siteIntelligenceId: siteIntelligence?.id,
      strategyId: generationPlan.strategies.selected[i]?.id,
      revisionCount: evaluationPipeline.revisionCount,
      revisionApplied: evaluationPipeline.revisedIndexes.includes(i),
      revisionFailed: evaluationPipeline.revisionFailedIndexes.includes(i),
      evaluation: evaluationPipeline.evaluations[i],
      originality: originality.assessments[i],
    },
  };
});
```

### O que NÃO muda no system prompt

O system prompt do LLM (`server/routers.ts` linhas 778-836) **permanece inalterado**. O LLM continua gerando conteúdo sem saber de paletas ou receitas. Nenhum token extra é gasto.

O que **pode ser removido** do system prompt para reduzir tokens (opcional, Sprint 3):
- A seção "PSICOLOGIA E CLONAGEM DE CORES" (linhas 808-810) — o classificador cuida disso
- A seção "LAYOUT INTELIGENTE" (linhas 802-806) — o classificador define o layout
- Os campos `backgroundColor`, `textColor`, `accentColor`, `layout` do schema obrigatório — podem virar opcionais

Isso reduziria ~500 tokens por chamada. **Mas é opcional** — o plano funciona com ou sem essa remoção.

---

## Componente 4: Troca instantânea no HoloDeck (client-side)

**Arquivo a modificar:** `client/src/components/views/HoloDeck.tsx`

Adicionar dois dropdowns no `ActionBar` (ou como painel lateral) que permitem trocar paleta e receita com 1 clique:

```typescript
// No componente HoloDeck, adicionar ao estado:
const [overridePaletteId, setOverridePaletteId] = useState<string | null>(null);
const [overrideRecipeId, setOverrideRecipeId] = useState<string | null>(null);

// Ao trocar paleta:
const handlePaletteChange = (paletteId: string) => {
  setOverridePaletteId(paletteId);
  // Reaplica a paleta à variação ativa — instantâneo, client-side
  const palette = PALETTE_PRESETS.find(p => p.id === paletteId);
  if (!palette) return;
  const tokens = paletteToDesignTokens(palette);
  updateActiveVariation({
    designTokens: tokens,
    backgroundColor: tokens.colors.background,
    textColor: tokens.colors.text,
    accentColor: tokens.colors.primary,
  });
};

// Ao trocar receita:
const handleRecipeChange = async (recipeId: string) => {
  setOverrideRecipeId(recipeId);
  const recipe = COMPOSITION_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return;

  // Aplica elementos da receita — instantâneo
  const elements = injectContentIntoRecipe(recipe, activeVariation!);
  updateActiveVariation({
    textElements: elements.textElements,
    imageElements: elements.imageElements,
    template: recipe.template,
    layoutSettings: recipe.layoutSettings,
  });

  // Se a receita exige adaptação de conteúdo, chama o adaptador Groq
  if (recipe.id === "mosaic-collage") {
    setAdaptingContent(true);
    const adapted = await trpc.post.adaptContentForRecipe.mutate({
      variation: activeVariation!,
      recipeId,
    });
    updateActiveVariation(adapted);
    setAdaptingContent(false);
  }
};
```

---

## Nova rota tRPC: `post.adaptContentForRecipe`

**Arquivo a modificar:** `server/routers.ts`

```typescript
adaptContentForRecipe: protectedProcedure
  .input(z.object({
    variation: z.any(), // PostVariation
    recipeId: z.string(),
  }))
  .mutation(async ({ input }) => {
    const recipe = COMPOSITION_RECIPES.find(r => r.id === input.recipeId);
    if (!recipe) throw new TRPCError({ code: "BAD_REQUEST", message: "Receita não encontrada" });

    const adapted = await adaptContentForRecipe({
      variation: input.variation as PostVariation,
      targetRecipe: recipe,
    });

    return {
      headline: adapted.headline,
      body: adapted.body,
      sections: adapted.sections,
    };
  }),
```

---

## Novas funções necessárias (sumário)

| Função | Arquivo | Custo | Quando chamada |
|---|---|---|---|
| `classifyVariationStyle()` | `server/ai/styleClassifier.ts` | Zero | A cada `post.generate` |
| `injectContentIntoRecipe()` | `client/src/lib/compositionRecipes.ts` | Zero | A cada aplicação de receita |
| `adaptContentForRecipe()` | `server/ai/styleContentAdapter.ts` | ~0.1s, gratuito | Só quando usuário troca receita que exige adaptação |
| `paletteToDesignTokens()` | `client/src/lib/palettes.ts` | Zero | A cada aplicação de paleta |

---

## Fluxo completo com tempos

```
1. post.generate (LLM gera conteúdo)       ~8s    (Sparks)
2. classifyVariationStyle (determinístico)  0ms    (CPU)
3. paletteToDesignTokens + injectContent    ~5ms   (CPU)
4. HoloDeck: preview estilizado            ~50ms  (render)
5. Usuário troca paleta (1 clique)          0ms    (Zustand)
6. Usuário troca receita (1 clique)         ~5ms   (Zustand)
   Se adaptação necessária:                 ~100ms (Groq gratuito)
7. Workbench: refinar                       manual
```

---

## Vantagens sobre o plano original

1. **LLM não infla com catálogo** — zero tokens extras no prompt
2. **Seleção é instantânea** — 30 linhas de switch, não 800 tokens de prompt
3. **Troca é grátis** — cliente troca paleta/receita sem gastar sparks
4. **Adaptação de conteúdo é preguiçosa** — só chama Groq se necessário
5. **Escalável** — adicionar nova paleta = 1 linha no switch + 1 entrada no array
6. **À prova de alucinação** — cores vêm de constantes, não de LLM
7. **Compatível com Chameleon Vision** — se houver brand extraction, o classificador pode ser bypassado em favor das cores extraídas
8. **Preserva a invariante do PostVisualSnapshot** — o pipeline continua: conteúdo → normalizador → snapshot

---

## Verificação e correções aplicadas (auditoria 2026-07-02)

### Correções críticas
- `task: "microcopy" as any` → `taskRoute: "microcopy"` (parâmetro correto do `invokeLLM`)

### Ressalvas e decisões de design

**1. Campo `_styleSelection`:**
Não existe no tipo `PostVariation`. O `variations.map` em `routers.ts:1566` já usa `v: any`, então o campo extra não quebra compilação. Para tipagem estrita futura, adicionar ao `PostVariation`:
```typescript
_styleSelection?: { paletteId: string; recipeId: string; reason: string };
```

**2. Estado do HoloDeck:**
A troca de paleta/receita usa o estado local do HoloDeck (`localVariations` + `updateActiveVariation` definidos em `HoloDeck.tsx:341-348`), **não** a store global (`useEditorStore`). Isso é correto: o HoloDeck mantém previews locais; a store global só recebe o snapshot final quando o usuário clica "Ajustar no Workbench".

**3. Lacunas do `AUDITORIA_FINAL.md` ainda pendentes:**
- Diferenciação visual (lacuna #3): não endereçada — requer análise de dissimilaridade
- Curadoria de UI (lacuna #4): o HoloDeck terá 10 paletas + 7 receitas — precisa de UI de busca/filtro
- Testes de regressão visual (lacuna #5): não endereçada
- Performance (lacuna #6): não modelada — receitas adicionam textElements/imageElements ao canvas
- Migração de posts salvos (lacuna #7): posts antigos usam THEMES legados; sem plano de upgrade
- Coexistência com TemporaryThemes (lacuna #8): o classificador deve ser bypassado quando há brand extraction
- Carrossel (lacuna #9): receitas não definem variação entre slides
- Acessibilidade (lacuna #10): WCAG verificado nas cores puras, não em gradientes/overlays

**Estas lacunas não bloqueiam a implementação, mas devem ser endereçadas antes do lançamento.**

---

## Impacto no `DOCUMENTO_MESTRE.md`

Adicionar seção:

```
## Seção XX — Classificador Automático de Estilos

Após post.generate, o classificador determinístico `classifyVariationStyle()` seleciona
a melhor paleta + receita para cada variação baseado no conteúdo (tom, estrutura, indústria).

As paletas e receitas são aplicadas deterministicamente via `paletteToDesignTokens()` e
`injectContentIntoRecipe()`. O LLM não conhece o catálogo de estilos — a inteligência de
seleção está no pós-processamento.

No HoloDeck, o usuário pode trocar paleta e receita com 1 clique (client-side, instantâneo).
Se a nova receita exigir redistribuição de conteúdo (ex: de parágrafo único para 3 seções),
o adaptador `adaptContentForRecipe()` usa Groq (gratuito, ~0.1s) para reorganizar o texto.
```
