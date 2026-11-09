# Lista de Tarefas — Fundos "Seamless Carousel" e Modo Fantasma em Fileira (CanvasLab)

## FASE 1: Otimização dos 17 Panoramas Inteiros e Manifesto
- [x] **T1.1**: Gerar versões inteiras super leves (`.webp` otimizados e `.svg` vetoriais) dos 17 designs de `artes/carrosseis-panoramicos` (5, 6 e 7 slides) em `client/public/images/backgrounds/seamless-carousel/`.
- [x] **T1.2**: Atualizar `client/public/images/backgrounds/manifest.json` adicionando a seção `seamlessCarousels` com metadados completos (`id`, `name`, `slideCount`, `width`, `height`, `url`, `series`, `defaultOverlayOpacity`, `fallbackBgColor`).

## FASE 2: Motor de Aplicação Multi-Slide (`seamlessCarousel.ts`)
- [x] **T2.1**: Criar `client/src/pages/CanvasLab/lib/seamlessCarousel.ts` com `applySeamlessPanoramaToPost` e `detectActiveSeamlessPanorama`, aplicando a imagem panorâmica inteira com `focalX = i / (N - 1)` nos slides cobertos, cortando quando $M < N$ e deixando sem imagem de fundo quando $M > N$ (compatível com `CanvasPostModel` e `ArsenalComposition`).

## FASE 3: Opção "Seamless Carousel" na Gaveta de Fundos
- [x] **T3.1**: Em `client/src/pages/CanvasLab/components/BackgroundsDrawer.tsx` e `client/src/pages/CanvasLab/components/CanvasEditorContent.tsx`, exibir a aba/atalho `"Seamless Carousel"` exclusivamente quando `post.slides.length > 1`, renderizando os cards em formato panorâmico horizontal (`4:1`) com linhas de corte e status de compatibilidade com o número atual de slides.

## FASE 4: Modo de Edição "Fantasma" em Fileira no Palco (`SeamlessGhostStripView.tsx` & `CanvasLabPage.tsx`)
- [x] **T4.1**: Criar `client/src/pages/CanvasLab/components/SeamlessGhostStripView.tsx` para renderizar todos os slides em fileira contínua sobre o fundo panorâmico com os elementos de cada slide em modo "fantasma" (translúcido), indicando eventuais fatias cortadas ($N > M$) ou slides sem fundo ($M > N$), controle de deslocamento da tira e botão `"OK / Concluir"`.
- [x] **T4.2**: Integrar `SeamlessGhostStripView` e o estado `isViewingSeamlessPanorama` em `client/src/pages/CanvasLab/CanvasLabPage.tsx`, abrindo automaticamente ao selecionar um fundo `"Seamless Carousel"` e retornando à edição comum ao confirmar (`OK / Concluir`, `Enter` ou `Esc`).

## FASE 5: Testes Automatizados e Verificação
- [x] **T5.1**: Criar `client/src/pages/CanvasLab/lib/seamlessCarousel.test.ts` e validar `npx vitest run` e `npx tsc --noEmit`.
