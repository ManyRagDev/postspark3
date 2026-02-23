# Resumo de Tarefas: Slider de Tamanho da Fonte

- [ ] **1. Modificar Tipagem (shared/postspark.ts)**: Adicionar os campos opcionais numéricos `headlineFontSize` e `bodyFontSize` à estrutura interna de `PostVariation`. *(Gatilho executor: Alteração na interface de state visual).*
- [ ] **2. Modificar Visualizador de Componente (client/src/components/PostCard.tsx)**: Ler as variáveis de estado do `PostVariation` e aplicar os multiplicadores em `calc()` nos atributos css `fontSize` tanto no escopo flexível normal quanto nas branches `ArchitectOverlay`.
- [ ] **3. Adicionar Controles na Interface e UI (client/src/components/views/WorkbenchRefactored.tsx)**: Introduzir o React hooks handler dos multiplicadores e exibi-los via botões de Título/Corpo, e renderizá-los com o Slider `PrecisionSlider` (mínimo 0.5, máximo 2.0). 
- [ ] **4. Testes de Integração Manual**: Acessar o sistema rodando, carregar o WorkbenchRefactored de um post novo e mover os slides do tamanho do "Corpo" para "1.5x" e observar se os layouts como "Story Layout" e "Centered Layout" respondem ao vivo. Confirmar se a mudança de cor atual de `textColorScope` não quebrou com a alteração.
