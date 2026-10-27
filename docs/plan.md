# Plano de Implementação — Tolerância Elástica e Resiliência em 3 Camadas na Geração de Posts

## Visão Geral
Este plano implementa a estratégia completa aprovada para garantir que o usuário nunca receba propostas com erro decorrentes de pequenos transbordos de texto ou incompatibilidades de layout. A resolução combina auto-resolução elástica, feedback explicativo no prompt de recuperação e substituição automática de template via shortlist JEV (até 3 tentativas).

---

## Arquitetura das 3 Camadas

### Camada 1: Auto-Resolução Elástica na Geometria
- **Arquivo afetado:** `shared/arsenalGeometry.ts`
- **Comportamento:**
  - Quando um token indivisível causar `overflowsTokenWidth()`, permitir que o loop de redução avance até um piso elástico seguro (`p.minFontSize * 0.80`, limitado a `>= 12px`).
  - Se o texto couber dentro desse piso elástico, considerar o elemento ajustado e não emitir `overflow:token:<id>`.
  - Cobrir com teste unitário em `shared/arsenalGeometry.test.ts` e `shared/componentAssembly.test.ts`.

### Camada 2: Feedback Cirúrgico de Capacidade no Prompt de Recuperação
- **Arquivo afetado:** `server/ai/workflows/proposalGraph.ts`
- **Comportamento:**
  - Enriquecer `recoveryPrompt` quando houver issues do tipo `overflow:token` ou `overflow`.
  - Indicar explicitamente o limite máximo de caracteres por palavra para a caixa que transbordou, evitando que o LLM troque uma palavra de 5 letras por outra de 5 letras.
  - Cobrir com teste unitário em `server/ai/workflows/proposalGraph.test.ts`.

### Camada 3: Fallback de Template por Slot via JEV (Até 3x)
- **Arquivos afetados:** `server/ai/workflows/proposalGraph.ts` e `server/ai/workflows/generationRuntime.ts`
- **Comportamento:**
  - Permitir que, se o pré-flight do template inicial persistir com defeito após a recuperação cirúrgica, o executor tente uma oferta alternativa do shortlist avaliado pelo JEV (até 3 substituições por slot).
  - Preservar integridade dos recibos de auditoria e do billing.
  - Testar o fluxo de fallback garantindo que o slot entregue um post pronto em vez de falhar.
