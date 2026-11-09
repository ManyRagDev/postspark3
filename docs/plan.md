# Plano de Arquitetura e Implementação — Fundos "Seamless Carousel" e Modo Fantasma em Fileira (CanvasLab)

Consulte o plano detalhado da track ativa em [`.conductor/tracks/013-seamless-carousel-backgrounds/plan.md`](../.conductor/tracks/013-seamless-carousel-backgrounds/plan.md).

## Resumo das Fases
1. **Fase 1 — Otimização de Assets e Manifesto**: Converter os 17 panoramas de `artes/carrosseis-panoramicos` (5, 6 e 7 slides) em versões inteiras super leves (`.webp` / `.svg`) em `client/public/images/backgrounds/seamless-carousel/` e catalogá-los no `manifest.json`.
2. **Fase 2 — Motor de Aplicação Multi-Slide (`seamlessCarousel.ts`)**: Aplicar a imagem panorâmica inteira aos slides `0..min(M, N)-1` com `focalX = i / (N - 1)` (tanto em `CanvasPostModel` quanto em `ArsenalComposition`), cortando o excesso se $M < N$ e deixando sem imagem de fundo os slides excedentes se $M > N$.
3. **Fase 3 — Categoria "Seamless Carousel" no CanvasLab (`BackgroundsDrawer.tsx` & `CanvasEditorContent.tsx`)**: Exibir a opção `"Seamless Carousel"` exclusivamente quando `post.slides.length > 1`, com prévia panorâmica inteira e indicação de encaixe/corte.
4. **Fase 4 — Modo de Visualização "Fantasma" em Fileira (`SeamlessGhostStripView.tsx` & `CanvasLabPage.tsx`)**: Ao selecionar um panorama Seamless, exibir todos os slides enfileirados lado a lado no palco central com o fundo contínuo aplicado e os textos/elementos em modo fantasma translúcido, com barra superior e botão `"OK / Concluir"` para retornar à edição comum.
5. **Fase 5 — Verificação e Testes (`seamlessCarousel.test.ts`)**: Validar a matemática de recorte, regras de excesso/falta de slides, restrição a carrosséis e testes do CanvasLab.
