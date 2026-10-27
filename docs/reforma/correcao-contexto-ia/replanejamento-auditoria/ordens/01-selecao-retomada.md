# C-01 — Seleção completa sem recompra na retomada

Estado: **PRONTA**
Papel: executor-blindado; um escritor para payload e proteção de retomada.
Base verificada: `main`, HEAD `40c0832`, com alterações locais da primeira entrega preservadas.
Depende de: exclusividade dos caminhos confirmada pelo responsável pela sessão antes de executar.
Execução: sequencial; precede C-02 e C-03.

## Objetivo e aceite

Resolver D1 e D3 juntos, conforme [CONTRATOS §§1–2](../CONTRATOS.md). Não tornar históricos antigos recompráveis ao completar a entrada nova.

- AC-1: sem prepared, carregar journal histórico sintético anterior à reforma com lote Jev completed ou uncertain; em ambos os casos zero chamadas novas, falha `preparation_contract_incompatible`/selection/não retryable antes de pin novo. Cobrir também seleção completed antes de savePrepared e catálogo histórico com/sem perfis compactos.
- AC-2: pedido novo fixa `selection_input` antes de Jev/seletor. Interrupção depois de lote completed retoma com mesma entrada e chave; interrupção depois da seleção não recompra seleção. Efeito uncertain não é contornado. Journal ilegível/estado desconhecido ou recibo inválido falha fechado; mudar default/modelo incompatível não reescreve pin.
- AC-3: prepared histórico salvo continua retornando fonte/configuração/hash/parecer idênticos sem exigir pin novo e sem recarregar snapshot. Não remover propostas prontas nem alterar reserva/liquidação.
- AC-4: com <=12 e >12 ofertas compactas v2, sentinelas exclusivas de requisitos literal/meaning/forbidden aparecem no Jev quando aplicável e no seletor após adapter, com scope/case/match corretos. Termos legados, fonte/complemento, CTA e intervenção permanecem. Ideation text/URL e limites 24k/96k/28k mantidos, inclusive falha explícita de envelope excedido.
- AC-5: journal/RPC PGlite persiste e reaproveita a nova chave pelo `begin` normal, sem whitelist/migration. Comparar journal antes/depois de retomada: recibos anteriores intactos. Testes devem falhar na base pelos mecanismos D1/D3, com rede não mockada bloqueada.

## Leitura e contrato

- `DOCUMENTO_MESTRE.md` §§3.2, 13.115, 13.124, 13.126–128; roadmap/adendo deste pacote; auditoria D1/D3.
- `generationPreparation.ts`, `generationRuntime.ts`, `generationJournalTrace.ts`, `generationStore.ts`: operações, readJournalResult e leitura por proprietário.
- `shared/contentRequirements.ts`, `shared/generationRequest.ts`, `shared/proposalReviewV7.ts`; `reviewExecutionConfigV7.ts`; `designShortlist.ts` e `designElectionEvidence.ts`.
- `drizzle/0034_orchestrated_generation.sql` e `0038_generation_recent_selections_replay.sql`: somente leitura da chave genérica e whitelist.

## Escrita autorizada

- `server/ai/workflows/generationPreparation.ts` — composição/pin local de entrada, requisitos efetivos, validação e reuso da configuração salva; não reescrever eleição.
- `server/ai/workflows/generationRuntime.ts` — somente leitura/checagem do journal antes de preparar e ligação ao recibo; sem modificar snapshot nesta ordem, store, heartbeat, cobrança ou mecanismo geral de durableOperations.
- `server/ai/workflows/generationSelectionContext.test.ts` — transporte das sentinelas, bundles e limites.
- `server/ai/workflows/generationPreparation.test.ts` — pin anterior aos efeitos, compatibilidade e fixtures atuais.
- `server/ai/workflows/generationRuntime.test.ts` — retomada histórica/nova, erro de leitura e prepared salvo.
- `server/ai/workflows/designElection.test.ts` e `server/ai/workflows/designElection.postgres.test.ts` — histórico realista de operações e invariantes de recibos; não converter fixture antiga em nova para fazê-la passar.
- `server/ai/workflows/generationStore.postgres.test.ts` — teste da chave nova pelo RPC existente; produto SQL permanece protegido.
- `server/ai/workflows/fixtures/selection-handoff-history.json` — criar fixture sintética sanitizada congelada de payloads/chaves anteriores, com procedência. Não usar resposta de provedor real nem recalcular os valores esperados no assert.
- `DOCUMENTO_MESTRE.md` — acrescentar resultado verificado/limites desta ordem após confirmar exclusividade documental.

Resultado exclusivo a criar: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/resultados/01-selecao-retomada.md`.

Protegidos: tudo fora da lista, especialmente helper legado `generationOrchestrator.ts`, `designShortlist.ts`, modelRouter/LLM, store produtivo, SQL, schemas públicos, configurações/provedores, billing, editor, manifests/lockfile, contratos/ordens originais e resultados anteriores. Novos imports/wiring ficam nos dois módulos autorizados. Se for necessário outro caminho, emitir `[BLOQUEIO DE FRONTEIRA]` antes de editar.

## Dependências e integração

C-02 modifica outro trecho de runtime depois desta entrega. C-03 verifica Kit/snapshot/seleção/copy/revisão/editor e corrige o conjunto dos registros. Testes antigos que precisem de ajuste fora da lista não autorizam expansão automática: preservar cenário, informar incompatibilidade e pedir revisão da ordem.

## Verificações

Na raiz da cópia descartável descrita no roadmap:

```bash
pnpm exec vitest run server/ai/workflows/generationSelectionContext.test.ts server/ai/workflows/generationPreparation.test.ts server/ai/workflows/generationRuntime.test.ts server/ai/workflows/designElection.test.ts server/ai/workflows/designElection.postgres.test.ts server/ai/workflows/generationStore.postgres.test.ts server/designCatalog/designShortlist.test.ts server/_core/llm.test.ts
pnpm exec tsc --noEmit --incremental false
```

Runner e arquivos de teste já existem; a fixture indicada será criada. Registrar AC → asserts/mensagens sanitizadas, cwd, comandos, contagens e exits, incluindo falhas preexistentes. Não modificar teste para dispensar a recusa histórica decidida no contrato.

## Operações externas

Nenhuma. Apenas PGlite descartável e transporte controlado; nenhum novo modelo pago, worker, banco conectado ou mudança financeira remota.
