# Especificação Técnica: Controle de Tamanho da Fonte (Font Size Sliders)

## Contexto e Problema
O usuário tem hoje a possibilidade de alterar a cor dos textos do post individualmente (título e corpo) na ferramenta de edição (`WorkbenchRefactored`). No entanto, a plataforma não permite o redimensionamento dinâmico desses textos; os tamanhos de fonte baseiam-se unicamente nas configurações matemáticas do componente de auto-fit (`useTextAutoFit`). O usuário manifestou a vontade de ter "um controle arrastável para selecionar o tamanho da fonte dos textos que são escritos (cabeçalho e corpo)", semelhante à customização visual de cores.

## Restrições e Engenharia Envolvida
- **Arquitetura de Adaptação Automática de Texto:** Atualmente, a responsabilidade do cálculo do tamanho que evita o derramamento (overflow) de texto é do hook `useTextAutoFit`. 
- **Solução sem Refatoração Maior:** Para preservar o delicado cálculo interno de layout, implementaremos as novas propriedades `headlineFontSize` e `bodyFontSize` no esquema de PostVariation. Essas propriedades atuarão como **multiplicadores diretos** (ex: `0.5` a `2.0`, sendo `1.0` o padrão sem alteração).
- O CSS utilizará a função `calc()` nativa (ex: `calc(${autoFitSize} * ${multiplier})`) injetando dinamicamente o redimensionamento sem bagunçar a lógica base do React.

## Comportamento Esperado
1. O painel visual (`WorkbenchRefactored.tsx`) exibirá uma nova seção de edição de tamanhos, contendo dois *sliders* (para título e corpo).
2. O PostVariation terá dois novos atributos numéricos (propriedades opcionais).
3. O `PostCard.tsx` escutará essas propriedades e atualizará a declaração de estilo `fontSize` do `style` em todas as opções do array de layouts.
