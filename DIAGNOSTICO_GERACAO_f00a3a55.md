# Diagnóstico — Falha de geração do pedido BizuMiner `f00a3a55`

**Data da análise:** 21/11/2026
**Pedido:** `f00a3a55-8070-4c7b-b65b-f0eb8121fc1d` · carrossel Instagram · 5 slides · imagens de IA desligadas
**Relatório auditado:** `~/.codex/visualizations/2026/11/18/01a1f03d-0d96-7a92-853b-b34c904f21fb/bizuminer-f00a3a55/fluxo.html` (+ `chamadas.json`)
**Configuração do pedido:** `generationStrategyVersion 2`, `finalFitRepairVersion 1`, `textRecoveryVersion 1`, `layoutFitPolicy adaptive_v2`, roteamento `deepseek_haiku_v2` (copy = `anthropic/claude-haiku-5.5` via Anthropic/OpenRouter; intent/repair = `deepseek/deepseek-v4.1-flash` via DeepInfra).
**Escopo do documento:** §1–9 tratam do pedido `f00a3a55` (bug do guarda); a **§10** registra a segunda instância, pedido `bb70f7e1` (overflow crônico com final fit indisponível).

---

## 1. Resumo executivo

Das 3 propostas geradas em paralelo, **apenas 1 foi entregue**. A proposta auditada (slot 0) esgotou 4 tentativas de design por overflow de texto e, na última, o reparo final de cópia (`copy_final_fit`) foi **bloqueado por um guarda de validação do transporte LLM** — um erro de contrato de código, não de modelo. A proposta ficou presa em `awaiting_reconciliation` (irrecuperável) e o usuário viu a galeria com apenas 1 post.

**Causa raiz:** o worker de geração rodou com módulos desalinhados — o call site novo do final fit (código não commitado) combinado com o guarda antigo de `server/_core/llm.ts`, cuja whitelist de traceLabels ainda não aceitava `copy_final_fit`. **A correção já existe na working tree** (único diff de `llm.ts`); falta carregá-la no worker e consolidar commit/bundle.

**Custo do pedido:** ~US$ 0,0214 em 13 chamadas pagas. O slot 0 queimou ~US$ 0,0075 em 4 chamadas de copy sem entrega; o reparo que teria resolvido custaria ~US$ 0,0009.

---

## 2. Resultado por proposta

| Slot | Trajetória | Desfecho | Métrica |
|---|---|---|---|
| 0 (proposta 1) | R9-03 → CON-05 → CON-23 → R9-09 | `execution_failed` → `awaiting_reconciliation` (guarda bloqueou `copy_final_fit`) | `pendingCount=1` |
| 1 (proposta 2) | R9-21 → R9-12 → R9-25 → R9-20 | `artwork_unusable` após 4 tentativas (11 findings na última) — falha legítima de layout | `failedCount=1` |
| 2 (proposta 3) | REF-08 → R9-08 → REF-14 | Entregue na tentativa fb2 | `deliveredCount=1` |

`completedThree=false`; status do pedido `awaiting_reconciliation` → após o deadline, `partial`. Nota: `awaiting_reconciliation` conta como **pendente**, não falha, nas métricas (`generationTerminalDiagnostic.ts`) — o dashboard mascara a morte do slot 0.

## 3. Trajetória do slot 0 (a proposta auditada)

Inspeção local de layout (`scene_inspection`, preflight com medição real Fontkit + solver `adaptive_v2`) rejeitou todas as tentativas:

| Tentativa | Design | Overflow | Colisões | Observação |
|---|---|---|---|---|
| 0 | R9-03 | 39 | 7 | cópia sistematicamente longa para as caixas |
| 1 (fb1) | CON-05 | 3 | 0 | `write_for_design` |
| 2 (fb2) | CON-23 | 5 | 0 | + muitos diagnósticos `authored_text_media_overlap` |
| 3 (fb3) | R9-09 | 4 | 0 | todos em `text-8-0` = CTA `field-4` dos slides 1, 2, 3, 5 |

Os textos que estouraram eram CTAs curtos: "Arrasta pro lado", "Continue o carrossel", "Veja a diferença", "Acesse o link da bio". A caixa do CTA no R9-09 (variante `4x5-601e6c26c59c`) mede ~212×45 px — efetivamente **1 linha** (fontSize 34.2, mínimo 22.2, altura máx. 47.6).

Na última tentativa, o runtime disparou o reparo direcionado `copy_final_fit` (gate: todos os findings são `overflow`, `proposalGraph.ts:1804-1807`). A chamada foi rejeitada antes de qualquer HTTP:

> `[runtime:op] ❌ [f00a3a55] p-f00a3a55-...-0:copy_final_fit falhou: structuredValidationOwner 'caller' requires post_evaluation route or a permitted journaled generation, exactly 1 transport attempt, disableFallback: true, and disableStructuredRepair: true`

## 4. Causa raiz — guarda desatualizado no worker

O guarda em `server/_core/llm.ts:617-646` (`invokeLLM`) exige, para `structuredValidationOwner='caller'` fora da rota `post_evaluation`, que o caller seja um destes: preparation, proposal copy, ou **proposal repair** — este último exigindo (llm.ts:627-635):

- `durableProposalCopyReceipt=true`;
- modelo de reparo pinado `deepseek/deepseek-v4.1-flash` (config validada);
- `response_format` json_schema; timeout ≤ 60 s; completion limit inteiro 1..2048;
- rota `static_generation|carousel_generation`;
- **traceLabel casando a whitelist**;
- e sempre: `maxTransportAttempts=1`, `disableFallback=true`, `disableStructuredRepair=true`.

No HEAD (`3cf155f`, "antes do refactor") a whitelist era `/^proposal_.+_editorial_recovery$/` — **não aceita `copy_final_fit`**. O call site (`proposalGraph.ts:1826-1833`, feature inteira não commitada) usa traceLabel `proposal_<id>_copy_final_fit` e satisfaz **todas as demais condições**. Logo, o guarda antigo rejeitava exatamente essa chamada.

**Evidências do desalinhamento:**
1. O diff de `server/_core/llm.ts` na working tree é **apenas** o alargamento do regex para `/^proposal_.+_(?:editorial_recovery|copy_final_fit)$/` (llm.ts:635) — a correção exata para este erro.
2. O worker (`pnpm generation:worker` = `tsx server/ai/workflows/generationWorker.ts`, **sem watch**, processo longo) carregou o `proposalGraph.ts` novo mas o `llm.ts` antigo — snapshot misto de módulos.
3. O bundle commitado `api/index.js` é stale: **zero ocorrências** de `copy_final_fit`.
4. **Prova positiva:** a reprodução isolada offline (chamada 14 do relatório, código atual) passou pelo guarda e produziu reparo válido com 258 tokens (~US$ 0,0009), encurtando os 4 CTAs:

| Slide | Campo | Antes | Depois |
|---|---|---|---|
| 1 | field-4 | Arrasta pro lado | Vá para o lado |
| 2 | field-4 | Continue o carrossel | Continue lendo |
| 3 | field-4 | Veja a diferença | Veja a prova |
| 5 | field-4 | Acesse o link da bio | Link na bio |

## 5. Agravantes (achados secundários, fora do escopo da correção)

1. **Erro local tratado como "efeito pago incerto".** `generationRuntime.ts:202-204` marca a operação como uncertain em qualquer throw — inclusive um guarda local que rejeita **antes** de qualquer HTTP (custo zero). Isso liga `hasUncertainEffect` (`proposalGraph.ts:1807,1861`), joga a proposta em `awaiting_reconciliation` (`generationCoordinator.ts:351-354`) e a reconciliação **não consegue replayar** `copy_final_fit` (só repõe operações com `expectation` durable; `generationReconciliation.ts:30-64`). Um erro determinístico local mata a proposta permanentemente.
2. **Heurística de capacidade otimista.** O prompt de copy usa `chars = floor(width/(fontSize*0.55))*rows` (`shared/textFieldFlexibility.ts:59-61`); a inspeção usa medição real Fontkit. Para a caixa de 1 linha do CTA, a heurística estima 11–17 chars, mas 16 chars estouram na medição (largura real de glifos + desperdício de fim de linha). O aviso "maxChars é estimativa" não evita o overflow sistemático → 4 chamadas pagas de copy queimadas.
3. **Final fit só na última tentativa.** `generationCoordinator.ts:320-321` (ou replay pós-loop, `322-326,367-373`). O reparo direcionado barato só é tentado após 3 trocas de design; provavelmente teria resolvido já no CON-05 (3 overflows) ou no R9-09.
4. **Falha legítima do slot 1.** `artwork_unusable` com 11 findings após 4 tentativas — problema real de adequação layout/cópia, independente do guarda. Mesmo com a correção, este pedido teria entregue 2 de 3.

## 6. Estado da correção e verificação

- **Correção presente na working tree** (não commitada): regex alargado em `llm.ts:635`; teste de journal+replay já cobre `copy_final_fit` (`server/_core/llm.taskRouting.test.ts:98`).
- **Typecheck:** `pnpm check` (`tsc --noEmit`) — **limpo** (21/11/2026).
- **Suítes-alvo:** `llm.taskRouting`, `proposalGraphRecoveryV10`, `generationRuntime`, `compactProposalCopyV2`, `generationDeliveryRecovery`, `localTextRecovery`, `workerReadiness`, `routers/generation` — resultado registrado na seção 8.
- Contrato guarda ↔ call site confirmado por leitura: `llm.ts:617-646` vs `proposalGraph.ts:1826-1833` + `generationTaskModelCallOptions` (`server/ai/generationModel.ts:126-143`).

## 7. Pendências operacionais (topologia verificada em 21/11/2026)

Estado real encontrado na verificação:

- **Worker local parado.** `pnpm generation:worker` não está em execução e o `readyz` local não responde. Tentativa de subida falhou: falta `GENERATION_DATABASE_SESSION_URL` no `.env` (conexão PostgreSQL **de sessão** do Supabase self-hosted, necessária para LISTEN/NOTIFY — `generationWorker.ts:12-14`). O `DATABASE_URL` presente no `.env` é o pooler transacional do projeto **legado** (`spbuwcwmxlycchuwhfir`, porta 6543) — proibido pelo AGENTS.md e incompatível com LISTEN. Quem processou o pedido de 18/11 foi um worker local com snapshot misto da working tree, hoje encerrado.
- **Worker da VPS rodando, mas com código antigo.** Há túnel SSH ativo `127.0.0.1:39837 → 172.16.5.5:9465 (postspark-vps)`; o `readyz` responde `ready:true`, porém **sem** `textRecoveryVersion`/`finalFitRepairVersion` — campos que o código atual sempre anuncia (`generationWorker.ts:136`). Logo, o deployment da VPS é anterior à feature de final fit e não contém a correção.
- **Porta de readiness divergente.** `.env` aponta `GENERATION_WORKER_READINESS_URL=http://127.0.0.1:19465/readyz`, mas o túnel vivo expõe `39837`. A API local não consegue ler o readiness do worker nessa configuração (`readDemandWorkerReadiness` retorna null → admission sem garantia de worker).

Ações necessárias (dependem de decisão/credenciais do usuário):

1. **Deploy do código atual na VPS** (commit + push + rebuild + restart do worker de lá) — é o caminho para a correção valer no executor real. Não executar sem pedido explícito.
2. **Alinhar a porta de readiness** (`.env` 19465 vs túnel 39837) ou restabelecer o túnel na porta esperada.
3. Se a intenção for rodar worker **local**: prover `GENERATION_DATABASE_SESSION_URL` (papel SQL de sessão do banco self-hosted, `db:5432`, conforme `docs/contrato-integracao-supabase-vps.md:154`) e subir `pnpm generation:worker`.
4. **Commitar a feature + correção** e **rebuildar `api/index.js`** antes de qualquer deploy — o bundle commitado não contém o final fit.
5. Após o deploy/restart, validar com um novo carrossel com overflow residual: deve entregar via final fit (ou falhar como `artwork_unusable` recuperável, nunca `awaiting_reconciliation` por erro local).

## 8. Resultado da verificação

- `pnpm check` (`tsc --noEmit`): **OK** (sem erros de tipo).
- Suítes-alvo vitest (21/11/2026): **8 arquivos, 181 testes, todos aprovados** (5.77 s):
  `llm.taskRouting`, `proposalGraphRecoveryV10`, `generationRuntime`, `compactProposalCopyV2`, `generationDeliveryRecovery`, `localTextRecovery`, `workerReadiness`, `routers/generation`.
- O teste `llm.taskRouting.test.ts:98` confirma em execução que `copy_final_fit` passa pelo guarda atual e é journalado/replayado sem nova inferência; `workerReadiness` anuncia `finalFitRepairVersion: 1` coerente com o config do pedido.
- **Limitação declarada:** a jornada real (worker + Supabase self-hosted) não foi reexecutada nesta verificação; suíte verde não demonstra sozinha a entrega. A prova de ponta a ponta do reparo vem da reprodução isolada (chamada 14 do relatório). Validação final depende do restart do worker + novo carrossel com overflow residual.

## 9. Referências de código

| Tema | Arquivo |
|---|---|
| Guarda do transporte | `server/_core/llm.ts:617-646` |
| Call site do final fit | `server/ai/workflows/proposalGraph.ts:1804-1867` |
| Opções do modelo de reparo | `server/ai/generationModel.ts:126-143` |
| Política de tentativas / final fit | `server/ai/workflows/generationCoordinator.ts:199-373` |
| Marcação de efeito incerto | `server/ai/workflows/generationRuntime.ts:177-206` |
| Reconciliação (só com expectation) | `server/ai/workflows/generationReconciliation.ts:30-64` |
| Heurística de capacidade | `shared/textFieldFlexibility.ts:44-74` |
| Teste do guarda (journal+replay) | `server/_core/llm.taskRouting.test.ts:98` |

---

## 10. Segunda instância — pedido `bb70f7e1` (21/11/2026, 19:03 UTC)

**Pedido:** `bb70f7e1-3001-40ca-894a-212dfe00fbb5` · carrossel BizuMiner · 3 propostas · status `partial` (2 entregues, 1 falha).
**Fonte:** Supabase self-hosted (`generation_v5_requests` + `generation_v5_operations`, schema `postspark`, via REST) — sem relatório de auditoria em `~/.codex/visualizations/` para este pedido.

**Diferença essencial em relação ao f00a3a55:** aqui o guarda do transporte **nunca disparou**. Não houve `awaiting_reconciliation` nem erro de contrato. É o padrão crônico de overflow (§5.2–5.3) matando a proposta porque o final fit estava **indisponível no executor e desligado no config**.

### 10.1 Resultado por proposta

| Slot | Trajetória | Desfecho |
|---|---|---|
| 0 | 4 tentativas → CON-16 · Cyanotype · planta arquitetônica | Entregue em fb3 (review com finding estético advisory) |
| 1 | CON-05 · Dual Split · contraste de argumentos | Entregue na 1ª tentativa (com `copy_fit_candidate`) |
| 2 | R9-12 → R9-25 → R9-08 → R9-10 | **Falhou** em fb3: `artwork_unusable`, stage `copy`, `retryable:false` |

### 10.2 Trajetória do slot 2 (journal de operações)

| Tentativa | Design | Operação | Resultado |
|---|---|---|---|
| 0 | R9-12 · Grid Systems · grade suíça (`acervo82-r9-12`) | `-2:copy` + `-2:copy_recovery` | copy ok; **recovery rejeitado pelo provedor (HTTP 400)**; overflow |
| fb1 | R9-25 (`delivery_recovery:candidate`, `write_for_design`) | `-2-fb1:copy` | overflow |
| fb2 | R9-08 (`delivery_recovery:2:candidate`) | `-2-fb2:copy` | overflow |
| fb3 | R9-10 (`delivery_recovery:3:candidate`) | `-2-fb3:copy` | overflow → fim do orçamento, sem operação `candidate` |

Os **10 findings finais são todos `overflow`** (severity fatal, "Defeito técnico mensurável no layout resolvido"), nos elementos `text-6-0` e `text-7-0` de **todos os 5 slides** — nenhum outro defeito. `errorReason`: "Composição contém defeito técnico comprovado antes da geração de mídia." `projections[2]` é null (falhou antes de persistir o layout); os findings são a medição autoritativa (Fontkit).

**Custo queimado no slot 2:** 4 chamadas de copy (`anthropic/claude-haiku-5.5` via Anthropic/OpenRouter), ~US$ 0,0018–0,0020 cada ≈ **US$ 0,0075 sem entrega** — o mesmo valor do slot 0 do f00a3a55.

### 10.3 Causa demonstrada — final fit indisponível por dois motivos independentes

1. **Worker da VPS com código antigo (HEAD `3cf155f`).** `/readyz` via túnel 39837 responde `ready:true, contractVersion:1, transport:"postgres-notify"` **sem** `textRecoveryVersion`/`finalFitRepairVersion`. Verificado no git: HEAD tem **0 ocorrências** de `copy_final_fit` em `proposalGraph.ts` e nenhum `finalFit` em `generationCoordinator.ts`. O journal do pedido não contém nenhuma operação `copy_final_fit`. Métricas do worker (executions 0→1, drains 131→154) confirmam que foi ele quem processou este pedido.
2. **Admissão não carimbou a feature no config.** A API da VPS leu o readiness antigo → `supportsTextRecovery=false`, `supportsFinalFitRepair=false` (`workerReadiness.ts:16`) → `resolveGenerationModelConfig` omitiu as versões (`generationModel.ts:75-76`). O `generation_config` do pedido confirma: tem `taskRouting deepseek_haiku_v2 v2`, mas **não tem** `finalFitRepairVersion`/`textRecoveryVersion`. O gate do coordinator exigiria `config.finalFitRepairVersion === 1` (`generationCoordinator.ts:223`) — final fit desligado mesmo se o worker tivesse a feature.

**Esclarecimento sobre a admissão (complementa §7):** `routers/generation.ts:230-238` exige readiness **não-nulo**, senão rejeita com PRECONDITION_FAILED ("executor indisponível"). Como a porta local 19465 está morta (túnel vivo = 39837), a API local não poderia admitir este pedido — ele foi admitido pela **API da VPS**, cujo readiness aponta para o worker antigo local à VPS. O problema não é "admission sem garantia de worker", e sim readiness antigo anunciando contrato sem as versões → features silenciosamente desligadas no config.

### 10.4 Hipóteses e achados secundários (não demonstrados)

- **Overflow concentrado nos mesmos dois elementos em 4 designs da mesma família R9** sugere conteúdo sistematicamente maior que as caixas — consistente com a heurística de capacidade otimista (§5.2, `shared/textFieldFlexibility.ts:59-61`). Trocar design dentro da família não redimensiona as caixas o suficiente. Não foi possível medir o layout resolvido do slot 2 (não persistido).
- **HTTP 400 no `copy_recovery`** (`invalid_request_error`, `anthropic/claude-haiku-5.5` via OpenRouter, `providerRequestId req_011ChGbQWP41szFj1t9KNLbm`). A causa exata não foi journalada (apenas hashes de request/response). É agravante — a recovery da tentativa 0 não rodou — mas não a causa da morte: o fluxo seguiu para 3 fallbacks de design e morreu no overflow do fb3. Nota: a recovery rodou no modelo de copy, não no modelo de reparo pinado (comportamento do código antigo).

### 10.5 O que a correção pendente muda (e o que não muda)

- O deploy do código atual (guarda + final fit + text recovery) no worker da VPS **resolveria este caso**: overflow-only é exatamente o gate do `copy_final_fit` (`proposalGraph.ts:1804-1807`), e a reprodução isolada do f00a3a55 provou o reparo (~US$ 0,0009, 4 CTAs corrigidos).
- O bug do guarda em si é **irrelevante para esta falha** — ele nunca disparou aqui.
- Mesmo deployed, o final fit só atua na **última tentativa** (§5.3): os 3 swaps de design (~US$ 0,0075) continuam sendo queimados antes do reparo barato. Os 3 endurecimentos permanecem pendentes de decisão: calibrar a heurística de capacidade, antecipar o final fit, não marcar erro local como "efeito pago incerto".

### 10.6 Como confirmar o fechamento

1. Commit + rebuild (`api/index.js`) + deploy do código atual no worker da VPS (requer autorização explícita).
2. Alinhar a porta de readiness local (19465 → túnel correto) se a API local for admitir pedidos.
3. Conferir `/readyz` do worker anunciando `textRecoveryVersion:1, finalFitRepairVersion:1`.
4. Novo carrossel: `generation_config` deve carimbar `finalFitRepairVersion:1`; havendo overflow residual na última tentativa, o journal deve registrar operação `copy_final_fit` e a proposta deve entregar.

### 10.7 Evidências

| Evidência | Fonte |
|---|---|
| Registro completo do pedido (config, proposals, findings) | REST `generation_v5_requests?id=eq.bb70f7e1-…` |
| Trajetória de tentativas e custos | REST `generation_v5_operations?request_id=eq.bb70f7e1-…` (32 operações; `result.usage.cost` por chamada de copy) |
| Worker antigo processou o pedido | `/readyz` 127.0.0.1:39837 (sem campos de versão; `executions:1`) vs 19465 morto |
| Feature ausente no código deployed | `git show HEAD:server/ai/workflows/proposalGraph.ts` (0× `copy_final_fit`); `git show HEAD:…/generationCoordinator.ts` (sem `finalFit`) |
| Gate de admissão e carimbo de versão | `server/routers/generation.ts:230-252`; `server/ai/generationModel.ts:75-76`; `server/ai/workflows/generationCoordinator.ts:223-224` |
