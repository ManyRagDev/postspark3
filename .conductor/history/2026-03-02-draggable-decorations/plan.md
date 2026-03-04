# Plano de Implementação: Badge/Sticker Movíveis e Snap 5x5

## Escopo
Tornar os elementos decorativos visuais (Badge e Sticker) manipuláveis pelo usuário no modo de edição (Workbench / ArchitectOverlay), além de expandir a precisão da funcionalidade de "Ímã" (Snap-to-Grid) para uma resolução de 5x5.

## Fatiamento de Domínio (Isolamento)
Todas as alterações pertencem estritamente à camada de **UI / Client Components**.

### Domínio: UI Core & Tipagem
- `client/src/types/editor.ts`: Expansão da interface `AdvancedLayoutSettings` para alocar `badge` e `sticker`. Configuração inicial do default.
- `client/src/components/canvas/DraggableBlock.tsx`: Atualização das constantes `GRID_SNAP_POSITIONS` para conter a matriz de 25 pontos (`10, 30, 50, 70, 90`).

### Domínio: UI Components (Workbench)
- `client/src/components/PostCard.tsx`: Modificação do `ArchitectOverlay` para que o badge (`renderTopBar`) e o sticker (`renderBottomBar`) passem a ser renderizados condicionalmente dentro de um `DraggableBlock`, herdando os callbacks `onDragPosition` e `onResizeBlock`.
- `client/src/components/views/WorkbenchRefactored.tsx`:
  - Expansão do controle "Elemento Ativo" para incluir 'badge' e 'sticker'.
  - Atualização do Grid UI (atualmente 3x3) para 5x5. Cada bloco do grid 5x5 enviará uma posição `freePosition` equivalente àquela coordenada (10% a 90%), injetando precisão nos cliques.
