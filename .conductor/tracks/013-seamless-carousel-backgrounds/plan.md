# Plano de Arquitetura e Implementação — Fundos "Seamless Carousel" e Modo Fantasma em Fileira (CanvasLab)

## 1. Objetivo e Visão Geral
Permitir que o usuário selecione planos de fundo panorâmicos contínuos (**Seamless Carousel**) dentro do **CanvasLab** exclusivamente quando estiver editando um **Carrossel** (`post.slides.length > 1`).

Em vez de picotar imagens estáticas em dezenas de arquivos isolados, utilizaremos **versões inteiras super leves (`.webp` otimizado e `.svg` nativo)** dos **17 panoramas** presentes em `artes/carrosseis-panoramicos` (de 5, 6 e 7 slides). Quando um fundo Seamless for selecionado:
1. O motor aplica a imagem panorâmica inteira aos slides cobertos usando posicionamento horizontal proporcional exato (`focalX = i / (N - 1)`), cortando naturalmente caso o carrossel tenha menos slides que o panorama ($M < N$) ou deixando os slides excedentes sem imagem de fundo ($M > N$).
2. O palco central do CanvasLab entra automaticamente no **Modo de Visualização Fantasma em Fileira (`SeamlessGhostStripView`)**, exibindo todos os slides do carrossel lado a lado sobre a tira panorâmica contínua, com o conteúdo textual/elementos em opacidade translúcida ("fantasma") para inspeção visual imediata do corte contínuo.
3. Ao clicar em **"OK / Concluir"** (ou selecionar um slide específico / pressionar `Enter`/`Esc`), o editor retorna à edição comum de slide único.

---

## 2. Inventário dos 17 Panoramas (`artes/carrosseis-panoramicos`)
Todos possuem altura canônica `1350px` e largura múltipla de `1080px` (`4:5`):

### Panoramas de 5 Slides (`5400 × 1350 px`)
1. `editorial-paper-collage-5` — *Paper Collage & Kinfolk Archival* (`.svg` / `.webp`, fundo claro `#F4EFE6`, `overlayOpacity: 0`)
2. `erosao-monolitica-5` — *Erosão Monolítica* (`.webp`, fundo escuro `#141210`)
3. `caderno-de-arquitetura-5` — *Caderno de Arquitetura* (`.svg`, fundo claro `#F4EFE6`, `overlayOpacity: 0`)
4. `cidade-dobravel-5` — *Cidade Dobrável* (`.webp`, fundo escuro `#12161F`)
5. `costura-do-sol-5` — *Costura do Sol* (`.webp`, fundo escuro `#1A110B`)
6. `fenda-de-cal-5` — *Fenda de Cal* (`.webp`, fundo claro/médio `#E8E2D5`, `overlayOpacity: 0.15`)

### Panoramas de 6 Slides (`6480 × 1350 px`)
7. `editorial-neubrutalist-pop-6` — *Swiss Neubrutalist Pop* (`.svg` / `.webp`, fundo claro `#F7F3EB`, `overlayOpacity: 0`)
8. `metamorfose-abissal-6` — *Metamorfose Abissal* (`.webp`, fundo escuro `#081018`)
9. `atlas-de-campo-6` — *Atlas de Campo* (`.svg`, fundo claro `#EFECE4`, `overlayOpacity: 0`)
10. `frequencia-partida-6` — *Frequência Partida* (`.webp`, fundo escuro `#0E1118`)
11. `herbario-fantasma-6` — *Herbário Fantasma* (`.webp`, fundo escuro `#0F1412`)
12. `mare-de-mercurio-6` — *Maré de Mercúrio* (`.webp`, fundo escuro `#10141C`)

### Panoramas de 7 Slides (`7560 × 1350 px`)
13. `editorial-cyber-tech-cad-7` — *Cyber-Tech Telemetry & CAD* (`.svg` / `.webp`, fundo escuro `#090D16`, `overlayOpacity: 0`)
14. `ressonancia-cinetica-7` — *Ressonância Cinética* (`.webp`, fundo escuro `#120E1A`)
15. `revista-de-vanguarda-7` — *Revista de Vanguarda* (`.svg`, fundo claro `#F3EFEA`, `overlayOpacity: 0`)
16. `anatomia-de-uma-mare-7` — *Anatomia de uma Maré* (`.webp`, fundo escuro `#0B131E`)
17. `o-vento-tem-peso-7` — *O Vento Tem Peso* (`.webp`, fundo escuro `#161412`)

---

## 3. Arquitetura da Solução

### Fase 1: Pipeline de Otimização & Manifesto (`client/public/images/backgrounds/seamless-carousel/`)
- Criar e executar script de otimização (`scripts/optimize_seamless_carousels.py`) que:
  - Converte os PNGs/JPGs panorâmicos inteiros para `.webp` de alta eficiência (`quality=84`, `method=6`), reduzindo arquivos de ~20 MB para ~350–750 KB sem perda perceptível;
  - Copia os `.svg` vetoriais leves (`12 KB` a `240 KB`) ou gera `.webp` equivalente para máxima compatibilidade com Konva `HTMLImageElement`;
  - Registra no `client/public/images/backgrounds/manifest.json` a coleção `seamlessCarousels` contendo para cada item:
    - `id`, `name`, `slideCount` (`5 | 6 | 7`), `width`, `height`, `url` (`/images/backgrounds/seamless-carousel/...`), `series` (`"Editorial"` | `"Arte Conceitual"`), `defaultOverlayOpacity` e `fallbackBgColor` (cor sólida complementar para slides sem fundo quando $M > N$).

### Fase 2: Utilitário Canônico de Aplicação Multi-Slide (`client/src/pages/CanvasLab/lib/seamlessCarousel.ts`)
- Criar funções puras e determinísticas:
  - `applySeamlessPanoramaToPost(post: CanvasPostModel, panorama: SeamlessPanoramaMeta, startSlideOffset = 0): CanvasPostModel`:
    - Percorre `post.slides` (`index = 0 .. M-1`).
    - Se o slide estiver dentro da faixa coberta pelo panorama (`panoIndex = index - startSlideOffset`, com `0 <= panoIndex < panorama.slideCount`):
      - Calcula `focalX = panorama.slideCount > 1 ? panoIndex / (panorama.slideCount - 1) : 0.5` e `focalY = 0.5`.
      - Em slides com `composition` (`ArsenalComposition` v3): aplica `setArsenalCustomBackground(composition, { imageUrl: panorama.url, fitMode: "cover", focalX, focalY, overlayOpacity: panorama.defaultOverlayOpacity })`.
      - Em slides sem `composition` (`CanvasPostModel` clássico): define `bgImage: panorama.url`, `bgTransform: undefined`, `bgPlacement: { fitMode: "cover", focalPoint: { x: focalX, y: focalY } }`.
    - Se o slide estiver fora da faixa do panorama (ex.: 6º slide quando o panorama tem 5 slides):
      - Remove a imagem de fundo daquele slide (`bgImage: ""` / `customBackground.imageUrl: undefined`), mantendo-o limpo com cor sólida harmonizada (`panorama.fallbackBgColor`).
  - `detectActiveSeamlessPanorama(post: CanvasPostModel, panoramas: SeamlessPanoramaMeta[])`:
    - Identifica se o carrossel atual está usando um dos panoramas seamless e qual o `startSlideOffset`.

### Fase 3: Opção "Seamless Carousel" na Gaveta e Painel de Fundo (`BackgroundsDrawer.tsx` & `CanvasEditorContent.tsx`)
- Em `CanvasMediaPanel` (`CanvasEditorContent.tsx`):
  - Quando `mode === "background"` e `post.slides.length > 1`, exibir um botão de destaque **"✨ Seamless Carousel (Fundo Contínuo)"** logo ao lado/acima de *"Explorar texturas de fundo"*, que abre a `BackgroundsDrawer` já posicionada na aba `"seamless"`.
- Em `BackgroundsDrawer.tsx`:
  - Quando `post.slides.length > 1`, exibir a aba especial **"Seamless Carousel"** (com ícone e contador `17`) no topo das categorias.
  - Quando a aba **"Seamless Carousel"** estiver ativa:
    - Exibir cards panorâmicos horizontais em **1 coluna** (proporção `4:1` / tira inteira) com linhas tracejadas verticais marcando as divisões de `5`, `6` ou `7` slides.
    - Mostrar etiqueta inteligente comparando com o carrossel atual (`post.slides.length` slides):
      - Se `panorama.slideCount === post.slides.length`: `"Encaixe exato (${N} slides)"`
      - Se `panorama.slideCount > post.slides.length`: `"${N} slides • usa ${M} e corta ${N - M}"`
      - Se `panorama.slideCount < post.slides.length`: `"${N} slides • ${M - N} slide(s) sem fundo"`
    - Ao clicar em um panorama: aplica o fundo contínuo em todo o carrossel, fecha a gaveta (ou recolhe no mobile) e aciona automaticamente o **Modo Fantasma em Fileira** no palco central!

### Fase 4: Modo de Edição/Visualização "Fantasma" em Fileira (`SeamlessGhostStripOverlay.tsx` + `CanvasLabPage.tsx`)
- Criar o componente `client/src/pages/CanvasLab/components/SeamlessGhostStripView.tsx` integrado ao `<main>` de `CanvasLabPage.tsx`:
  - Quando `seamlessGhostMode` estiver ativo (acionado ao selecionar um panorama Seamless, ou pelo botão *"Ver tira contínua"* no painel de Fundo quando um panorama Seamless já estiver aplicado):
    - **Barra Flutuante Superior (HUD):**
      - Título: **"Modo Fantasma — Seamless Carousel"** + Nome do Panorama (`5`, `6` ou `7` slides);
      - Controle rápido de **Opacidade Fantasma dos Textos** (`Fantasma 45%`, `Forte 85%`, `Só Fundo 0%`);
      - Se o número de slides do carrossel for diferente do tamanho do panorama ($M \neq N$), botões **`◀ Deslocar tira ▶`** para escolher a partir de qual slide/fatia o corte começa;
      - Botão primário **"OK / Concluir"** (além de atalho `Enter` / `Escape`) que fecha o modo fantasma e volta à edição normal.
    - **Fileira Panorâmica no Palco:**
      - Renderiza todos os slides do carrossel (`1..M`) **lado a lado em fileira contínua**, sem espaçamento entre eles (apenas uma linha tracejada vertical de corte estilo guilhotina editorial e numeração `SLIDE 01`, `SLIDE 02`... no topo).
      - Em cada slide da fileira, o fundo panorâmico aparece com `100%` de nitidez (mostrando a emenda perfeita entre os slides) e a camada de textos/elementos do slide é renderizada de forma **"fantasma" (translúcida)** por cima.
      - Se $N > M$ (panorama maior que o carrossel), exibe à direita as fatias excedentes semi-transparentes com hachura e selo `"CORTADO (${N - M} slide(s))"`, deixando claro que não há problema e que aquela parte será cortada.
      - Se $M > N$ (carrossel maior que o panorama), os slides excedentes aparecem na fileira com seu fundo sólido e selo `"SEM FUNDO PANORÂMICO (COR SÓLIDA)"`.
      - Clicar diretamente em qualquer slide da fileira seleciona aquele slide (`currentSlideIndex`) e se o usuário der duplo-clique (ou clicar em `"OK / Concluir"`), foca nele para edição normal.

### Fase 5: Testes Automatizados e Verificação
- Criar testes unitários e de integração (`seamlessCarousel.test.ts`) cobrindo:
  - Cálculo exato de `focalX = i / (N - 1)` para panoramas de 5, 6 e 7 slides;
  - Corte automático quando o carrossel tem menos slides que o panorama (ex.: 4 slides com panorama de 6);
  - Limpeza de fundo nos slides excedentes quando o carrossel tem mais slides que o panorama (ex.: 6 slides com panorama de 5);
  - Suporte simultâneo a slides com `ArsenalComposition` e slides `CanvasPostModel` clássicos;
  - Visibilidade exclusiva da opção `"Seamless Carousel"` quando `post.slides.length > 1`.

---

## 4. Resolução do Bug de Continuidade (Diagnóstico & Correção)
- **Problema Reportado:** O panorama começava no início em todos os slides em vez de manter a continuidade.
- **Causas Raízes Identificadas e Corrigidas:**
  1. **Composições V2:** Os templates de carrossel gerados são criados na versão 2. A verificação `slide.composition.version === 3` impedia que `setArsenalCustomBackground` promovesse a composição e aplicasse o `focalX` contínuo. Agora qualquer composição é atualizada e promovida para V3 via `setArsenalCustomBackground`.
  2. **Perda de `focalX` no `captureInitialVisuals`:** Quando `slide.bgImage` era recuperado para o `customBackground`, os campos `focalX` e `focalY` eram omitidos, voltando para `0.5` padrão. Agora são preservados diretamente de `slide.bgPlacement`.
  3. **Sobrescrita no `handleUpdatePost`:** Quando `input.kind === "document"` recebia o post com todas as fatias calculadas, `putArsenalComposition(doc, comp)` era invocado com a composição do slide ativo, sobrescrevendo a sincronização de múltiplos slides. Agora mutações de documento inteiro preservam todos os slides intactos.
  4. **Interferência de `bgTransform` residual:** Se o post possuía transformações manuais antigas no nível raiz, estas sobrepunham o enquadramento `crop` calculado por slide. No `CanvasPostStage.tsx`, a presença de `bgPlacement` no slide ativo agora prevalece sobre `post.bgTransform`.
  5. **Integração nas Gavetas:** `BackgroundsDrawer` no `CanvasSidebar.tsx` e `CanvasMobileDrawer.tsx` agora repassam `onApplySeamlessPanorama` corretamente.
- **Verificação:** 7/7 testes específicos de continuidade e fatiamento contínuo (`1080px` por fatia) aprovados em `seamlessCarousel.test.ts`, e 64/64 suítes com 399 testes passando sem regressões.
