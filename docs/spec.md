# Especificação Técnica: Redesign da Interface Mobile (Workbench)

## Contexto e Problema
A versão mobile atual das telas de edição não condizem com a experiência premium ("high-ticket") do PostSpark. Houve uma tentativa prévia de usar um menu circular (`ReactorArc.tsx`) que não funcionou bem na prática. O usuário solicitou o desenvolvimento de uma interface mobile do zero, focada em fluidez, adaptando os controles focados em mouse (desktop) para toque (celular), mantendo o padrão visual premium do desktop que já possui excelente design.

## Objetivos e Requisitos
1. **Remoção de Código Legado:** Eliminar completamente o menu circular (`ReactorArc.tsx`) e qualquer lógica associada que não será aproveitada.
2. **Layout Otimizado para Toque:** 
   - Maximizar a área do Canvas visível na tela.
   - Controles na parte inferior da tela, acessíveis com o polegar (Bottom Navigation ou Scroll Horizontal).
   - "Hit areas" (áreas de toque) confortáveis (mínimo 44x44px).
   - Sliders e botões adaptados para não exigirem precisão fina de mouse.
3. **Fluidez (Motion & UX):**
   - Transições suaves usando `framer-motion` em painéis inferiores (Bottom Sheets).
   - Em vez de um menu arc problemático, usar um sistema limpo de Abas ou Ferramentas que abrem painéis contextuais.
4. **Paridade Funcional:** O mobile deve permitir formatar texto, alterar design (cores, temas), gerar imagens e ajustar layout.

## Arquitetura Proposta para o Mobile `WorkbenchRefactored`
- **Header Topo:** Minimalista (Voltar à esquerda, Salvar/Exportar à direita).
- **Área Central (Canvas):** Renderiza o `PostCard`/`AdvancedTextCanvas` redimensionado para caber perfeitamente na viewport. 
  - *Design Guide Applied:* O Canvas deve respeitar as **Safe Zones** (Princípio 2 e 8), garantindo "White Space" e margens de respiro ao redor do post para evitar toques acidentais e proporcionar uma visualização limpa ("Regra 40/60" de respiro visual).
- **Bottom Toolbar (Root):** Barra de ferramentas rolável horizontalmente com ícones grandes e labels para: "Texto", "Cores", "Imagem", "Layout".
- **Bottom Sheet (Painel de Edição):** Ao tocar numa ferramenta, uma folha sobre na metade inferior (Drawer expansível) substituindo a toolbar inferida, permitindo edição granular (sliders de fonte, campos de texto, paleta de cores).
  - *Design Guide Applied:* A UI dos painéis de edição também deve seguir a **Hierarquia Visual (Lei do Contraste)** e **Contraste WCAG 2.1** (Princípio 4), usando escalas de fonte 3:2:1 para títulos e controles legíveis contra o fundo void/escuro.
- O módulo `useArcDrawer` e `MobileEditSheet` serão evoluídos ou substituídos por um drawer mais estável e premium, removendo heranças do "Arc".
