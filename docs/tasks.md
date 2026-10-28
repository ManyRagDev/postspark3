# Lista de Tarefas — Reforma de Arquitetura e UX do Editor (CanvasLab)

## FASE 1: Desduplicação do Inspetor de Composição e Edição em Tempo Real
- [x] **T1.1**: Em `client/src/pages/CanvasLab/components/ArsenalCompositionInspector.tsx`, remover a duplicação dos controles de tipografia/estilo em `section === "style"` (manter apenas uma instância com `aria-label="Fonte da peça"` e demais seletores de acessibilidade) e de alinhamento rápido em `section === "design"`.
- [x] **T1.2**: Em `client/src/pages/CanvasLab/components/ArsenalCompositionInspector.tsx`, sincronizar alterações de `draft` (`VariableContentEditor` e campos v2) automaticamente com `onChange(editArsenalContent(c, nextDraft))`, preservando o botão `"Aplicar conteúdo"`.
- [x] **T1.3**: Em `client/src/pages/CanvasLab/components/VariableContentEditor.tsx`, adicionar rótulos amigáveis aos papéis de bloco e melhorar a hierarquia visual mantendo todos os botões e `aria-label` exigidos pelos testes.

## FASE 2: Unificação e Desduplicação da Sidebar Desktop (`CanvasSidebar.tsx` & `PropertyInspector.tsx`)
- [x] **T2.1**: Em `client/src/pages/CanvasLab/components/PropertyInspector.tsx`, adicionar suporte à inspeção contextual de camadas de imagem livre (`extraImages`: escala, opacidade, arredondamento, rotação, ordem de camada e exclusão).
- [x] **T2.2**: Em `client/src/pages/CanvasLab/components/CanvasSidebar.tsx`, corrigir o `useEffect` que sequestra a guia `Logo` (`brand`) usando `prevSelectedIdRef` para só mudar para `design` quando `selectedElementId` transicionar para um novo elemento.
- [x] **T2.3**: Em `client/src/pages/CanvasLab/components/CanvasSidebar.tsx`, liberar `+ Texto` e catálogo/upload de fontes na guia `Texto` mesmo quando `composition` estiver presente, e mover a seção `Imagens & Fotos (Camadas Livres)` da guia `Texto` para a guia `Mídia`.
- [x] **T2.4**: Em `client/src/pages/CanvasLab/components/CanvasSidebar.tsx`, eliminar a triplicação na guia `Mídia` para posts com `composition` (evitar renderizar o bloco legado de upload/ponto focal de fundo e o upload duplicado do `ArsenalCompositionInspector` quando `MediaSlotPanel` estiver ativo, mantendo Gerador IA, Imagens Sobrepostas e Catálogo de 110+ Texturas).

## FASE 3: Unificação e Desbloqueio da Gaveta Mobile (`CanvasMobileDrawer.tsx`)
- [x] **T3.1**: Em `client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx`, corrigir o `useEffect` que sequestra a guia `Logo` (`brand`) usando `prevSelectedIdRef`.
- [x] **T3.2**: Em `client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx`, liberar `+ Texto` e fontes na guia `Texto` para posts com `composition`, mover `extraImages` da guia `Texto` para a guia `Mídia`, e usar `PropertyInspector` atualizado para `extraImages`.
- [x] **T3.3**: Em `client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx`, remover o bloqueio global `!(composition && onMediaUpdate)` na guia `Mídia` Mobile para que posts com `composition` tenham acesso ao Gerador IA, Imagens Sobrepostas e ao Catálogo de 110+ Texturas (ocultando apenas o card legado de foto única quando `MediaSlotPanel` estiver ativo).

## FASE 4: Otimização de Viewport Desktop e Ergonomia Touch Mobile (`CanvasLabPage.tsx` & `GuidedEditor.tsx`)
- [x] **T4.1**: Em `client/src/pages/CanvasLab/CanvasLabPage.tsx`, calcular `desktopAdaptiveScale` no `ResizeObserver` da área do palco para que pranchetas `1:1`, `4:5` e `9:16` se ajustem automaticamente a 100% da altura/largura útil do navegador Desktop sem cortes.
- [x] **T4.2**: Em `client/src/pages/CanvasLab/CanvasLabPage.tsx` e `client/src/pages/CanvasLab/components/GuidedEditor.tsx`, iniciar `freeEditing = true` por padrão (manipulação direta ativa no palco desde a entrada) e manter os controles rápidos do `GuidedEditor` visíveis na barra superior, além de transformar o botão `"Remover elemento selecionado · Del"` em pill flutuante sem layout shift.
- [x] **T4.3**: Em `client/src/pages/CanvasLab/CanvasLabPage.tsx`, remover o `useEffect` que força `setIsMobileDrawerOpen(true)` ao selecionar qualquer elemento no palco Mobile, mantendo o palco livre para arraste e toque direto.

## FASE 5: Verificação Automatizada e Regressão
- [x] **T5.1**: Executar e validar toda a suíte de testes `npx vitest run client/src/pages/CanvasLab/` e checagem de tipos `npx tsc --noEmit`.
