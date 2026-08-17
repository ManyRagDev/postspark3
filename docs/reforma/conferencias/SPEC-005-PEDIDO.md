# PEDIDO DE CONFERÊNCIA — SPEC-005: consolidação e remoção de caminhos paralelos

**Data:** 2026-08-12
**Commit-base:** `f402518` (worktree local, não commitado), sobre SPEC-001/002/003/004 (conferências diferidas pelo dono)
**Executor:** agente autônomo (sessão única)
**Conferência exigida:** parcial focada em remoções, importações dinâmicas, build e invariantes; nenhuma remoção de contrato material (a única superfície pública mantida é `postJudge`).

## Objetivo (5 linhas)

Consolidar o runtime pós-SPEC-003/004: remover módulos comprovadamente
órfãos, retirar flags/comentários/métricas de caminhos extintos, remover
dependências sem uso, manter compatibilidade nomeada onde existe superfície
pública, produzir o ledger do Next e provar que as fontes constroem
(`npm run build`), corrigindo de quebra um bug de build herdado da SPEC-001.

## Classificação aplicada (tabela obrigatória)

| Candidato | Classe | Ação | Evidência |
|---|---|---|---|
| `server/_core/voiceTranscription.ts` | órfão comprovado | removido | zero imports estáticos/dinâmicos; só menções em docs antigos |
| `server/ai/slimBriefing.ts` | órfão comprovado | removido | zero imports (só comentário de tipo em `shared/contextBriefing.ts`) |
| `captionSynthesis.ts` (caminho LLM: synthesizeCaption/CaptionsForVariations) | órfão comprovado (funções) | removidas | zero importers; orquestrador usa apenas `synthesizeCaptionDeterministic` |
| `contentStrategy.ts` (caminho LLM: planContentStrategies/generateCandidates/parseResponse) | órfão comprovado (funções) | removidas | zero importers; caminho produtivo é `planContentStrategiesDeterministic` |
| `postEvaluation.ts` (`evaluateAndReviseCandidates`) | órfão comprovado (função) | removida | zero importers; reparo único vive no orquestrador (SPEC-003) |
| `generationValidation.ts` (`assertVariationSet`) | órfão comprovado | removido | zero importers; `validateVariationSet` continua |
| `db.ts` (ShadowGraphMetrics/PipelineGraphMetrics/GraphCutoverReadiness + extractShadow/calculateShadow/getEmptyShadow/extractPipeline/calculatePipeline/getEmptyPipeline + evaluateGraphCutoverReadiness) | órfão comprovado | removidos | zero importers (o único consumidor era o Admin, removido junto) |
| `server/db.test.ts` | teste de caminho removido | removido | só testava shadow graph |
| Admin "Gate do pipeline de grafo" | métricas de caminho extinto | card removido (nota explicativa no lugar) | `client/src/pages/Admin.tsx` |
| `admin.getAiRollout` — `contentStrategy` | flag de caminho extinto | campo removido | `server/routers/admin.ts` |
| `ENV.aiContentStrategyEnabled` / `AI_CONTENT_STRATEGY_ENABLED` | flag de caminho extinto | removida | `server/_core/env.ts` |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `axios`, `nodemailer`, `@types/nodemailer`, `@hookform/resolvers` | dependências sem uso | removidas (pnpm) | varredura de imports em client/server/shared + configs |
| `server/postJudge.ts` (endpoint `post.evaluateQuality`) | **compatibilidade** | mantido | endpoint tRPC público sem chamador interno; header com critério de retirada + `server/postJudge.compat.test.ts` |
| `postspark-next/` | decisão do dono | intacto | ledger `docs/reforma/NEXT-LEDGER.md`; exclusão requer autorização |
| `api/index.js`, `dist/`, `dist-server/` | gerado | não editado; regenerado via build | `npm run build` |
| `shared/typography/resolve.ts` + `fonts/registry.ts` | bug de build herdado (SPEC-001) | indireção `shared/typography/measurer.ts`; fontkit registrado por servidor/vitest | build ✅ |

## Diff e arquivos tocados

Removidos: `server/_core/voiceTranscription.ts`, `server/ai/slimBriefing.ts`, `server/db.test.ts`.
Novos: `shared/typography/measurer.ts`, `vitest.setup.ts`, `server/postJudge.compat.test.ts`, `docs/reforma/NEXT-LEDGER.md`.
Modificados: `server/db.ts` (tipos/funções shadow/pipeline), `server/ai/generationValidation.ts` (assertVariationSet), `server/ai/postEvaluation.ts` (+ teste reescrito), `server/ai/captionSynthesis.ts` (só determinístico), `server/ai/contentStrategy.ts` (+ teste reescrito), `server/_core/env.ts`, `server/routers/admin.ts`, `client/src/pages/Admin.tsx`, `shared/typography/resolve.ts`, `server/ai/generationOrchestrator.ts` (registra medidor), `vitest.config.ts`, `package.json`/`pnpm-lock.yaml` (deps), `api/index.js` (regenerado), docs da reforma.

## Contagem de testes

| | Antes (fim SPEC-004) | Depois |
|---|---|---|
| Arquivos de teste | 45 | 45 |
| Testes | 380 | 368 |

Queda: `db.test.ts` (16) + `postEvaluation.test.ts` (9 antigos → 8 novos) + `contentStrategy.test.ts` (3 → 4) + postJudge.compat (+2). Rede: `shared/typography/measure` — nenhum teste novo para o measurer (coberto indiretamente).

## Afirmo que / como rederivar / evidência

| Afirmação | Como rederivar | Evidência |
|---|---|---|
| Zero imports dos módulos removidos | grep `voiceTranscription|slimBriefing|evaluateAndReviseCandidates|assertVariationSet|extractShadowGraphEvents|synthesizeCaptionsForVariations|planContentStrategies` em client/server/shared | nenhuma ocorrência fora de docs históricos |
| `npm run check` limpo | `npm run check` | saída vazia |
| 368 testes passam | `npm test` | `45 passed (45)`, `Tests 368 passed (368)` |
| Build a partir das fontes (client + api/index.js) | `npm run build` | `✓ built in 10s`; `api\index.js 470.1kb` (regenerado, sem edição manual) |
| Harness sem regressão | `npm run harness -- --aspect 1:1,5:6,9:16` | 2664/0, ✅ APROVADO |
| Compatibilidade nomeada: postJudge testado | `npx vitest run server/postJudge.compat.test.ts` | 2/2 |
| Flag removida não referenciada | grep `aiContentStrategyEnabled|AI_CONTENT_STRATEGY_ENABLED` | zero ocorrências em código ativo |
| Deps removidas sem uso | varredura de imports + `npm run build` + `npm test` | build/testes verdes pós-remoção |
| Next intacto | `git -C postspark-next status` | sem alterações |
| Nenhum bundle editado manualmente | `git diff --stat api/index.js` | diffs apenas de regeneração |

## Exclusões declaradas

1. **`postspark-next/` não foi removido** — decisão do dono; o ledger recomenda retenção até a SPEC-006 e arquivo externo depois.
2. **`postJudge` mantido** como compatibilidade (superfície tRPC pública) — remoção exigiria decisão de dono sobre o contrato externo.
3. **`getGenerationOperationalMetrics`** simplificado (sem shadow/pipeline/graphCutover) — contrato do admin alterado de forma compatível? Não: o tipo mudou (campos removidos) e o Admin foi atualizado junto; clientes externos do endpoint admin são improváveis, mas a mudança é material para o contrato `admin.getGenerationMetrics` — registrada para a conferência decidir se `compatibilidade` exigiria versão suportada.
4. **`shared/const.ts` (AXIOS_TIMEOUT_MS)** mantido: constante legada exportada sem consumidor — não removida por ser superfície de `shared` (evita mudança de contrato para uma constante inofensiva).
5. **Correção do build (measurer)** é correção de regressão da SPEC-001 dentro desta spec (regressão provocada pela implementação → corrige-se na spec corrente, conforme EXECUCAO-AUTONOMA §"regressão provocada pela implementação").
6. **Sem conferência total** (pedido parcial): nenhuma remoção de contrato de domínio (snapshot/tRPC de produto); a mudança de contrato `admin.getGenerationMetrics` está declarada no item 3.

## Onde o executor desconfia do próprio trabalho

1. **A varredura de imports é textual** (regex por nome de módulo/função): imports dinâmicos com caminhos montados em runtime não seriam detectados — para os removidos não há nenhum padrão de caminho dinâmico plausível (verificação manual feita), mas a conferência deve repetir a busca.
2. **A remoção do card Admin mudou o contrato `admin.getGenerationMetrics`** — decidi simplificar em vez de manter campos sempre-zero; se algum painel externo consome o endpoint, quebra. Registro como pendência de conferência.
3. **O measurer stub do browser** (sem medidor configurado) faz a re-resolução de edição no Workbench falhar estruturadamente no cliente — comportamento JÁ existente (pathFor retornava undefined no browser), agora explícito. Se a conferência quiser medir no cliente de verdade (ex.: fonte embarcada via `font-face` + canvas), é feature nova, fora das specs.
4. **`@types/*` e ferramentas de build** (tsx, esbuild, tailwind, postcss, prettier, typescript, vite-plugin-manus-runtime) não foram removidas mesmo parecendo "não usadas" na varredura — são consumidas por scripts/config; a varredura só provou ausência para as 6 removidas.
5. **Não rodei o dev server** com o novo bundle (o build valida a compilação, não o runtime do browser); a renderização visual continua coberta pelo harness + conferência final.

## Degraus de verificação cumpridos e pendentes

Cumpridos:
1. `npm run check` ✅
2. 368 testes ✅
3. `npm run build` ✅ (client + server bundle regenerado)
4. harness ✅
5. Varredura de consumidores + flags + deps ✅

Pendentes:
6. Conferência parcial: repetir buscas por imports dinâmicos, revisar o diff de `admin.getGenerationMetrics`, decidir sobre `postJudge` e o destino final do Next.
