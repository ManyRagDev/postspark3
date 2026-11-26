---
description: Refatorar um fluxo com testes nas suas entradas e fronteiras.
---

# Workflow /refatorar

1. Identifique a responsabilidade do trecho, seus chamadores, contratos e dados persistidos. Use [AGENTS.md](../../AGENTS.md) e o código atual.
2. Preserve o comportamento nos pontos de entrada existentes. Introduza uma transição temporária somente quando a compatibilidade exigir.
3. Integre as mudanças em etapas verificáveis. Use `pnpm check` e os testes do fluxo afetado. Documente alterações duradouras de contrato quando houver.
