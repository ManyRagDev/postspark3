# Tarefas: Fix Design Transfer & Editing

- [ ] Modificar PostCard.tsx <!-- id: 0 -->
    - [ ] Adicionar prop `forceVariationColors`. <!-- id: 1 -->
    - [ ] Atualizar prioridade de resolução de cores. <!-- id: 2 -->

- [ ] Modificar WorkbenchRefactored.tsx <!-- id: 3 -->
    - [ ] Inicializar state `variation` com cores do `initialTheme`. <!-- id: 4 -->
    - [ ] Passar `forceVariationColors={true}` para `PostCard`. <!-- id: 5 -->

- [ ] Verificação <!-- id: 6 -->
    - [ ] Teste manual: Holodeck (Theme) -> Workbench (Input Colors = Theme Colors). <!-- id: 7 -->
    - [ ] Teste manual: Edit Color -> Updated Preview. <!-- id: 8 -->
