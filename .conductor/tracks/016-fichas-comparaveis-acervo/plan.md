# Track 016 — Fichas comparáveis do acervo

**Objetivo.** Medir quanto a apresentação das capacidades de uma família muda o parecer do JEV. Usa o controle e os critérios editoriais da track 015.

## Execução

- [ ] Inventariar a projeção que o worker histórico enviava e as projeções disponíveis no código local. Derivar a ficha da definição autoritativa de cada família no acervo único. Reaproveitar campos e versões existentes quando representarem a mesma informação.
- [ ] Aplicar a mesma estrutura às 82 famílias. Para cada capacidade declarada, indicar a função editorial, o elemento nativo que a sustenta e a limitação relevante. Por exemplo, distinguir duas colunas que comportam os dois preços de uma grade que apenas organiza blocos. Para capacidades sem evidência, registrar a incerteza.
- [ ] Rodar o A/B em diagnóstico. A usa os recibos originais. B altera apenas as fichas, mantendo briefing, conjunto e ordem de candidatos, modelo, instruções de avaliação, escala e classificação posterior. Nos pares novos, medir os dois braços e contabilizá-los separadamente. Se o modelo fixado estiver indisponível, registrar a diferença e comparar os dois braços com o mesmo modelo.
- [ ] Medir bytes por lote, chamadas efetivas, tokens de entrada e saída, custo informado e latência. Registrar os limites reais de transporte e qualquer divisão ou expansão de lote. Comparar notas, confiança e finalistas por formato com os critérios da 015.

## Aceite

Entregar a comparação por pedido, com versões e hashes das fichas e dos payloads. Para as dez rodadas históricas, a meta é uma avaliação por pedido no braço B. A estimativa anterior foi de aproximadamente 652 tokens de entrada adicionais por pedido para uma ficha compacta de exemplo. Substituir essa estimativa pelos recibos da ficha efetivamente testada. Indicar quais mudanças de posição têm explicação editorial e qual representação segue para a 017.

**Pontos de partida.** `shared/designFamilySelection.ts`, `server/designCatalog/designShortlist.ts` e `server/designCatalog/capabilityTransport.test.ts`.
