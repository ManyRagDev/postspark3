# Lista de Tarefas: Badge/Sticker Movíveis

Estas tarefas devem ser executadas passo-a-passo e marcadas quando concluídas. O fatiamento foca nos domínios UI estritos.

- [ ] `tipo-atualizacao`: Adicionar `badge` e `sticker` (tipo `LayoutPosition`) na interface `AdvancedLayoutSettings` em `client/src/types/editor.ts`. Atualizar `DEFAULT_LAYOUT_SETTINGS` com as propriedades recém-criadas.
- [ ] `grid-magnetico-5x5`: Modificar a constante `GRID_SNAP_POSITIONS` em `client/src/components/canvas/DraggableBlock.tsx` para gerar dinamicamente (ou hardcoded) um array de 25 posições distribuídas nas coordenadas combinadas `10, 30, 50, 70, 90`.
- [ ] `ui-workbench-grid`: Atualizar `client/src/components/views/WorkbenchRefactored.tsx` (seção do grid visual) para iterar uma grade 5x5. Configurar os botões para aplicar dinamicamente o estado `freePosition` de suas respectivas coordenadas nos cliques.
- [ ] `ui-workbench-elemento-ativo`: Expandir os targets do `WorkbenchRefactored.tsx` e botões agrupados sob o "Elemento Ativo" para passar a incluir e suportar as novas chaves `'badge'` e `'sticker'`.
- [ ] `renderizacao-draggable-postcard`: Refatorar os métodos de renderização (topo e base) e o `ArchitectOverlay` em `client/src/components/PostCard.tsx` para permitir que o `renderTopBar` e `renderBottomBar` funcionem encapsulados pelo componente contextual `<DraggableBlock>`, delegando o arraste e resizes ao estado.
