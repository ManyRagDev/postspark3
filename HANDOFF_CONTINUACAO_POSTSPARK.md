# Handoff — Continuação da implementação do PostSpark (Experiência Inteligente)

> Copie o bloco entre as linhas `===== PROMPT INÍCIO =====` e `===== PROMPT FIM =====`
> e cole como primeira mensagem no novo chat, dentro do mesmo repositório:
> `/home/many/Documentos/Projetos linux/PostSpark 3`.

---

===== PROMPT INÍCIO =====

Você é o agente principal do PostSpark e deve **continuar** a implementação já iniciada do plano
`PLANO_IMPLEMENTACAO_EXPERIENCIA_INTELIGENTE_POSTSPARK.md`. Este é um handoff: parte do trabalho
já foi feita e está commitada apenas no worktree (HEAD `e36c6ee`, sem commit novo — não faça commit).

## 1. Contexto obrigatório — leia antes de qualquer edição

1. `AGENTS.md`
2. `DOCUMENTO_MESTRE.md`
3. `PLANO_IMPLEMENTACAO_EXPERIENCIA_INTELIGENTE_POSTSPARK.md`
4. `HANDOFF_CONTINUACAO_POSTSPARK.md` (este arquivo)

Fluxo oficial ativo: `/thevoid` ou `/studio` → `StudioAppV2BPage` → `StudioGalleryView`/`StudioMobileFlashcards` → `CanvasLab`.
`Home.tsx`, `HoloDeck`, `WorkbenchV2` são **legado órfão**: não implemente novas features neles.
`CanvasPostModel` (`client/src/pages/CanvasLab/components/types.ts`) é o documento autoritativo do editor.
O runtime usa o cliente Supabase direto em `server/db.ts` (Drizzle NÃO é ORM de runtime).

## 2. Regras inegociáveis

1. Não faça commit/push/deploy nem aplique migrations em banco remoto/produção sem autorização.
2. Não use `git reset --hard`, `git checkout --` nem limpeza destrutiva. Preserve todas as alterações pré-existentes.
3. Não edite manualmente `api/index.js`, `dist/`, `dist-server/`.
4. Toda mutação visual passa pelo funil `CanvasLabPage.handleUpdatePost` e produz estado determinístico.
5. Ação "slide atual" nunca escreve no root global do documento.
6. Fallback local NUNCA é apresentado como geração de IA.
7. Priorize funções puras e schemas Zod em fronteiras de API/persistência.
8. Após cada mudança permanente, atualize `DOCUMENTO_MESTRE.md` (adicione §13.x) e os checkboxes do plano.

## 3. O que JÁ foi concluído (não refazer)

- **Etapa 0** (baseline/proteção): HEAD `e36c6ee`; 107 arquivos pré-modificados preservados.
- **Etapa 1** (schema/traces/taxonomia):
  - `shared/postspark.ts` e `shared/postsparkSchemas.ts`: `GenerationFailureReason`, `GenerationFailureMetadata`, `GenerationProvenance` (+ Zod).
  - `shared/generationFailure.ts` (classify/toFailureMetadata/isRetryable/userMessageFor).
  - `server/_core/generationError.ts` + `errorFormatter` em `server/_core/trpc.ts`.
  - Persistência degradável do trace em `server/ai/generationTrace.ts` + `createGenerationRunMinimal`/`isSchemaIncompatibilityError` em `server/db.ts`.
  - Migration idempotente `drizzle/0017_add_generation_failure_reason.sql`; `runtimeManifest.ts` atualizado.
  - `post.generate` em `server/routers.ts` já usa a taxonomia (quality_rejected/provider_*).
- **Etapa 2** (integridade de slides/save/restore/export):
  - `client/src/pages/CanvasLab/lib/documentCommands.ts` (applyPatchToCurrentSlide/AllSlides, updateSlideById, setCurrentSlideBackground, duplicateSlide, removeSlide, reorderSlides, resolveCoverSlide).
  - `lib/saveAdapter.ts` projeta campos legados pela **capa** (1º slide), nunca pelo slide ativo.
  - `CanvasLabPage.tsx` isola `bgTransform` por slide e usa comandos para duplicar/excluir.
  - ZIP offscreen determinístico em `CanvasPostStage.tsx` (override `exportSlideIndex` + await de fontes/imagens).
  - Restore do histórico via `postspark.restore_generation` ↔ `StudioAppV2BPage`.
  - Testes: `documentCommands.test.ts`, `saveAdapter.test.ts`.
- **Etapa 3** (formato/fallback/gates) — backend e shared prontos:
  - `shared/formatIntent.ts` (detectFormatIntent/hasFormatMismatch).
  - `shared/sourceCopyGate.ts` (evaluateSourceCopyGate/ngramOverlap/stripRequiredTerms).
  - `server/routers.ts`: revalida formato antes de reservar Sparks; gate de copy pós-aprovado.
  - `client/src/pages/CanvasLab/components/types.ts`: novo campo `provenance?: CanvasPostProvenance`.
  - `client/src/pages/StudioApp/lib/studioGeneration.ts`: helper `localFallbackProvenance`.
  - Testes: `formatIntent.test.ts`, `sourceCopyGate.test.ts`.

## 4. Estado atual verificado

- `npm run check` ✅ (0 erros).
- `npm run test` ✅ **752/752** (60 arquivos).
- `npm run verify:runtime` ❌ (6 críticos remotos ausentes: `spark_reservations`, `generation_runs.events`, `events_version`, RPCs `reserve_/commit_/refund_spark_reservation`). São **bloqueios externos pré-existentes** — migrations `0013/0014/0015` aguardam autorização.

## 5. O que FALTA fazer (sua missão)

Continue **autonomamente por todas as etapas seguras/localmente executáveis**:

- **Etapa 3 — finalizar UI**: tela de confirmação de divergência de formato (`detectFormatIntent`) antes de gerar; trocar o fallback local genérico por **fallback explícito opt-in** com proveniência persistente (sem toast de sucesso de IA após fallback). Arquivos: `StudioAppV2BPage.tsx`, `components/v2/StudioCreateViewV2B.tsx`, `components/v2/shared.tsx`, `lib/studioGeneration.ts`.
- **Etapa 4 — briefing persistente e inteligência de marca**: contrato `CreationBrief` versionado; separar entrada/interpretação; persistir rascunho; recuperar após refresh; detectar URLs embutidas; expor `creationMode`/`executionBrief` no Studio; carregar Brand Kit/persona; testes (refresh→recupera, correção de interpretação, URL embutida, isolamento por usuário, GDPR).
- **Etapa 5 — fidelidade geração→CanvasLab**: eliminar `any` de `variationToCanvasModel`; preservar headline/body/caption/CTA/hashtags/sections/slides/copyAngle/proveniência; versionar `CanvasPostModel`; migração de modelos antigos; fixture de round-trip.
- **Etapa 6 — fundo/crop/mídia**: `BackgroundPlacement` (cover/contain/original/custom + focalPoint + crop); preservar asset original; controles desktop+mobile; persistência por slide; exportação idêntica ao preview.
- **Etapa 7 — paridade de textos/imagens livres**: `onTransformEnd` persistente; rotação/opacidade/ordem; duplicação com IDs novos; paridade desktop/mobile.
- **Etapa 8 — produtividade**: autosave (não duplicar post, controle de versão/conflito, recuperação após refresh); undo/redo sobre comandos; reordenação (save+ZIP); assistência contextual por IA reversível/rastreável com custo; auditoria pré-exportação.
- **Etapa 9 — hardening/rollout/documentação**: feature flags, métricas, matriz E2E, revisão final do `DOCUMENTO_MESTRE.md`.

## 6. Testes obrigatórios adicionais (cada etapa)

Cubra os casos da seção "Testes obrigatórios" de cada etapa no plano. Para exportação de carrossel,
compare **hashes/conteúdo visual** dos PNGs do ZIP (não apenas quantidade de arquivos).

## 7. Rituais de verificação (sempre)

- `npm run check`
- `npm run test`
- `npm run verify:runtime`
- `npm run verify:e2e` **somente** com autorização (consome Sparks/provedor).
- Antes de marcar uma etapa concluída, inspecione o código atual, rode os testes proporcionais e atualize `DOCUMENTO_MESTRE.md` + checkboxes do plano.

## 8. Entregável obrigatório ao final

Relatório com: resumo executivo; etapas concluídas; arquivos alterados; contratos criados/modificados; migrations
criadas e onde foram/não foram aplicadas; testes executados e resultados; critérios de aceite verificados;
bloqueios restantes; mudanças no `DOCUMENTO_MESTRE.md`; próximos passos que exigem autorização externa.

**Importante**: não pare após analisar. Continue implementando todas as etapas seguras até a definição de conclusão
ou até um bloqueio externo genuíno. Registre bloqueios com clareza e prossiga nas etapas independentes.

===== PROMPT FIM =====