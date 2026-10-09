# Ensaio local de recombinação

Execute `node --import tsx harness/designCombinations/run.ts` na raiz do projeto.
Saída: `artifacts/design-recreation/combination-pilot/index.html`.

Três receitas V3 existentes fornecem parâmetros de fundos, superfícies, fontes,
realces e uma foto já inserida pelo usuário. O ensaio combina três fundos com três
blocos, usando três frases. A distribuição é escolhida explicitamente para este
experimento; não existe descoberta automática de peças arbitrárias.

O título preserva corpo e centro; sua largura acompanha a medição com
`layoutRichText`. Após o limite útil, quebra por palavras. Realces acompanham as
linhas; apoio e CTA acompanham a altura do título. A superfície cresce dentro do
limite da prancheta. Texto excessivo emite erro do ensaio, sem alterar qualquer
receita de origem. Isso não implementa editor livre, solver geral ou reflow no Admin2.

O manifesto guarda relações e proveniência. JSONs V3 exportados são instantâneos
compatíveis com o laboratório atual e permanecem sujeitos ao seu encaixe fixo.
Não existe publicação no gerador, migration, custo de API ou treinamento novo.

A pontuação é uma heurística técnica explícita; não foi calibrada como medida
estética. A seleção acrescenta diversidade entre os dois eixos. O HTML oferece
três frases precomputadas e coleta preferências localmente, com download; não há
envio ao backend nem uso automático dessas preferências para treinamento.

Verificação: `pnpm exec tsc --noEmit -p harness/designCombinations/tsconfig.json`.
O runner verifica schema, medidas, centro, padding, fluxo, rejeição e roundtrip PNG.
Renderização por Konva/napi; a interação HTML e o Stage React não são provados por
esses testes. Leia os traces e inspecione os PNGs antes de interpretar pontuações.
