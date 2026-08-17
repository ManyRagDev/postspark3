# Backlog — Capabilities do High Ticket não absorvidas

> Status: backlog — aguardando decisão de produto.
>
> Origem: `PLANO_CONCLUSAO_BLUEPIRNT.md` §6 (Fase D), entrega de 2026-07-14.
>
> Contexto: o pipeline paralelo High Ticket foi absorvido no canônico na Fase D
> (absorção mínima). Apenas o contexto enriquecido (BrandKit + Persona + context
> budget) e o intent router (3 ângulos ortogonais) foram portados. As
> capabilities abaixo ficaram de fora porque o pipeline canônico **já tem**
> equivalentes — mas podem oferecer valor incremental no futuro.

## Capabilities descartadas e seus equivalentes canônicos

### 1. Workers paralelos por ângulo (`workers.ts`)

**O que fazia:** uma chamada LLM por ângulo (3 chamadas paralelas via
`Promise.all`), cada uma produzindo um `WorkerPayload` atômico (copy + visual +
design tokens + multi-aspect-ratio optimizations).

**Equivalente canônico:** `post.generate` já faz `Promise.all` de 3 slots
paralelos (`routers.ts:~1149`), cada um com retry de 2 tentativas. Cada slot
serializa uma `ContentStrategy` como contrato e retorna exatamente 1 variação.

**Quando portar:** se a qualidade por-slot for insuficiente com o prompt
atual. O worker HT tinha prompt mais estruturado (SlimBriefing com brand/persona
explícitos) e produção de `aspectRatioOptimizations` para 3 formatos de uma vez.
Critério: medir qualidade A/B entre o slot canônico e o worker HT antes de
migrar.

### 2. QA evaluator própria (`qaEvaluator.ts`)

**O que fazia:** LLM-judge (`high_ticket_qa` route, default Claude 3.5 Sonnet)
scoring cada payload em 10 dimensões incluindo `layoutIntegrity`, com gate
`>=50`.

**Equivalente canônico:** `evaluateAndReviseCandidates` em
`server/ai/postEvaluation.ts` — já alinhado com `layoutIntegrity` (Fase A.4),
com hard gate `>=50`, pesos rebalanceados e feedback geométrico acionável.

**Quando portar:** se o modelo do juiz canônico (GPT-5 mini via OpenRouter)
for consistentemente inferior ao Claude 3.5 Sonnet do HT. Critério: comparar
concordância inter-judge em um conjunto de 50+ posts.

### 3. Correction loop (`correctionLoop.ts`)

**O que fazia:** LLM de revisão cirúrgica (`high_ticket_revision` route) para
payloads rejeitados, preservando `angleId` e partes aprovadas. Re-executava
originalidade após cada revisão.

**Equivalente canônico:** a closure `revise` passada a
`evaluateAndReviseCandidates` (`routers.ts:~1500`) + `validateRevisedCandidate`
(`revisionValidation.ts`). Já re-entra no funil de validação após revisão.

**Quando portar:** se a revisão canônica não preservar bem o ângulo/identidade
da variação durante correções. Critério: avaliar se revisões canônicas
"derrotem" a estratégia original em vez de corrigi-la cirurgicamente.

### 4. Visual contract validator (`visualContractValidator.ts`)

**O que fazia:** validação determinística (não-LLM) de payloads:
schema, headline/body length, forbidden terms, **WCAG contrast** via
`contrastRatio`, presença de 3 aspect-ratio optimizations, carousel=5 slides /
static=0-or-3 sections, split-layout imagePrompt.

**Equivalente canônico:** `validateVisualFit` em `@shared/visualFit` (opera
sobre snapshot pós-composição) + `applyVisualFitFallback` (corrige
automaticamente).

**Diferença de camada:** o HT validava o `WorkerPayload` **antes** do mapeamento
para `PostVariation`; o canônico valida o snapshot **depois** da composição.
O HT checava contraste WCAG explicitamente; o canônico tem `visualReadability`
(contrast ratio) no juiz, mas não como hard gate determinístico.

**Quando portar:** se contraste WCAG insuficiente estiver passando pelo juiz
canônico. Critério: portar o `contrastRatio` como hard gate determinístico em
`revisionValidation.ts` ou `generationValidation.ts`.

### 5. Final mapper (`finalMapper.ts`)

**O que fazia:** mapeamento puro de `WorkerPayload` → `PostVariation` com
metadados de QA/originality/revisão anexados. Não criava snapshot (snapshot
era responsabilidade de `createPostVisualSnapshot` no caller).

**Equivalente canônico:** `createPostVisualSnapshot` (fronteira canônica).
O mapper HT era redundante — apenas copiava campos.

**Quando portar:** nunca — era puramente adaptador do formato interno do HT.
Sem valor incremental.

### 6. Graph state persistido (`graph.ts` + `persist.ts`)

**O que fazia:** orquestração imperativa com estado transitório persistido a
cada nó em `generation_runs.graphState` (context, routing, workers, qa, output,
events, control).

**Equivalente canônico:** `server/ai/generationGraph/pipeline.ts` (grafo
declarativo com `runStateGraph`) — mas hoje é **shadow/audit only**, não
producer. O `finishGenerationTrace` + `createGenerationRun` persistem o run,
mas não um graphState estruturado por nó.

**Quando portar:** na Fase E do plano (formalizar schema Zod do grafo e
controle operacional do run). O `graphState` do HT é um modelo de como
persistir estado estruturado por nó.

---

## Resumo de prioridade

| Capability | Valor incremental | Esforço | Prioridade |
|---|---|---|---|
| WCAG contrast hard gate | Médio | Baixo | **Alta** — fácil de portar |
| Worker com aspectRatioOptimizations 3-formatos | Médio | Alto | Média |
| Juiz com Claude 3.5 Sonnet | Baixo (config) | Baixo | Média |
| Graph state persistido por nó | Alto | Alto | **Fase E** |
| Correction loop cirúrgica | Baixo | Médio | Baixa |
| Final mapper | Nenhum | — | Não portar |
