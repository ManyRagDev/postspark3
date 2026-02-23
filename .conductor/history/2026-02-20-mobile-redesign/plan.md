# Plano de Implementação: Mobile Redesign (PostSpark)

## 1. Visão Geral
Refatorar a experiência mobile do editor (`WorkbenchRefactored`), abandonando abordagens complexas que falharam na prática (como o Menu Radial/Arc) e focando na fluidez inspirada em editores mobile modernos (ex: CapCut, Instagram Stories). A interface será desenhada para oferecer precisão sem sacrificar espaço de tela, com alvos de toque generosos e acesso rápido.

## 2. Abordagem Arquitetural
- **Remoção Segura de Dead Code:**
  - Deletar `client/src/components/ReactorArc.tsx`.
  - Auditar `Workbench.tsx` (antigo) e desvincular o componente se necessário.
  - Refatorar ou remover dependências vazias do antigo hook de "ArcDrawer".

- **Nova Foundation Mobile (`MobileWorkbenchUI`):**
  - **Top Bar Escuta:** A barra de topo no Mobile ficará mais fina e com comandos prioritários: "Voltar", "Exportar", "Salvar". O restante do layout passará o foco total para o Canvas (Preview).
  - **ToolBar Principal Inferior:** Uma barra fixa com scroll horizontal simples (ícones grandes + legenda abaixo do ícone). Servirá de Hub para as abas (Text, Design, Image, Composition).
  - **Drawer/Sheet Reativo:** Ao clicar em um ícone da ToolBar, uma aba sobe (`MobileEditSheet` aprimorado), cobrindo o mínimo necessário da tela para edição.
  - **Modo Ocultamento Automático (Fullscreen Preview):** Tocar no Canvas deverá contrair ferramentas e deixar apenas o elemento focado para drag & drop e preview claro.

- **Adaptação dos Controles para o Toque (Touch Optimization):**
  - Todo Slider (tamanho do texto, borderRadius) deverá ter espaçamento (`touch-action: none` onde apropriado para não dar scroll na tela enquanto desliza).
  - Handles do Canvas (se aplicável ao `AdvancedTextCanvas`) devem usar padding invisível (target area) de no mínimo `44px x 44px`.
  - *Design Guide Applied:* A interface das ferramentas deve aplicar a **Psicologia das Cores** (Princípio 10) para ações críticas: botões destrutivos ou de alerta devem evitar cores vibrantes desnecessárias, e botões primários (Salvar/Exportar) devem usar a cor de Accent/Verde.
  - *Design Guide Applied:* A **Proximidade e Lei da Continuidade** (Princípio 3) deve orientar a clusterização dos controles no Drawer. Opções relacionadas (ex: Fonte e Tamanho) devem estar a 1 UB (Unidade Base) de distância, enquanto configurações distintas (ex: Fonte vs Alinhamento) a 3 UB, criando respiro visual.
  
## 3. Desafios Previstos
1. **Convivência Desktop vs Mobile:** O componente `WorkbenchRefactored.tsx` possui ramificações `if (isMobile)`. O plano será estender esse particionamento para encapsular a lógica da interface em sub-componentes se o aquivo crescer muito, visando não quebrar a excelente experiência desktop atual.
2. **Virtual Keyboard Overflow:** O teclado on-screen em mobile empurra a tela para cima. Input de texto precisará garantir que o campo e o canvas permaneçam visíveis e não quebrem o layout (usando `env(safe-area-inset-bottom)`).
