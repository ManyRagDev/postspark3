# 🎯 MAPA COMPLETO DA ESTEIRA DE GERAÇÃO — PostSpark 3

> **Data de Mapeamento**: 6 de Julho de 2026  
> **Versão do Código**: main branch (commit f22ade8)  
> **Escopo**: HoloDeck + Workbench V2

---

## 📍 1. ENDPOINTS DE GERAÇÃO

### Entrada Principal (tRPC)

**Arquivo**: `server/routers.ts` (linha 563-1726)  
**Endpoint**: `post.generate`  
**Method**: `protectedProcedure.mutation`

#### Payload de Entrada (Input Schema)

```typescript
{
  inputType: "text" | "url" | "image";
  content: string;                    // Ideia bruta do usuário
  platform: "instagram" | "twitter" | "linkedin" | "facebook";
  imageUrl?: string;                  // Opcional (para inputType="image")
  tone?: string;                      // Tom desejado
  postMode: "static" | "carousel";   // Formato do post
  model?: "gemini" | "llama";        // LLM escolhida
  creationMode: "ideation" | "execution"; // Modo de criação
  executionBrief?: {                  // Briefing estruturado (execution mode)
    format: "static" | "carousel" | "story" | "ad";
    platform: string;
    objective: "educate" | "authority" | "sell" | "engage" | "lead";
    tone?: string;
    callToAction?: string;
    interventionLevel: "visual_only" | "light_optimize" | "optimize_structure";
    contentSourceType: "freeform" | "carousel_topics" | "carousel_slides" | "caption_ready";
    rawInput: string;                  // Conteúdo bruto
    slides?: [{                       // Slides pré-estruturados
      slideNumber: 1-5;
      rawText: string;
      role?: "hook" | "development" | "cta" | "custom";
      locked?: boolean;
    }];
    mustKeep?: string[];              // Termos que devem ser preservados
    mustInclude?: string[];          // Termos que devem aparecer
    forbiddenTerms?: string[];       // Termos proibidos
    notes?: string;
    brandInput?: {                    // Identidade visual
      websiteUrl?: string;
      logoUrl?: string;
      referenceImageUrl?: string;
      brandColors?: string[];
      fontHint?: string;
      adaptationMode: "strict" | "adaptive" | "reference_clone";
    };
  };
  siteIntelligenceId?: string;        // UUID (se já extraído)
  debug?: boolean;                   // Modo debug
}
```

#### Payload de Saída (Output Schema)

```typescript
{
  variations: PostVariation[];        // 3 variações completas
  generationRunId: string;            // UUID da execução
  debug?: {                          // Trace completo (opcional)
    runId: string;
    requestedModel: string;
    effectiveModels: string[];
    startedAt: string;
    durationMs: number;
    calls: GenerationDebugCall[];
    events: GenerationDebugEvent[];
    strategies?: ContentStrategy[];
    evaluations?: GenerationEvaluationSummary[];
    finalOutput?: PostVariation[];
  };
}
```

---

## 🔄 2. FLUXO COMPLETO DE EXECUÇÃO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ENTRADA DO USUÁRIO                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
│  │  Texto bruto   │  │      URL       │  │    Imagem      │              │
│  └────────────────┘  └────────────────┘  └────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 1: VERIFICAÇÃO DE BILLING                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  getBillingProfile(email)                                             │ │
│  │  → Debita Sparks (10✦ static / 40✦ carousel)                         │ │
│  │  → Retorna erro se insuficiente                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 2: EXTRAÇÃO DE CONTEXTO (PARALELO)                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  IF inputType === "url":                                               │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  BRANCH 1: Scrape + Chameleon Vision                             │ │ │
│  │  │  → scrapeUrl(url): extrai HTML                                   │ │ │
│  │  │  → captureScreenshot(url): Railway screenshot service            │ │ │
│  │  │  → chameleonVision(screenshot, content):                         │ │ │
│  │  │    • Analisa visualmente o site                                 │ │ │
│  │  │    • Extrai CSS tokens (cores, fontes, bordas)                  │ │ │
│  │  │    • Gera 5 ângulos de copy (pain, benefit, objection, authority, storytelling)        │ │ │
│  │  │    • Retorna ChameleonVisionResult                              │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  BRANCH 2: Brand DNA (paralelo)                                 │ │ │
│  │  │  → extractBrandDNA(url):                                        │ │ │
│  │  │    • Multi-page screenshots (home + about + pricing)           │ │ │
│  │  │    • Personalidade da marca (eixos 0-100)                       │ │ │
│  │  │    • Cores psicológicas + composição musical                    │ │ │
│  │  │    • Retorna BrandDNA                                           │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  IF ENV.aiSiteIntelligenceEnabled && siteUrl && !siteIntelligence:    │ │
│  │  → analyzeSiteIntelligence(url, userId):                             │ │
│  │    • Scrape completo do site                                         │ │
│  │    • Análise semântica (negócio, produtos, value prop)               │ │
│  │    • Editorial pillars + priority topics                             │ │
│  │    • Evidências citáveis (title, description, headings, body)       │ │
│  │    • Retorna SiteIntelligence                                        │ │
│  │                                                                       │ │
│  │  Nota: Se siteIntelligenceId foi informado, carrega do cache          │ │
│  │  (loadSiteIntelligence) antes de tentar análise completa.             │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 3: ESTRATÉGIA DE CONTEÚDO                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  prepareGenerationPlan({ sourceContent, siteIntelligence, brief })    │ │
│  │  → planContentStrategies(input)                                       │ │
│  │    • Resolve objetivo (brief > siteIntelligence > "engage")          │ │
│  │    • Gera 5 candidatos de estratégia (LLM call)                       │ │
│  │      - Cada candidato tem: topic, angle, hook, promise, audience     │ │
│  │      - Ângulos: pain, benefit, objection, authority, story, myth...  │ │
│  │    • Scorea candidatos (topicRelevance, objectiveAlignment, etc.)      │ │
│  │    • Seleciona 3 estratégias distintas (sem duplicatas)               │ │
│  │    • Retorna ContentStrategyPlan                                      │ │
│  │      • objective, candidates[], selected[3], fallbackUsed            │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 4: GERAÇÃO PRINCIPAL (3 SLOTS EM PARALELO)                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Promise.all([Slot1, Slot2, Slot3])                                  │ │
│  │                                                                        │ │
│  │  PARA CADA SLOT (índice 0-2):                                         │ │
│  │  ┌────────────────────────────────────────────────────────────────┐ │ │
│  │  │  invokeLLM({                                                    │ │ │
│  │  │    traceLabel: "post_generation_${slotIndex + 1}",              │ │ │
│  │  │    taskRoute: "carousel_generation" | "static_generation",      │ │ │
│  │  │    model: input.model,                                          │ │ │
│  │  │    maxCompletionTokens: carousel? 4096 : 3072,                  │ │ │
│  │  │    messages: [                                                  │ │ │
│  │  │      { role: "system", content: slotSystemPrompt },             │ │ │
│  │  │      { role: "user", content: slotPrompt }                      │ │ │
│  │  │    ],                                                            │ │ │
│  │  │    response_format: {                                           │ │ │
│  │  │      type: "json_schema",                                        │ │ │
│  │  │      json_schema: {                                             │ │ │
│  │  │        name: "post_variation_${slotIndex + 1}",                 │ │ │
│  │  │        strict: true,                                             │ │ │
│  │  │        schema: variationSchema (dynamic by postMode)           │ │ │
│  │  │      }                                                           │ │ │
│  │  │    }                                                              │ │ │
│  │  │  })                                                                │ │ │
│  │  │                                                                   │ │ │
│  │  │  System Prompt inclui:                                           │ │ │
│  │  │  • Especialista em marketing + design visual                     │ │ │
│  │  │  • Modo de execução (se executionBrief)                         │ │ │
│  │  │  • Contrato estratégico do slot (strategy selected)              │ │ │
│  │  │  • Brand DNA context (cores, psicoologia, ritmo)                │ │ │
│  │  │  • Regras rígidas de copy (headline 60 chars, body 100 chars)   │ │ │
│  │  │  • Layouts inteligentes (centered, left-aligned, split, minimal)│ │ │
│  │  │  • Psicologia de cores (WCAG 2.1, contraste > 4.5:1)            │ │ │
│  │  │  • Templates estruturados (feature-grid, numbered-list, etc.)     │ │ │
│  │  │                                                                   │ │ │
│  │  │  User Prompt inclui:                                             │ │ │
│  │  │  • Conteúdo bruto do usuário                                     │ │ │
│  │  │  • Estratégia específica do slot (JSON)                          │ │ │
│  │  │  • "Gere somente a variacao N de 3"                              │ │ │
│  │  │                                                                   │ │ │
│  │  │  Schema dinâmico (variaçãoSchema):                                │ │ │
│  │  │  IF postMode === "carousel":                                     │ │ │
│  │  │    • headline, body, hashtags, callToAction, caption             │ │ │
│  │  │    • slides[5] (headline, body, slideNumber, isTitleSlide...)   │ │ │
│  │  │    • aspectRatioOptimizations (1:1, 5:6, 9:16)                    │ │ │
│  │  │    • copyAngle (type, label, badge, stickerText)                 │ │ │
│  │  │  ELSE (static):                                                  │ │ │
│  │  │    • headline, body, hashtags, callToAction, caption             │ │ │
│  │  │    • template (simple | feature-grid | numbered-list...)         │ │ │
│  │  │    • sections[3] (icon, label, description, number)               │ │ │
│  │  │    • aspectRatioOptimizations (1:1, 5:6, 9:16)                    │ │ │
│  │  │    • copyAngle                                                    │ │ │
│  │  │                                                                   │ │ │
│  │  │  RETORNA: variations[1] (ou null em caso de falha)               │ │ │
│  │  └────────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 5: BRAND VISUAL GUARDIAN (DETERMINÍSTICO)                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  IF siteIntelligence && brandDnaContext.length > 0:                    │ │
│  │  → enforceBrandVisualGuardian(variations, siteIntelligence, options)  │ │
│  │    • Força backgroundColor EXCLUSIVAMENTE da paleta extraída           │ │
│  │    • Aplica WCAG 2.1 contrast (text/background ratio > 4.5:1)         │ │
│  │    • Valida se as cores estão na paleta do site (tolerância 40)        │ │
│  │    • Corrige textColor para garantir legibilidade (snap, nunca rejeita)    │
│  │    • SEM chamadas LLM (processamento determinístico)                  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 6: VARIAÇÃO DIVERSIFICATION (SE NECESSÁRIO)                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  IF !normalizedExecutionBrief && variationsNeedDiversification(vars):  │ │
│  │  → invokeLLM("lexical_diversification")                                │ │
│  │    • Recebe as 3 variações que ficaram parecidas                      │ │
│  │    • Reescreva para entregar 3 variações nitidamente diferentes       │ │
│  │    • Preserva tema + marca + layout, mas muda copy/ângulo/paleta      │ │
│  │    • Garante layouts diferentes no conjunto final                      │ │
│  │    • SE carousel: preserva 5 slides por variação                       │ │
│  │    • RETORNA: variations[3] diversificadas                             │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 7: ORIGINALIDADE SEMÂNTICA (ANTI-PLÁGIO) — 1ª PASSAGEM                  │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  assessSemanticOriginality({                                          │ │
│  │    candidates: variations,                                             │ │
│  │    siteIntelligence,                                                   │ │
│  │    recentPosts                                                         │ │
│  │  })                                                                     │ │
│  │                                                                         │ │
│  │  → Gemini Embedding API (gemini-embedding-001) — NÃO é LLM             │ │
│  │    • Gera vetores de embedding (768 dimensões) para:                   │ │
│  │      - Cada variação candidata                                         │ │
│  │      - SiteIntelligence (evidências, até 8 itens)                     │ │
│  │      - Posts recentes do usuário (até 20)                             │ │
│  │    • Calcula cosineSimilarity() entre vetores (matemática pura)        │ │
│  │    • Fallback: embeddings determinísticos por hash se API indisponível │ │
│  │    • RETORNA: originality.assessments[]                                │ │
│  │      • score (0-100, sendo 0=plágio)                                   │ │
│  │      • maxCandidateSimilarity (0-1)                                   │ │
│  │      • maxSiteSimilarity (0-1)                                        │ │
│  │      • maxHistorySimilarity (0-1)                                     │ │
│  │      • closestSource (candidate | site | history | none)               │ │
│  │      • fallbackUsed (se embeddings falharam)                          │ │
│  │                                                                         │ │
│  │  ⚠️ Os scores de originalidade ALIMENTAM a Fase 8 (Evaluation)         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 8: AVALIAÇÃO E REVISÃO (LLM-AS-JUDGE + DETERMINÍSTICO)                 │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  evaluateAndReviseCandidates({                                        │ │
│  │    candidates: variations,                                            │ │
│  │    strategies: generationPlan.strategies.selected,                    │ │
│  │    siteIntelligence,                                                   │ │
│  │    platform,                                                           │ │
│  │    originalityScores,  ← vindos da Fase 7                             │ │
│  │    revise: async (candidate, evaluation, index) => {...}              │ │
│  │  })                                                                    │ │
│  │                                                                         │ │
│  │  ETAPA 1: Evaluation PARALELA (Promise.all, 3 calls simultâneas)       │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  PARA CADA VARIAÇÃO (em paralelo):                                │ │ │
│  │  │  ┌───────────────────────────────────────────────────────────┐  │ │ │
│  │  │  │  1. Avaliação DETERMINÍSTICA (sempre roda):                 │  │ │ │
│  │  │  │    • brandAlignment (Jaccard vs site/brand text)           │  │ │ │
│  │  │  │    • objectiveAlignment (Jaccard vs strategy)              │  │ │ │
│  │  │  │    • audienceRelevance (Jaccard vs audience text)          │  │ │ │
│  │  │  │    • factuality (números não verificados → penalidade)     │  │ │ │
│  │  │  │    • originality (vindo do cosineSimilarity da Fase 7)     │  │ │ │
│  │  │  │    • clarity (penaliza headline>60 chars, body>120)        │  │ │ │
│  │  │  │    • platformFit (penaliza caption > limite da plataforma) │  │ │ │
│  │  │  │    • visualReadability (contrast WCAG ≥ 4.5 → 100)        │  │ │ │
│  │  │  │    • captionCoherence (overlap lexical + discrepância     │  │ │ │
│  │  │  │      numérica caption vs slides/seções — peso 0.16)       │  │ │ │
│  │  │  │                                                              │  │ │ │
│  │  │  │  2. LLM-as-Judge (se ENV.aiLlmJudgeEnabled):               │  │ │ │
│  │  │  │    invokeLLM({                                              │  │ │ │
│  │  │  │      traceLabel: "post_evaluation",                         │  │ │ │
│  │  │  │      taskRoute: "post_evaluation",                          │  │ │ │
│  │  │  │      response_format: json_schema                           │  │ │ │
│  │  │  │    })                                                        │  │ │ │
│  │  │  │    • Avalia as mesmas 9 dimensões por LLM                   │  │ │ │
│  │  │  │    • Retorna dimensions + feedback[até 4]                   │  │ │ │
│  │  │  │                                                              │  │ │ │
│  │  │  │  3. Blend: deterministic * 0.45 + LLM * 0.55                │  │ │ │
│  │  │  │    → overallScore (média ponderada das 9 dimensões)        │  │ │ │
│  │  │  │    → accepted (score≥70 && factuality≥65 &&                │  │ │ │
│  │  │  │      visualReadability≥65 && objectiveAlignment≥60 &&      │  │ │ │
│  │  │  │      captionCoherence≥50)                                   │  │ │ │
│  │  │  └───────────────────────────────────────────────────────────┘  │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                         │ │
│  │  ETAPA 2: Revision PARALELA (Promise.all, só se !accepted)             │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  IF !accepted:                                                    │ │ │
│  │  │  → invokeLLM("quality_revision_${index + 1}")                     │ │ │
│  │  │    • Recebe candidate + evaluation + strategy                      │ │ │
│  │  │    • Sistema: "Revisor cirúrgico — preserve estrutura/layout"   │ │ │
│  │  │    • Corrige apenas os problemas apontados                        │ │ │
│  │  │    • Garante coerência caption/slides (conta coerente)            │ │ │
│  │  │    • RETORNA: variations[1] revisada                              │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                         │ │
│  │  SE houve revisões → reavalia (2ª passagem das 3 evaluations)         │ │
│  │                                                                         │ │
│  │  RETORNA: evaluationPipeline                                          │ │
│  │  • candidates (revisadas se necessário)                                │ │
│  │  • evaluations[]                                                      │ │
│  │  • revisedIndexes[]                                                    │ │
│  │  • revisionFailedIndexes[]                                            │ │
│  │  • revisionCount                                                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 9: SÍNTESE DE CAPTION (COERÊNCIA VISUAL)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  synthesizeCaptionsForVariations(variations, {                        │ │
│  │    platform, tone, strategies, isCarousel                            │ │
│  │  })                                                                     │ │
│  │                                                                         │ │
│  │  → Promise.all: 3 chamadas LLM paralelas (1 por variação)              │ │
│  │    • Sistema: "Sintetizador de legendas coerentes"                     │ │
│  │    • Analisa slides/seções de cada variação final                      │ │
│  │    • Garante que a caption reflita o número correto de tópicos        │ │
│  │    • SE 5 slides: caption deve mencionar "5 dicas" (não "3 dicas")    │ │
│  │    • Enriquece a legenda inicial (gerada na fase 4)                     │ │
│  │    • Adiciona contexto + emoji + CTAs                                   │ │
│  │    • Cada call gera 1 caption; fallback = caption original se falhar   │ │
│  │    • RETORNA: variations[3] com captions enriquecidas                  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 9b: ORIGINALIDADE SEMÂNTICA — 2ª PASSAGEM (SE HOUVE REVISÕES)         │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  IF evaluationPipeline.revisionCount > 0:                              │ │
│  │  → assessSemanticOriginality({...})                                    │ │
│  │    • Recalcula embeddings para as variações revisadas                  │ │
│  │    • Compara novamente vs site + histórico                             │ │
│  │    • Substitui os assessments de originalidade anteriores             │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 10: MOTOR DE VARIABILIDADE CRIATIVA                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  PARA CADA VARIAÇÃO:                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │ │
│  │  │  const seed = hashString(variation.id);                           │ │ │
│  │  │  const dir = directCreative(variation, null, seed);              │ │ │
│  │  │  // ⚠️ dir é computado mas NÃO é passado abaixo (possível bug)   │ │ │
│  │  │  → composeVariation(variation, designTokens)                      │ │ │
│  │  │                                                                     │ │ │
│  │  │  directCreative (deduz intent da variação):                        │ │ │
│  │  │  • Analisa copyAngle + layout + platform + tone                   │ │ │
│  │  │  • Classifica intent: tech, urgent, serene, premium, fun         │ │ │
│  │  │  • Seleciona familyId + paletteId baseado no intent               │ │ │
│  │  │  • RETORNA: CreativeDirection (NÃO aproveitado por composeVar)    │ │ │
│  │  │    • version: 1                                                   │ │ │
│  │  │    • familyId (ex: "neo-brutalist", "editorial")                  │ │ │
│  │  │    • paletteId (ex: "cyberpunk", "sunset")                        │ │ │
│  │  │    • paletteInverted: boolean                                      │ │ │
│  │  │    • seed: número determinístico                                   │ │ │
│  │  │    • axes: { composition, typography, color, ornaments... }       │ │ │
│  │  │    • hiddenOrnaments: { badge, stickerText, accentBar }           │ │ │
│  │  │                                                                     │ │ │
│  │  │  composeVariation (aplica apenas designTokens, sem dir criativo): │ │ │
│  │  │  • Enriquece variação com:                                         │ │ │
│  │  │    - chameleonDesignTokens (cores, fontes, bordas)               │ │ │
│  │  │    - copyAngle (tipo, label, badge, stickerText)                  │ │ │
│  │  │  • Garante fields obrigatórios:                                     │ │ │
│  │  │    - headline, body, caption, hashtags, callToAction              │ │ │
│  │  │    - backgroundColor, textColor, accentColor                       │ │ │
│  │  │    - layout, aspectRatio, platform                                 │ │ │
│  │  │    - postMode, slides (se carousel)                                │ │ │
│  │  │    - designTokens, generationMeta                                  │ │ │
│  │  │  • RETORNA: PostVariation completa                                 │ │ │
│  │  └─────────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 11: VALIDAÇÃO FINAL                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  validateVariationSet(generatedVariations, postMode)                   │ │
│  │  → Verifica:                                                           │ │
│  │    • Exatamente 3 variações                                            │ │
│  │    • Todas completas (headline, body, caption, CTA...)               │ │
│  │    • Distintas entre si (sem duplicatas)                              │ │
│  │    • IF carousel: 5 slides por variação                               │ │
│  │    • IF static: sections válidas (se template estruturado)            │ │
│  │  → RETORNA: { valid: boolean, errors: string[] }                      │ │
│  │                                                                         │ │
│  │  IF !valid:                                                            │ │
│  │  → throw TRPCError("BAD_GATEWAY", "A IA não conseguiu produzir...")    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 12: PERSISTÊNCIA E RETORNO                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  persistCandidateFingerprints()                                        │ │
│  │  → Salva no DB:                                                        │ │
│  │    • generationRunId                                                   │ │
│  │    • userUuid                                                          │ │
│  │    • candidates (variações finais)                                     │ │
│  │    • embeddings (vetores de originalidade)                            │ │
│  │    • assessments (scores de similaridade)                             │ │
│  │                                                                         │ │
│  │  finishGenerationTrace()                                                │ │
│  │  → Atualiza trace com:                                                 │ │
│  │    • status: "completed"                                               │ │
│  │    • strategies, evaluations, revisionCount                            │ │
│  │    • output: generatedVariations                                       │ │
│  │    • durationMs                                                        │ │
│  │                                                                         │ │
│  │  appendOperationalLog("POST_GENERATION_COMPLETED")                      │ │
│  │  → Log operacional com:                                                │ │
│  │    • generationRunId, userUuid, durationMs                             │ │
│  │    • inputType, platform, postMode, creationMode                       │ │
│  │    • effectiveModels[], llmCalls[]                                     │ │
│  │    • variationCount, revisionCount                                      │ │
│  │    • outputSummary (variações geradas)                                 │ │
│  │                                                                         │ │
│  │  RETORNA PARA CLIENTE:                                                 │ │
│  │  {                                                                      │ │
│  │    variations: PostVariation[],  // 3 variações completas               │ │
│  │    generationRunId: string,                                            │ │
│  │    debug?: GenerationDebugTrace  // opcional, se input.debug=true      │ │
│  │  }                                                                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLIENTE (HoloDeck → Workbench)                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  HoloDeck.tsx recebe variations[]                                     │ │
│  │  → Renderiza 3 cards visuais (PostCardV2)                             │ │
│  │  → Usuário seleciona uma variação                                     │ │
│  │  → editorStore.loadSnapshot(variation)                                │ │
│  │  → WorkbenchV2 abre com:                                               │ │
│  │    • Canvas interativo (CanvasWorkspace)                              │ │
│  │    • Controles de edição (DesignBlock, FontColorBlock, etc.)          │ │
│  │    • Preview em tempo real (PostRenderer)                             │ │
│  │    • Exportação (html2canvas → PNG)                                   │ │
│  │                                                                         │ │
│  │  SAVE: post.save (tRPC mutation)                                       │ │
│  │  → createPost({ variationSnapshot, userUuid })                        │ │
│  │  → Salva no DB (Supabase)                                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 3. GARGALOS DE CONTEXTO

### Onde a Copy é Gerada?

**RESPOSTA**: A copy é gerada em **3 estágios progressivos**:

1. **Geração Inicial (Fase 4 - Slot Generation)**
   - Cada slot gera headline, body, caption inicial, hashtags, CTA
   - A caption é gerada como "legenda INICIAL curta (1-2 frases)"
   - System prompt instrui: "Esta legenda será substituída por uma versão mais rica e coerente em um passo dedicado posterior"

2. **Síntese de Caption (Fase 9 - Caption Synthesis)**
   - `synthesizeCaptionsForVariations()` analisa slides/seções FINAIS
   - Garante coerência numérica (ex: "5 dicas" se houver 5 slides)
   - Enriquece a legenda com contexto + emoji + CTAs
   - **OCORRE APÓS REVISÃO**, quando o conteúdo visual está estável
   - 3 chamadas LLM paralelas (Promise.all), uma por variação

3. **Revisão Cirúrgica (Fase 8 - Evaluation/Revision)**
   - Se uma variação é rejeitada, o revisor corrige caption junto com o resto
   - Garante que a caption revisada também seja coerente com slides/seções

### Quando Contexto é Injetado?

**RESPOSTA**: Contexto é injetado em **4 pontos críticos**:

1. **Antes da Estratégia (Fase 2-3)**
   - `siteIntelligence.evidence[]` → usado em `planContentStrategies()`
   - `brandDnaContext` → injetado no system prompt da Fase 4

2. **Durante a Geração (Fase 4)**
   - `generationPlan.promptContext` → incluído em cada slot prompt
   - `brandDnaContext` → cores, psicoologia, ritmo visual
   - `executionBrief` → briefing completo (se modo execution)

3. **Durante a Revisão (Fase 8)**
   - `strategies.selected[index]` → contrato estratégico do slot
   - `evaluation.feedback[]` → usado para revisão cirúrgica

4. **Durante a Síntese (Fase 9)**
   - `strategies.selected` → usados para contextualizar caption
   - `tone` → tom desejado da legenda

5. **Antes da Evaluation (Fase 7 — Originality → Fase 8)**
   - `originality.assessments[].score` → alimenta a dimensão originality da evaluation

### Onde Contexto é Gargalo?

**RESPOSTA**: Os **principais gargalos** são:

1. **SiteIntelligence Cache (Fase 2)**
   - Se `siteIntelligenceId` fornecido, carrega do cache
   - Se não, faz análise completa (demorada)
   - **Gargalo**: usuários repetitivos pagam custo extra

2. **LLM Calls (Fases 3-9)**
   - Slot 1, 2, 3 → paralelos (Promise.all) ✅
   - Evaluation → paralela (Promise.all, 3 calls simultâneas) ✅
   - Revision → paralela (Promise.all, só se rejeitada) ✅
   - Caption Synthesis → 3 chamadas paralelas independentes (Promise.all) ✅

3. **Embeddings de Originalidade (Fase 7)**
   - Gemini Embedding API (não é LLM) — uma chamada para todos os textos ✅
   - Cosine similarity calculada matematicamente (sem custo de LLM)
   - Pode rodar 2x se houve revisões (Fase 9b)

---

## 📊 4. DIAGRAMA DE FLUXO ATUAL

### Arquitetura de Chamadas LLM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CHAMADAS LLM (ordem de execução)                                           │
└─────────────────────────────────────────────────────────────────────────────┘

[1] contentStrategy (Fase 3)
    → Task route: "content_strategy"
    → Max tokens: 1024
    → Output: 5 estratégias de conteúdo
    → SEQUENCIAL (1 call LLM)

[2] post_generation_1 (Fase 4)
    → Task route: "static_generation" | "carousel_generation"
    → Max tokens: 4096 (carousel) | 3072 (static)
    → Output: PostVariation 1
    → PARALELO (com 2 e 3)

[2] post_generation_2 (Fase 4)
    → Task route: "static_generation" | "carousel_generation"
    → Max tokens: 4096 (carousel) | 3072 (static)
    → Output: PostVariation 2
    → PARALELO (com 1 e 3)

[2] post_generation_3 (Fase 4)
    → Task route: "static_generation" | "carousel_generation"
    → Max tokens: 4096 (carousel) | 3072 (static)
    → Output: PostVariation 3
    → PARALELO (com 1 e 2)

[3] lexical_diversification (Fase 6)
    → Task route: "static_generation" | "carousel_generation"
    → Max tokens: 4096
    → Output: 3 variações diversificadas
    → CONDICIONAL (só se variationsNeedDiversification)
    → SEQUENCIAL (1 call LLM)

[4] semantic_originality (Fase 7) ⚠️ NÃO É LLM — é Gemini Embedding API
    → API: gemini-embedding-001
    → Output: vetores de embedding (768d) + cosine similarity
    → 1 chamada batch para todos os textos
    → Pode rodar novamente pós-revisão (Fase 9b)

[5] post_evaluation_1 (Fase 8)
    → Task route: "post_evaluation"
    → Max tokens: 2048
    → Output: Evaluation da variação 1
    → PARALELO (com evaluations 2 e 3 via Promise.all)

[5] post_evaluation_2 (Fase 8)
    → Task route: "post_evaluation"
    → Max tokens: 2048
    → Output: Evaluation da variação 2
    → PARALELO (com evaluations 1 e 3 via Promise.all)

[5] post_evaluation_3 (Fase 8)
    → Task route: "post_evaluation"
    → Max tokens: 2048
    → Output: Evaluation da variação 3
    → PARALELO (com evaluations 1 e 2 via Promise.all)

[6] quality_revision_N (Fase 8)
    → Task route: "quality_revision"
    → Max tokens: 3072 (carousel) | 2048 (static)
    → Output: PostVariation revisada
    → CONDICIONAL (só se evaluation.accepted === false)
    → PARALELO (Promise.all entre revisions)

[7] caption_synthesis (Fase 9)
    → Task route: "caption_synthesis"
    → Max tokens: 1024 por call
    → Output: 1 caption enriquecida por call
    → PARALELO (3 chamadas independentes via Promise.all)

TOTAL DE CHAMADAS LLM: 8-11 calls (mínimo sem diversification/sem revisions)
  = 1 content_strategy + 3 slots + 3 evaluations + 3 captions = ~10
  + 1 diversification (condicional) + N revisions (condicional)
CHAMADAS DE EMBEDDING: 1-2 (Fase 7, +1 se Fase 9b)
ONDAS DE PARALELISMO: ~4 ondas (estratégia → slots → eval+caption → revisions condicionais)
TEMPO ESTIMADO: 15-30 segundos (dependendo de model e revisões)
```

### Otimizações Atuais

1. ✅ **Slot-based generation paralela** (3 variações simultâneas)
2. ✅ **Evaluation + Revision em paralelo** (Promise.all, não sequencial)
3. ✅ **Caption synthesis paralela** (3 chamadas independentes via Promise.all)
4. ✅ **Semantic originality via Embedding API** (não LLM, zero custo de inferência)
5. ✅ **Brand Visual Guardian determinístico** (sem LLM)
6. ✅ **Avaliação híbrida determinística + LLM** (determinístico sempre roda; LLM é blend opcional)
7. ⚠️ **Originality roda antes da evaluation** (alimenta scores) e pode rodar 2x pós-revisão

---

## 🎨 5. FLUXO DE DADOS: COPY → VISUAL

```
COPY BRUTA (IDEIA DO USUÁRIO)
    ↓
CONTEXTUALIZAÇÃO (SiteIntelligence / BrandDNA)
    ↓
ESTRATÉGIA (5 estratégias → 3 selecionadas)
    ↓
SLOT GENERATION (3 variações em paralelo)
    ↓
    ├─ VARIATION 1:headline, body, caption_inicial, hashtags, CTA
    ├─ VARIATION 2:headline, body, caption_inicial, hashtags, CTA
    └─ VARIATION 3:headline, body, caption_inicial, hashtags, CTA
    ↓
BRAND VISUAL GUARDIAN (cores determinísticas)
    ↓
DIVERSIFICATION (se necessário)
    ↓
ORIGINALIDADE SEMÂNTICA 1ª PASSAGEM (embeddings → cosine similarity)
    ↓
EVALUATION (LLM-as-Judge + determinístico, 9 dimensões, paralelo)
    ↓
REVISION (se rejeitado, corrige copy + visual, paralelo)
    ↓
CAPTION SYNTHESIS (3 chamadas LLM paralelas, enriquece caption baseado em slides/seções FINAIS)
    ↓
ORIGINALIDADE SEMÂNTICA 2ª PASSAGEM (se houve revisões)
    ↓
MOTOR DE VARIABILIDADE (aplica design tokens + eixos visuais)
    ↓
VARIATION FINAL
    ├─ headline, body, caption (final), hashtags, CTA
    ├─ backgroundColor, textColor, accentColor
    ├─ layout, aspectRatio, template, sections/slides
    ├─ designTokens (CSS tokens da marca)
    ├─ creativeDirection (eixos visuais: composition, typography, color...)
    └─ copyAngle (tipo, label, badge, stickerText)
```

---

## 🔧 6. ARQUIVOS CHAVE DO SISTEMA

### Backend (Server)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `server/routers.ts` | Endpoint `post.generate`, pipeline completa |
| `server/ai/contentStrategy.ts` | Planejamento de 5 estratégias → 3 selecionadas |
| `server/ai/generationPipeline.ts` | Preparação do plano de geração + contexto estratégico |
| `server/ai/postGenerator.ts` | `buildStrategyGenerationContext()` — injeta contratos no prompt |
| `server/ai/postEvaluation.ts` | LLM-as-Judge (9 dimensões, híbrido determinístico+LLM) |
| `server/ai/captionSynthesis.ts` | Síntese de legendas coerentes (3 calls paralelas) |
| `server/ai/brandVisualGuardian.ts` | Validação visual determinística (WCAG + paleta, snap apenas) |
| `server/ai/semanticOriginality.ts` | Anti-plágio via Gemini Embedding API + cosine similarity |
| `server/ai/variationDiversity.ts` | Detecção de similaridade entre variações (Jaccard) |
| `server/ai/generationValidation.ts` | `validateVariationSet()` — validação final do output |
| `server/ai/generationTrace.ts` | Trace de debugging da execução completa |
| `server/siteIntelligence.ts` | Análise completa de site (negócio + editorial) |
| `server/brandDNA.ts` | Extração multi-página de identidade visual |
| `server/chameleonVision.ts` | Análise visual direta (screenshot → CSS tokens) |
| `server/_core/llm.ts` | Interface unificada para Groq, OpenRouter, Gemini |
| `server/billing.ts` | Debitamento de Sparks + Stripe integration |

### Frontend (Client)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `client/src/components/views/HoloDeck.tsx` | Galeria de 3 variações |
| `client/src/components/views/WorkbenchV2/WorkbenchV2.tsx` | Editor visual interativo |
| `client/src/store/editorStore.ts` | Estado global do editor (Zustand) |
| `client/src/lib/variationSnapshot.ts` | Criação de snapshot versão 3 |
| `client/src/components/views/WorkbenchV2/blocks/*` | Blocos modulares de edição |

### Shared (Tipos + Schemas)

| Arquivo | Responsabilidade |
|---------|-----------------|
| `shared/postspark.ts` | Tipos principais (PostVariation, SiteIntelligence, etc.) |
| `shared/postsparkSchemas.ts` | Schemas Zod de validação |
| `shared/creative/compose.ts` | Motor de variabilidade criativa |

---

## 💡 7. INSIGHTS DE PERFORMANCE

### Onde Estão os Gargalos?

1. **Site Intelligence (Fase 2)**
   - Multi-page screenshots (demorado)
   - Análise LLM por página
   - **Oportunidade**: Cache agressivo + pré-extração

2. **Caption Synthesis (Fase 9)**
   - 3 chamadas LLM paralelas (já otimizado com Promise.all)
   - Mas depende do conteúdo final estar estável
   - **Oportunidade**: Pré-calcular durante generation

3. **Dual-pass de Originality (Fases 7 + 9b)**
   - Roda 2x se houve revisões (custo extra de embedding API)
   - **Oportunidade**: Recalcular só se o conteúdo textual mudou significativamente

### Onde Está Bem Otimizado?

1. ✅ **Slot Generation Paralela** (3 variações simultâneas)
2. ✅ **Evaluation + Revision em Paralelo** (Promise.all, não sequencial)
3. ✅ **Caption Synthesis em Paralelo** (3 chamadas independentes)
4. ✅ **Semantic Originality via Embedding API** (sem custo de LLM)
5. ✅ **Brand Visual Guardian Determinístico** (sem LLM)
6. ✅ **Avaliação híbrida determinística + LLM** (determinístico sempre disponível como fallback)

### O Que Pode Melhorar?

1. **Cache de SiteIntelligence**
   - Usuários repetitivos não deveriam pagar custo extra
   - Implementar cache persistente por URL

2. **Caption Pré-sintetizada**
   - Começar síntese durante generation (não após revision)
   - Overlap computation

3. **Originality single-pass**
   - Evitar segunda passagem de embeddings pós-revisão quando mudanças textuais são mínimas
   - Comparar hash do texto antes/depois da revisão

4. **directCreative não aproveitado**
   - O resultado de `directCreative()` (linha 1607 de routers.ts) é computado mas nunca passado para `composeVariation()` (linha 1608)
   - Verificar se é bug ou código morto intencional

---

## 📝 8. RESUMO EXECUTIVO

### Entrada → Saída

```
INPUT: Ideia bruta (texto | URL | imagem)
    ↓
PIPELINE: 12 fases (estratégia → geração → originality → avaliação → caption synthesis → validação)
    ↓
OUTPUT: 3 variações completas (PostVariation[])
    ↓
RENDER: HoloDeck (cards) → Workbench (editor interativo)
```

### Chamadas LLM

- **Mínimo LLM**: ~10 calls (ideal, sem revisions/diversification)
  = 1 content_strategy + 3 slots + 3 evaluations + 3 captions
- **Máximo LLM**: 12+ calls (com revisions + diversification)
- **Embedding API**: 1-2 chamadas Gemini (gemini-embedding-001, não LLM)
- **Paralelas**: Slots (Fase 4), Evaluations (Fase 8), Revisions (Fase 8), Captions (Fase 9)
- **Sequenciais**: Content Strategy (Fase 3), Diversification (Fase 6, condicional)

### Context Injection Points

1. **SiteIntelligence** → Estratégia (Fase 3)
2. **BrandDNA** → System prompt (Fase 4)
3. **Strategies** → Slot prompts (Fase 4)
4. **Originality scores** → Evaluation (Fase 7 → Fase 8)
5. **Evaluations** → Revisions (Fase 8)
6. **Final Content** → Caption synthesis (Fase 9)

### Copy Generation Timeline

1. **Fase 4**: Geração inicial (headline, body, caption curta)
2. **Fase 8**: Revisão (se rejeitado, corrige copy)
3. **Fase 9**: Síntese final (3 calls paralelas, enriquece caption baseado em slides/seções)

---

**FIM DO MAPEAMENTO COMPLETO**
