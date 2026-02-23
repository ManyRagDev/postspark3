# Tarefas de Implementação: Mobile Redesign

## Fase 1: Limpeza e Setup do Novo Modelo
- [x] 1. Deletar `client/src/components/ReactorArc.tsx` e remover importações dele no projeto (verificar `Workbench.tsx`).
- [x] 2. Limpar referências residuais do estado "radial" em `useArcDrawer.ts`, otimizando o hook para gerenciar somente o Sheet (Gaveta) clássico (`isOpen`, `activeTab`, `heightInVh`).

## Fase 2: Recriação da Base da Interface Mobile (`WorkbenchRefactored.tsx`)
- [x] 3. Refatorar a renderização do bloco `if (isMobile)` no `WorkbenchRefactored.tsx`. Implementar a nova `Mobile ToolBar` fixa na parte inferior (com os botões de ferramentas: Texto, Design, Imagem, Layout).
- [x] 4. Otimizar a Top Bar mobile (com margens consistentes e botões focados: Voltar, Action/Save).
- [x] 5. Melhorar o `MobileEditSheet.tsx` garantindo animações de swipe-down polidas via `framer-motion`, altura responsiva `74vh`, e cabeçalho identificando a ferramenta aberta.

## Fase 3: Touch-Optimizations (Controles & Sliders)
- [x] 6. Otimizar a aba "Design" para exibição mobile: usar grids de toque em paletas de cores, separando controles de cor de texto vs backgrounds de forma clara em listas modais.
- [x] 7. Otimizar a aba "Texto" para mobile: ajustar `PrecisionSlider` e inputs numéricos/textuais para possuírem `touch-action: none` correto e alvos >= 44px. 
- [x] 8. Otimizar a aba "Layout" (composição): tornar a matriz 3x3 de posicionamento generosa para toques de polegar.

## Fase 4: Integração Final e Quality Assurance
- [x] 9. Testar o fluxo completo: Entrar no PostCard, tocar em editar texto, abrir abas, arrastar controles e verificar a sobreposição do teclado virtual. (Enviado para teste manual)
- [x] 10. Documentar conclusões no `project-status.md`.
