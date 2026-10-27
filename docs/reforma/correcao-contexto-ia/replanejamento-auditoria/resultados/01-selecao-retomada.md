# Resultado da Execução: C-01 — Seleção completa sem recompra na retomada

Estado: **CONCLUIDO**
Data: 16/10/2026
Ordem: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/ordens/01-selecao-retomada.md`
Contratos de Referência: `docs/reforma/correcao-contexto-ia/replanejamento-auditoria/CONTRATOS.md` §§1 e 2

---

## 1. Arquivos alterados e criados no escopo autorizado

- `server/ai/workflows/fixtures/selection-handoff-history.json` — fixture sintética congelada e sanitizada contendo operações históricas anteriores à reforma (`jevCompleted`, `jevUncertain`, `selectionCompleted`) e recibo canônico `selectionInputReceipt`, sem credenciais privadas nem dados de provedores reais.
- `server/ai/workflows/generationPreparation.ts` — fixação da operação `prepare:selection_input` antes da execução de modelos Jev e seletor; transporte tipado de requisitos editoriais com campos normalizados (`id`, `kind`, `value`, `scope`, `caseSensitive`, `match`); validação fechada contra divergência de `jevModel` (`preparation_contract_incompatible`); e reutilização determinística de `selectionInput.reviewExecutionConfig` para cálculo de hash e `PreparedGeneration`.
- `server/ai/workflows/generationRuntime.ts` — verificação de journal no runtime antes de iniciar preparação: caso `!record.prepared`, checa se o journal possui estado de operações válido, se `prepare:selection_input` está presente e íntegro com `selectionInputReceiptSchema`, ou se há efeitos pagos anteriores (`prepare:design-shortlist:*`, `prepare:selection`) sem recibo prévio de entrada, falhando fechado com `preparation_contract_incompatible` (stage `selection`, retryable `false`) sem efetuar chamadas a modelos.
- `server/ai/workflows/generationSelectionContext.test.ts` — testes para AC-1, AC-2 e AC-4 verificando a propagação de requisitos tipados para o Jev e o seletor (com <=12 e >12 ofertas compactas), respeitando escopo, case sensitivity e match, além de limites de caracteres.
- `server/ai/workflows/generationPreparation.test.ts` — testes de fixação de `selection_input` antes dos modelos, reutilização idempotente da entrada e recusa por divergência de `jevModel`.
- `server/ai/workflows/generationRuntime.test.ts` — testes unitários cobrindo AC-1 (recusa de journals históricos com Jev completed/uncertain e seleção completed sem selection_input), AC-2 (journal ilegível, estados desconhecidos, recibo inválido, retomada com entrada fixada) e AC-3 (reuso byte a byte de prepared histórico sem alteração de propostas).
- `server/ai/workflows/generationStore.postgres.test.ts` — teste AC-5 verificando persistência e retomada de `prepare:selection_input` via `begin` normal no PostgreSQL / PGlite, sem necessidade de novas migrations ou alteração de whitelist.
- `server/ai/workflows/designElection.postgres.test.ts` — asserção de compatibilidade com a presença de `prepare:selection_input` no journal durante a eleição completa em banco.
- `DOCUMENTO_MESTRE.md` — atualização da seção §13.128 com a documentação do contrato de fixação da entrada de seleção e proteção de retomada.

---

## 2. Aceite e Evidências

### AC-1: Journal histórico anterior à reforma com efeito pago sem selection_input falha fechado
- **Cenários testados**:
  - `jevCompleted`: lote Jev concluído sem `selection_input`. Falha com `preparation_contract_incompatible`, stage `selection`, `retryable: false`. Zero novas chamadas a modelos (`deps.prepare` e `generateText` não chamados).
  - `jevUncertain`: lote Jev em estado incerto sem `selection_input`. Falha fechado com mesmo erro e zero novas chamadas.
  - `selectionCompleted`: seleção concluída antes de `savePrepared` sem `selection_input`. Falha fechado sem recompra.
  - Catálogo histórico (com e sem perfis compactos v2) sem entrada fixada rejeitado antes da chamada aos modelos.
- **Evidência**: `server/ai/workflows/generationRuntime.test.ts` (`AC-1: historical journal without selection_input fails closed before calling new models`).

### AC-2: Pedido novo fixa selection_input antes de Jev/seletor; retomada segura sem recompra
- **Cenários testados**:
  - Pedido novo executa `deps.operation("selection_input", ...)` registrando recibo completo com `brief`, `sourceEvidence`, `requirements`, `reviewExecutionConfig` e `jevModel`.
  - Interrupção após lote Jev completado retoma reutilizando a mesma entrada fixada e a mesma chave, sem recompra.
  - Interrupção após seleção concluída reutiliza o resultado de seleção gravado, sem redisparar o seletor.
  - Efeito `uncertain` em `selection_input` ou seleção lança erro de reconciliação e não é contornado.
  - Journal ilegível (erro no store), estado de operação desconhecido ou recibo malformado/inválido falha fechado com `preparation_contract_incompatible`.
  - Modelo Jev divergente do padrão configurado falha fechado e não sobrescreve o pin.
- **Evidência**: `server/ai/workflows/generationPreparation.test.ts` (`C-01: pins selection_input operation before models and reuses it idempotently`, `C-01: throws preparation_contract_incompatible if pinned jevModel diverges`), `server/ai/workflows/generationRuntime.test.ts` (`AC-2: invalid or corrupted journal operations fail closed with preparation_contract_incompatible`, `AC-2: completed selection_input allows resume without re-buying completed Jev/selector operations`).

### AC-3: Prepared histórico salvo continua idêntico sem exigir novo pin nem recarregar snapshot
- **Cenários testados**:
  - Quando `record.prepared` já está preenchido, `executeClaimedGeneration` executa diretamente sem chamar `deps.prepare` nem `deps.loadContext`.
  - Propostas prontas existentes permanecem intocadas, e reservas/liquidações de billing não são afetadas.
- **Evidência**: `server/ai/workflows/generationRuntime.test.ts` (`AC-3: prepared historical state resumes with exact byte-by-byte context, no pin rewrite, no re-buying`).

### AC-4: Sentinelas de requisitos tipados (literal/forbidden/meaning) chegam a Jev e seletor
- **Cenários testados**:
  - Conjuntos de ofertas com `<= 12` e `> 12` ofertas compactas v2.
  - Sentinelas de requisitos com `id`, `kind`, `value`, `scope`, `caseSensitive` e `match` são transportadas nos fatos fornecidos ao Jev e no payload estruturado ao seletor.
  - Sobrevivência à serialização JSON do adaptador sem truncamento indevido.
- **Evidência**: `server/ai/workflows/generationSelectionContext.test.ts` (`C-01 AC-4: passes typed content requirements to jev and selector across <=12 and >12 offer thresholds`).

### AC-5: Persistência e reuso via RPC PostgreSQL PGlite sem migrations ou whitelist
- **Cenários testados**:
  - `prepare:selection_input` é persistido com sucesso via `postspark.generation_v5_operation` com ação `begin` normal.
  - Chamada com `begin_safe` falha com `Only unpaid preparation reads`, comprovando que a chave nova não demandou alteração de whitelist nem migração SQL no produto.
  - Após expiração de lease e retomada por novo worker, a chamada `begin` reutiliza o resultado completado intacto.
  - Comparação do journal antes e depois da retomada confirma identidade estrita dos registros.
- **Evidência**: `server/ai/workflows/generationStore.postgres.test.ts` (`AC-5: persists and reuses prepare:selection_input via normal begin without whitelist migration and keeps existing receipts intact across resume`), `server/ai/workflows/designElection.postgres.test.ts`.

---

## 3. Comandos Executados e Resultados

Executados no diretório de teste isolado e descartável (`/tmp/postspark-test-run/`):

### 3.1 Suíte C-01 (Vitest)
```bash
pnpm exec vitest run server/ai/workflows/generationSelectionContext.test.ts server/ai/workflows/generationPreparation.test.ts server/ai/workflows/generationRuntime.test.ts server/ai/workflows/designElection.test.ts server/ai/workflows/designElection.postgres.test.ts server/ai/workflows/generationStore.postgres.test.ts server/designCatalog/designShortlist.test.ts server/_core/llm.test.ts
```
- **Arquivos avaliados**: 8 arquivos de teste.
- **Testes executados**: 124 testes.
- **Resultado**: 124 aprovados, 0 falhas. Exit code: 0.

### 3.2 Checagem de Tipos TypeScript
```bash
pnpm exec tsc --noEmit --incremental false
```
- **Resultado**: 0 erros. Exit code: 0.

---

## 4. Operações Externas e Banco de Dados

- Nenhuma operação externa ou chamada a provedores reais realizada.
- Nenhuma alteração em migrations SQL (`drizzle/`) ou schemas públicos.
- Todos os testes de banco foram executados isoladamente no engine PGlite em memória/disco temporário.

---

## 5. Adendo V1 — Resolução e Fechamento de RC-001 (16/10/2026)

Conforme registrado em `docs/reforma/correcao-contexto-ia/REGISTRO-CORRECOES.md` (§3, RC-001), o mecanismo de validação prévia de `prepare:selection_input` apresentava validação permissiva de `brief: z.unknown()` e validação tardia da configuração V7, permitindo invocar efeitos externos (Jev/seletor) antes de detectar incompatibilidades.

### 5.1 Implementação Corretiva (V1)
1. **Schema estrito de briefing (`selectionInputBriefSchema`)**:
   - Definido em `generationPreparation.ts` e consumido por `selectionInputReceiptSchema`.
   - Aceita exclusivamente strings não vazias ou arrays de partes de imagem multimodal válidas.
   - Rejeita terminantemente `null`, valores numéricos, booleanos ou objetos arbitrários.
2. **Validação prévia da configuração de revisão V7 (`reviewExecutionConfig`)**:
   - Aplica `assertReviewExecutionConfigV7(savedReceipt.reviewExecutionConfig)`.
   - Confere igualdade estrita entre `savedReceipt.reviewExecutionConfig.configurationHash` e `resolveReviewExecutionConfigV7().configurationHash`.
   - Valida correspondência exata entre `savedReceipt.jevModel` e o modelo atual do ambiente (`ENV.openRouterDesignSelectionModel`).
   - Lança `GenerationFailureError("preparation_contract_incompatible", "selection", false)` **antes de qualquer chamada a Jev ou seletor**.
3. **Guard correspondente no runtime (`generationRuntime.ts`)**:
   - Valida a operação salva de `prepare:selection_input` com o mesmo schema estrito e conferência de `configurationHash` / `jevModel` antes de acionar `deps.prepare`.

### 5.2 Evidências e Testes de Homologação
- **Matriz de 5 casos em `server/ai/workflows/generationSelectionContext.test.ts`**:
  1. *Controle positivo*: brief e recibo válidos executam shortlist e completam com sucesso.
  2. *Brief nulo (`brief: null`)*: falha com `preparation_contract_incompatible`, contadores Jev = 0 e seletor = 0.
  3. *Brief numérico (`brief: 123`)*: falha com `preparation_contract_incompatible`, contadores Jev = 0 e seletor = 0.
  4. *ConfigurationHash zerado (64 zeros)*: falha com `preparation_contract_incompatible`, contadores Jev = 0 e seletor = 0.
  5. *Modelo de revisão do ambiente alterado*: falha com `preparation_contract_incompatible`, contadores Jev = 0 e seletor = 0.
- **Suíte `server/ai/workflows/generationRuntime.test.ts`**:
  - Teste `AC-2: modified environment review model or configurationHash in selection_input fails closed before calling prepare` confirma que a execução aborta no runtime sem invocar `mockPrepare`.
  - Teste `AC-2: completed selection_input allows resume without re-buying completed Jev/selector operations` confirma retomada íntegra de recibo válido sem recompra.
- **Resultados**: 11/11 testes em `generationSelectionContext.test.ts` e 20/20 testes em `generationRuntime.test.ts` aprovados com exit code 0.
- **Status do Achado**: **RC-001 ENCERRADO / RESOLVIDO**.
