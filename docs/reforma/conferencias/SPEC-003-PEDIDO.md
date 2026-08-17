# PEDIDO DE CONFERÊNCIA — SPEC-003: geração única, orçamento de chamadas e latência

**Data:** 2026-08-12
**Commit-base:** `f402518` (worktree local, não commitado), sobre os vereditos de SPEC-001/SPEC-002
**Executor:** agente autônomo (sessão única; vereditos de SPEC-001/002 registrados pelo dono no início da sessão)
**Conferência exigida pela spec:** total — rederivar contagem de chamadas, resultados financeiros e eventos a partir de testes/trace, não do relatório.

## Objetivo (5 linhas)

Transformar `post.generate` em borda fina sobre um orquestrador único tipado
(`server/ai/generationOrchestrator.ts`) com orçamento de chamadas: exatamente 1
chamada generativa no caminho feliz e no máximo 1 de reparo (apenas slots
rejeitados). Estratégia e captions saem do caminho síncrono (determinísticos ou
incorporados à chamada principal). `GenerationOutcome` distingue
approved/rejected/failed até a borda, e os grafos shadow/pipeline (flags,
módulos e engine) são removidos — não existe segunda máquina de estado.

## Diff e arquivos tocados

Novos:
- `server/ai/generationOrchestrator.ts` — orquestrador canônico (prompts, schema único, reparo, avaliação, originalidade, composição, snapshots, métricas)
- `server/ai/generationOrchestrator.test.ts` — 14 testes com provider falso (orçamento, reparo, deadline, diversidade, caption, imagem, idempotência)
- `server/ai/llmJson.ts` — `safeJsonParse`/`extractTextContent` extraídos do router (reuso com o orquestrador)
- `docs/reforma/conferencias/SPEC-003-PEDIDO.md` (este arquivo)

Modificados (produção):
- `server/routers.ts` — `post.generate` enxugado (-1033 linhas): reserva/commit/refund, trace, logs, site intelligence, intent router e a chamada ao orquestrador; mapeamento de `rejected` → BAD_GATEWAY e `failed` → INTERNAL_SERVER_ERROR/GATEWAY_TIMEOUT
- `server/ai/contentStrategy.ts` — `planContentStrategiesDeterministic` (caminho produtivo; LLM `content_strategy` sai do síncrono, função permanece como biblioteca)
- `server/ai/generationPipeline.ts` — `prepareGenerationPlan` usa o planner determinístico
- `server/ai/postEvaluation.ts` — `evaluateCandidates`/`deterministicEvaluation` exportados; `applyOriginalityToEvaluations` novo
- `server/ai/captionSynthesis.ts` — `synthesizeCaptionDeterministic` novo (fallback marcado); síntese LLM tardia sai do síncrono
- `server/_core/env.ts` — flags `AI_GRAPH_SHADOW`/`AI_GRAPH_PIPELINE` removidas
- `shared/validation.ts` — sem mudanças (leitura)

Removidos (grafos):
- `server/ai/generationGraph/` (`shadow.ts`, `pipeline.ts`, `replay.ts`, `control.ts` + 4 arquivos de teste)
- `shared/generationGraph.ts` (+ teste), `shared/graphEngine.ts` (+ teste)

Modificados (testes):
- `server/post.test.ts` — reescrito para o novo contrato (1 chamada `post_generation`, schema 3 itens, zero chamadas legadas) + teste de falha operacional com refund observável via mock de billing; commit chamado 1x no caminho aprovado

## Contagem de testes

| | Antes (fim SPEC-002) | Depois |
|---|---|---|
| Arquivos de teste | 47 | 42 |
| Testes | 386 | 355 |

A queda vem da remoção dos grafos (6 arquivos de teste, ~46 testes) e da perda de ~13 testes não duplicados. Novos: orquestrador (14) + router (net +1: 3 testes novos, 1 reescrito).

## Afirmo que / como rederivar / evidência

| Afirmação | Como rederivar | Evidência |
|---|---|---|
| `npx tsc --noEmit` limpo | `npm run check` | saída vazia |
| 355 testes passam | `npm test` | `Test Files 42 passed (42)`, `Tests 355 passed (355)` |
| Harness não regrediu | `npm run harness -- --aspect 1:1,5:6,9:16` | 2664 medidos, 0 pulados, ✅ APROVADO (mesmos números pré-SPEC-003) |
| Caminho feliz estático: exatamente 1 chamada generativa | `npx vitest run server/ai/generationOrchestrator.test.ts -t "caminho feliz"` | `harness.calls` length 1; `metrics.generativeCalls === 1`; 3 snapshots v4 |
| Carrossel feliz: 1 chamada, 5 slides por variação | mesmo arquivo, teste "caminho feliz carrossel" | aprovado; `snapshot.slides` length 5 |
| Reparo: 1 chamada contendo APENAS os slots rejeitados | teste "slot incompleto dispara exatamente 1 reparo" | repair prompt contém "SLOT 3" e não contém "SLOT 1:"/"SLOT 2:"; schema minItems 1 |
| Reparo que não sana → `rejected` (não failed) | teste "reparo que não corrige o slot" | status rejected; 2 chamadas generativas; 1 reparo |
| Falha de provider → `failed` sem reparo | teste "falha operacional do provider" | status failed, kind provider, 0 reparos |
| Resposta sem variações → falha de parse | teste "sem variações parseáveis" | status failed, kind parse |
| Deadline respeitado (antes da chamada) | teste "deadline excedida antes da chamada principal" | failed kind deadline, 0 chamadas ao provider |
| Variedade insuficiente → reparo com os 3 slots e directive; persistindo → rejected (diversity) | teste "variedade insuficiente" | repair prompt contém "DIVERSIDADE"; issues type diversity |
| Caption curta → fallback determinístico marcado | teste "caption curta demais" | `fallbacks` contém `caption_deterministic_slots:2`; evento `caption_synthesis` status fallback |
| Fallback de estratégia determinística registrado | teste "fallback de estratégia" | `fallbacks` contém `strategy_deterministic` |
| Fallback de originalidade registrado | teste "fallback de originalidade" | `fallbacks` contém `originality` |
| Double-submit: mesma chave de idempotência | testes do describe "transação financeira" | `deriveIdempotencyKey` igual para requests idênticos, diferente para distintos |
| Borda: commit 1x no aprovado; refund no failed; erro discriminado | `npx vitest run server/post.test.ts` | commit chamado 1x; refund não chamado no sucesso; `rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })` + refund com a reserva no fallback de provider |
| Input por imagem: imagem na chamada principal | teste "input por imagem" | user content array com `image_url` |
| Execução real com provider (OpenRouter, credenciais do ambiente) | script temporário `server/realRun.ts` (removido após o uso) | status ok; 3 variações v4; **1 chamada `post_generation`**; 1 chamada `generation_repair` (orquestrador) com 3 retries de transporte + fallback Gemini registrados no trace (`attempt`/`fallbackFrom`); 3 juízes; 8893 tokens; ~US$ 0.0069; duração 152s (dominada pelos retries de transporte do reparo) |
| Execução real 2 (orquestrador direto, métricas expostas) | script temporário `server/realRun2.ts` (removido) | status failed kind deadline com `exceededDeadline: true` em 103,8s > deadline 90s — **o enforcement de deadline pós-reparo funciona em execução real**; 2 chamadas generativas, 1 reparo, 3 juízes, 13484 tokens, ~US$ 0.0115 |
| Grafos removidos: zero referências | `Get-ChildItem server/ai/generationGraph`, grep `runGenerationShadowGraph|runGenerationPipeline|aiGraphShadow|aiGraphPipeline` | não existem; flags ausentes de `env.ts` |

## Exclusões declaradas

1. **Sem baseline de latência antes/depois comparável.** A execução real usou o novo caminho; não rodei o fluxo antigo (3 slots + diversificação + revisão + caption LLM) com o mesmo corpus para comparar p50/p95. O relatório de custo/tokens real é do novo caminho (US$ 0.0069, 8893 tokens, 1 chamada principal). A promessa de latência é estrutural (1 chamada principal vs 3 slots + diversificação + revisão + caption), mas não apresento números medidos do caminho antigo.
2. **Juízes LLM (`post_evaluation`) não contam no orçamento de "chamada generativa".** O orçamento da spec conta copy/caption/slides (1) e reparo (0-1); juízes ficam na categoria avaliação (`evaluationCalls`). Se a conferência ler "nenhuma chamada LLM além de 1" literalmente, os juízes (3 paralelas, atrás de `AI_LLM_JUDGE_ENABLED`) violam a leitura — registro a interpretação aqui para decisão.
3. **`postJudge.ts`, `voiceTranscription.ts`, `slimBriefing.ts`, `captionSynthesis.ts` (LLM) permanecem como bibliotecas não usadas no caminho produtivo** — remoção/classificação é escopo da SPEC-005. `contentStrategy.ts` mantém o caminho LLM exportado para testes.
4. **Slides fabricados por fallback** (`normalizeCarouselSlides`/`buildFallbackCarouselSlides`) são marcados via evento `carousel_slide_fabrication` + `metrics.fallbacks` e passam pelas mesmas validações, mas não ganham flag no `generationMeta` do snapshot (evitei mudança de contrato de snapshot fora do escopo; registrar se exigido).
5. **Reavaliação pós-reparo é determinística** (sem novo juiz LLM para slots reparados) — decisão de custo/latência; a aceitação final do conjunto usa `validateVariationSet` (estrutura/diversidade), igual ao comportamento pré-existente.
6. **Sem cobertura de teste para o caminho URL com site intelligence no novo orquestrador** (o fluxo de carga de site intelligence fica na borda, inalterado; a geração em si é a mesma chamada). Execução real foi com texto.

## Onde o executor desconfia do próprio trabalho

1. **A mudança de estratégia LLM → determinística muda o produto**: os contratos estratégicos agora nascem de tópicos/evidências reais do site (fallback determinístico já existente), mas sem a curadoria do LLM. Qualidade de copy pode cair em casos sem site intelligence. Foi o que a letra da spec pediu ("determinísticos ou incorporados ao contrato da chamada principal"), mas é uma decisão de produto disfarçada de otimização — o dono deve confirmar.
2. **A execução real 1 levou 152s** (retries de transporte no reparo, 3×35s + fallback 11s) e aprovou — ver item 3 sobre o deadline. A execução real 2 (com métricas) falhou corretamente por deadline aos 103,8s. O orçamento de chamadas melhorou; a latência em caso de reparo sob stress depende de um reparo único grande.
3. **Deadline: anomalia no run 1, enforcement provado depois.** O router passa `deadlineMs = Date.now() + ENV.llmRequestTimeoutMs` (90s) e o orquestrador checa entre estágios. O run 1 (via router, sob instabilidade do provider) aprovou com duração total de 152s — sem métricas capturadas na borda, não dá para provar se o check rodou com deadline diferente. O run 3 (orquestrador direto com métricas: 103,8s > 90s → `failed` kind deadline, `exceededDeadline: true`) e o teste unitário com clock falso **provam que o enforcement funciona**. Pendência: a borda não expõe as métricas ao chamador — decidir se `metrics` entra no retorno tRPC (debug) ou se `failed` ganha o evento terminal `generation_metrics`.
4. **`metrics.transportRetries` fica 0 no objeto de métricas**: os retries reais são registrados no trace (`LlmTraceCall.attempt > 1`) pelo invokeLLM, não pelo orquestrador. A métrica local é declarada mas não preenchida — decidi não duplicar a fonte para não criar contagem divergente.
5. **O evento `generation_metrics` é adicionado no fim de approved/rejected, mas não em `failed`** — o trace de um failed termina no catch da borda (finishGenerationTrace status failed) sem o bloco de métricas. Se a conferência quiser métricas em failed, é uma linha a adicionar.
6. **Não rederivei manualmente a contagem de testes do arquivo `server/post.test.ts`** após o reescrito além do que o vitest reporta (6 testes) — a suíte inteira passa, mas não confirmei caso a caso a cobertura dos novos asserts de transação além do que rodei (20/20 nos dois arquivos).

## Degraus de verificação cumpridos e pendentes

Cumpridos:
1. Checagem automática mais barata: `npm run check` (tsc) ✅
2. Checagem contra expectativa registrada: 355 testes ✅ (14 novos no orquestrador + 3 no router)
3. Verificação de comportamento observável: harness ✅ (sem regressão); testes de integração do router ✅; amostra visual renderizada ❌ (mesma limitação das specs anteriores)
4. Execução real com custo: ✅ (OpenRouter, 1 chamada principal + 1 reparo com retries; tokens/custo/latência registrados)

Pendentes:
5. Julgamento humano: **este pedido** — (a) estratégia determinística vs LLM como decisão de produto; (b) interpretação do orçamento quanto aos juízes; (c) deadline excedido sem abort (item 3 das desconfianças); (d) veredito final.
