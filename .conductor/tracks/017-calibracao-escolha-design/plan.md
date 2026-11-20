# Track 017 — Calibração da escolha por vantagem específica

**Objetivo.** Testar em memória quando uma capacidade específica justifica preferir uma composição a outra mais versátil. Usa os casos da 015 e as notas congeladas da 016.

## Execução

- [ ] Reproduzir primeiro a classificação vigente. Identificar no código como entram a adequação, a confiança, a diversidade entre as três propostas, a recência e o desempate. Usar as mesmas restrições de formato, mídia e conteúdo em todas as alternativas.
- [ ] Comparar a regra vigente com uma alternativa que exija adequação absoluta suficiente e evidência de vantagem específica para favorecer um especialista. Registrar o elemento do design e a necessidade do briefing que sustentam a preferência. Quando essa evidência for insuficiente, preservar a escolha pela adequação geral.
- [ ] Testar separadamente o valor incremental de usar a nota habitual da família em pedidos comparáveis. Calcular essa referência por formato e versão com avaliações anteriores, incluindo candidatas que perderam. Excluir o pedido avaliado e resultados futuros. Para famílias novas ou com poucas observações, aplicar contribuição histórica neutra ou progressivamente reduzida.
- [ ] Variar pesos, piso e margem apenas na amostra de calibração. Repetir com os valores congelados nos casos reservados. Testar empates, confiança baixa, disponibilidade de apenas uma família e vitória legítima de um design versátil. Conferir o efeito nas três propostas e nas reservas.

## Aceite

Entregar, por caso, vencedor e segundo colocado, notas originais, contribuições para a diferença, evidência específica e tempo do cálculo local. Medir concordância com os critérios registrados na 015 e expor regressões. A comparação reutiliza as respostas do JEV. A recomendação pode ser manter a regra vigente se a vantagem da alternativa não aparecer nos casos reservados.

**Pontos de partida.** `shared/selectionPolicy.ts`, `server/ai/workflows/heuristicPlanBuilder.ts` e `shared/capabilitySelection.test.ts`.
