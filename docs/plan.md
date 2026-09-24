# Plano de Implementação — Refatoração de Redimensionamento e UX de Rich Text (CanvasLab)

## Visão Geral
Este plano estrutura a modernização do motor de texto e da interface do editor oficial (`CanvasLabPage`). O foco central é corrigir o comportamento atual de "tecido elástico" nas transformações de texto, unificar os controles de propriedades em um "Inspetor Contextual" e, finalmente, entregar suporte a Rich Text (variabilidade de cor e tamanho inline) no Canvas.

## Fonte da Verdade e Invariantes
- A documentação de contexto obrigatória está em `DOCUMENTO_MESTRE.md`.
- O modelo autoritativo da edição é o `CanvasPostModel`.
- O renderizador é o Konva.js em `CanvasPostStage.tsx`.
- A arquitetura adotada para *Rich Text* no Canvas é a **Divisão Dinâmica de Glifos em Canvas (Caminho B)**, rejeitando a injeção de HTML/SVG via `foreignObject` para preservar a estabilidade de fontes web, alta performance e fidelidade em exportação offscreen.

## Fases da Arquitetura

### 1. Etapa 1: A Nova Física da Caixa de Texto (Ajuste Horizontal)
**Objetivo:** Substituir a deformação elástica (anamórfica) por redimensionamento de caixa com quebra de linha natural (*word wrap* em tempo real).
- **Alterações:**
  - Configurar o componente `Transformer` no `CanvasPostStage.tsx` limitando as âncoras para elementos de texto.
  - Implementar suporte à propriedade de largura (`width`) individual nos elementos `headline` e `subtext` do `CanvasPostModel`.
  - Capturar o evento `onTransform` (ou `boundBoxFunc`) durante o arrasto das alças laterais, converter a escala instantânea na nova largura da caixa, e forçar o reset de `scaleX` e `scaleY` a 1.
  - O mesmo tratamento será aplicado para elementos `extraTexts`.

### 2. Etapa 2: O Inspetor Contextual (UX Universal)
**Objetivo:** Eliminar o atrito da hierarquia estática da barra lateral, fazendo com que ela reaja inteligentemente ao elemento focado na tela.
- **Alterações:**
  - Refatorar `CanvasSidebar.tsx` (e `CanvasMobileDrawer.tsx`).
  - **Estado Vazio (Sem Seleção):** Mostrará propriedades globais (Paleta, Fundo, etc).
  - **Texto Selecionado:** Mostrará o Inspetor de Propriedades de Texto (Fonte, Tamanho, Cores, Opacidade, Efeito de Sombra, Alinhamento, Posição no Z-Index), **seja ele** a Headline, Subtext ou um ExtraText. O painel deve ler do nó selecionado e gravar via `documentCommands.ts` de forma centralizada.

### 3. Etapa 3: Rich Text Engine + Mini-Barra Flutuante
**Objetivo:** Permitir a formatação interna cirúrgica (ex: cores diferentes e tamanhos diferentes em uma mesma linha) com suporte a alinhamento de base.
- **Alterações:**
  - **Motor Gráfico (RichTextElement):** Expandir a renderização de texto no `CanvasPostStage` para interpretar marcação interna estruturada (ou array de trechos com `sizeScale` e `color`). O uso de `textBaseline = 'alphabetic'` garantirá o alinhamento na linha de palavras de múltiplos tamanhos.
  - **UX (Modo Edição e Seleção):** Ao dar duplo-clique no texto, interceptar o cursor dentro do DOM (`contentEditable`).
  - Criar um componente de Toolbar Flutuante leve com as opções: [Cor do Texto], [Tamanho da Fonte], [Negrito], [Itálico]. Esta barra aparece sobre o texto quando o usuário destaca (highlight) um pedaço dele e reflete a mutação apenas no trecho selecionado.
