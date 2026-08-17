# Catálogo Completo do Fluxo LLM — Geração de Posts (VERSIÃO CORRIGIDA)

**Propósito:** Este documento cataloga exaustivamente o fluxo LLM do PostSpark, permitindo a reconstrução completa do sistema de geração.

**Data:** 2026-08-05  
**Versão:** 2.0 (Corrigida e Completa)

---

## ÍNDICE

1. [Arquitetura de Providers](#1-arquitetura-de-providers)
2. [Framework de Chamadas LLM](#2-framework-de-chamadas-llm)
3. [Rotas e Configurações por Tarefa](#3-rotas-e-configurações-por-tarefa)
4. [Pipeline de Geração Completo](#4-pipeline-de-geração-completo)
5. [Sistema de Retry e Resiliência](#5-sistema-de-retry-e-resiliência)
6. [Sistema de Fallback e Recovery](#6-sistema-de-fallback-e-recovery)
7. [Schemas de Saída Estruturada](#7-schemas-de-saída-estruturada)
8. [Validações Pós-LLM](#8-validações-pós-llm)
9. [Sistema de Trace e Auditoria](#9-sistema-de-trace-e-auditoria)
10. [Custos e Billing](#10-custos-e-billing)
11. [Contagem de Chamadas LLM](#11-contagem-de-chamadas-llm)
12. [Fluxo de Dados: Prompt → HoloDeck](#12-fluxo-de-dados-prompt--holodeck)

---

## 1. ARQUITETURA DE PROVIDERS

### 1.1 Providers Disponíveis

| Provider | Modelo | Uso Principal | Endpoint |
|----------|--------|---------------|----------|
| **OpenRouter** | `openai/gpt-5-mini` | Geração principal (texto, avaliação, revisão, caption) | `https://openrouter.ai/api/v1/chat/completions` |
| **Groq** | `openai/gpt-oss-120b` | Microcopy, texto rápido | `https://api.groq.com/openai/v1/chat/completions` |
| **Groq** | `meta-llama/llama-4-scout-17b-16e-instruct` | Fast vision (análise de imagem) | `https://api.groq.com/openai/v1/chat/completions` |
| **Google** | `gemini-2.5-flash` | Fallback global | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| **Forge** | `gemini-2.5-flash` | Fallback alternativo (self-hosted) | `{FORGE_API_URL}/v1/chat/completions` |

### 1.2 Configuração de Providers

**Arquivo:** `server/_core/llm.ts`

```typescript
// OpenRouter Configuration
function openRouterConfig(model: string): ProviderModelConfig {
  return {
    provider: "openrouter",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: ENV.openRouterApiKey,
    effectiveModel: model,
    headers: {
      "HTTP-Referer": ENV.openRouterSiteUrl,
      "X-Title": ENV.openRouterAppName,
    },
    providerOptions: {
      allow_fallbacks: true,
      data_collection: "deny",
    },
  };
}

// Groq Configuration
function groqConfig(model: string): ProviderModelConfig {
  return {
    provider: "groq",
    apiUrl: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: ENV.groqApiKey,
    effectiveModel: model,
  };
}

// Gemini/Forge Fallback Configuration
function resolveGeminiFallbackConfig(): ProviderModelConfig {
  if (ENV.geminiApiKey) {
    return {
      provider: "google",
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: ENV.geminiApiKey,
      effectiveModel: "gemini-2.5-flash",
    };
  }
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    return {
      provider: "forge",
      apiUrl: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: ENV.forgeApiKey,
      effectiveModel: "gemini-2.5-flash",
    };
  }
  throw new Error("Gemini fallback requires GEMINI_API_KEY or Forge configuration.");
}
```

---

## 2. FRAMEWORK DE CHAMADAS LLM

### 2.1 Arquitetura Central

**Arquivo:** `server/_core/llm.ts`

**Componente principal:** `invokeLLM(params: InvokeParams): Promise<InvokeResult>`

**Características:**
- HTTP direto via `fetch()` — sem SDK de terceiros
- Protocolo: OpenAI Chat Completions API (compatível com todos)
- JSON Schema nativo via `response_format.json_schema`
- Adaptação automática por provider
- Retry com exponential backoff
- Fallback automático para Gemini
- Sistema de trace completo

### 2.2 Tipos Principais

```typescript
type InvokeParams = {
  model?: AiModel;
  taskRoute?: AiTaskRoute;
  traceLabel?: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  temperature?: number;
  topP?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  maxCompletionTokens?: number;
  outputSchema?: JsonSchema;
  responseFormat?: ResponseFormat;
  disableFallback?: boolean;
};

type InvokeResult = {
  id: string;
  created: number;
  model: string;
  provider?: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
    native_finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
};
```

### 2.3 Normalização de Mensagens

**Funcionalidade:** `normalizeMessage(message: Message)`

**Processo:**
1. Detecta se conteúdo é string, array ou multipart
2. Colapsa texto único para string (compatibilidade)
3. Mantém array para multimodal (text + image)
4. Normaliza role/tool calls
5. Valida estrutura

---

## 3. ROTAS E CONFIGURAÇÕES POR TAREFA

### 3.1 Task Routes Disponíveis

**Arquivo:** `server/_core/llm.ts` e `server/ai/modelRouter.ts`

| Rota | Provider | Modelo | Temperatura | topP | Reasoning | Timeout |
|------|----------|--------|-------------|------|-----------|---------|
| `content_strategy` | OpenRouter | gpt-5-mini | 0.35 | 0.85 | minimal | 12s |
| `static_generation` | OpenRouter | gpt-5-mini | 0.40 | 0.85 | minimal | 35s |
| `carousel_generation` | OpenRouter | gpt-5-mini | 0.45 | 0.85 | low | 60s |
| `post_evaluation` | OpenRouter | gpt-5-mini | 0.25 | 0.85 | minimal | 20s |
| `quality_revision` | OpenRouter | gpt-5-mini | 0.30 | 0.85 | minimal | 25s |
| `caption_synthesis` | OpenRouter | gpt-5-mini | 0.50 | 0.90 | minimal | 25s |
| `microcopy` | Groq | gpt-oss-120b | - | - | - | - |
| `fast_vision` | Groq | llama-4-scout | - | - | - | - |
| `vision_analysis` | OpenRouter | (vision model) | - | - | - | - |
| `high_ticket_context_summary` | OpenRouter | (configurável) | - | - | - | - |
| `high_ticket_intent_router` | OpenRouter | (configurável) | - | - | - | - |

### 3.2 Configuração via Environment Variables

**Arquivo:** `server/_core/env.ts`

```typescript
ENV = {
  // Modelos
  openRouterTextModel: "openai/gpt-5-mini",
  openRouterVisionModel: "openai/gpt-5-mini",
  
  // High Ticket (Fase D)
  highTicketContextSummaryModel: "openai/gpt-5-mini",
  highTicketIntentRouterModel: "openai/gpt-5-mini",
  
  // Resiliência
  llmTransientRetries: 2,           // +1 = até 3 tentativas
  llmRetryBaseDelayMs: 700,          // Base para exponential backoff
  llmRequestTimeoutMs: 90_000,       // Timeout padrão (sobrescrito por rota)
  
  // Features
  aiContentStrategyEnabled: true,
  aiLlmJudgeEnabled: true,
  aiSemanticEmbeddingsEnabled: true,
  aiModelFallbackEnabled: true,
  aiTraceStoreContent: false,
}
```

---

## 4. PIPELINE DE GERAÇÃO COMPLETO

### Fase 0 — Billing & Reserva (Transacional)

**Arquivo:** `server/routers.ts` + `server/billing.ts`

```typescript
// 1. Calcular custo
const cost = input.postMode === "carousel" 
  ? SPARK_COSTS.CAROUSEL   // 40 ✦
  : SPARK_COSTS.GENERATE_TEXT;  // 10 ✦

// 2. Gerar chave idempotente
const idempotencyKey = deriveIdempotencyKey({
  userUuid: ctx.user.id,
  content: input.content,
  platform: input.platform,
  timestamp: Date.now(),
});

// 3. Reservar Sparks (transação ACID)
const reservation = await reserveSparks(
  profile, 
  cost, 
  idempotencyKey, 
  `Geração de post (${input.postMode})`
);

// Se insuficiente → TRPCError PAYMENT_REQUIRED
// Se sucesso → reservation.reservationId válido
```

**Tabela de Custos:**

| Operação | Custo (Sparks) | Descrição |
|----------|----------------|-----------|
| GENERATE_TEXT | 10 ✦ | 3 variações de texto |
| CAROUSEL | 40 ✦ | Carrossel completo (texto + imagem) |
| GENERATE_IMAGE | 25 ✦ | Imagem IA |
| REGEN_IMAGE | 10 ✦ | Regenerar imagem (mesma sessão) |
| CHAMELEON | 15 ✦ | ChameleonProtocol |

---

### Fase 1 — Carregamento de Contexto

```typescript
// 1. Site Intelligence (se fornecido)
if (ENV.aiSiteIntelligenceEnabled && input.siteIntelligenceId) {
  siteIntelligence = await loadSiteIntelligence(input.siteIntelligenceId, ctx.user.id);
}

// 2. Análise de site (se URL e sem intelligence)
if (ENV.aiSiteIntelligenceEnabled && siteUrl && !siteIntelligence) {
  const result = await analyzeSiteIntelligence(siteUrl, ctx.user.id);
  siteIntelligence = result.siteIntelligence;
}

// 3. Fallback: scrape direto
if (siteUrl && !siteIntelligence) {
  const scrapeResult = await scrapeSiteUrl(siteUrl);
  contextContent = `URL: ${siteUrl}\nTitulo: ${scrapeResult.title}...`;
}
```

---

### Fase 2 — Content Strategy (LLM #1)

**Arquivo:** `server/ai/contentStrategy.ts`

```typescript
const generationPlan = await prepareGenerationPlan({
  sourceContent: contextContent,
  siteIntelligence,
  executionBrief: normalizedExecutionBrief,
});
```

**Rota:** `content_strategy` (OpenRouter, gpt-5-mini, 0.35, 12s timeout)

**Saída:** 5 candidatos de estratégia → scored → 3 selecionados

**Fallback (sem LLM):**
```typescript
function buildFallbackCandidates(sourceContent, objective, intelligence) {
  // Gerar 5 estratégias determinísticas baseadas em:
  // - topics extraídos do conteúdo
  // - ANGLES fixos ["pain", "benefit", "objection", "authority", "story", "myth", "how-to"]
  // - audiences do intelligence ou ["publico principal"]
  // - evidenceIds do intelligence
  return Array.from({ length: 5 }, (_, index) => ({
    title: `${topic} por ${angle}`,
    topic, objective, audience, angle,
    hook: `${topic}: o ponto que merece atencao agora`,
    promise: intelligence?.business.valueProposition || "Entregar uma perspectiva util e acionavel.",
    evidenceIds: evidenceIds.slice(index % 2, index % 2 + 2),
  }));
}
```

---

### Fase 3 — Intent Router (LLM #2, modo execution)

**Arquivo:** `server/ai/intentRouter.ts`

**Condição:** `input.creationMode === "execution"` e `normalizedExecutionBrief` existe

```typescript
if (input.creationMode === "execution" && normalizedExecutionBrief) {
  // 1. Carregar contexto enriquecido (BrandKit + Persona + SiteIntelligence)
  const briefing = await loadGenerationContext({...});
  
  // 2. Router determina 3 ângulos ortogonais
  const routing = await routeHighTicketIntent(briefing);
  
  // 3. Converter ângulos em estratégias
  const intentStrategies = routing.angles.map(angleToStrategy);
  
  // 4. Substituir estratégias selecionadas
  generationPlan.strategies.selected = intentStrategies;
}
```

**Rota:** `high_ticket_intent_router` (OpenRouter, modelo configurável)

**Saída:** 3 ângulos ortogonais (story/authority/objection)

**Fallback:**
```typescript
function fallbackRouter(briefing: MasterBriefing): RouterOutput {
  return {
    intent: { objective, confidence: 0.55, rationale: "..." },
    angles: [
      { angleId: "angle-story", mechanism: "story", thesis: "Mostrar transformacao...", ... },
      { angleId: "angle-authority", mechanism: "authority", thesis: "Posicionar com criterio...", ... },
      { angleId: "angle-objection", mechanism: "objection", thesis: "Quebrar objecao...", ... },
    ],
  };
}
```

---

### Fase 4 — Context Loader (modo execution)

**Arquivo:** `server/ai/contextLoader.ts` (integração via `loadGenerationContext`)

**Funcionalidade:**
- Carregar BrandKit (paleta, tipografia, tom de voz)
- Carregar Persona (públicos, objetivos, dores)
- Carregar SiteIntelligence (evidências, temas)
- Aplicar context budget (limitar tokens por contexto)
- Montar MasterBriefing com contexto consolidado

---

### Fase 5 — Geração Principal (LLM #3, #4, #5 — paralelo)

**Arquivo:** `server/routers.ts` (linhas ~1184-1316)

```typescript
// 3 chamadas paralelas (uma por estratégia selecionada)
const slotResponses = await Promise.all(
  generationPlan.strategies.selected.map(async (strategy, index) => {
    const slotPrompt = `${userPrompt}\n\nTAREFA DESTE AGENTE:\n- Gere somente a variacao ${index + 1} de 3.\n- Execute exclusivamente este contrato estrategico:\n${JSON.stringify(strategy, null, 2)}\n- Nao misture os outros angulos.\n- Retorne um array "variations" com exatamente 1 item.`;
    
    const generateSlot = async (attempt: number) => {
      const userContent = (input.inputType === "image" && (input.imageUrl || input.content))
        ? [
            { type: "text", text: attempt === 1 ? slotPrompt : `${slotPrompt}\n\nA tentativa anterior retornou um item ausente ou incompleto. Preencha todos os campos obrigatorios do schema sem alterar o contrato estrategico.` },
            { type: "image_url", image_url: { url: input.imageUrl || input.content, detail: "high" } },
          ]
        : attempt === 1
          ? slotPrompt
          : `${slotPrompt}\n\nA tentativa anterior retornou um item ausente ou incompleto. Preencha todos os campos obrigatorios do schema sem alterar o contrato estrategico.`;
      
      const response = await invokeLLM({
        traceLabel: attempt === 1 ? `post_generation_${index + 1}` : `post_generation_${index + 1}_retry`,
        taskRoute: isCarousel ? "carousel_generation" : "static_generation",
        model: input.model as any,
        maxCompletionTokens: attempt === 1
          ? isCarousel ? 4096 : 3072
          : isCarousel ? 3072 : 2048,
        messages: [
          { role: "system", content: slotSystemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: `post_variation_${index + 1}`,
            strict: true,
            schema: { type: "object", properties: { variations: {...} }, required: ["variations"], additionalProperties: false },
          },
        },
      });
      
      return response.choices[0].message.content;
    };
    
    // 1ª tentativa
    const firstAttempt = await generateSlot(1);
    
    // 2ª tentativa (retry targeted) se incompleto
    if (isIncomplete(firstAttempt)) {
      return await generateSlot(2);
    }
    
    return firstAttempt;
  })
);
```

**maxCompletionTokens por tentativa:**

| Rota | Tentativa 1 | Tentativa 2+ |
|------|------------|--------------|
| Estático | 3072 | 2048 |
| Carrossel | 4096 | 3072 |

**Saída:** 3 PostVariation (headline, body, caption, colors, layout, slides/sections, copyAngle, aspectRatioOptimizations)

---

### Fase 6 — Brand Visual Guardian (determinístico, sem LLM)

**Arquivo:** `server/ai/brandVisualGuardian.ts`

**Funcionalidades:**
- Snap backgroundColor/accentColor para paleta da marca
- Garantir WCAG >= 4.5:1 contraste texto/fundo
- Aplicar mesma regra em aspectRatioOptimizations

---

### Fase 7 — Diversificação (LLM #6, condicional)

**Arquivo:** `server/routers.ts`

```typescript
// Detectar similaridade
const needsDiversification = variationsNeedDiversification(variations);

if (needsDiversification) {
  // Reescrever as 3 variações para maior diversidade
  const diversified = await invokeLLM({
    taskRoute: isCarousel ? "carousel_generation" : "static_generation",
    // ... prompt de diversificação
  });
  
  variations = diversified.variations;
}
```

**Critério:** Similaridade Jaccard > 0.6 entre variações

---

### Fase 8 — Originalidade Semântica

**Arquivo:** `server/ai/semanticOriginality.ts`

```typescript
const initialOriginality = await assessSemanticOriginality({
  candidates: variations,
  siteEvidence: siteIntelligence?.evidence ?? [],
  recentPosts: recentPostHistory ?? [],
});
```

**Implementação:**
- Embeddings: `gemini-embedding-001` (Google GenAI SDK)
- Fallback: `fallbackEmbedding()` — hash SHA256-based determinístico
- Compara candidatos entre si
- Compara com site evidence
- Compara com histórico de posts

---

### Fase 9 — Avaliação & Revisão (LLM #7 + loop)

**Arquivo:** `server/ai/postEvaluation.ts`

**Avaliação determinística (10 dimensões):**
```typescript
const dimensions = {
  brandAlignment: number;      // 0-100
  objectiveAlignment: number;   // 0-100
  audienceRelevance: number;   // 0-100
  factuality: number;          // 0-100
  originality: number;         // 0-100
  clarity: number;             // 0-100
  platformFit: number;         // 0-100
  visualReadability: number;   // 0-100
  captionCoherence: number;    // 0-100
  layoutIntegrity: number;     // 0-100
};
```

**Avaliação LLM (condicional):**
```typescript
if (ENV.aiLlmJudgeEnabled) {
  const llmJudgment = await invokeLLM({
    taskRoute: "post_evaluation",
    // ...
  });
  
  // Peso: 45% determinístico + 55% LLM
  finalScore = (deterministic * 0.45) + (llmJudgment * 0.55);
}
```

**Loop de revisão (máx 2 rounds):**
```typescript
const evaluationPipeline = await evaluateAndReviseCandidates({
  candidates: variations,
  platform: input.platform,
  siteIntelligence,
  recentPosts: recentPostHistory,
  strategies: generationPlan.strategies.selected,
});

// Para cada candidato rejeitado:
for (const rejected of evaluationPipeline.rejected) {
  // Reescrever com quality_revision
  const revised = await invokeLLM({
    taskRoute: "quality_revision",
    // ...
  });
  
  // Validar revisão
  const validated = validateRevisedCandidate(revised);
  
  // Aplicar copy guards + brand guardian + visual fit
  variations[rejected.index] = validated;
}
```

---

### Fase 10 — Caption Synthesis (LLM #8)

**Arquivo:** `server/ai/captionSynthesis.ts`

```typescript
const finalCaptions = await synthesizeCaptionsForVariations({
  variations: finalVariations,
  platform: input.platform,
  tone: effectiveTone,
  strategies: generationPlan.strategies.selected,
  isCarousel,
});
```

**Rota:** `caption_synthesis` (OpenRouter, 0.50, 25s timeout)

**Funcionalidade:**
- Extrai conteúdo visual real (slides/sections/headline+body)
- Gera legenda coerente com o que está no post visual
- **Fallback:** mantém caption original

---

### Fase 11 — Visual Diversity Plan (determinístico)

**Arquivo:** `shared/creative/compose.ts`

```typescript
const visualPlan = composeVisualDiversityPlan({
  variations: finalVariations,
  platform: input.platform,
  aspectRatio: input.aspectRatio,
});
```

**Saída:** CreativeDirection (familyId, paletteId, axes)

---

### Fase 12 — Snapshot Frozen

```typescript
// Criar snapshot autoritativo
const snapshot = createPostVisualSnapshot(finalVariations);

// Validar consistência
validateVariationSet(snapshot);

// Auditoria paralela (shadow graph)
if (ENV.aiGraphShadowEnabled) {
  runGenerationShadowGraph({...});
}
```

---

### Fase 13 — Persistência & Retorno

```typescript
// 1. Persistir embeddings (fingerprints)
await persistCandidateFingerprints(finalVariations, generationTrace.id);

// 2. Finalizar trace
await finishGenerationTrace(generationTrace.id);

// 3. Commit de Sparks (débito definitivo)
await commitSparkReservation(reservation.reservationId, generationTrace.id);

// 4. Retorno
return {
  variations: snapshot,  // PostVisualSnapshot[]
  generationRunId,
  debug: ENV.aiUiDebugEnabled ? generationTrace : undefined,
};
```

---

## 5. SISTEMA DE RETRY E RESILIÊNCIA

### 5.1 Loop de Retry Completo

**Arquivo:** `server/_core/llm.ts` (linhas 790-906)

```typescript
const executeWithRetries = async (
  config: ProviderModelConfig,
  fallbackFrom?: string,
): Promise<InvokeResult> => {
  const buildAdaptedRequest = (forceTextSchema = false) =>
    adaptRequestForProvider({
      provider: config.provider,
      effectiveModel: config.effectiveModel,
      forceTextSchema,
      messages: normalizedMessages,
      responseFormat: normalizedResponseFormat,
    });
  
  let adapted = buildAdaptedRequest();
  let lastError: unknown;
  let maxAttempts = ENV.llmTransientRetries + 1;  // +1 = tentativa inicial
  let downgradedNativeSchema = false;
  
  // Loop de tentativas
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    const payload = buildPayload(config, adapted.messages, adapted.responseFormat);
    
    try {
      // 1. Chamada ao provider
      const result = await callProvider(config, payload);
      
      // 2. Validação de schema estruturado
      if (adapted.schema) {
        const content = responseText(result);
        const validation = validateStructuredContent(content, adapted.schema);
        
        if (!validation.valid) {
          const structuredFailureType = classifyStructuredFailure(result, validation.errors);
          
          // 3. Tentar repair se apropriado
          if (shouldAttemptStructuredRepair(structuredFailureType)) {
            return await repairGroqOutput({
              config,
              adapted,
              invalidContent: content,
              errors: validation.errors,
              fallbackFrom,
            });
          }
          
          // 4. Se não repairável, falhar
          throw new StructuredOutputError(structuredFailureType, "...");
        }
      }
      
      // 5. Sucesso - registrar e retornar
      estimateAndRecord({ config, result, adaptedMessages: adapted.messages, startedAt, attempt, ... });
      return result;
      
    } catch (error) {
      lastError = error;
      
      // 6. Registrar erro
      estimateAndRecord({ config, adaptedMessages: adapted.messages, startedAt, attempt, error, ... });
      
      // 7. Downgrade de schema (Groq)
      if (shouldDowngradeGroqSchema(error, config, adapted) && !downgradedNativeSchema) {
        adapted = buildAdaptedRequest(true);  // Force text_schema
        downgradedNativeSchema = true;
        maxAttempts += 1;  // Tentativa extra
        continue;
      }
      
      // 8. Verificar se deve continuar retry
      if (attempt >= maxAttempts || !isTransientProviderError(error)) {
        throw error;
      }
      
      // 9. Exponential backoff + jitter
      const providerDelay = error instanceof ProviderRequestError ? error.retryAfterMs : undefined;
      await sleep(Math.max(retryDelayMs(attempt), providerDelay ?? 0));
    }
  }
  
  throw lastError;
};
```

### 5.2 Exponential Backoff + Jitter

```typescript
function retryDelayMs(attempt: number): number {
  const exponential = ENV.llmRetryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.round(Math.random() * ENV.llmRetryBaseDelayMs * 0.35);
  return exponential + jitter;
}
```

**Configuração padrão:**
- `ENV.llmRetryBaseDelayMs = 700ms`
- `ENV.llmTransientRetries = 2`

**Exemplo:**
- Attempt 1: 700ms + jitter (±245ms)
- Attempt 2: 1400ms + jitter (±490ms)
- Attempt 3: 2800ms + jitter (±980ms)

### 5.3 Detecção de Erros Transientes

```typescript
function isTransientStatus(status: number | undefined): boolean {
  return status === 408 ||    // Request Timeout
         status === 429 ||    // Too Many Requests
         status === 500 ||    // Internal Server Error
         status === 502 ||    // Bad Gateway
         status === 503 ||    // Service Unavailable
         status === 504;      // Gateway Timeout
}

function isTransientProviderError(error: unknown): boolean {
  return error instanceof ProviderRequestError &&
         (error.status === undefined || isTransientStatus(error.status));
}
```

---

## 6. SISTEMA DE FALLBACK E RECOVERY

### 6.1 Fallback de Provider

```typescript
// Após esgotar retries no provider primário
try {
  return await executeWithRetries(primaryConfig);
} catch (primaryError) {
  // Verificar se pode fazer fallback
  const canFallback =
    primaryConfig.provider !== "google" &&
    primaryConfig.provider !== "forge" &&
    !disableFallback &&
    ENV.aiModelFallbackEnabled &&
    canUseGeminiFallback() &&
    (!tools || tools.length === 0) &&  // Sem ferramentas
    isTransientProviderError(primaryError);
  
  if (!canFallback) {
    throw toPublicLlmError(primaryError);
  }
  
  // Tentar Gemini/Forge fallback
  try {
    const fallbackConfig = resolveGeminiFallbackConfig();
    return await executeWithRetries(fallbackConfig, primaryConfig.effectiveModel);
  } catch (fallbackError) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Os provedores de IA estao temporariamente indisponiveis. Tente novamente em alguns instantes.",
      cause: fallbackError,
    });
  }
}
```

### 6.2 Downgrade Automático de Schema (Groq)

```typescript
function shouldDowngradeGroqSchema(
  error: unknown,
  config: ProviderModelConfig,
  adapted: ReturnType<typeof adaptRequestForProvider>,
): boolean {
  return (
    config.provider === "groq" &&
    adapted.structuredOutputMode === "native_schema" &&
    error instanceof ProviderRequestError &&
    (error.status === 400 || error.status === 422)  // Bad Request / Unprocessable Entity
  );
}

// Quando detectado:
if (shouldDowngradeGroqSchema(error, config, adapted) && !downgradedNativeSchema) {
  adapted = buildAdaptedRequest(true);  // Force text_schema
  downgradedNativeSchema = true;
  maxAttempts += 1;  // +1 tentativa extra
  continue;
}
```

### 6.3 Repair de Output Estruturado

```typescript
const repairGroqOutput = async (input: {
  config: ProviderModelConfig;
  adapted: ReturnType<typeof adaptRequestForProvider>;
  invalidContent: string;
  errors: string[];
  fallbackFrom?: string;
}): Promise<InvokeResult> => {
  // 1. Criar prompt de reparo
  const repairMessages = buildRepairMessages({
    messages: input.adapted.messages,
    invalidContent: input.invalidContent,
    schema: input.adapted.schema,
    errors: input.errors,
  });
  
  // 2. Chamada de reparo
  const result = await callProvider(
    input.config,
    buildPayload(input.config, repairMessages, input.adapted.responseFormat ?? { type: "json_object" }),
  );
  
  // 3. Validar reparo
  const validation = validateStructuredContent(responseText(result), input.adapted.schema);
  if (!validation.valid) {
    throw new Error(`Structured output repair did not satisfy schema: ${validation.errors.join("; ")}`);
  }
  
  return result;
};
```

---

## 7. SCHEMAS DE SAÍDA ESTRUTURADA

### 7.1 Content Strategy Schema

```typescript
{
  name: "content_strategies",
  schema: {
    type: "object",
    properties: {
      strategies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            topic: { type: "string" },
            objective: { type: "string", enum: ["educate", "authority", "sell", "engage", "lead"] },
            audience: { type: "string" },
            angle: { type: "string", enum: ["pain", "benefit", "objection", "authority", "story", "myth", "how-to"] },
            hook: { type: "string" },
            promise: { type: "string" },
            evidenceIds: { type: "array", items: { type: "string" } },
            score: {
              type: "object",
              properties: {
                total: { type: "number" },
                topicRelevance: { type: "number" },
                objectiveAlignment: { type: "number" },
                evidenceGrounding: { type: "number" },
                distinctiveness: { type: "number" },
              },
              required: ["total", "topicRelevance", "objectiveAlignment", "evidenceGrounding", "distinctiveness"],
            },
          },
          required: ["id", "title", "topic", "objective", "audience", "angle", "hook", "promise", "evidenceIds", "score"],
        },
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ["strategies"],
  },
}
```

### 7.2 Post Variation Schema

```typescript
{
  name: `post_variation_${index}`,
  strict: true,
  schema: {
    type: "object",
    properties: {
      variations: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          properties: {
            headline: { type: "string", description: "Título principal do post" },
            body: { type: "string", description: "Corpo do post" },
            hashtags: { type: "array", items: { type: "string" } },
            callToAction: { type: "string", description: "Call-to-action" },
            caption: { type: "string", description: "Legenda para publicação" },
            tone: { type: "string", description: "Tom detectado" },
            imagePrompt: { type: "string", description: "Prompt em inglês para gerar imagem de fundo" },
            backgroundColor: { type: "string", description: "Cor de fundo hex" },
            textColor: { type: "string", description: "Cor do texto hex" },
            accentColor: { type: "string", description: "Cor de destaque hex" },
            layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
            aspectRatio: { type: "string", enum: ["1:1", "5:6", "9:16"] },
            
            // Estático ou Carrossel
            template: { type: "string" },
            sections: { type: "array", items: {...} },  // Estático
            slides: { type: "array", items: {...} },     // Carrossel
            
            aspectRatioOptimizations: {
              type: "object",
              properties: {
                "1:1": { $ref: "#/$defs/formatOptimization" },
                "5:6": { $ref: "#/$defs/formatOptimization" },
                "9:16": { $ref: "#/$defs/formatOptimization" },
              },
              required: ["1:1", "5:6", "9:16"],
            },
            
            copyAngle: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["dor", "beneficio", "objecao", "autoridade", "escassez", "storytelling", "mito_vs_verdade"] },
                label: { type: "string" },
                badge: { type: "string" },
                stickerText: { type: "string" },
              },
              required: ["type", "label", "badge", "stickerText"],
            },
          },
          required: ["headline", "body", "hashtags", "callToAction", "caption", "tone", "imagePrompt", "backgroundColor", "textColor", "accentColor", "layout", "aspectRatio", "aspectRatioOptimizations", "copyAngle"],
        },
      },
    },
    required: ["variations"],
  },
}
```

### 7.3 Post Evaluation Schema

```typescript
{
  name: "post_generation_evaluation",
  schema: {
    type: "object",
    properties: {
      dimensions: {
        type: "object",
        properties: {
          brandAlignment: { type: "number", minimum: 0, maximum: 100 },
          objectiveAlignment: { type: "number", minimum: 0, maximum: 100 },
          audienceRelevance: { type: "number", minimum: 0, maximum: 100 },
          factuality: { type: "number", minimum: 0, maximum: 100 },
          originality: { type: "number", minimum: 0, maximum: 100 },
          clarity: { type: "number", minimum: 0, maximum: 100 },
          platformFit: { type: "number", minimum: 0, maximum: 100 },
          visualReadability: { type: "number", minimum: 0, maximum: 100 },
          captionCoherence: { type: "number", minimum: 0, maximum: 100 },
          layoutIntegrity: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["brandAlignment", "objectiveAlignment", "audienceRelevance", "factuality", "originality", "clarity", "platformFit", "visualReadability", "captionCoherence", "layoutIntegrity"],
      },
      feedback: {
        type: "array",
        items: { type: "string" },
      },
      overallScore: { type: "number", minimum: 0, maximum: 100 },
    },
    required: ["dimensions", "feedback", "overallScore"],
  },
}
```

---

## 8. VALIDAÇÕES PÓS-LLM

### 8.1 Validções Determinísticas

```typescript
// 1. Sanitização de copy
applyDeterministicCopyGuards(variation);

// 2. Garantias visuais da marca
enforceBrandVisualGuardian(variation, brandPalette);
// - WCAG >= 4.5:1 contraste
// - Snap para paleta da marca

// 3. Validação de schema e consistência
validateVariationSet(variations);

// 4. Validação de ajuste visual
validateVisualFit(variation);
// - Overlap de elementos
// - Overflow de texto
// - Truncation

// 5. Detecção de similaridade
variationsNeedDiversification(variations);
// - Jaccard similarity > 0.6
```

### 8.2 Validções com LLM

```typescript
// Avaliação + Revisão
const evaluationPipeline = await evaluateAndReviseCandidates({
  candidates: variations,
  platform: input.platform,
  siteIntelligence,
  recentPosts: recentPostHistory,
  strategies: generationPlan.strategies.selected,
});

// Validação de candidato revisado
const validated = validateRevisedCandidate(revised);
```

---

## 9. SISTEMA DE TRACE E AUDITORIA

### 9.1 Registro de Chamadas LLM

**Arquivo:** `server/ai/generationTrace.ts`

```typescript
recordLlmTraceCall({
  label: "content_strategy",
  requestedModel: "openai/gpt-5-mini",
  taskRoute: "content_strategy",
  effectiveModel: "openai/gpt-5-mini",
  provider: "openrouter",
  promptHash: "abc123...",
  messages: [...],
  response: {...},
  promptTokens: 1234,
  completionTokens: 5678,
  totalTokens: 6912,
  latencyMs: 8500,
  estimatedCostUsd: 0.0123,
  attempt: 1,
  fallbackFrom: undefined,
  translatedSchema: false,
  structuredOutputMode: "native_schema",
  payloadOptions: { temperature: 0.35, top_p: 0.85, reasoning_effort: "minimal" },
  reasoningTokens: 0,
  finishReason: "stop",
  nativeFinishReason: "stop",
  contentLength: 12345,
  structuredFailureType: undefined,
  repairedOutput: false,
  error: undefined,
});
```

### 9.2 Registro de Eventos de Geração

```typescript
recordGenerationEvent({
  stage: "content_strategy",
  status: "completed",
  detail: "3 strategies selected.",
  data: generationPlan.strategies,
});
```

**Stages disponíveis:**
- `content_strategy`
- `intent_router`
- `post_generation`
- `brand_guardian`
- `diversification`
- `originality`
- `evaluation`
- `caption_synthesis`
- `visual_diversity`
- `snapshot`

### 9.3 Finalização de Trace

```typescript
await finishGenerationTrace(generationTrace.id);
```

**Armazena:**
- Todas as chamadas LLM
- Todos os eventos de geração
- Custo total em USD
- Latência total
- Status final

---

## 10. CUSTOS E BILLING

### 10.1 Custos de Modelos (por 1M tokens)

| Modelo | Input | Output | Platform Fee |
|--------|-------|--------|--------------|
| `openai/gpt-5-mini` | $0.25 | $2.00 | 5.5% |
| `openai/gpt-oss-120b` (Groq) | $0.00 | $0.00 | - |
| `meta-llama/llama-4-scout` (Groq) | $0.00 | $0.00 | - |
| `gemini-2.5-flash` | $0.30 | $2.50 | - |

### 10.2 Custos de Usuário (Sparks)

| Operação | Custo (Sparks) | Descrição |
|----------|----------------|-----------|
| GENERATE_TEXT | 10 ✦ | 3 variações de texto |
| CAROUSEL | 40 ✦ | Carrossel completo (texto + imagem) |
| GENERATE_IMAGE | 25 ✦ | Imagem IA |
| REGEN_IMAGE | 10 ✦ | Regenerar imagem (mesma sessão) |
| CHAMELEON | 15 ✦ | ChameleonProtocol |

### 10.3 Custo Estimado por Geração

**Estático (8-11 chamadas LLM):**
- Content Strategy: ~$0.002
- 3× Geração: ~$0.015
- Avaliação: ~$0.003
- 3× Caption: ~$0.006
- **Total: ~$0.026 USD**

**Carrossel (11-15 chamadas LLM):**
- Content Strategy: ~$0.002
- 3× Geração: ~$0.025
- Avaliação: ~$0.003
- 3× Caption: ~$0.008
- **Total: ~$0.038 USD**

---

## 11. CONTAGEM DE CHAMADAS LLM

### 11.1 Contagem por Fase

| Fase | Chamadas | Condicional | Notas |
|------|----------|-------------|-------|
| **Content Strategy** | 1 | Sempre | Ou fallback determinístico |
| **Intent Router** | 1 | Modo execution | Ou fallback determinístico |
| **Geração Principal** | 3 | Sempre | Paralelo |
| **Retry de Geração** | 0-3 | Se incompleto | Máx 1 por slot |
| **Diversificação** | 1 | Se similares | ~Jaccard > 0.6 |
| **Avaliação LLM** | 3 | Se aiLlmJudgeEnabled | Paralelo |
| **Revisão** | 1-6 | Se rejeitados | Máx 2 rounds × 3 |
| **Caption Synthesis** | 3 | Sempre | Paralelo |

### 11.2 Total Típico

**Cenário otimista (sem revisões):**
- Estático: 8 chamadas
- Carrossel: 8 chamadas

**Cenário realista (1-2 revisões):**
- Estático: 10-14 chamadas
- Carrossel: 10-14 chamadas

**Cenário pessimista (múltiplas revisões):**
- Estático: 12-17 chamadas
- Carrossel: 12-17 chamadas

---

## 12. FLUXO DE DADOS: PROMPT → HOLODECK

### 12.1 Frontend → Backend

```typescript
// Home.tsx
const { data } = await trpc.post.generate.mutateAsync({
  content: userPrompt,
  inputType: "text",
  platform: "instagram",
  postMode: "static",
  // ...
});
```

### 12.2 Backend → Frontend

```typescript
// routers.ts
return {
  variations: snapshot,  // PostVisualSnapshot[]
  generationRunId,
  debug: ENV.aiUiDebugEnabled ? generationTrace : undefined,
};
```

### 12.3 Frontend (HoloDeck)

```typescript
// Home.tsx
setAppState("holodeck");

// HoloDeck recebe PostVisualSnapshot[] como staging area
// Usuário seleciona variação → Workbench
```

---

## CONCLUSÃO

Este documento cataloga exaustivamente o fluxo LLM do PostSpark, incluindo:

✅ **Arquitetura completa** de providers e modelos  
✅ **Framework de chamadas** com retry e resiliência  
✅ **13 fases** do pipeline de geração  
✅ **Sistema de fallback** (Groq, Gemini,Forge)  
✅ **Schemas de saída** estruturada  
✅ **Validações** determinísticas e com LLM  
✅ **Sistema de trace** e auditoria  
✅ **Custos** (modelos e usuário)  
✅ **Contagem de chamadas** por cenário  

**Para reconstruir o sistema, siga a ordem das fases e implemente os mecanismos de resiliência descritos nas seções 5 e 6.**

---

**Documento mantido por:** Equipe PostSpark  
**Versão:** 2.0 (Corrigida)  
**Última atualização:** 2026-08-05