# Especificação Técnica: Ajuste de Escala do Visualizador

## Contexto
O usuário reportou que ao mudar a proporção (aspect ratio) de 1:1 para 5:6 ou 9:16, o visualizador não aumenta verticalmente de forma satisfatória. Atualmente, o comportamento é sutil demais, mantendo o card quase do mesmo tamanho.

## Objetivo
Aumentar significativamente a altura do visualizador ao selecionar formatos verticais (5:6 e 9:16), transmitindo melhor a sensação de "formato retrato" e "story/reels", sem quebrar o layout do Workbench.

## Mudanças Propostas

### WorkbenchRefactored.tsx
Alterar as dimensões hardcoded na animação do framer-motion:

**Atual:**
- 1:1 -> 448px x 448px
- 5:6 -> 384px x 460px (Aumento de apenas 12px na altura)
- 9:16 -> 292.5px x 520px (Largura muito reduzida)

**Novo (Proposto):**
- 1:1 -> **450px x 450px** (Base mantida/arredondada)
- 5:6 -> **420px x 504px** (Aumento de ~54px na altura, largura reduzida levemente para compensar)
- 9:16 -> **340px x 604px** (Aumento de ~154px na altura, preservando largura legível)

Isso garantirá que o card "cresça" verticalmente, ocupando mais espaço na tela e atendendo à expectativa do usuário.

## Impacto
- O layout pai (`Canvas Central`) deve acomodar essas novas alturas sem criar scroll indesejado em desktops padrão (1080p).
- A altura máxima de ~600px cabe bem na área central do Workbench (que tem ~80-90vh).
