# Plano de Conclusão do Blueprint de Orquestração

> Status: planejado — aguardando execução.
>
> Fonte: `BLUEPRINT_ORQUESTRACAO_PIPELINE_GERACAO.md`, auditoria de implementação de 2026-07-13 e estado do código observado.
>
> Regra de trabalho: este plano não autoriza criar uma segunda normalização visual. `createPostVisualSnapshot` e `PostVisualSnapshot` continuam sendo a fronteira canônica e o documento autoritativo do editor.

## 1. Objetivo e definição de pronto

Concluir as fases pendentes do blueprint sem regressão nos fluxos existentes de geração, HoloDeck, Workbench, persistência e billing.

O blueprint estará encerrado quando:

1. Toda edição manual gerar um `PostVisualSnapshot` pelo normalizador canônico, inclusive com `applyVisualFitFallback`.
2. Snapshots server-side v3 forem validados por shape no cliente, e não apenas por `snapshotVersion`.
3. O contrato visual de carrosséis validar todos os slides projetados, não apenas o slide-base.
4. Sparks usarem reserva idempotente, commit na aprovação final e refund em falha terminal.
5. High Ticket deixar de ser um pipeline paralelo: será estratégia/configuração do pipeline canônico ou será removido.
6. O estado do grafo possuir schema Zod e os runs tiverem idempotência, orçamento e deadline explícitos.
7. A exportação for verificada por renderização PNG real em browser.
8. `pnpm test`, typecheck e build estiverem verdes, com os testes de contrato do snapshot executados.
9. `DOCUMENTO_MESTRE.md` registrar os contratos e o encerramento das fases.

## 2. Regras e limitações obrigatórias

- Não persistir projeções do editor em vez de `visualSnapshot`.
- Não recalcular layout, cores, background ou tokens em renderers.
- Overrides de carrossel continuam exclusivamente em `slides[].editorState`.
- Toda alteração em snapshot, HoloDeck, Workbench, editorStore, `PostRenderer`, `PostCardV2` ou persistência exige execução de `variationSnapshot.test.ts`.
- Alterações de contrato devem atualizar `snapshotVersion`, leitores de versões antigas e `DOCUMENTO_MESTRE.md` em conjunto.
- Billing deve ser entregue em migration e deploy isoláveis das mudanças visuais.
- Não remover `server/chameleonVision.ts` antes de confirmar referências estáticas, dinâmicas e operacionais.

## 2.1 Estado já implementado (revisão de 2026-07-13)

Antes de executar as fases abaixo, é preciso saber que partes do blueprint já estão no código. Isto evita retrabalho e reposiciona o escopo de algumas fases.

| Item do blueprint | Estado | Onde | Pendência remanescente |
|---|---|---|---|
| `layoutIntegrity` no juiz de direção de arte (Fase 3 do blueprint) | **Implementado** | `server/ai/postEvaluation.ts:119-137` (`computeLayoutIntegrity`), `:201` (integração), `:299/313` (peso + hard gate), `:391/431` (schema do juiz LLM) | Nenhuma no `postEvaluation`. **Sua consistência depende da Fase A.1** (edição no Workbench ainda não passa pelo normalizador). |
| `projectSnapshotForSlide` (projeção de slide de carrossel) | **Implementado** | `shared/variationSnapshot.ts:387-428` | Não é chamado em loop per-slide no juiz/fit — ver **Fase A.4**. |
| `applyVisualFitFallback` + `validateVisualFit` + issue types | **Implementado** | `shared/visualFit.ts`; `text_exceeds_visible_area` incluso | Nenhuma. O `LAYOUT_INTEGRITY_PENALTY` em `postEvaluation.ts:110-117` já cobre todos os 6 tipos. |
| Execução do grafo em modo shadow (`AI_GRAPH_SHADOW`) | **Parcial** | `server/ai/generationGraph/pipeline.ts`, `shadow.ts`, `replay.ts` | Usa tipos TS (`PipelineStatus`), **sem schema Zod formal** do estado. Ver **Fase E.1** (reescrito). |
| `debit_sparks` (RPC de débito) | **Implementado** | `server/billing.ts:119` (`debitSparks`), `routers.ts:585` | Não-idempotente, sem reserva/commit/refund. Ver **Fase C**. |

**Consequência direta:** a Fase D.2 não precisa mais "implementar `layoutIntegrity`" (já existe); a Fase E.1 não cria o grafo do zero (a execução já existe, falta o contrato parse-able); e a Fase A.1 vira **pré-requisito** para a integridade visual ser consistente entre geração e edição manual.

## 3. Fase A — Correções das partes já auditadas

### A.1 Normalização canônica em edições do Workbench

**Problema:** `client/src/lib/variationSnapshot.ts::buildVariationSnapshot` monta manualmente um objeto com cast para `PostVisualSnapshot`; com isso, uma edição pode não passar por `applyVisualFitFallback`.

**Implementação:**

1. Manter o editor como produtor de um `PostVariation` provisório, contendo todos os campos editados.
2. Registrar a geometria do aspect ratio ativo em `layoutSettingsByAspectRatio[aspectRatio]`, para que ela vença hints antigos de geração no normalizador.
3. Retornar `createPostVisualSnapshot(draft, aspectRatio)` em vez de um objeto construído manualmente.
4. Verificar que a mudança não faz o normalizador sobrescrever `sectionLayouts`, imagem, `bgValue`, `bgOverlay` ou overrides do slide corrente.
5. Garantir atualização atômica de `visualSnapshot` dentro de `setWithSnapshot` antes da próxima renderização.

**Arquivos principais:**

- `client/src/lib/variationSnapshot.ts`
- `client/src/store/editorStore.ts`
- `client/src/lib/variationSnapshot.test.ts`
- `client/src/store/editorStore.test.ts`

**Critério de aceite:** uma edição que antes criaria headline/body sobrepostos, texto fora do canvas ou card estreito produz snapshot já corrigido pelo fit canônico.

> **Por que isto é pré-requisito:** o `computeLayoutIntegrity` (já implementado em `server/ai/postEvaluation.ts:119`) chama `createPostVisualSnapshot`. Hoje, durante a geração o snapshot atravessa o normalizador e o fallback visual; mas durante a **edição no Workbench**, `buildVariationSnapshot` (`client/src/lib/variationSnapshot.ts:42-61`) ainda constrói o objeto manualmente com `as PostVisualSnapshot`, **sem** `applyVisualFitFallback`. Sem A.1, um post pode passar pelo juiz (geração) e voltar a ficar quebrado ao ser editado, ou um post com `layoutIntegrity` baixo pode ser "corrigido" só na geração e quebrar de novo na edição. A.1 fecha essa inconsistência.

### A.2 Validação real de snapshot v3

**Problema:** `isFrozenV3` aceita qualquer objeto com `snapshotVersion === 3`.

**Implementação:**

1. Importar `postVisualSnapshotSchema` no carregamento do editor.
2. Usar `safeParse` para decidir se um snapshot pode ser consumido verbatim.
3. Se v3 for inválido, registrar motivo em desenvolvimento e atravessar o caminho de compatibilidade pelo normalizador.
4. Preservar leitura de snapshots v1/v2 persistidos, sempre normalizando-os.
5. Adicionar fixture de snapshot v3 truncado/parcial e provar que ele não é tratado como frozen.

**Critério de aceite:** somente snapshot v3 com shape válido evita re-normalização.

### A.3 Contrato de design tokens

**Problema:** o schema permite `designTokens` parcial, enquanto snapshots v3 produzidos no runtime possuem tokens completos.

**Implementação:**

1. Mapear fixtures e posts legados que dependem de tokens parciais ou ausentes.
2. Endurecer o schema especificamente para v3, mantendo leitura explícita de versões antigas.
3. Garantir que `synchronizeDesignTokenColors` produza um conjunto completo antes de persistir ou retornar o snapshot.
4. Adicionar testes para v3 com tokens incompletos (rejeitado) e v1/v2 legado (normalizado).

**Critério de aceite:** snapshots novos não podem ser persistidos com contrato mais frouxo que a garantia do runtime.

### A.4 Carrossel por slide

**Problema:** o fit e o juiz v1 avaliam implicitamente o slide-base; projeções dos demais slides podem escapar.

**Implementação:**

1. Usar `projectSnapshotForSlide` para cada slide do carrossel.
2. Executar `validateVisualFit` em todas as projeções.
3. Agregar issues por índice de slide e enviar o sumário ao juiz de direção de arte.
4. Fazer revisão por slot retornar ao funil completo: schema, copy guards, brand guardian, diversidade, snapshot e fit.
5. Se houver fallback de slides, marcar `generationMeta.slidesFabricated` e estado degradado de forma observável.

**Critério de aceite:** um carrossel só passa quando todos os cinco slides projetados atendem ao contrato visual ou estão explicitamente degradados.

## 4. Fase B — Limpeza e documentação


### B.1 Código órfão

1. Rodar busca por imports estáticos, imports dinâmicos, paths e referências de deploy para `server/chameleonVision.ts`.
2. Confirmar que não há feature flag ou rota externa ainda dependente do arquivo.
3. Remover o arquivo e testes exclusivamente associados, se existirem.
4. Rodar typecheck e testes do backend.

> **Não confundir `chameleonVision.ts` com `ChameleonProtocol`:** são coisas diferentes.
> - `server/chameleonVision.ts` — **órfão** (zero imports ativos em `server/routers.ts`; só aparece em caches `.cache/`, `.claude/worktrees/` e no próprio arquivo). Alvo da remoção aqui.
> - `ChameleonProtocol` — **ativo**. É um endpoint em `server/routers.ts:2220` que debita Sparks (`SPARK_COSTS.CHAMELEON`) e importa de `./chameleon` (`routers.ts:10`), **não** de `chameleonVision`. Não tocar neste neste item.
>
> A auditoria de 2026-07-13 confirmou que `routers.ts` não importa `chameleonVision` em nenhuma linha.

### B.2 Documentação residual

1. Atualizar `docs/project-status.md`, `docs/audit-report.md`, `docs/AUDITORIA_IMPLEMENTACAO.md` e o plano de reforma do Workbench para remover referências a componentes excluídos.
2. Corrigir a nota histórica de `post.listBackgrounds` em `DOCUMENTO_MESTRE.md`.
3. Registrar a fronteira canônica de snapshot e a validação por slide como comportamento confirmado.

**Critério de aceite:** documentação ativa não declara como pendente ou existente algo que o código já removeu ou concluiu.

## 5. Fase C — Billing transacional (Fase 4 do blueprint)

### C.1 Modelo de dados e migrations

1. Criar tabela/ledger `spark_reservations` no schema `postspark` com: `id`, `idempotency_key`, `user_uuid`, `generation_run_id`, `amount`, `status`, `description`, timestamps e metadados de erro.
2. Adicionar constraints para valor positivo, status válido e unicidade de `(user_uuid, idempotency_key)`.
3. Criar índices por usuário/status e por run.
4. Habilitar RLS e políticas coerentes com o service role; documentar que o runtime usa o service role em `server/billing.ts`.
5. Atualizar `drizzle/schema.ts` e criar migration SQL idempotente.

### C.2 RPCs atômicas

1. Implementar `reserve_sparks`: validar saldo, criar/reutilizar reserva idempotente e impedir saldo disponível negativo.
2. Implementar `commit_spark_reservation`: tornar a cobrança definitiva uma única vez.
3. Implementar `refund_spark_reservation`: liberar reserva em falha sem duplicar saldo.
4. Definir comportamento para planos DEV/FOUNDER e ambientes sem Supabase, sempre retornando handle consistente.
5. Registrar eventos de billing no run/operational log.

### C.3 Integração em `post.generate`

1. Resolver `idempotencyKey` antes de qualquer chamada de LLM.
2. Reservar Sparks no início da geração.
3. Vincular a reserva ao `generationRunId` assim que ele existir.
4. Fazer commit somente após `assertVariationSet`, persistência de fingerprints e aprovação final.
5. Fazer refund em toda falha terminal: LLM, schema, fit, persistência, timeout e exceções não tipadas.
6. Não alterar os fluxos de cobrança de geração de imagem sem auditoria específica; eles ficam explicitamente fora desta entrega inicial.
7. Retornar erro tRPC tipado que diferencie saldo insuficiente, falha reembolsada e entrega degradada.

> **Refund cobre o meio do pipeline, não só a entrada.** Hoje `debitSparks` é chamado **antes** de qualquer LLM (`routers.ts:585`), então uma falha no meio da geração (schema, fit, persistência, timeout serverless) já consumiu Sparks. O refund da Fase C deve ser disparado por **qualquer** exceção/rejeição ocorrida **depois** da reserva — envolver o corpo de `post.generate` num bloco que faça `refund` no `catch`/rejeição terminal antes de propagar o erro, e não apenas "antes de chamar o LLM". Sem isso, uma exceção não-tipada no meio do run deixa o usuário pago sem entrega.

> **Dívida técnica conhecida (fora do escopo desta entrega, registrar explicitamente):** existem **três** outros pontos de débito além de `post.generate`, todos no mesmo padrão não-idempotente de `debitSparks`:
> - `server/routers.ts:1836` — geração de imagem IA (`SPARK_COSTS.GENERATE_IMAGE`).
> - `server/routers.ts:1999` — geração de imagem de fundo (`SPARK_COSTS.GENERATE_IMAGE`).
> - `server/routers.ts:2223` — `ChameleonProtocol` / análise de marca (`SPARK_COSTS.CHAMELEON`).
>
> Eles **não** serão migrados para reserva/commit/refund nesta Fase C (item 6 acima), mas ficam registrados como pendência para uma Fase C.2 futura. Sem isso, o billing transacional fica pela metade: o fluxo principal fica idempotente, mas três entradas de cobrança continuam sujeitas a double-charge e débito sem entrega.

### C.4 Testes de billing

1. Sucesso: reserva seguida de um commit, com débito exato.
2. Falha de LLM: reserva reembolsada.
3. Falha em `assertVariationSet`: reserva reembolsada.
4. Falha de persistência: reserva reembolsada.
5. Duas chamadas concorrentes com a mesma chave: uma reserva e um débito.
6. Repetir commit/refund: operação idempotente.
7. Saldo insuficiente: não chamar LLM nem criar débito.

**Critério de aceite:** nenhuma falha terminal de `post.generate` deixa Sparks cobrados; um double-click não cobra duas vezes.

## 6. Fase D — Unificação High Ticket (Fase 5 do blueprint)

### D.1 Inventário de paridade

1. Catalogar tudo que `server/ai/highTicket/` faz e que o fluxo canônico não faz: context loader, intent routing, workers, QA, correction loop, originalidade, visual contract, captions e persistência.
2. Mapear cada responsabilidade para um nó/estratégia canônica ou justificar remoção.
3. Criar matriz de entrada/saída e testes de paridade para modo normal e High Ticket.

### D.2 Migração para estratégia canônica

1. Fazer `strategy_router` absorver a decisão de intenção High Ticket.
2. Converter workers High Ticket em configuração de geração por slot, sem segundo orquestrador.
3. Centralizar QA em `postEvaluation` — `layoutIntegrity` **já está implementado** (`server/ai/postEvaluation.ts:119-137`, integrado em `:201/299/313/391/431`); o que falta é o `qaEvaluator` do High Ticket deixar de rodar em paralelo e delegar ao `postEvaluation` canônico.
4. Centralizar captions, originalidade e fit visual nos módulos canônicos (`synthesizeCaptionsForVariations`, `semanticOriginality`, `validateVisualFit`), removendo as cópias locais em `server/ai/highTicket/`.
5. Preservar metadados e rastreabilidade específicos como estratégia no `generationTrace`, e não como state machine independente.
6. Migrar persistência de estados úteis para o schema do grafo geral.

### D.3 Retirada do pipeline paralelo

1. Executar replay/paridade com `AI_GRAPH_SHADOW`.
2. Comparar qualidade, rejeição, fallback, custo e duração por estratégia.
3. Habilitar o caminho único de forma controlada.
4. Remover `AI_HIGH_TICKET_PIPELINE`, `runHighTicketPipeline` e módulos não reutilizados.
5. Atualizar imports, testes, documentação e flags de ambiente.

**Critério de aceite:** há um único pipeline de produção; High Ticket é seleção de estratégia, não bifurcação arquitetural.

## 7. Fase E — Fechamento técnico obrigatório do blueprint

### E.1 Schema do estado do grafo

1. Formalizar schemas Zod para estado, slots, eventos, billing, controle e issues de fit — modelo: o `generationGraphStateSchema` do blueprint §4.1 (`BLUEPRINT_ORQUESTRACAO_PIPELINE_GERACAO.md:169-261`).
2. Decidir a **localização**: `shared/generationGraph.ts` (permite `safeParse` no client e em testes de replay) ou `server/ai/generationGraph/stateSchema.ts` (próximo da execução). Recomendação: `shared/`, porque o replay e a validação de snapshots persistidos precisam ler o estado fora do servidor.
3. Substituir os tipos TS soltos atuais (`PipelineStatus` em `server/ai/generationGraph/pipeline.ts`) pelo schema parse-able; validar todo estado persistido/leitura de replay com `generationGraphStateSchema.parse`.
4. Versionar o formato de replay e definir migração/compatibilidade para versões anteriores.

> **A execução do grafo já existe.** `server/ai/generationGraph/` contém `pipeline.ts` (21KB), `shadow.ts` (10KB) e `replay.ts` — é a implementação do modo `AI_GRAPH_SHADOW`. O que falta **não** é a execução, é o **contrato formal**: hoje o estado é tipado por TS (`PipelineStatus` e afins) mas não passa por `z.parse`, então snapshots persistidos e replays não são validados por shape. E.1 é formalização de contrato, não criação do grafo.

### E.2 Controle operacional do run

1. Resolver chave idempotente no nó de entrada.
2. Implementar `llmCallBudget` e `deadlineAt` antes de cada nó LLM.
3. Fazer os limites escolherem edge de degradação ou refund, nunca timeout opaco do host.
4. Persistir eventos em bateladas nos nós determinísticos rápidos.
5. Expor KPIs: retry por slot, fallback por nó, auto-fix visual, rejeição do juiz e degradação de carrossel.

### E.3 Exportação real

1. Iniciar ambiente de desenvolvimento com servidor local.
2. Usar browser automatizado para gerar PNG de snapshots representativos.
3. Validar tamanho do canvas, presença de conteúdo, ausência de console errors e regressões visuais críticas.
4. Automatizar ao menos uma matriz mínima: estático 1:1, 5:6, 9:16 e carrossel.

**Critério de aceite:** o contrato não termina no objeto em memória; ele é validado até o PNG exportado.

## 8. Pós-blueprint: itens que não bloqueiam encerramento

Estes itens devem ficar registrados, mas não bloqueiam as fases A–E sem decisão explícita de produto:

- Juiz v2 com screenshot headless e visão computacional.
- Smart guides entre elementos; a grade 9x9 atual permanece como comportamento suportado.
- Undo/redo transacional mais amplo, além das coalescências atuais.
- Unificação de coordenadas de `textElements` do espaço lógico 360x360 para contrato de pixels/canvas mais explícito.
- Edição geométrica dedicada de `bgOverlay.position`.
- Validação de formatos CSS numéricos em `TextElement.styles`.
- Limpeza de exports e nomes internos em módulos de IA.

## 9. Ordem de execução e gates

> Princípio de dependência: a integridade visual já implementada (`computeLayoutIntegrity`) só é **consistente** entre geração e edição depois da Fase A.1. Por isso A.1 vem primeiro e gateia tudo o que depende de snapshots confiáveis.

1. **Fase A.1 e A.2** — destravam a consistência do juiz visual e a confiança em snapshots v3.
2. **Testes de snapshot/editor** (`variationSnapshot.test.ts`, `editorStore.test.ts`); só avançar se verdes.
3. **Fase A.3 e A.4** — contrato de tokens e carrossel por slide.
4. **Fase B** (remoção de `chameleonVision.ts` + atualização de docs) e atualização do documento-mestre.
5. **Fase C** em branch/deploy observável isolado — reserva/commit/refund em `post.generate`. Cobre refund no meio do pipeline, não só na entrada. Os três débitos extras (imagem, background, Chameleon) ficam para Fase C.2.
6. **Testes de billing** (C.4) e janela de observação de logs.
7. **Fase D** com replay de paridade antes de retirar `AI_HIGH_TICKET_PIPELINE`. Lembrar: `layoutIntegrity` já existe; o trabalho é fazer `highTicket/qaEvaluator` delegar ao `postEvaluation` canônico.
8. **Fase E** (formalizar schema Zod do grafo — a execução em `server/ai/generationGraph/` já existe) e validação completa.
9. **Auditoria final:** marcar cada item como concluído, auditado ou pós-blueprint.

## 10. Comandos de validação previstos

Scripts confirmados em `package.json`:

```powershell
pnpm test      # vitest run (suíte completa)
pnpm check     # tsc --noEmit (typecheck)
pnpm build     # vite build + esbuild -> api/index.js
```

Além da suíte completa, executar os testes focados por fase:

```powershell
pnpm test variationSnapshot editorStore          # Fase A
pnpm test postEvaluation                          # confirmar layoutIntegrity intacto após D.2
pnpm test server/ai/generationGraph              # Fase E (pipeline/shadow/replay)
```

> **Atenção:** hoje **não existe** `billing.test.ts`. Os testes de billing listados em C.4 serão **criados** na Fase C — ao chegar nela, adicione o arquivo e rode `pnpm test billing` para cobrir reserva/commit/refund/idempotência.

E o fluxo de browser para exportação (Fase E.3), que roda fora do vitest.

## 11. Atualizações obrigatórias de documentação

Ao concluir cada fase, atualizar `DOCUMENTO_MESTRE.md` com:

1. Responsabilidade e dono dos módulos alterados.
2. Contratos de entrada/saída e versões de snapshot/grafo.
3. Fluxo de erro, refund e idempotência de billing.
4. Flags removidas ou alteradas.
5. Pendências confirmadas e itens transferidos para pós-blueprint.