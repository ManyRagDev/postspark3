# Controle das dez rodadas

As 30 escolhas iniciais, os componentes e os hashes das 102 páginas coincidiram com os recibos da revisão 1. O controle permite trocar a representação enviada ao JEV sem confundir essa intervenção com uma mudança de catálogo. [Pedidos, sementes, mídia, elegibilidade e reservas](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/controle.json) · [Auditoria original](/home/emanuel/.codex/visualizations/2026/11/18/01a1f03d-0d96-7a92-853b-b34c904f21fb/thevoid-auditoria/dez-rodadas/relatorio.md)

| Etapa | Resultado do controle |
|---|---|
| Elegibilidade | 62 famílias por estático e 20 por carrossel. Quatro estáticos e seis carrosséis de cinco páginas, sem geração de imagem. |
| Avaliação | 20 famílias por pedido após a recuperação lexical. As 200 notas e confianças, a ordem e as sementes foram reconciliadas. |
| Escolha e reservas | Três famílias por pedido. Todas as listas de reservas coincidiram. Houve 29 tentativas de reserva, com 26 novas redações e três reaproveitamentos de texto. |
| Entrega | 24 de 30 propostas, cinco pedidos completos. Das 24 prontas, 17 mantiveram a família inicial e sete vieram de reservas. |
| Provedor e billing | 123 chamadas, 120 com USD informado, somando US$ 0,1132490748. Três reparos HTTP 400 ficaram sem valor. A conta ilimitada teve débito de zero Sparks nos dez pedidos. |

O conferente independente repetiu a eleição com observação ativa e desativada e com 30 falhas de registro injetadas. Os resultados coincidiram nas árvores histórica e local. O painel de frequências distingue família elegível, avaliada, escolhida de início, tentada como reserva e entregue. O índice abaixo leva aos recibos congelados e ao percurso de cada família. [Comparação por pedido](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/comparacao.html#controle) · [Frequências históricas](/home/emanuel/.codex/visualizations/2026/11/18/01a1f03d-0d96-7a92-853b-b34c904f21fb/thevoid-auditoria/dez-rodadas/frequencias.csv) · [Liquidações originais](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/sparks-historicos.json)

## Versões e limites do replay

O worker histórico usou o caminho de seleção legado, ficha compacta v5, planejamento v2, flexibilidade criativa v1 e recuperação v2. Já continha a opção de usar `capability_v1`. O checkout `3cf155fdd18e82e74884dfb37d672c9d5aaddf2f` também tem projeções mais recentes, versões de ordenação e lotes, novas opções de eixos e reconciliação. O teste fixou as versões gravadas. O inspetor histórico confirmou 10/10. O inspetor atual sinalizou `planned_definitions_mismatch` em 30/30 lugares ao reprojetar os cartões, porque acrescenta `fragmentCount` às regiões de texto. Omitir esse único campo da projeção em memória conciliou as 102 páginas. O SHA do deploy original permanece desconhecido. SHA-256 do arquivo de fonte histórica utilizado: `b50f78b5ab05ef7bdc74159904b3a111245f682995ccb81694915257fdf98cfa`. [Fonte, renderer e configuração do worker](/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao/worker-fonte.tar.gz)

Os dois casos de calibração e os quatro de validação foram registrados antes das novas notas. No Pátio, os casos mantêm os passes, a mídia e cinco páginas. Na Oficina, preservam as quantidades e uma página. `compose` identifica o modo de composição do repertório. A entrada do Studio usa `execution`. SHA-256 do registro editorial: `e01e7b721aac91d9f0cdc6c25cd3074866e7ea8024d215584c854046dfdf572d`. [Briefings e critérios prévios](pares.json)

## Reprodução local sem cobrança

Execute na raiz do checkout com suas dependências instaladas e os arquivos locais indicados nas duas variáveis. Os dez recibos estão em `recibos/`, as 22 respostas novas em `jev/` e as definições em `definicoes/`. Os comandos abaixo recalculam os relatórios derivados. Os valores de tempo local variam entre execuções.

```bash
export DESIGN_FIT_OUTPUT='/home/emanuel/.codex/visualizations/2026/11/20/01a1f9ab-fdf4-73c2-849d-e8fc25fca332/selecao'
export DESIGN_FIT_AUDIT='/home/emanuel/.codex/visualizations/2026/11/18/01a1f03d-0d96-7a92-853b-b34c904f21fb/thevoid-auditoria/dez-rodadas'
node --import tsx scripts/diagnostics/designFit/replay.mjs
node --import tsx scripts/diagnostics/designFit/checks.mjs
node --import tsx scripts/diagnostics/designFit/rank.mjs
node --import tsx scripts/diagnostics/designFit/materializePlans.mjs
python3 scripts/diagnostics/designFit/report.py
```

A comparação de qualidade e a capacidade de entrega exigem observar as artes. A track 018 cobre três briefings históricos. Os demais rankings permanecem diagnósticos.
