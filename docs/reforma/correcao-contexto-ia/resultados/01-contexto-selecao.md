# Resultado da Execução: OS-01 — Fonte e pedido complementar chegam à seleção

Estado: **CONCLUIDO**
Data: 15/10/2026
Ordem: `docs/reforma/correcao-contexto-ia/ordens/01-contexto-selecao.md`

## 1. Arquivos próprios alterados/criados

- `server/ai/workflows/generationPreparation.ts` — transmissão de `sourceEvidence` e `complementaryInstruction` para `shortlist` (Jev) e `selection` (seletor LLM) quando em modo `execution`. Deduplicação exata quando o texto já consta no briefing, rawInput ou notas.
- `server/ai/workflows/generationSelectionContext.test.ts` — criado com cobertura dos critérios AC-1 a AC-5 (regressão C2/C7, isolamento de catálogo <=12 e >12, preservação de ideation/restrições, limites de 24k, reuso de operações persistidas e entrega de contexto a jusante).

## 2. Aceite e evidências

- **AC-1 (Fonte e pedido complementar chegam ao seletor)**:
  - *Evidência*: `server/ai/workflows/generationSelectionContext.test.ts` (`AC-1: delivers sentinel source and complementary instruction to selector in execution mode`).
  - *Comportamento*: No modo `execution`, a fonte sentinela (em `contextContent`) e a instrução exclusiva do pedido (`input.content`, divergente de `rawInput`/`notes`) chegam ao payload do seletor identificados como `sourceEvidence` e `complementaryInstruction`. `prepared.contextContent` preservado.
- **AC-2 (Catálogo compacto v2 <=12 e >12, paridade com Jev e adapter)**:
  - *Evidência*: `server/ai/workflows/generationSelectionContext.test.ts` (`AC-2: <=12 offers bypasses Jev; >12 delivers same material condition to Jev and selector through model adapter`).
  - *Comportamento*: Com <=12 ofertas, Jev não é acionado e o seletor recebe as duas sentinelas. Com >12 ofertas, Jev recebe `sourceEvidence` e `complementaryInstruction` dentro de `state.context`, e o seletor recebe ambos no prompt de usuário. O adapter OpenRouter/Gemini serializa os campos sem perdas.
- **AC-3 (Ideação textual/URL e preservação de restrições)**:
  - *Evidência*: `server/ai/workflows/generationSelectionContext.test.ts` (`AC-3: ideation textual & URL preserve source in brief, execution preserves constraints, >24k fails explicitly`).
  - *Comportamento*: Em ideação, a fonte continua presente no `brief`. Em execution, regras, negações e condições finais são preservadas. Contexto >24.000 caracteres lança `SourceContextLimitError`.
- **AC-4 (Reuso de preparação e seleção completed)**:
  - *Evidência*: `server/ai/workflows/generationSelectionContext.test.ts` (`AC-4: completed operations and saved preparation are reused without recalling selector or Jev`).
  - *Comportamento*: Operações registradas no journal (`prepare:selection`, `prepare:design-shortlist:*`) são reaproveitadas byte a byte sem recompra de modelo.
- **AC-5 (Conectividade do workflow)**:
  - *Evidência*: `server/ai/workflows/generationSelectionContext.test.ts` (`AC-5: prepared selection delivers context and selected definitions to consumer`).
  - *Comportamento*: `prepared` entrega `contextContent`, `selectedDefinitions` e `selectedOffers` completos.

## 3. Comandos executados e resultados

Executado em ambiente descartável isolado (`/tmp/postspark-test-run`):

```bash
pnpm exec vitest run server/ai/workflows/generationSelectionContext.test.ts server/ai/workflows/generationPreparation.test.ts server/designCatalog/designShortlist.test.ts server/ai/workflows/designElection.test.ts server/ai/workflows/designElection.postgres.test.ts server/_core/llm.test.ts
pnpm exec tsc --noEmit --incremental false
```

- **Vitest**: 6 arquivos de teste, 87 testes executados, 87 aprovados (0 falhas). Exit code: 0.
- **TypeScript (`tsc`)**: 0 erros de tipagem. Exit code: 0.

## 4. Operações externas e limitações

- Nenhuma operação remota, rede viva ou chamada real a modelo pago foi realizada.
- Limitação: Demonstração focada na integridade do transporte de dados estruturados; não avalia competência semântica subjetiva da LLM na escolha de designs.

---

## 5. Retificação e Integração Corretiva (16/10/2026 — Auditoria C-01 e C-03)

- **Retificação de Escopo e Evidências**: Conforme apontado na auditoria D4/R1 e planejado no replanejamento corretivo (`replanejamento-auditoria/ROADMAP.md`), o teste original `generationSelectionContext.test.ts` realizava asserções parciais que foram aprofundadas pela ordem corretiva C-01 (`ordens/01-selecao-retomada.md`) e verificadas de ponta a ponta na integração final C-03 (`ordens/03-integracao-evidencias.md`).
- **Validação de Retomada e Recompra Zero**: A garantia de zero recompra de provedores em retomadas com lease expirado ou falha a jusante foi comprovada em testes de roundtrip PostgreSQL real (`generationStore.postgres.test.ts` e `designElection.postgres.test.ts`).
- **Nova contagem integrada**: Na suíte integrada de 16/10/2026, 183 arquivos de teste e 1.919 testes passaram com sucesso absoluto (exit code 0), sem recompra de provedores pagos e sem dependência de rede externa.

