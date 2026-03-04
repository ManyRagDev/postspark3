# Fases de Refatoração: Workbench V2 e Arquitetura Zustand (Strangler Fig)

> **Regra**: Cada checkbox deve ser executada de modo estritamente atômico. Apenas avance após testes de compilação sem erro. Use o Type-Checker após cada Fase.

### FASE 1: Fonte Única de Verdade Escalonável (Zustand Global)
- [ ] Criar o arquivo `client/src/store/editorStore.ts`.
- [ ] Implementar a store com todos os estados migrados do `EditorContext`: `activeVariation`, `slides`, `postMode`, `imageSettings`, `layoutSettings`, `bgValue`, `bgOverlay`, `layoutTarget` e `platform`.
- [ ] Construir as actions mutators de granulado fino: `setActiveVariation`, `updateImageSettings`, `setBgValue`, etc.
- [ ] Substituir o uso de Props de navegação no `HoloDeck` para despachar `setActiveVariation` e dados globais no Zustand logo antes de navegar para o Editor.
- [ ] (Limpeza Suspensa): O `<EditorProvider>` de `Home.tsx` não será apagado até a Fase final, garantindo a coexistência com o Workbench V1 em dev.

### FASE 2: Type-Driven Development (Contratos de Interface)
- [ ] Modificar `client/src/types/editor.ts` removendo ambiguidades de `Partial<>` relaxados no `AdvancedLayoutSettings`.
- [ ] Garantir que objetos `badge` e `sticker` possuam posicionadores obrigatórios de X e Y mapeados para a nova grade 5x5 prevista na especificação.

### FASE 3: Desidratação do PostCard.tsx
- [ ] Criar arquivo `client/src/components/views/WorkbenchV2/PostCardV2.tsx` de forma passiva.
- [ ] O componente consumirá exclusivamente a store: `useEditorStore(s => s)`.
- [ ] Extrair as lógicas de arrasto, mouse e eventos pesados de `architectProps` construindo o container limpo `ArchitectOverlay.tsx` externo.

### FASE 4: Modularização Cirúrgica e Mobile-First (Baby Steps)
- [ ] **Passo 4.1:** Criar a base `WorkbenchV2.tsx` e o `CanvasWorkspace.tsx`, provendo o layout de 3 colunas (desktop).
- [ ] **Passo 4.2:** Ejetar e criar o bloco `WorkbenchV2/blocks/PlatformBlock.tsx` (Proporções e Plataforma). Acoplar ao Zustand. Testar.
- [ ] **Passo 4.3:** Ejetar e criar o bloco `WorkbenchV2/blocks/DesignBlock.tsx` (Marca e Temas). Acoplar ao Zustand. Testar.
- [ ] **Passo 4.4:** Ejetar e criar o bloco `WorkbenchV2/blocks/FontColorBlock.tsx` (Tipografia, cor e formatação de layer atual).
- [ ] **Passo 4.5:** Ejetar e criar o bloco `WorkbenchV2/blocks/ImageBlock.tsx` (Fundo, Máscara e Uploads).
- [ ] **Passo 4.6:** Ejetar e criar o bloco `WorkbenchV2/blocks/LayoutBlock.tsx` (Grades 5x5 e snap).
- [ ] **Passo 4.7:** Ejetar e criar o bloco `WorkbenchV2/blocks/CaptionBlock.tsx` (Edição de texto e char count das legendas).
- [ ] **Passo 4.8 (Responsividade Mestre):** Em `WorkbenchV2.tsx`, capturar uso em tela pequena e injetar as renderizações dos blocos iterados acima estritamente dentro do `MobileEditSheet` orquestrado pelo `useArcDrawer` nativo. Conservando 100% da responsividade hoje imposta no Workbench V1.

### FASE 5: Resgate das Funcionalidades Premium
- [ ] Restaurar funcionalidade de endpoint da view "Ajustar com IA", configurando o payload de imagem B64 do Canvas submetendo à LLM Multimodal e consumindo o diff da store.
- [ ] Amarrar Select UI de Pro/Basic Models no Backend e na Injeção Visual do `HoloDeck` e `ImageBlock`.

### FASE FINAL: O Corte do Strangler Fig
- [ ] Plugar `<WorkbenchV2 />` em uma flag DEV temporária de roteamento via `Home.tsx`.
- [ ] Compilar, efetuar o teste de mesa profundo.
- [ ] Apagar `<EditorProvider>` legado e arquivo estático original `WorkbenchRefactored.tsx`. Promover V2 oficial.
