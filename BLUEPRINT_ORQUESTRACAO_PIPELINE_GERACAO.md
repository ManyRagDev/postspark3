# BLUEPRINT — Orquestração do Pipeline de Geração (Grafo de Estados)

> Auditoria técnica read-only. Nenhum código foi alterado. Data: 2026-07-08.
> Nota de método: `graphify-out/` **não existe no repositório** — a auditoria foi feita por leitura direta dos arquivos canônicos citados abaixo.

---

## 1. Diagnóstico de Gargalos da Arquitetura Atual

### 1.1 O runtime procedural (`server/routers.ts` → `post.generate`, linhas 566–1818)

A mutation executa ~14 estágios em sequência imperativa, com estado carregado em variáveis locais mutáveis (`variations` é reatribuída 5 vezes). Ordem real observada:

```
debitSparks → startGenerationTrace → [branch highTicket?] → siteIntelligence
→ prepareGenerationPlan → slot_generation (3× Promise.all, retry inline)
→ applyDeterministicCopyGuards → enforceBrandVisualGuardian (condicional)
→ diversification (condicional, full-set rewrite) → assessSemanticOriginality
→ evaluateAndReviseCandidates (1 rodada) → applyDeterministicCopyGuards (de novo)
→ synthesizeCaptionsForVariations → re-originality (se revisou)
→ composeVariation (motor criativo) → validateVariationSet/assert → return
```

**Gargalos pontuais:**

| # | Gargalo | Local | Efeito |
|---|---------|-------|--------|
| G1 | **Débito de Sparks antes de qualquer validação** | `routers.ts:583-607` | `assertVariationSet` no FIM (`routers.ts:1710`) lança `BAD_GATEWAY` depois de todo o gasto de LLM — usuário paga Sparks por uma falha. Não há reserve/refund. |
| G2 | **Motor criativo roda DEPOIS do QA** | `routers.ts:1659-1701` | `evaluateAndReviseCandidates` julga a variação crua; `composeVariation` depois muta `layout`, `template`, `layoutSettings`, `textElements`, cores e fontes. O que o juiz aprovou não é o que é entregue. `validateVariationSet` final só checa copy/contagem, não visual. |
| G3 | **Chamada morta de `directCreative`** | `routers.ts:1698-1699` | `const dir = directCreative(baseVar, null, seed)` — resultado descartado; `composeVariation` recalcula internamente com a mesma seed. Custo puro + leitura enganosa. |
| G4 | **`composeVariation` fixa canvas 1:1 / 360px** | `shared/creative/compose.ts:44-56` | `aspectRatio: "1:1"`, `doc: 360×360` hardcoded. `textElements` decorativos (`cd-*`) são posicionados em px para 1:1; em 5:6/9:16 o client reinterpreta os mesmos px contra outra altura de canvas (`visualFitValidator.ts:103-119`) → decorações vazam ou colidem → `applyVisualFitFallback` as descarta silenciosamente. É a origem estrutural de layouts quebrados por formato. |
| G5 | **Precedência de layout invertida no snapshot** | `variationSnapshot.ts:248-252` | Ordem: `layoutSettingsByAspectRatio` > `aspectRatioOptimizations` (coordenadas cruas da LLM) > `variation.layoutSettings` (saída curada do motor criativo). A geometria da LLM **vence** a do motor. O servidor gasta compute compondo e o client sobrescreve com a fonte menos confiável. |
| G6 | **Validação de completude duplicada inline** | `routers.ts:1374-1384` vs `generationValidation.ts` | O check de slot reimplementa `hasRequiredCopy` parcialmente e chama `hasValidStaticSections`/`hasCoherentStaticItemCount` — dois lugares para a mesma regra, com drift garantido. |
| G7 | **Diversificação e revisão se anulam** | `routers.ts:1446-1527` vs `1536-1602` | Diversificação roda ANTES da revisão de qualidade; a revisão pode reintroduzir similaridade; `validateVariationSet` final re-checa diversidade e lança erro — sem loop de volta. Falha terminal onde deveria haver um edge condicional. |
| G8 | **Brand Guardian não re-roda após revisão** | `routers.ts:1422-1444` | `enforceBrandVisualGuardian` aplica paleta/WCAG antes do QA; a revisão LLM pode emitir novas cores; ninguém re-aplica o guardian → drift de marca aprovado. |
| G9 | **Pipeline High Ticket paralelo e divergente** | `server/ai/highTicket/graph.ts` | Grafo manual próprio (bom desenho: estado tipado, transitions persistidas, loop de correção com `MAX_CORRECTION_ATTEMPTS=2`), mas com QA (`qaEvaluator`), captions (`captionSynthesis`), originalidade e validador visual (`visualContractValidator`) **duplicados** em relação aos módulos do fluxo canônico. Dois pipelines para manter em paridade manualmente. |
| G10 | **Slides de carrossel fabricados DEPOIS do QA** | `routers.ts:342-388` + `routers.ts:1661` | `normalizeCarouselSlides` roda no mapeamento final, após `evaluateAndReviseCandidates`: se a LLM devolveu slides inválidos, `buildFallbackCarouselSlides` fabrica 5 slides genéricos a partir de headline/body — conteúdo que **nenhum juiz avaliou** é entregue como aprovado, sem nenhum flag em `generationMeta`. Degradação invisível para o usuário e para a telemetria. |
| G11 | **Branch morto do pipeline legado de URL** | `routers.ts:53-55, 725-777` | `isLegacySitePipelineEnabled()` retorna `false` hardcoded — todo o bloco `chameleonVision`/`captureScreenshot`/`extractBrandDNA` dentro de `post.generate` é inalcançável, mas `chameleonResult`/`chameleonPosts` seguem participando do enriquecimento final (sempre vazios). Ruído puro para qualquer migração. |
| G12 | **Drift de contrato no snapshot persistido** | `routers.ts:1890, 1934` | `post.save`/`post.update` fazem `variationSnapshot: input.variationSnapshot as any` — o tipo inferido do `postVisualSnapshotSchema` (Zod) e o tipo TS `PostVisualSnapshot` já divergiram o suficiente para exigir cast. O contrato que deveria ser a fonte de verdade do snapshot não fecha nem dentro do próprio server. |

### 1.2 Onde as validações se fragmentam e se anulam

Regras hoje vivem em **8 pontos** desacoplados:

1. `routers.ts:1374-1384` — completude de slot (inline).
2. `server/ai/generationValidation.ts` — copy/estrutura/contagem (server).
3. `server/ai/postEvaluation.ts` — QA determinístico + juiz LLM; **`advertisedItemCounts` é copy-paste literal** de `generationValidation.ts:25-42` (mesma regex duplicada em `postEvaluation.ts:154-165`).
4. `routers.ts:2429-2455` — `applyDeterministicCopyGuards` (truncamentos; função local do router, não compartilhada).
5. `server/ai/brandVisualGuardian.ts` — WCAG/paleta (server); `postEvaluation.ts:61-71` recalcula contraste WCAG por conta própria.
6. `client/src/lib/visualFitValidator.ts` — geometria (client only; o servidor **nunca vê** violações de fit).
7. `client/src/lib/variationSnapshot.ts:111-208` — anti-colisão própria (`estimateTextHeightPercent`) que **quase duplica** `visualFitValidator.textHeightPercent` com constantes divergentes (safetyFactor 1.15 vs 1.2; lineHeight body 1.5 vs 1.55). Duas físicas diferentes para o mesmo texto.
8. `server/ai/highTicket/visualContractValidator.ts` — contrato visual só do branch High Ticket.

**Anulação em cascata:** juiz aprova (server, sem geometria) → motor criativo muta (server, pós-QA) → snapshot re-normaliza (client) → `applyVisualFitFallback` reescreve geometria e dropa `textElements` (client, silencioso). Quatro camadas "corrigem" umas às outras sem que nenhuma seja autoritativa.

### 1.3 Onde ocorrem as colisões visuais

- **Headline × body:** coordenadas center-based emitidas pela LLM em `aspectRatioOptimizations` sem noção de quebra de linha. Mitigado só no client (`variationSnapshot.ts:185-208` + `visualFitValidator.ts:166-172`), com heurísticas divergentes (item 7 acima).
- **Decorações fora do canvas:** G4 — `textElements` px de 1:1 renderizados em 9:16.
- **Wrappers/cards duplicados:** o motor emite `layoutSettings.card` + `textElements`; o snapshot pode selecionar a geometria de `aspectRatioOptimizations` (G5) mantendo os `textElements` do motor — card da LLM + decoração do motor coexistem sem terem sido compostos juntos. No HoloDeck, `adaptContentForFamily` + re-snapshot a cada patch (`HoloDeck.tsx:364,379`) recompõe sobre estado já composto.
- **Alucinação de escopo ("7 itens" em post de 3 seções):** os guards (`hasCoherentStaticItemCount`, `captionCoherence`) são regex de léxico PT (`dicas|passos|sinais|...`) apenas no headline/caption; body e sections não são cruzados; sinônimos fora do léxico passam. E quando o guard final pega, é G1: erro terminal pós-gasto.

### 1.4 O invariante do snapshot está violado

A doc de `createPostVisualSnapshot` (`variationSnapshot.ts:298-302`) o declara "canonical boundary". Na prática a fronteira é atravessada repetidamente:

- `Home.tsx:140,206,346` — na chegada da geração (passagem "oficial").
- `HoloDeck.tsx:379` — **a cada render de preview** (re-snapshot de um `PostVisualSnapshot`, legal em tipos porque `PostVisualSnapshot extends PostVariation`).
- `HoloDeck.tsx:364` — a cada patch de copy.
- `editorStore.ts:439,618` — troca de aspect ratio / restore.
- `buildVariationSnapshot` (`editorStore.ts:255`) — a cada `setWithSnapshot`.

Re-snapshot não é garantidamente idempotente: `applyVisualFitFallback` pode dropar `textElements` numa passada e `normalizeLayoutSettings` re-resolver precedências na seguinte com inputs já mutados. O tipo não distingue "variação crua" de "snapshot congelado", então o compilador não protege o invariante.

---

## 2. Avaliação de Viabilidade — LangGraph vs Máquina Nativa

**Veredito: máquina de estados nativa tipada, generalizando o padrão já existente em `server/ai/highTicket/graph.ts`. LangGraph não se justifica.**

Fundamentos:

1. **A dependência não existe** (`package.json` confirmado: sem `@langchain/langgraph`, sem `@langchain/core`). Adotá-la traz o ecossistema LangChain inteiro (peer deps, churn de versões, abstração `Runnable`) para um pipeline request-scoped de processo único que não precisa de checkpointer distribuído, streaming de canais nem human-in-the-loop.
2. **O time já escreveu 70% de um LangGraph manual e tipado:** `HighTicketGraphState` com Zod (`shared/highTicketSchemas.ts:210`), `transition()` persistindo cada mudança de status, loop condicional QA→revisão com limite de tentativas. Falta apenas generalizar: extrair o runner (nós como `(state) => Promise<Partial<State>>`, edges condicionais como funções `(state) => NodeId`), em vez de deixar a topologia hardcoded no corpo da função.
3. **O nó mais crítico (snapshot/visual fit) é matemática pura já isolada** — `visualFitValidator` e as heurísticas do `variationSnapshot` não tocam DOM. Podem migrar para `shared/`, permitindo que o grafo rode a validação visual **no servidor**, antes da entrega. LangGraph não ajudaria nisso; a mudança é de módulo, não de framework.
4. **Compatibilidade futura:** modelando nós como funções puras sobre um `State` Zod e edges como funções de decisão, a topologia fica isomórfica ao `StateGraph` do LangGraph. Se um dia houver necessidade real (checkpointing durável, execução distribuída), a migração é mecânica.

---

## 3. Topologia do Grafo Proposto

```
                              ┌──────────────────────┐
 input ──▶ input_normalization ──▶ strategy_router ──▶ copy_generation (3 slots ∥)
                              └─(sem contexto útil)──▶ FAIL_FAST (refund)
                                                          │
                         ┌── retry_slot (≤2, por slot) ◀──┤ inválido
                         ▼                                ▼ válido
                   copy_generation ◀────────────── schema_validation
                                                          │
                                                          ▼
                                              creative_composition
                                          (directCreative + composeVariation,
                                           seed persistida, POR aspect ratio)
                                                          │
                                                          ▼
                                             snapshot_normalization
                                        (createPostVisualSnapshot — ÚNICA passagem,
                                         server-side, marca snapshot como frozen)
                                                          │
                                                          ▼
                                             visual_fit_validation
                                   ┌─ fixável determin.: aplica fallback, anota ─┐
                                   │                                             ▼
                                   └─ não fixável ─▶ revision_loop      art_direction_judge
                                                          ▲              (LLM vê copy + geometria
                                                          │               + issues do visual fit)
                                              rejeitado (≤2 por slot) ◀──┤
                                                          │              │ aprovado
                                                          ▼              ▼
                                                 schema_validation   final_approval
                                                  (re-entra o loop)  (validateVariationSet +
                                                                      commit do débito Sparks)
                                                                          │
                                                                          ▼
                                                                      HoloDeck
                                                              (consome snapshot congelado;
                                                               não re-normaliza)
```

**Nós:**

| Nó | Responsabilidade | Absorve (código atual) |
|----|------------------|------------------------|
| `input_normalization` | Zod parse do input, executionBrief, scraping/siteIntelligence, débito → **reserva** de Sparks | `routers.ts:583-803`, `normalizeExecutionBrief` |
| `strategy_router` | Estratégias/ângulos; decide branch (ideation/execution/highTicket como estratégia, não pipeline paralelo) | `prepareGenerationPlan`, `highTicket/intentRouter` |
| `copy_generation` | 3 workers paralelos, 1 slot cada, prompt por contrato estratégico | `routers.ts:1273-1405`, `highTicket/workers` |
| `schema_validation` | Zod estrito + `hasValidStaticSections` + `hasCoherentStaticItemCount` + copy guards determinísticos — **fonte única**, em `shared/validation` | `generationValidation.ts`, `applyDeterministicCopyGuards`, check inline de slot |
| `creative_composition` | `directCreative` + `composeVariation` parametrizado pelo aspect ratio **solicitado no input** (corrige o hardcode 1:1 sem pré-gerar os 3 formatos — multi-formato é generalização posterior, fora do caminho crítico); brand guardian roda AQUI (determinístico, pós-copy) | `shared/creative/*`, `brandVisualGuardian` |
| `snapshot_normalization` | `createPostVisualSnapshot` movido para `shared/`, executado uma única vez; output tipado `FrozenSnapshot` (brand distinto de `PostVariation`) | `variationSnapshot.ts:303-351` |
| `visual_fit_validation` | `validateVisualFit` em `shared/`; fixável → `applyVisualFitFallback` + anotação; não fixável → rejeição estruturada | `visualFitValidator.ts` |
| `art_direction_judge` | Juiz LLM recebe snapshot final + sumário geométrico + issues; dimensões atuais + `layoutIntegrity` | `postEvaluation.ts`, `highTicket/qaEvaluator` (unificados) |
| `revision_loop` | Revisão cirúrgica POR SLOT com feedback do juiz; re-entra em `schema_validation` | closure `revise` de `routers.ts:1542-1601`, `highTicket/correctionLoop` |
| `final_approval` | `validateVariationSet` + captions (`caption_synthesis` como subnó) + originalidade final + **commit** do débito; falha → refund | `assertVariationSet`, `synthesizeCaptionsForVariations`, `persistCandidateFingerprints` |
| `HoloDeck` (entrega) | Client renderiza o snapshot verbatim; re-derivação só em edição manual via `buildVariationSnapshot` | `Home.tsx`, `HoloDeck.tsx` (sem `createPostVisualSnapshot`) |

**Edges condicionais:**

- `schema_validation → copy_generation`: slot inválido e `slot.attempts < 2` (retry local, só o slot).
- `schema_validation → degraded_slot`: slot inválido pós-retry → decide entre completar com fallback determinístico ou falhar o run (política explícita, hoje o slot é silenciosamente omitido e o assert final explode).
- `visual_fit_validation → art_direction_judge`: sempre, com issues anexadas (fixáveis já corrigidas).
- `art_direction_judge → revision_loop`: `!accepted && state.control.attempt < max`.
- `art_direction_judge → final_approval`: todos aceitos.
- `revision_loop → schema_validation`: revisado re-entra o funil completo (hoje a revisão pula diversidade e brand guardian — G7/G8 resolvidos por construção).
- `final_approval → FAIL(refund)`: set inválido após esgotar tentativas.

**Carrossel no grafo (fecha G10):**

- `schema_validation` valida os 5 slides como parte do contrato do slot — slides inválidos disparam retry do slot, **não** fabricação silenciosa.
- A fabricação de fallback (`buildFallbackCarouselSlides`) sobrevive apenas como edge explícito `degraded_slot`, marcando `slots[i].status = "degraded"` e `generationMeta.slidesFabricated = true` — visível para o usuário, para o juiz e para a telemetria.
- `visual_fit_validation` e `art_direction_judge` avaliam carrossel **por slide**, usando `projectSnapshotForSlide` (projeção pura, já existe em `variationSnapshot.ts:381-422`) — hoje só o slide base é implicitamente avaliado e as projeções nunca passam por fit.

---

## 4. Definição de Estado e Contratos por Nó

### 4.1 Estado global (Zod)

```ts
// shared/generationGraph.ts (proposto — NÃO implementado neste turno)
import { z } from "zod";
import { postVisualSnapshotSchema, generationEvaluationSchema } from "./postsparkSchemas";

export const slotStatusSchema = z.enum([
  "pending", "generated", "schema_valid", "composed",
  "snapshotted", "fit_validated", "approved", "rejected", "degraded", "failed",
]);

export const visualFitIssueSchema = z.object({
  type: z.enum([
    "headline_body_overlap", "structured_absolute_layout", "card_too_narrow",
    "text_element_outside_canvas", "text_element_overlaps_copy",
  ]),
  target: z.string(),
  detail: z.string(),
  autoFixed: z.boolean(),
});

export const slotStateSchema = z.object({
  index: z.number().int().min(0).max(2),
  status: slotStatusSchema,
  attempts: z.object({ generation: z.number(), revision: z.number() }),
  strategy: z.record(z.string(), z.unknown()),        // ContentStrategy
  draft: z.record(z.string(), z.unknown()).nullable(), // PostVariation crua (pré-compose)
  snapshot: postVisualSnapshotSchema.nullable(),       // FrozenSnapshot pós-normalização
  visualFit: z.object({ ok: z.boolean(), issues: z.array(visualFitIssueSchema) }).nullable(),
  evaluation: generationEvaluationSchema.nullable(),
  /**
   * seed = hash(`${runId}:${slotIndex}:${attempt}`) — reproduzível em replay.
   * Substitui o esquema atual (hash de `var-${Date.now()}-${i}`), que torna cada
   * tentativa irreproduzível e inviabiliza o shadow por replay da Fase 1.
   */
  seed: z.number().int(),
});

export const generationGraphStateSchema = z.object({
  runId: z.string().uuid(),
  /** Chave de idempotência enviada pelo client: double-submit não gera segundo run nem segundo débito. */
  idempotencyKey: z.string(),
  status: z.enum([
    "created", "normalized", "routed", "generated", "validated", "composed",
    "snapshotted", "fit_validated", "judged", "revising", "approved", "failed",
  ]),
  input: z.object({
    inputType: z.enum(["text", "url", "image"]),
    content: z.string(),
    platform: z.enum(["instagram", "twitter", "linkedin", "facebook"]),
    postMode: z.enum(["static", "carousel"]),
    aspectRatio: z.enum(["1:1", "5:6", "9:16"]),
    creationMode: z.enum(["ideation", "execution"]),
    executionBrief: z.record(z.string(), z.unknown()).optional(),
    siteIntelligenceId: z.string().uuid().optional(),
  }),
  billing: z.object({
    reservationId: z.string(),
    cost: z.number(),
    committed: z.boolean(),
  }),
  context: z.object({
    contextContent: z.string(),
    brandPrompt: z.string(),
    siteIntelligence: z.record(z.string(), z.unknown()).nullable(),
    recentPostFingerprints: z.array(z.string()),
  }).nullable(),
  routing: z.object({
    strategies: z.array(z.record(z.string(), z.unknown())).length(3),
    fallbackUsed: z.boolean(),
  }).nullable(),
  slots: z.array(slotStateSchema).length(3),
  control: z.object({
    attempt: z.number().int(),
    maxRevisionAttempts: z.number().int().default(2),
    maxSlotRetries: z.number().int().default(2),
    /** Teto GLOBAL de chamadas de LLM no run — hoje o pior caso é ilimitado por composição de loops. */
    llmCallBudget: z.number().int().default(14),
    llmCallsUsed: z.number().int().default(0),
    /** Deadline absoluto do run; nós de LLM checam antes de invocar e degradam se estourou. */
    deadlineAt: z.string().datetime(),
    failedReason: z.string().optional(),
  }),
  events: z.array(z.object({
    at: z.string().datetime(),
    node: z.string(),
    status: z.string(),
    detail: z.string(),
    data: z.unknown().optional(),
  })),
  output: z.object({ variations: z.array(postVisualSnapshotSchema).length(3) }).nullable(),
});
export type GenerationGraphState = z.infer<typeof generationGraphStateSchema>;
```

### 4.2 Contrato por nó (I/O, retry, falha)

| Nó | Lê | Escreve | Retry local | Em falha terminal |
|----|-----|---------|-------------|-------------------|
| `input_normalization` | `input` | `context`, `billing.reservationId` | scraping: 1 retry com timeout; siteIntelligence: degrade para conteúdo cru | refund + `failed` (nenhum token de geração gasto) |
| `strategy_router` | `context` | `routing` | fallback determinístico (já existe em `prepareGenerationPlan`) | nunca terminal — fallback obrigatório |
| `copy_generation` | `routing`, `context`, `slots[i]` | `slots[i].draft`, `attempts.generation++` | por slot, ≤2, prompt de retry direcionado (preserva o padrão atual de `routers.ts:1283-1307`) | `slots[i].status = "failed"` → edge de degradação |
| `schema_validation` | `slots[i].draft` | `slots[i].status`, erros estruturados | n/a (determinístico) | devolve o slot a `copy_generation` ou marca `degraded` |
| `creative_composition` | `slots[i].draft`, `slots[i].seed`, `input.aspectRatio` | `slots[i].draft` composto | n/a (determinístico, seeded) | erro = bug, propaga com estado persistido |
| `snapshot_normalization` | draft composto | `slots[i].snapshot` (frozen) | n/a | idem |
| `visual_fit_validation` | `slots[i].snapshot` | `slots[i].visualFit`, snapshot corrigido se fixável | n/a | issues não fixáveis alimentam o juiz — nunca terminal sozinho |
| `art_direction_judge` | snapshot + visualFit + strategy | `slots[i].evaluation` | juiz LLM indisponível → só dimensões determinísticas (padrão atual de `postEvaluation.ts:412`) | rejeição vai para `revision_loop`, não lança |
| `revision_loop` | slot rejeitado + evaluation | novo `draft`, `attempts.revision++` | ≤ `maxRevisionAttempts` por slot | esgotado → `final_approval` decide com o que tem |
| `final_approval` | `slots[*]` | `output`, `billing.committed=true` | n/a | `<3` aprovados → refund + erro tipado com `events` completos |

Regras transversais:

- Todo nó escreve em `events` (substitui `recordGenerationEvent` espalhado). Bônus habilitado: os events dão progresso REAL para o client — os fake stages de `useAIProcessingStages` podem futuramente ser substituídos por streaming de status, sem mudança no grafo.
- **Orçamento e deadline:** cada nó de LLM decrementa `control.llmCallBudget` e checa `deadlineAt` antes de invocar; estourou → edge de degradação, nunca timeout do host. Relevante porque o deploy alvo é serverless (`pnpm build` → `api/index.js`), com teto duro de execução — o pior caso atual (3 slots × 2 tentativas + diversificação + juiz + 3 revisões + re-juiz + captions) já flerta com esse teto e o grafo não pode piorá-lo às cegas.
- **Idempotência do run:** `input_normalization` resolve `idempotencyKey` antes de reservar Sparks; requisição repetida (double-click no generate) retorna o run existente em vez de debitar de novo.
- **Persistência de estado:** transição a cada nó no padrão `persistHighTicketGraphState`, mas com política de batching para nós determinísticos rápidos (compose→snapshot→fit numa escrita só) — persistir cada micro-transição multiplicaria writes no Supabase sem valor de auditoria.
- Débito vira reserve-on-start / commit-on-approval / refund-on-fail (resolve G1; implementação na Fase 4).

---

## 5. Ponto de Ancoragem do Juiz Visual

**Depois de `createPostVisualSnapshot` + `visual_fit_validation`, antes do HoloDeck — nunca antes.**

Justificativa por eliminação:

- **Após `composeVariation` (cedo demais):** o snapshot ainda vai resolver precedência de `layoutSettings` (G5), sincronizar tokens, normalizar seções e aplicar `applyVisualFitFallback`, que pode reescrever geometria e dropar `textElements`. O juiz avaliaria um estado que ainda muta — exatamente a falha atual (G2).
- **No client, antes do HoloDeck (tarde demais):** o run já foi cobrado e retornado; reprovar aqui exigiria round-trip novo. Sem loop de revisão viável.
- **Após `createPostVisualSnapshot` (correto):** é o último estado determinístico antes do render. Pré-requisito: mover `createPostVisualSnapshot` e `visualFitValidator` para `shared/` (ambos são matemática pura — viável sem reescrita) e executá-los server-side no grafo. O juiz então intercepta o pixel-contract final: recebe o snapshot congelado + o sumário de caixas estimadas + as issues do fit (inclusive as auto-corrigidas, como sinal de qualidade), e sua rejeição alimenta o `revision_loop` com feedback geométrico concreto ("headline de 3 linhas colide com body em 5:6") em vez de nota abstrata.

Bônus estrutural: unifica as duas heurísticas divergentes de altura de texto (item 1.2-7) numa só, e o HoloDeck passa a renderizar o snapshot verbatim — some a re-normalização por render (`HoloDeck.tsx:379`) e o invariante "uma única passagem" passa a ser garantido por tipo (`FrozenSnapshot`), não por disciplina.

**Escopo do juiz em duas versões (não misturar):**

- **v1 (esta migração):** fit determinístico + sumário geométrico estimado alimentando o juiz LLM textual. Suficiente para eliminar as colisões e wrappers quebrados — os defeitos atuais são todos detectáveis por caixa estimada.
- **v2 (evolução pós-migração, fora do caminho crítico):** juiz com render real — screenshot headless do snapshot avaliado por modelo de visão. A infra parcial já existe no repo (`server/screenshotService.ts` / `captureScreenshot` para sites; `html2canvas-pro` no client para export). É o salto de "ok" para "direção de arte premium" (ritmo visual, respiro, tensão composicional — coisas que caixa estimada não mede), mas adiciona latência e custo por run; só entra depois que o grafo v1 estabilizar, como nó opcional atrás de flag.

---

## 6. Plano de Migração Incremental e Segura

Cada fase entrega valor isolado, é reversível por flag e não interrompe o fluxo canônico. **A ordem é dependência dura, não sugestão: cada fase tem gate de saída que bloqueia a seguinte.**

**Fase 0 — Consolidação pura (PRÉ-REQUISITO BLOQUEANTE, sem mudança de comportamento visível)**

Sem esta fase, o grafo apenas reorganizaria a duplicação existente — as regras continuariam divergindo em 8 lugares, só que dentro de nós. Nenhuma fase posterior começa antes do gate abaixo.

- Extrair geometria para `shared/visualFit.ts`: `textHeightPercent`, `layoutRect`, `validateVisualFit`, `applyVisualFitFallback`. `variationSnapshot.ts` passa a importar de lá, eliminando `estimateTextHeightPercent` duplicado (constantes unificadas — única micro-mudança de comportamento, coberta por teste de paridade).
- Extrair `shared/validation.ts`: `advertisedItemCounts` (dedup `generationValidation` × `postEvaluation`), `applyDeterministicCopyGuards` (sai do router), `hasRequiredCopy` (substitui o check inline de slot).
- Remover a chamada morta de `directCreative` em `routers.ts:1698-1699`.
- Remover o branch morto do pipeline legado de URL (G11): `isLegacySitePipelineEnabled()` + bloco `chameleonVision`/`captureScreenshot` inalcançável e o enriquecimento por `chameleonPosts` sempre-vazio (`routers.ts:53-55, 725-777, 1656-1681`).
- Fechar o drift de contrato do snapshot (G12): alinhar `postVisualSnapshotSchema` (Zod) com o tipo `PostVisualSnapshot` até os dois `as any` de `post.save`/`post.update` (`routers.ts:1890, 1934`) compilarem sem cast. Pré-condição silenciosa da Fase 2 — o snapshot server-side nascerá `parse`-ado por esse schema.
- **Escrever e rodar o teste de idempotência do snapshot** (`createPostVisualSnapshot(createPostVisualSnapshot(v, ar), ar)` deep-equal à primeira passada) sobre a matriz de fixtures. Expectativa realista: o teste vai FALHAR em alguns casos hoje (ex.: `applyVisualFitFallback` dropando `textElements` na 1ª passada muda o input da 2ª; lógica de `bgValue` sensível a re-entrada). Corrigir a idempotência ainda no client, onde o comportamento é observável e reversível.
- Gate de saída: `pnpm test` + `npx tsc --noEmit` verdes; golden cases idênticos; **idempotência provada** — este último item é o critério de entrada da Fase 2. Congelar um snapshot que ainda muta a cada passada seria congelar comportamento instável.

**Fase 1 — Runner genérico do grafo (shadow SEM dupla execução de LLM)**
- Generalizar `highTicket/graph.ts` num runner tipado (`shared/graphEngine.ts`): nós, edges condicionais, `events`, persistência de estado.
- Envelopar os estágios ATUAIS do `post.generate` como nós, sem alterar sua lógica interna. Flag `AI_GRAPH_PIPELINE` (default off) no padrão de `ENV.aiHighTicketPipelineEnabled` com fallback legado idêntico ao existente (`routers.ts:642-714`).
- **Restrição de custo:** shadow NUNCA re-invoca LLM. Duas modalidades, ambas com custo marginal ~zero:
  - *Replay offline:* o `generationTrace` já persiste input, output e cada chamada de LLM por estágio. O grafo roda em replay sobre esses artefatos gravados (nós de LLM viram lookup no trace), validando topologia, edges condicionais e transições de estado contra runs reais de produção — sem nenhum token novo.
  - *Shadow inline determinístico:* no request vivo, apenas os nós determinísticos (`schema_validation`, `creative_composition`, `visual_fit_validation`) re-executam sobre os artefatos que o caminho legado acabou de produzir, logando divergências. Os nós de LLM reutilizam a resposta única já obtida pelo legado.
- Cutover (grafo servindo a resposta) só depois de N runs de replay sem divergência — aí sim o grafo passa a ser O caminho, com uma única execução de LLM como sempre foi.
- **KPIs do gate de paridade** (derivados dos `events`, agregados — hoje só existem logs por run, não métricas): taxa de retry por slot, taxa de fallback por nó, taxa de auto-fix do visual fit, taxa de rejeição do juiz, taxa de degradação de carrossel. Sem esses agregados, "paridade" vira opinião; com eles, o cutover e cada fase seguinte têm baseline numérico para detectar regressão.

**Fase 2 — Snapshot server-side (a fase mais perigosa — entrada condicionada à idempotência provada na Fase 0)**
- Mover `createPostVisualSnapshot` para `shared/` (depende só de tipos + `layoutToAdvanced` + visualFit, todos puros; o import de `EditorState` em `variationSnapshot.ts:16` é type-only e fica no wrapper client).
- Grafo passa a emitir `PostVisualSnapshot[]` prontos; `Home.tsx` deixa de re-normalizar quando `snapshotVersion === 3` vier do server; HoloDeck troca `createPostVisualSnapshot` por consumo direto + `projectSnapshotForSlide`/`applyDesignTokensToSnapshot` (interações do usuário continuam client-side).
- Reordenar: `creative_composition` → snapshot → fit — corrige G2/G4/G5 por construção. **Escopo contido:** compor apenas para o aspect ratio solicitado no request (corrige o hardcode 1:1 de `compose.ts:44` para o formato que o usuário realmente pediu). Pré-gerar os 3 formatos triplicaria o trabalho de composição/validação por run e fica explicitamente FORA desta fase — é generalização futura, se a troca de formato no editor justificar.

**Fase 3 — Juiz de direção de arte + revisão por slot (qualidade visual, SEM tocar em billing)**
- Estender `postEvaluation` com dimensão `layoutIntegrity` alimentada pelo `visual_fit_validation`.
- Revisão por slot re-entra em `schema_validation` (fecha G7/G8).
- Juiz v1 = fit determinístico + sumário geométrico (ver §5). Juiz v2 com screenshot headless fica documentado como evolução, fora deste plano.

**Fase 4 — Billing reserve/commit/refund (isolada de propósito)**
- Débito de Sparks vira reserva em `input_normalization`, commit em `final_approval`, refund em falha terminal (fecha G1).
- Fase própria porque mexe em dinheiro/saldo (Stripe live, BRL): deploy separado, rollback independente das mudanças visuais, e janela de observação exclusiva sobre `operationalLog` de débitos. Nenhuma entrega de qualidade visual depende dela — se atrasar, o grafo continua debitando upfront como hoje, apenas com o mesmo defeito G1 já conhecido.
- **Contrato de erro para o client:** com refund, o client precisa distinguir estados que hoje colapsam num `BAD_GATEWAY` genérico — "falhou e reembolsamos" (retry grátis, mensagem tranquilizadora) vs `PAYMENT_REQUIRED` (UpgradePrompt) vs "entregue degradado" (aviso no HoloDeck). Erros tipados no payload do TRPCError, consumidos por `Home.tsx`/`UpgradePrompt`.

**Fase 5 — Unificação High Ticket**
- `strategy_router` absorve `intentRouter`; QA, captions, originalidade e validador visual do High Ticket colapsam nos nós únicos do grafo. `highTicket/` vira configuração de estratégia, não pipeline paralelo.
- Remover flag legada quando telemetria (`generationTrace`/`operationalLog`) mostrar paridade.

---

## 7. Matriz de Riscos, Arquivos Afetados e Estratégia de Testes

### 7.1 Riscos

| Risco | Prob. | Impacto | Mitigação |
|-------|-------|---------|-----------|
| Shadow mode duplicar chamadas de LLM (2× custo + 2× ruído de telemetria) | Alta se ingênuo | Alto | Shadow por replay do `generationTrace` + re-execução inline apenas dos nós determinísticos; LLM invocado exatamente uma vez por run (ver Fase 1) |
| `createPostVisualSnapshot` NÃO ser idempotente hoje — congelar comportamento instável na Fase 2 | Alta | Alto | Teste de idempotência é gate de saída da Fase 0 e critério de entrada da Fase 2; correções feitas no client antes de qualquer move para `shared/` |
| Unificar constantes de altura de texto muda fallbacks visuais existentes | Alta | Médio | Golden tests de paridade na Fase 0; escolher as constantes do `visualFitValidator` (mais conservadoras) |
| Snapshot server-side diverge do client em posts salvos legados (`snapshotVersion < 3`) | Média | Alto | Manter caminho de re-normalização client para posts salvos; só a geração nova recebe frozen snapshot |
| `editorStore` depende de re-derivar snapshot em edição — congelar demais quebra o editor | Média | Alto | `FrozenSnapshot` só na entrega; `buildVariationSnapshot` (fluxo de edição) intocado |
| Reordenar compose→QA muda distribuição de aceitação do juiz | Média | Médio | Replay da Fase 1 comparando `accepted`/`overallScore` antes do cutover |
| Compor todos os aspect ratios por run (inflação de escopo/custo na Fase 2) | Média | Médio | Escopo travado no formato solicitado; multi-formato é decisão futura explícita |
| Refund de Sparks introduz caminho novo no billing (Stripe/Supabase live) | Baixa | Alto | Fase 4 isolada (deploy e rollback próprios, sem acoplamento com entregas visuais); reserve como débito lógico local commitado no fim; sem nova API Stripe |
| Revision loop estourar o teto de execução serverless (timeout do host no meio do run) | Média | Alto | `llmCallBudget` + `deadlineAt` no state: nós de LLM degradam graciosamente em vez de deixar o host matar o processo com estado inconsistente |
| Endurecer a validação de slides quebrar carrosséis que hoje "funcionam" via fabricação silenciosa | Média | Médio | Fabricação preservada como `degraded_slot` explícito e flagado — comportamento igual, visibilidade nova; medir taxa de degradação no replay antes de decidir apertar |
| Double-submit do generate debitar Sparks duas vezes | Média | Médio | `idempotencyKey` resolvida em `input_normalization` antes da reserva |
| High Ticket em produção atrás de flag divergir durante a migração | Baixa | Médio | Fase 5 por último; flags atuais preservadas |

### 7.2 Arquivos afetados (por fase)

- **F0:** `shared/visualFit.ts` (novo), `shared/validation.ts` (novo), `client/src/lib/visualFitValidator.ts` (re-export), `client/src/lib/variationSnapshot.ts` (incl. correções de idempotência), `client/src/lib/variationSnapshot.test.ts` (teste de idempotência + golden cases), `server/ai/generationValidation.ts`, `server/ai/postEvaluation.ts`, `server/routers.ts` (remoções).
- **F1:** `shared/graphEngine.ts` (novo), `server/ai/generationGraph/*` (novo), `server/ai/generationTrace.ts` (leitura para replay), `server/_core/env.ts` (flag), `server/routers.ts` (branch).
- **F2:** `shared/variationSnapshot.ts` (movido), `shared/creative/compose.ts` (aspect ratio do request), `client/src/pages/Home.tsx`, `client/src/components/views/HoloDeck.tsx`, `client/src/store/editorStore.ts` (apenas imports/consumo).
- **F3:** `server/ai/postEvaluation.ts` (`layoutIntegrity`), nós do grafo (revision loop por slot).
- **F4:** `server/billing.ts` (reserve/commit/refund), nó `input_normalization` e `final_approval`.
- **F5:** `server/ai/highTicket/*` (colapso), `shared/highTicketSchemas.ts` (merge no state global).

### 7.3 Estratégia de testes (vitest já configurado; `variationSnapshot.test.ts` e `postsparkSchemas.test.ts` existem como base)

**Unitários — blindagem do `variationSnapshot`:**
1. **Idempotência (GATE — escrito na Fase 0, bloqueia a Fase 2):** `createPostVisualSnapshot(createPostVisualSnapshot(v, ar), ar)` deve ser deep-equal à primeira passada — formaliza o invariante que hoje é só doc-comment. Assumir que vai falhar inicialmente (fallback dropando `textElements`, resolução de `bgValue`) e corrigir no client antes do move para `shared/`.
2. **Paridade de física:** para uma matriz de fixtures (headline/body longos × 3 aspect ratios × templates), `shared/visualFit` reproduz os fallbacks atuais do client (golden files gerados ANTES da Fase 0).
3. **Precedência de layout:** casos cobrindo `layoutSettingsByAspectRatio` vs `aspectRatioOptimizations` vs saída do motor — trava a decisão de inverter G5 quando ela for tomada.
4. **`textElements` por formato:** decoração composta em 1:1 validada em 9:16 não pode sobreviver fora do canvas.

**Unitários — grafo:**
5. Cada edge condicional com estado sintético: slot inválido → retry; retry esgotado → degraded; juiz rejeita → revision re-entra `schema_validation`; revisão reintroduz similaridade → loop detecta (regressão do G7).
6. `generationGraphStateSchema.parse` em todo snapshot de estado persistido (fuzz leve com estados truncados).

**Integração — `editorStore`:**
7. `loadSnapshot` de snapshot congelado do server → `visualSnapshot` do store idêntico (sem re-normalização destrutiva); troca de aspect ratio preserva edições manuais (`sectionLayouts`, `freePosition` de drag).
8. Undo/redo (`historyStack`) sobre snapshots congelados — transações continuam coalescendo.

**Integração — contrato de entrega:**
9. `post.generate` (LLM mockado via `invokeLLM` stub) retorna 3 snapshots que passam `postVisualSnapshotSchema` E `validateVisualFit.ok === true` — o contrato que o HoloDeck assume. Para carrossel: as 5 projeções de `projectSnapshotForSlide` também passam o fit, não só o slide base.
10. Billing: falha em `final_approval` → saldo de Sparks intacto; sucesso → débito exato.
11. **Degradação de carrossel visível:** LLM mockada devolvendo 3 slides → run completa com `slots[i].status === "degraded"` e `generationMeta.slidesFabricated === true`; nunca fabricação sem flag (regressão do G10).
12. **Idempotência do run:** duas chamadas concorrentes de `post.generate` com a mesma `idempotencyKey` → um único run, um único débito, mesma resposta.
13. **Orçamento:** cenário forçando retries máximos em todos os slots → total de chamadas de LLM ≤ `llmCallBudget` e run termina em estado terminal válido (nunca exceção de timeout do host).

---

## Apêndice — Inventário de leitura desta auditoria

`server/routers.ts` (post.generate completo + `applyDeterministicCopyGuards`), `server/ai/highTicket/graph.ts`, `server/ai/generationValidation.ts`, `server/ai/postEvaluation.ts`, `shared/creative/compose.ts`, `client/src/lib/variationSnapshot.ts`, `client/src/lib/visualFitValidator.ts`, `client/src/components/views/HoloDeck.tsx` (330-409), `client/src/store/editorStore.ts` (230-290), índices de `shared/postspark.ts`, `shared/postsparkSchemas.ts`, `shared/highTicketSchemas.ts`, `server/_core/env.ts` (flags), `package.json`.
