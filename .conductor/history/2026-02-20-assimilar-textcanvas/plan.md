# Plano de Assimilação: TextCanvas

## 1. Visão Geral
Incorporar o ambiente de edição livre de texto (`textos.html`) ao PostSpark, transformando-o em um conjunto de componentes React nativos, estilizados via TailwindCSS e seguindo o ecossistema atual (Vite + React).
Este recurso será classificado como **Modo Estúdio (Architect Mode 2.0)**, projetado para toques finais profissionais, coexistindo pacificamente com o **Modo Expresso** (auto-fit e posicionamento automatizado por IA).

## 2. De/Para (Mapeamento de Arquitetura)
- **HTML/JS Puro (textos.html)** -> **Componentes React**
- **Sidebar/Ferramentas** -> Integrado a um novo painel lateral.
- **Top Bar (Propriedades)** -> Novo componente de propriedades avançadas de texto (`client/src/components/ui/AdvancedTextPropertyBar.tsx`).
- **Canvas Area & Selection Box** -> Transformar a lógica do canvas e da selection box (arrasto, redimensionamento, rotação) em componentes React (`AdvancedTextCanvas.tsx` e `AdvancedTextNode.tsx`).
- **CSS Local** -> Classes utilitárias do TailwindCSS (`bg-muted`, `border-border`, etc.) para herdar o Design System do projeto nativo.

## 3. Estratégia de Transmutação e Desafios de Engenharia
Criaremos os módulos em uma pasta isolada inicialmente (`client/src/components/canvas/`) para conter o ecossistema de edição isolado, antes de expor aos componentes de uso final (como `PostCard` ou `WorkbenchRefactored`).

### Pontos de Atenção (Desafios)
1. **Quebra de Paradigma no Estado (`PostVariation`)**: O estado deixará de ser apenas `headline/body` para suportar um array de objetos de texto (com coordenadas, rotação e estilos individuais). Precisamos adaptar a interface `PostVariation` e assegurar que o banco de dados seja capaz de persistir esse JSON.
2. **Responsividade (Coordenadas Absolutas vs Relativas)**: É imperativo que as posições salvas (x,y) e dimensões não quebrem o design ao rotacionar a tela ou exportar para formatos diversos (ex: 1:1, 9:16). As coordenadas do drag-and-drop precisam ser traduzidas para multiplicadores baseados no tamanho do container pai (`PostCard`).
3. **Fuga de Dados (`HoloDeck` -> `Workbench`)**: Há instabilidades crônicas reportadas onde o texto/design gerado pelo HoloDeck se perde ou chega corrompido ao Workbench. A arquitetura de *prop drilling* ou o store de transição deverá ser rigidamente auditado e refatorado em prioridade durante a fase de integração do estado do novo Canvas, para garantir a atomicidade da cópia do PostVariation gerado.

### Passos da Componentização
1. Investigar a injeção falha de props do `HoloDeck` para `WorkbenchRefactored`.
2. Modelagem do estado global/local do canvas (`elements`, `selectedId`, `zoomLevel`) expandido no `PostVariation`.
3. Construção do `AdvancedTextCanvas`, `AdvancedTextNode` e `AdvancedTextSelectionBox`.
4. Limpeza de atalhos e hooks globais vazados.

## Verificação
A validação envolverá a instanciação do `AdvancedTextCanvas` com isolamento no ambiente, confirmando:
1. Capacidades de drag, scale, rotate e text-formatting.
2. Persistência de estado simulada (conversão para/de JSON do novo formato).
3. Auditoria do fluxo de dados corrigido (HoloDeck -> Workbench -> Preview).
