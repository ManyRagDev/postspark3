# Lista de Tarefas — Resiliência de Layout e Recuperação em 3 Camadas

## FASE 1: Auto-Resolução Elástica na Geometria (Camada 1)
- [x] Modificar `shared/arsenalGeometry.ts`: implementar piso elástico (`TOKEN_OVERFLOW_ELASTICITY_FACTOR = 0.80`, limitado a `>= 12px`) no cálculo de `textFit` quando houver apenas estouro de token indivisível, condicionado a `elasticReduction: true`.
- [x] Executar testes de geometria com `pnpm vitest run shared/componentAssembly.test.ts` e validar ausência de regressões.

## FASE 2: Diagnóstico e Restrição de Caracteres no Prompt de Recuperação (Camada 2)
- [x] Modificar `server/ai/workflows/proposalGraph.ts`: estender o bloco gerador de `recoveryPrompt` para calcular e informar o limite recomendado de caracteres por token para caixas que acusaram `overflow:token`.
- [x] Adicionar teste unitário em `server/ai/workflows/proposalGraph.test.ts` cobrindo a injeção da restrição de caracteres na recuperação cirúrgica.

## FASE 3: Fallback de Template por Slot com Limite de 3 Tentativas (Camada 3)
- [x] Modificar `server/ai/workflows/generationCoordinator.ts`: implementar o mecanismo de troca de template para o slot a partir de `alternativeDefinitions` caso a proposta falhe na verificação técnica de layout.
- [x] Limitar as tentativas de fallback a no máximo 3 vezes por proposta antes de declarar o slot como `failed`.
- [x] Adicionar testes cobrindo a substituição de template com sucesso quando o primeiro template é inviável (`coordinates template fallback up to 3 times`).

## FASE 4: Verificação Ponta a Ponta
- [x] Executar suíte de testes completa do pipeline de geração: `pnpm vitest run server/ai/workflows/proposalGraph.test.ts server/ai/workflows/generationRuntime.test.ts shared/componentAssembly.test.ts` (69 testes aprovados).
- [x] Validar compilação e tipagem com `pnpm tsc --noEmit` (0 erros).
