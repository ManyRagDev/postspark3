# Insight inicial - novos estilos

Data da analise: 2026-07-01

## Escopo analisado

- `novos estilos/designs`: 9 imagens JPG.
- `novos estilos/Estilos`: 10 imagens JPG.
- Todas as imagens sao screenshots verticais de Instagram em `1268x2756`.
- As capturas incluem interface do Instagram; a implementacao nao deve copiar a captura inteira. O valor esta nos padroes visuais observados dentro dos posts.

## Leitura da pasta `Estilos`

Esta pasta e um catalogo de duplas cromaticas. E o conjunto mais simples de incorporar ao PostSpark neste momento, porque o produto ja possui `ThemeConfig`, `DesignTokens`, `themeToDesignTokens`, `StyleSelector` e o fluxo canonico `PostVariation -> PostVisualSnapshot`.

Combos identificados:

1. Tiffany `#21F1A8` + Dark Gray `#171717`
2. True Pink `#FD1843` + Chill White `#FFF9FA`
3. Charcoal Violet `#3C1A47` + Cyber Lime `#B6FF00`
4. Cyprus `#004741` + Sand `#F0EDE4`
5. Lime Sprout `#E4FD97` + Fresh Canopy `#2D3E2C`
6. Milky `#FFFDF1` + Mantis `#59C749`
7. Turmeric `#FFBE0B` + Malt `#2A2312`
8. Silver `#141414` + Luminous Moss `#28EE34`
9. Vulcanico `#FF4103` + Noturno `#001621`
10. Skin Tone `#FFC6A8` + Bridal `#741A2F`

Implementacao provavel:

- Criar uma colecao dedicada de paletas/presets, sem misturar o conceito com templates complexos de design.
- Converter cada combo para `DesignTokens`:
  - cor 1 como fundo ou destaque, conforme contraste;
  - cor 2 como texto/superficie;
  - `primary` e `secondary` derivados da dupla;
  - tipografia display forte, provavelmente `Anton`, `Bebas Neue`, `Space Grotesk` ou equivalente ja aceito pelo sistema.
- Atualizar testes que hoje assumem exatamente 8 temas em `server/theme.test.ts`.
- Onde o usuario escolhe esses estilos ainda pode ser decidido depois; a base tecnica pode existir separada da UI.

## Leitura da pasta `designs`

A pasta `designs` nao e apenas paleta. Ela apresenta tecnicas de composicao:

1. Tipografia em camadas: texto grande parcialmente atras de elementos da foto.
2. Texto incorporado a cena: titulo parece ocupar profundidade fisica da imagem.
3. Poster editorial/cinematografico: tipografia grande, imagem central, microtexto e hierarquia de poster.
4. Profundidade por sobreposicao: elementos visuais em frente e atras de texto.
5. Gradiente iridescente e efeitos luminosos.
6. Dupla exposicao.
7. Glitch design.
8. Stroke text overlay.
9. Glass effect com blur/rasgo vertical sobre retrato.

## O que da para implementar agora

Sem mudar o contrato do snapshot, ja e possivel criar aproximacoes boas de:

- Paletas da pasta `Estilos`.
- Posts com fundo de imagem, overlay, brilho/contraste/saturacao/blur e blend mode.
- Composicoes com texto posicionado livremente usando `textElements`.
- Insercao de imagens/stickers/logos usando `imageElements`.
- Layouts editoriais com titulo grande, subtitulo, badge, sticker e card.
- Glitch simples via duplicacao de textos/imagens com deslocamento e cores diferentes, desde que seja uma receita gerada com elementos atuais.
- Posters com hierarquia tipografica forte, se o motor gerar `textElements` bem posicionados.

## O que ainda nao podemos fazer bem

Algumas referencias dependem de capacidades que hoje nao aparecem como contrato visual completo:

- Texto realmente atras de uma pessoa/objeto da foto, sem segmentacao ou cutout do sujeito.
- Profundidade automatica por camadas de imagem, quando o sistema nao sabe qual parte esta na frente.
- Mascara por elemento, clip/mask por texto, ou texto recortado por silhueta.
- Efeitos por elemento como `text-stroke`, `mix-blend-mode`, `filter`, `backdrop-filter`, `text-shadow` e z-index persistido por layer.
- Warping/perspectiva de texto integrado a cena.
- Dupla exposicao real com composicao de duas imagens e mascara.
- Glass effect fiel quando depende de blur local, deslocamento e mascara vertical sobre o retrato.

## Insight principal

O caminho correto nao e tratar tudo como "estilo".

Para o PostSpark, estes materiais sugerem dois eixos separados:

1. **Estilos cromaticos**: paletas e tokens visuais. Entram como `DesignTokens`/presets e podem ser incorporados agora.
2. **Receitas de composicao**: tecnicas como layered typography, poster editorial, glitch, dupla exposicao, stroke overlay e glass effect. Entram como templates/recipes que produzem `textElements`, `imageElements`, `layoutSettings`, `bgValue`, `bgOverlay` e, futuramente, metadados de layer/effects.

Essa separacao preserva a invariante do projeto: HoloDeck, Workbench, exportacao, salvamento e historico continuam consumindo o mesmo `PostVisualSnapshot`. Nao deve ser criado um segundo normalizador visual nem uma precedencia paralela de cor/layout/background.

## Direcao tecnica sugerida

Fase 1:

- Criar um registro de paletas inspirado na pasta `Estilos`.
- Mapear cada paleta para `DesignTokens`.
- Ajustar testes existentes que assumem 8 temas.
- Manter a escolha de UI para depois.

Fase 2:

- Criar um conceito de `compositionRecipe` ou equivalente, separado de `DesignTokens`.
- Comecar por recipes que usam recursos existentes:
  - editorial poster;
  - bold color split;
  - layered typography aproximado;
  - glitch aproximado;
  - stroke overlay aproximado com fallback.

Fase 3:

- Evoluir contrato visual se necessario, com incremento de `snapshotVersion`, para suportar:
  - z-index persistido em `TextElement` e `ImageElement`;
  - efeitos por elemento;
  - stroke/shadow/blend/filter;
  - mask/clip path;
  - camadas de sujeito recortado quando houver asset segmentado.

Qualquer mudanca de contrato deve atualizar simultaneamente `DOCUMENTO_MESTRE.md` e os testes obrigatorios de `variationSnapshot`.
