# Handoff — Continuação da implementação do PostSpark (Experiência Inteligente)

> **Criado em:** 2026-09-23 (substitui `HANDOFF_CONTINUACAO_POSTSPARK.md`)
> **Repositório:** `/home/many/Documentos/Projetos linux/PostSpark 3`
> **HEAD:** `e36c6ee` (sem commit novo — NÃO faça commit)
> **Objetivo deste arquivo:** ser autossuficiente para outro agente continuar as etapas seguras do plano
> `PLANO_IMPLEMENTACAO_EXPERIENCIA_INTELIGENTE_POSTSPARK.md`.

---

## 1. Contexto obrigatório — leia antes de qualquer edição

1. `AGENTS.md`
2. `DOCUMENTO_MESTRE.md` (documento-mestre canônico; §13.7–§13.10 registram as Etapas 1/2/3/5 já feitas)
3. `PLANO_IMPLEMENTACAO_EXPERIENCIA_INTELIGENTE_POSTSPARK.md` (backlog completo com checkboxes)
4. Este arquivo (`HANDOFF_POSTSPARK_2026-09-23.md`)

### 1.1 Fatos de arquitetura que não podem ser assumidos errados

- **Fluxo oficial ativo:** `/thevoid` (e `/studio`, `/studio-v2b`) → `StudioAppV2BPage` (máquina `create → gallery → editor`) → `StudioGalleryView` (desktop) / `StudioMobileFlashcards` (mobile) → `CanvasLabPage`.
- **Legado órfão (não implementar features novas):** `Home.tsx`, `HoloDeck.tsx`, `WorkbenchV2/`. Só compatibilidade de leitura quando indispensável.
- **`CanvasPostModel`** (`client/src/pages/CanvasLab/components/types.ts`) é o documento autoritativo do editor oficial. Toda mutação visual passa pelo funil `CanvasLabPage.handleUpdatePost` e é renderizada deterministamente por `CanvasPostStage.tsx` (Konva).
- **Persistência em runtime** usa o cliente Supabase direto em `server/db.ts`. Drizzle **não** é ORM de runtime (é histórico declarativo).
- **Orquestrador único** `server/ai/generationOrchestrator.ts`: chamada generativa única, sem filas/workers/grafos multi-roundtrip.
- **Billing transacional:** reserva → geração → commit/refund em `server/routers.ts` (`post.generate`).

---

## 2. Regras inegociáveis

1. Não faça commit/push/deploy nem aplique migrations em banco remoto/produção sem autorização.
2. Não use `git reset --hard`, `git checkout --` nem limpeza destrutiva. Preserve TODAS as alterações pré-existentes (há 107+ arquivos modificados fora do escopo).
3. Não edite manualmente `api/index.js`, `dist/`, `dist-server/`.
4. Toda mutação visual passa pelo funil `CanvasLabPage.handleUpdatePost` e produz estado determinístico.
5. Ação "slide atual" NUNCA escreve no root global do documento (use `documentCommands.ts`).
6. Fallback local NUNCA é apresentado como geração de IA (proveniência `local_fallback` persistente).
7. Priorize funções puras e schemas Zod em fronteiras de API/persistência.
8. Após cada mudança permanente: atualize `DOCUMENTO_MESTRE.md` (novo §13.x) e os checkboxes do plano.
9. `CanvasPostModel` é autoritativo; campos legados do post (headline/body/slides) são apenas projeções.
10. `modelVersion` no `CanvasPostModel` é `2` (constante `CANVAS_MODEL_VERSION`); modelos antigos sem o campo devem continuar abrindo com defaults seguros.

---

## 3. Estado atual verificado (última bateria executada em 2026-09-23)

- `npm run check` → ✅ **0 erros** (`tsc --noEmit`).
- `npm run test` → ✅ **760/760** em **61 arquivos**.
- `npm run verify:runtime` → ❌ **6 críticos remotos ausentes** (bloqueio externo pré-existente):
  - `postspark.spark_reservations` (tabela)
  - `postspark.generation_runs.events`
  - `postspark.generation_runs.events_version`
  - RPCs `reserve_sparks`, `commit_spark_reservation`, `refund_spark_reservation`
  - Esses requisitos vêm das migrations `0013_harden_generation_events.sql`, `0014_spark_reservations.sql` e `0015_harden_manifest_corrective.sql`, que **aguardam autorização do dono** para aplicação no banco remoto.
- `npm run verify:e2e` **NÃO foi executado** (consome Sparks/provedor) — só com autorização.

---

## 4. O que JÁ foi concluído (não refazer)

### Etapa 0 — Baseline e proteção do worktree
- HEAD `e36c6ee`; ~107 arquivos pré-modificados preservados; batch verde no baseline.

### Etapa 1 — Schema, traces e taxonomia de falhas
- `shared/postspark.ts` / `shared/postsparkSchemas.ts`: `GenerationFailureReason`, `GenerationFailureMetadata`, `GenerationProvenance` (+ Zod).
- `shared/generationFailure.ts`: `classifyGenerationError`, `toFailureMetadata`, `isRetryable`, `userMessageFor`, `isGenerationFailureReason`.
- `server/_core/generationError.ts` (tRPC `GenerationFailureError`) + `errorFormatter` em `server/_core/trpc.ts` serializa `shape.data.generationFailure`.
- Persistência degradável do trace: `server/ai/generationTrace.ts` + `createGenerationRunMinimal`/`isSchemaIncompatibilityError` em `server/db.ts`.
- Migration idempotente `drizzle/0017_add_generation_failure_reason.sql`; `server/runtimeManifest.ts` atualizado.
- `post.generate` em `server/routers.ts` já usa taxonomia para todas as saídas de falha (quality_rejected/provider_*).

### Etapa 2 — Integridade de slides, save, restore e exportação
- `client/src/pages/CanvasLab/lib/documentCommands.ts`: funções puras `applyPatchToCurrentSlide`, `applyPatchToAllSlides`, `updateSlideById`, `setCurrentSlideBackground`, `duplicateSlide`, `removeSlide`, `reorderSlides`, `resolveCoverSlide`; duplicação regenera IDs aninhados.
- `lib/saveAdapter.ts`: `canvasModelToSavePayload` projeta campos legados pela **capa (1º slide)**, nunca pelo slide ativo.
- `CanvasLabPage.tsx`: `handleUpdateBgTransform` grava `bgTransform` apenas no slide atual (fim do vazamento).
- ZIP offscreen determinístico em `CanvasPostStage.tsx` (`exportSlideIndex` override + await de fontes/imagens).
- Restore do histórico via `postspark.restore_generation` ↔ `StudioAppV2BPage`.
- Testes: `documentCommands.test.ts`, `saveAdapter.test.ts`.

### Etapa 3 — Formato, fallback e gates de geração (backend + UI COMPLETOS)
- `shared/formatIntent.ts`: `detectFormatIntent` (`detectedFormat`/`confidence`/`evidence`), `hasFormatMismatch`.
- `shared/sourceCopyGate.ts`: `evaluateSourceCopyGate`, `ngramOverlap`, `stripRequiredTerms`.
- `server/routers.ts`: revalida `format_mismatch` ANTES de reservar Sparks; gate de similaridade após `approved` (vira `quality_rejected` + refund).
- **UI (novo nesta rodada):**
  - `client/src/pages/StudioApp/components/v2/CreationGuards.tsx`:
    - `FormatConfirmModal` — interrompe criação em divergência de formato, mostra evidência, oferece "Alterar para {detectado}"/"Manter {selecionado}".
    - `GenerationFailureModal` — mostra causa real (`reason`/`userMessage` da taxonomia), "Tentar novamente", "Revisar briefing" e "Usar sugestões locais" (opt-in).
  - `client/src/pages/StudioApp/StudioAppV2BPage.tsx` reescrito:
    - `handleCreateSubmit` bloqueia `hasFormatMismatch` localmente antes de gerar.
    - `doGenerate`/`doGenerateMore` NUNCA geram fallback automático; em erro abrem o modal com `generationFailure` (/ fallback `classifyGenerationError`).
    - variações IA recebem `aiGenerationProvenance(generationRunId)`.
  - `client/src/pages/StudioApp/lib/studioGeneration.ts`:
    - `aiGenerationProvenance(generationRunId)`, `localFallbackProvenance(reason)`.
    - `buildInitialFallbackVariations(prompt, declaredFamilyId?, reason?)` e `buildExtraFallbackVariations(prompt, reason?)` estampam `provenance: { source: "local_fallback" }` em todas as variações.
  - `client/src/pages/CanvasLab/components/types.ts`: `CanvasPostProvenance` e `saveAdapter.normalizeCanvasModel` preservam `provenance` no save/reopen.
- Testes: `formatIntent.test.ts`, `sourceCopyGate.test.ts`, `studioGeneration.test.ts` (proveniência/fallback), `saveAdapter.test.ts` (proveniência no round-trip).

### Etapa 5 — Fidelidade tipada geração → CanvasLab
- `variationToCanvasModel` deixou de receber `any` → `GeneratedVariationInput` (em `studioGeneration.ts`), com `CarouselSlide`/`ContentSection` de `@shared/postspark`.
- `CanvasPostModel` ganhou: `modelVersion` (=2), `callToAction`, `hashtags`, `sections` (`CanvasContentSection`), `copyAngle` (`CanvasCopyAngle`).
- Adapter preserva CTA/hashtags/seções (mesmo com `body`)/copyAngle; `sections` continuam sintetizadas em `subtext` para legibilidade.
- `saveAdapter.normalizeCanvasModel` preserva `provenance`, `callToAction`, `hashtags`, `sections`, `copyAngle` e `modelVersion` no save/reopen.
- Migração de modelos antigos: defaults seguros para posts sem `modelVersion`.
- Testes: `studioGeneration.test.ts` (round-trip `PostVariation → CanvasPostModel`), `saveAdapter.test.ts` (round-trip enriquecido + legado sem `modelVersion`).

---

## 5. Arquivos alterados/novos nesta rodada

**Novos:**
- `client/src/pages/StudioApp/components/v2/CreationGuards.tsx`
- `client/src/pages/StudioApp/lib/studioGeneration.test.ts`
- `client/src/pages/CanvasLab/lib/saveAdapter.test.ts`

**Modificados:**
- `client/src/pages/StudioApp/StudioAppV2BPage.tsx`
- `client/src/pages/StudioApp/lib/studioGeneration.ts`
- `client/src/pages/CanvasLab/components/types.ts`
- `client/src/pages/CanvasLab/lib/saveAdapter.ts`
- `DOCUMENTO_MESTRE.md` (§13.9 atualizada, §13.10 adicionada)
- `PLANO_IMPLEMENTACAO_EXPERIENCIA_INTELIGENTE_POSTSPARK.md` (checkboxes Etapa 5)

---

## 6. O que FALTA fazer (próximas frentes seguras — não bloqueadas por banco remoto)

### Etapa 4 — Briefing persistente e inteligência de marca
- Contrato `CreationBrief` **versionado** (sugestão no plano §9.1).
- Separar **entrada bruta** × **interpretação estruturada**, com tela curta de confirmação/edição opcional.
- Persistir rascunho de forma **durável** (tabela própria/entidade versionada — NÃO apenas `sessionStorage`).
- Recuperar rascunho após refresh (a rota oficial `/thevoid` deve ler o rascunho ao montar `StudioAppV2BPage`).
- Expor `creationMode` e `executionBrief` no Studio ativo (hoje só `ideation` é usado).
- Detectar **URLs embutidas** no briefing (não só quando o texto inteiro começa com URL).
- Carregar Brand Kit/persona; mostrar síntese da marca antes de usar.
- Testes: refresh→recupera, correção de interpretação, URL embutida, isolamento por usuário, GDPR (incluir rascunhos em exportação/exclusão).

### Etapa 6 — Fundo, crop e mídia
- `BackgroundPlacement` com `fitMode: "cover" | "contain" | "original" | "custom"`, `focalPoint`, `crop`.
- Preservar **asset original** (crop não destrutivo); nunca incorporar base64 pesado ao `canvas_model`.
- Controles desktop+mobile: Preencher / Mostrar inteira / Tamanho original / Ajuste custom / Zoom / Arrasto / Ponto focal / Restaurar.
- Persistência por slide; exportação idêntica ao preview.
- Testes: cover/contain/original/custom, restauração, persistência do crop, isolamento por slide, paridade desktop/mobile, CORS + imagem local.

### Etapa 7 — Paridade de textos e imagens livres
- `onTransformEnd` **persistente** (normalizar escala no modelo, sem acumulação visual).
- Rotação/opacidade/ordem de camada para `extraTexts` e `extraImages`.
- Duplicação de slide/elemento com IDs novos e referências imutáveis.
- Paridade desktop/mobile (mesmos comandos via `documentCommands.ts`).
- Testes: `onTransformEnd` persiste, deselecionar não reverte, save/reopen mantém, duplicação gera IDs únicos, isolamento por slide, paridade.

### Etapa 8 — Editor assistido e produtividade
- **Autosave**: debounce, estado `dirty/saving/saved/error`, controle de concorrência por versão/`updatedAt`, retry, recuperação pós-refresh, aviso ao fechar, NÃO duplicar post.
- **Undo/redo** sobre os comandos do `CanvasPostModel`.
- **Reordenação** de slides (drag-and-drop, IDs estáveis, capa explícita/primeira posição, save+ZIP na ordem).
- **Assistência contextual** por IA: reversível, rastreável (`generationRunId` próprio), custo indicado antes de consumir.
- **Auditoria pré-exportação**: contraste, overflow, elemento fora do canvas, texto cortado, slide vazio, numeração, CTA ausente, baixa resolução, fallback, fontes não carregadas.

### Etapa 9 — Hardening, rollout e documentação
- Feature flags, métricas de produto/operação, matriz E2E final, revisão final do `DOCUMENTO_MESTRE.md`.

---

## 7. Rituais de verificação (sempre)

```bash
npm run check
npm run test
npm run verify:runtime   # 6 críticos ausentes = bloqueio externo conhecido (ver §3)
# npm run verify:e2e     # SOMENTE com autorização (consome Sparks/provedor)
```

Antes de marcar uma etapa como concluída: inspecione o código atual, rode testes proporcionais, atualize `DOCUMENTO_MESTRE.md` (novo §13.x) e os checkboxes do plano.

---

## 8. Pontos de atenção para o próximo agente

1. **Checkpoint funcional em navegador ainda pendente** para os modais de Etapa 3 (`FormatConfirmModal` / `GenerationFailureModal`): rodar `npm run dev` e interagir manualmente (briefing de carrossel com seletor estático; falha de provider → fallback opt-in).
2. **`verify:e2e`** não foi executado — exige autorização e consume Sparks.
3. **Anatomia do erro tRPC no cliente**: metadados chegam em `err.data.generationFailure` (`GenerationFailureMetadata`); helper local já existe em `StudioAppV2BPage.extractFailureMetadata` (com fallback `classifyGenerationError`).
4. **Imports de alias**: `@` → `client/src`, `@shared` → `shared` (vid. `tsconfig.json`/`vite.config.ts`/`vitest.config.ts`).
5. **Workspace tem 107+ arquivos modificados fora do escopo** do plano; não reverter/resetar.

---

## 9. Entregável obrigatório ao final (para o próximo agente)

Relatório com: resumo executivo; etapas concluídas; arquivos alterados; contratos criados/modificados; migrations criadas e onde foram/não foram aplicadas; testes executados e resultados; critérios de aceite verificados; bloqueios restantes; mudanças no `DOCUMENTO_MESTRE.md`; próximos passos que exigem autorização externa.

**Importante:** não parar após analisar. Continuar pelas etapas seguras até definição de conclusão ou bloqueio externo genuíno, registrando bloqueios e prosseguindo nas etapas independentes.