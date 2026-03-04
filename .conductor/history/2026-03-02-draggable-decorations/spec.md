# Especificação Técnica: Badge e Sticker Movíveis & Grade 5x5

## 1. Visão Geral
O objetivo desta feature é aumentar a flexibilidade no Workbench, permitindo que os elementos decorativos de Copy ("Badge" e "Sticker Decorativo") se comportem como os demais blocos de texto (Headline, Body, Barrinha), tornando-os elementos livremente arrastáveis (movíveis). 
Além disso, a área de edição será refinada para utilizar uma grade de precisão 5x5 (em vez da atual 3x3), tanto para o ímã (snap) de arraste quanto para os atalhos de posicionamento no painel.

## 2. Comportamento Atual vs Esperado
- **Atual:** O Badge e o Sticker são renderizados estaticamente no topo e base do card. A grade de alinhamento e o ímã funcionam com 9 pontos (3x3).
- **Esperado:** 
  - O Badge e o Sticker devem aparecer na lista de "Elemento Ativo" no Workbench.
  - Eles devem possuir seu próprio estado no `LayoutSettings` inicial e serem renderizados via `DraggableBlock` no `ArchitectOverlay`.
  - O "ímã" (magnet / snap to grid) do canvas de edição deve reconhecer automaticamente 25 pontos de aderência (grade 5x5: posições em 10%, 30%, 50%, 70%, 90%).
  - A interface do Workbench deve apresentar o controle de Posições na mesma proporção 5x5.

## 3. Estratégia Técnica
- **Tipagem (`editor.ts`):** 
  Estender o contrato `AdvancedLayoutSettings` incluindo os elementos opcionais `badge` e `sticker`.
- **Snap Grid (`DraggableBlock.tsx`):**
  Atualizar o array constante `GRID_SNAP_POSITIONS` para gerar matrizes baseadas nos múltiplos `10, 30, 50, 70, 90`.
- **Controles (`WorkbenchRefactored.tsx`):**
  1. Alterar a lista de opções do "Elemento Ativo".
  2. Gerar uma grade UI dinâmica (5x5). A seleção via de clique na grade converterá o clique para cálculos equivalentes a `freePosition`, evitando uma quebra massiva da enumeração herdada `TextPosition`, para garantir legibilidade. Ou seja, as extremidades mantêm a referência amigável (como `top-left`) e as intermediárias definem uma `freePosition` estrita (ex: 30%, 30%).
- **Renderização (`PostCard.tsx` / `ArchitectOverlay`):**
  Converter a exibição atual do `renderTopBar` e `renderBottomBar` em instâncias do `DraggableBlock` (assim como é feito para Headline e Body) injetando as propriedades do modo Arquiteto.
