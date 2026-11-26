# Calibração e validação da regra de escolha

A recomendação é manter a regra vigente. Com as fichas B e as notas fixas, o bônus por capacidade específica mudou **zero das 48 posições**. Incluir o histórico também mudou zero posições nas duas representações. As mudanças que chegaram à track 018 já estavam presentes ao trocar as fichas e obter as novas notas. [Primeiro e segundo colocados, contribuições, reservas e tempos dos 16 casos](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/comparacao.html#ranking)

## Regra exata testada

1. Preserve os candidatos recuperados, os vetos físicos de mídia, conteúdo e formato, o encaixe por página e a exclusão das famílias já escolhidas. Nos pares, use o mesmo conjunto e o conteúdo factual estruturado do pedido fonte. A instrução e o objetivo variam com o briefing pareado, sem nova interpretação paga. Esse controle conserva também ênfases do conteúdo fonte, como destacar o total da Oficina, o que limita a leitura do caso bilhete.
2. Calcule `e = nota × (0,5 + 0,5 × confiança)`. Na alternativa, some 0,35 quando `e ≥ 2,6`, `confiança ≥ 0,45` e uma necessidade explícita coincide com a evidência nativa. As três correspondências testadas foram comparar lados rotulados, responder perguntas e destacar uma métrica. O reconhecimento nesta amostra usa expressões textuais registradas no script.
3. Na política histórica de flexibilidade, a terceira proposta recebe `0,25 × distância mínima` às duas já escolhidas. Subtraia 0,10 se a família apareceu nos três pedidos recentes. Ordene por utilidade, depois pela adequação ajustada e por desempate da semente. Preserve o alocador de reservas sobre as avaliações originais de cada braço.
4. A regra principal dá peso zero ao histórico de notas. Na ablação, acrescente `0,25 × n/(n+5) × (e − média anterior)` às candidatas que atingem o mesmo piso e confiança. Use notas das avaliadas, inclusive perdedoras, com mesmo hash da definição, revisão de catálogo, número de páginas, braço e modelo. Com zero observações, a contribuição é zero. O corte por data usa disponibilidade anterior ao pedido, conservadoramente após a conclusão registrada. As avaliações B novas ficam fora do passado das dez rodadas e entram nos pares conforme a data do recibo. Os casos reservados não alimentam o histórico uns dos outros.

A calibração variou os pares (piso, bônus) entre (2,4; 0,20), (2,6; 0,35) e (2,8; 0,50). As três configurações deram as mesmas três escolhas nos dois casos de calibração. O ponto intermediário foi congelado antes da aplicação aos quatro casos reservados. Não se identificou uma hipótese de ganho para normalização logarítmica. Os testes cobrem baixa confiança, piso, ausência de evidência, histórico vazio, candidato único, empate estável sob reordenação e vitória legítima da família versátil. [Calibração](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/calibracao.json) · [Parâmetros e hash](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/parametros.json)

| Briefing pareado | Líder A | Líder B | Relação com o critério prévio |
|---|---|---|---|
| Pátio, comparar | R9-03 | R9-03 | Duas colunas rotuladas, com CON-05 em segundo no B. |
| Pátio, narrar | REF-02 | REF-14 | A grade aceita título e corpo sequenciais. A narrativa depende da redação nas páginas. |
| Pátio, dúvidas | REF-08 | REF-14 | Regressão no critério de pergunta apoiada. REF-08 ficou em terceiro no B. |
| Pátio, aberto | R9-12 | REF-14 | As duas famílias comportam uma apresentação aberta. B venceu com 1,7262 contra 1,5840 de REF-08, sem bônus. |
| Oficina, número | R9-20 | R9-20 | A métrica dominante atende ao pedido. O bônus ampliou uma vantagem existente. |
| Oficina, bilhete | R9-20 | CON-01 | A liderança continuou com uma composição voltada a números. A vantagem de B sobre R9-24 foi apenas 0,0018. |

No Pátio histórico, B escolheu CON-05 com 2,1373 contra 2,1214 de R9-03. Ambos têm campos independentes para as duas ofertas e ficaram abaixo do piso. Essa troca decorreu da avaliação geral. As variantes com e sem histórico, incluindo as contribuições das famílias que perderam, estão preservadas. Medianas do cálculo local de ajuste, eleição e reservas sobre os 16 casos: 27,9 ms em A e 29,0 ms em B nesta execução. Essa medição usa um processo local com observação ligada e exclui busca, avaliação externa e redação. [Recibos de classificação](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/classificacoes.json)

A validação das quatro intenções reservadas chegou ao ranking. A geração de artes cobriu os três pedidos históricos da 018. Repetições com nova redação continuam necessárias para medir se uma vantagem de composição se mantém.
