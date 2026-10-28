# Plano de Arquitetura e UX — Reforma das 5 Guias e Viewport Adaptativo (CanvasLab)

## 1. Diagnóstico Arquitetural (Causa Raiz)
1. **Acoplamento Dual-Brain (`!composition` vs. `composition`)**:
   - `CanvasSidebar.tsx` e `CanvasMobileDrawer.tsx` bifurcam diretamente na camada JSX conforme a presença de `slide.composition`.
   - **Triplicação na guia `Mídia` (Desktop)**: Renderiza simultaneamente `MediaSlotPanel`, `ArsenalCompositionInspector(section="media")` e o painel legado de mídia (gerando 2 blocos de IA, 3 uploaders e 2 blocos de ponto focal).
   - **Amputação na guia `Mídia` (Mobile)**: `!(composition && onMediaUpdate)` oculta o catálogo de 110+ texturas, gerador de IA e imagens sobrepostas quando o post possui `composition`.
   - **Duplicação na guia `Estilo`**: `ArsenalCompositionInspector.tsx` renderiza controles idênticos de tipografia/cor duas vezes na mesma aba (`selected` no card azul superior e novamente no bloco inferior de `section === "style"`).
   - **Capacidades escondidas**: `+ Texto` (`onAddExtraText`) e catálogo/upload de fontes ficam ocultos quando `composition` existe, apesar de `handleAddExtraText` já suportar `addArsenalAuthorialLayer`.
   - **Sequestro da guia `Logo`**: `useEffect` com `[selectedElementId, composition, activeTab]` força `setActiveTab("design")` sempre que um elemento está selecionado e o usuário clica em `Logo` (`brand`).
2. **Vazamento de Escopo (Slide vs. Elemento Selecionado)**:
   - `extraImages` ficam escondidas dentro da guia `Texto` em vez da guia `Mídia`.
   - Selecionar uma `extraImage` no palco não exibe inspetor contextual em `!composition`.
   - `VariableContentEditor` exige clique manual em `"Aplicar conteúdo"` em vez de sincronizar em tempo real.
3. **Viewport Desktop e Mobile**:
   - **Desktop**: Não aplica escala de auto-fit (`desktopFitScale`), cortando posts `9:16` e `4:5` em telas de notebook (`1366x768`); inicia com `freeEditing = false` (palco bloqueado); barra `"Remover elemento selecionado"` causa layout shift vertical.
   - **Mobile**: Toque simples em qualquer peça no palco abre automaticamente a gaveta (`52dvh`) cobrindo o post; excesso de barras horizontais empilhadas.

## 2. Etapas de Implementação
- **Fase 1 (`ArsenalCompositionInspector.tsx` & `VariableContentEditor.tsx`)**:
  - Eliminar a duplicação de controles de estilo/tipografia em `section === "style"` e de alinhamento rápido em `section === "design"`.
  - Habilitar sincronização automática em tempo real (`live apply`) ao editar textos e blocos em `VariableContentEditor` / `ArsenalCompositionInspector`, mantendo o botão `"Aplicar conteúdo"` por compatibilidade.
  - Em `ArsenalCompositionInspector(section="media")`, permitir ocultar o bloco redundante de upload de slot quando `MediaSlotPanel` já estiver presente (`hideMediaSlotUpload`), mantendo os controles de filtro/fundo customizado.
- **Fase 2 (`PropertyInspector.tsx` & `CanvasSidebar.tsx` — Desktop)**:
  - Corrigir o bug de sequestro da guia `Logo` (`brand`) usando `prevSelectedIdRef` para disparar a troca de aba apenas quando uma nova seleção ocorre.
  - Desbloquear `+ Texto` e catálogo/upload de fontes em posts com `composition`.
  - Mover a gestão de `Imagens & Fotos (Camadas Livres)` (`extraImages`) da guia `Texto` para a guia `Mídia`.
  - Eliminar a triplicação na guia `Mídia` Desktop, unificando: (1) Gerador IA + Slots/Fundo, (2) Imagens Sobrepostas (`extraImages`), (3) Catálogo de 110+ Texturas e Overlays.
  - Estender `PropertyInspector.tsx` e `CanvasSidebar.tsx` para inspecionar `extraImages` quando selecionadas no palco.
- **Fase 3 (`CanvasMobileDrawer.tsx` — Mobile)**:
  - Corrigir o sequestro da guia `Logo` com `prevSelectedIdRef`.
  - Desbloquear `+ Texto` e fontes para posts com `composition`.
  - Mover `extraImages` da guia `Texto` para a guia `Mídia`.
  - Desbloquear o catálogo de 110+ texturas, gerador de fundo IA e imagens sobrepostas na guia `Mídia` Mobile para posts com `composition` (removendo o bloqueio global `!(composition && onMediaUpdate)` e ocultando apenas o card legado de foto única quando `MediaSlotPanel` já gerencia os slots).
- **Fase 4 (`CanvasLabPage.tsx` & `GuidedEditor.tsx` — Viewport Desktop & Mobile)**:
  - Calcular `desktopFitScale` no `ResizeObserver` para garantir que 100% da prancheta (`1:1`, `4:5`, `9:16`) caiba na área útil do Desktop sem corte.
  - Iniciar `freeEditing` como `true` para manipulação direta imediata no palco, mantendo a barra rápida do `GuidedEditor` sempre acessível no topo sem esconder os botões de preset (`Reorganizar visual`, `Destaque`, `Cor`, `Mais / Menos`).
  - No Mobile, remover a abertura forçada da gaveta (`setIsMobileDrawerOpen(true)`) no toque simples do palco, permitindo arrastar/selecionar peças com o palco limpo e abrir a gaveta apenas quando o usuário tocar em uma aba inferior ou pedir ferramentas de imagem.
  - Eliminar o layout shift vertical do botão `"Remover elemento selecionado · Del"` integrando-o como HUD flutuante sobre a área do palco sem empurrar o canvas.
- **Fase 5 (Verificação e Testes)**:
  - Atualizar e expandir testes automatizados (`Vitest`) garantindo 100% de aprovação na suíte `CanvasLab` e zero erros de TypeScript.
