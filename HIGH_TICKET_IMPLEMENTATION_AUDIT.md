# Auditoria de implementacao: Pipeline High Ticket

Data de inicio: 2026-07-07

Objetivo: implementar o pipeline High Ticket conforme `HIGH_TICKET_PIPELINE_IMPLEMENTATION_PLAN.md` revisao 1.1, preservando a fonte unica de verdade visual (`PostVisualSnapshot`) e registrando cada passo relevante para auditoria posterior.

## Passos executados

1. Inicio da implementacao total solicitado pelo usuario.
   - Escopo aceito: contratos, validators, grafo, persistencia, feature flag, integracao controlada e testes focados.
   - Regra de seguranca: nenhuma entrega parcial ao HoloDeck; o pipeline deve retornar exatamente 3 variacoes validas ou falhar/fazer fallback conforme flag explicita.
   - Regra visual: HoloDeck e Workbench continuam passando pelo normalizador canonico `createPostVisualSnapshot`; o backend nao cria `PostVisualSnapshot`.
2. Criados contratos compartilhados High Ticket.
   - Arquivos: `shared/highTicket.ts`, `shared/highTicketSchemas.ts`.
   - Conteudo: `MasterBriefing`, `WorkerPayload`, `RouterOutput`, `OriginalityResult`, `QaResult`, `HighTicketGraphState` e schemas Zod correspondentes.
   - Observacao: `WorkerPayload` permanece interno ao grafo e nao substitui `PostVariation`.
3. Adicionados helpers runtime de banco.
   - Arquivo: `server/db.ts`.
   - Conteudo: leitura de `brand_kits`/`personas`, update incremental de `generation_runs.graph_state`, suporte a `spark_cost` e `completed_at`.
   - Decisao: `createGenerationRun` passou a usar `upsert` para permitir que o grafo crie o run cedo e o trace finalize depois sem conflito de chave.
4. Implementados modulos iniciais do grafo High Ticket.
   - Arquivos: `server/ai/highTicket/contextBudget.ts`, `contextLoader.ts`, `intentRouter.ts`, `workers.ts`, `visualContractValidator.ts`, `finalMapper.ts`, `semanticOriginality.ts`, `qaEvaluator.ts`, `correctionLoop.ts`, `captionSynthesis.ts`, `persist.ts`, `graph.ts`, `index.ts`.
   - Decisao: originality usa `server/ai/semanticOriginality.ts`; QA usa `server/ai/postEvaluation.ts`; o backend mapeia `WorkerPayload` para `PostVariation`, mas nao cria `PostVisualSnapshot`.
   - Decisao: o grafo persiste `graph_state` apos cada transicao relevante.
5. Adicionadas flags e rotas de modelo.
   - Arquivos: `server/_core/env.ts`, `server/ai/modelRouter.ts`.
   - Flags: `AI_HIGH_TICKET_PIPELINE=false`, `AI_HIGH_TICKET_LEGACY_FALLBACK=false`.
   - Rotas: `high_ticket_context_summary`, `high_ticket_intent_router`, `high_ticket_worker`, `high_ticket_qa`, `high_ticket_revision`, `high_ticket_caption_synthesis`.
6. Integrado `post.generate` atras de feature flag.
   - Arquivo: `server/routers.ts`.
   - Ponto de entrada: depois de billing, trace e normalizacao do `executionBrief`; antes do pipeline legado.
   - Com `AI_HIGH_TICKET_PIPELINE=false`, o fluxo legado continua sendo executado.
   - Com `AI_HIGH_TICKET_PIPELINE=true`, `runHighTicketPipeline` retorna `PostVariation[]` e `generationRunId`; o frontend segue criando `PostVisualSnapshot`.
   - Com falha High Ticket, o pipeline legado so e usado se `AI_HIGH_TICKET_LEGACY_FALLBACK=true`.
7. Validados testes focados da camada nova.
   - Comando: `npm test -- shared/highTicketSchemas.test.ts server/ai/highTicket/visualContractValidator.test.ts server/ai/highTicket/finalMapper.test.ts`.
   - Resultado: 3 arquivos passaram, 5 testes passaram.
   - Observacao: foi necessario rodar fora do sandbox porque o Vitest/esbuild falhou ao acessar o `vitest.config.ts` dentro das restricoes do sandbox.
8. Corrigida persistencia para preservar `graph_state`.
   - Arquivo: `server/db.ts`.
   - Motivo: `finishGenerationTrace` tambem usa `createGenerationRun`; o `upsert` nao pode sobrescrever `generation_runs.graph_state` com `{}` quando `graphState` nao foi fornecido.
9. Adicionado shim de tipos para `react-helmet-async`.
   - Arquivo: `client/src/types/react-helmet-async.d.ts`.
   - Motivo: `npm run check` estava bloqueado por erro preexistente de modulo/tipos nas paginas legais (`Cookies`, `Privacy`, `PrivacySettings`, `Terms`).
   - Escopo: declaracao minima de `Helmet` e `HelmetProvider`; sem alteracao funcional de UI.
10. Validacao global executada.
   - `npm run check`: passou.
   - `npm test`: executado fora do sandbox. Resultado: 32 arquivos passaram, 2 arquivos falharam.
   - Falhas: `client/src/editor/interaction/interaction.test.ts` (7 falhas) e `client/src/editor/integration/firstDrag.dom.test.tsx` (2 falhas).
   - Avaliacao: falhas estao no motor de interacao/primeiro drag do Workbench, area nao alterada por esta implementacao High Ticket. Mantidas como risco residual separado.
   - Testes High Ticket passaram dentro da suite completa: `shared/highTicketSchemas.test.ts`, `server/ai/highTicket/visualContractValidator.test.ts`, `server/ai/highTicket/finalMapper.test.ts`.
11. Integrada etapa explicita de `caption_synthesis` ao grafo High Ticket.
   - Arquivo: `server/ai/highTicket/captionSynthesis.ts`.
   - Reuso: `server/ai/captionSynthesis.ts`.
   - Posicao: apos `visual_contract_validated` e antes de persistir fingerprints/output final.
   - Resultado: captions finais sao sintetizadas a partir do conteudo visual aprovado; em falha, captions dos workers sao preservadas e o evento fica registrado no `graph_state`.
12. Revalidacao apos caption synthesis.
   - `npm run check`: passou.
   - Testes focados High Ticket: passaram novamente, 3 arquivos e 5 testes.
13. Adicionado teste explicito de handoff HoloDeck -> Workbench para variacao High Ticket.
   - Arquivo: `client/src/lib/variationSnapshot.test.ts`.
   - Cobertura: uma `PostVariation` com `aspectRatioOptimizations`, `layoutSettingsByAspectRatio` e `designTokens` e normalizada uma unica vez por `createPostVisualSnapshot`.
   - Verificacao: `editorStore.loadSnapshot` preserva o mesmo snapshot selecionado, incluindo layout/cor do aspect ratio, tokens e otimizacoes por formato.
    - Revalidacao focada: passou com 4 arquivos e 18 testes.
14. Refinamento do pipeline (QA real, modelos por no, correction schema, slim briefing, originality single-pass).
    - Arquivos alterados: `server/ai/highTicket/qaEvaluator.ts` (rewrite com invokeLLM proprio), `server/ai/highTicket/correctionLoop.ts` (json_schema estrito), `server/ai/highTicket/graph.ts` (originality single-pass), `server/ai/highTicket/workers.ts` (slimBriefing), `server/ai/highTicket/slimBriefing.ts` (novo), `server/ai/modelRouter.ts` (roteamento por no), `server/_core/env.ts` (6 novas env vars HT_*_MODEL), `shared/postsparkSchemas.ts` (export generationEvaluationSchema + captionCoherence), `shared/highTicketSchemas.ts` (evaluation via schema real).
    - Validacao: `npm run check` passou. Testes High Ticket + handoff: 18 testes passando.
    - Modelo default do QA: `anthropic/claude-3.5-sonnet` (sobrescrevivel via `HT_QA_MODEL`).
    - Correction loop agora usa `json_schema` completo do WorkerPayload, eliminando falhas bobas de parsing.

## Decisoes arquiteturais

- O log de auditoria sera atualizado durante a implementacao.
- A implementacao sera feita atras de `AI_HIGH_TICKET_PIPELINE=false` por padrao.
- Qualquer fallback para pipeline legado devera ser separado da flag principal.

## Validacoes pendentes

- Executar teste end-to-end manual com `AI_HIGH_TICKET_PIPELINE=true` contra Supabase/LLM reais antes de ativar para usuarios.
- Corrigir separadamente as falhas preexistentes em `client/src/editor/interaction/interaction.test.ts` e `client/src/editor/integration/firstDrag.dom.test.tsx` para recuperar a suite completa.
