# Efeito de apresentar a capacidade nativa ao JEV

As fichas mudaram 26 das 30 posições iniciais nas rodadas históricas e 12 das 18 nos briefings pareados. No Pátio histórico, CON-05, que possui rótulo e texto independentes para cada lado, passou a liderar. No pedido de perguntas e respostas, REF-08 caiu de primeiro para terceiro. A ficha candidata seguiu para a avaliação em memória e a geração de diagnóstico. [Comparativo por pedido](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/comparacao.html#ranking)

## Evidência da composição e limites

A ficha A é o JSON compacto do recibo. B acrescenta somente `nativeEvidence` à instrução de cada família. A projeção usa os campos da definição raiz, sua mecânica e a orientação editorial do design. O teste reconstrói os três campos de entrada das 82 famílias pela função oficial `compactComponentCard` e compara com a projeção histórica. Cada ficha tem ID e SHA-256 de origem. A revisão inclui as variantes por página na execução. [82 fichas e hashes](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/fichas.json)

- CON-05 e R9-03 documentam dois rótulos e dois textos independentes. Seus campos curtos estimam, respectivamente, dois e cinco caracteres para um rótulo.
- REF-08 documenta pergunta, título, apoio, lista e um índice de dois caracteres. R9-12 documenta organização em blocos e uma chamada curta de aproximadamente um caractere.
- REF-14 documenta título e corpo. A ficha registra incerteza de encaixe quando a projeção carece de uma estimativa de campo individual. As estimativas da capa deixam a execução de cada página dependente do texto e das fontes reais.

## Transporte e medição

A e B mantiveram conjunto, ordem, panorama editorial, instrução, escala 0–4 e alias `typesafe/jev-1.13`. As 32 respostas identificaram o mesmo modelo efetivo `typesafe/jev-1.13-20260917`. Os dez controles históricos foram reutilizados. Houve 22 chamadas novas, sempre um lote de 20 famílias, dentro do orçamento de 48.000 bytes da recuperação. Nenhum lote exigiu divisão, expansão ou nova tentativa. O valor de cada resposta e os hashes por ficha e lote estão no relatório de recibos. [Avaliações completas](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/avaliacoes.json)

| Casos e braço | Lotes | Bytes por lote | Tokens entrada / saída | USD informado | Latência mediana |
|---|---:|---:|---:|---:|---:|
| Dez históricos A, arquivados | 10 | 19.644–19.863 | 54.239 / 8.897 | 0,002278038 | 232,5 ms |
| Dez históricos B, novos | 10 | 23.494–23.757 | 70.999 / 8.897 | 0,002981958 | 401,5 ms |
| Seis pareados A, novos | 6 | 19.662–20.026 | 32.637 / 5.360 | 0,001370754 | 405,4 ms |
| Seis pareados B, novos | 6 | 23.512–23.920 | 42.745 / 5.360 | 0,001795290 | 389,8 ms |

B acrescentou em média **1.676 tokens de entrada** por pedido histórico, 30,9% sobre A e acima da previsão de 652. Foram mais US$ 0,000070392 por pedido. A média histórica de latência passou de 293,6 para 437,7 ms. Nos seis pareados passou de 424,7 para 394,6 ms. As datas de execução dos controles históricos e do braço B diferem, e a latência inclui transporte. As 22 novas avaliações somaram US$ 0,006148002.

| Formato e amostra | Avaliações por braço | Nota média A / B | Confiança média A / B |
|---|---:|---:|---:|
| Estático histórico | 80 | 1,775 / 1,485 | 0,414 / 0,350 |
| Carrossel histórico | 120 | 2,135 / 1,656 | 0,328 / 0,372 |
| Estático pareado | 40 | 2,373 / 1,747 | 0,338 / 0,271 |
| Carrossel pareado | 80 | 2,400 / 1,746 | 0,257 / 0,327 |

O avaliador devolveu nota e confiança. As funções editoriais decorrem dos campos da definição. Uma resposta por braço limita a separação entre efeito da ficha e variação do modelo. O teste da track 018 verifica se as mudanças sobreviveram à redação, ao reparo e à revisão.
