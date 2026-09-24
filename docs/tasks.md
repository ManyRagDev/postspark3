# Tarefas - Refatoração de Redimensionamento e UX de Rich Text

## Etapa 1 — A Nova Física da Caixa de Texto
- [x] Adicionar suporte individual à largura de caixa (`width` flexível) para `headline` e `subtext` no `CanvasPostModel`.
- [x] Configurar o `<Transformer>` do Konva para não usar alças verticais em caixas de texto.
- [x] Implementar `onTransform` no redimensionamento de caixa de texto para ajustar `width` em vez de `scaleX` e recalcular word-wrap em tempo real nas alças laterais.
- [x] Garantir que puxar as alças de canto redimensione o `fontSize` proporcionalmente, resetando a escala de matriz (scaleX/Y = 1).
- [x] Validar a experiência de arrasto elástico vs natural para textos extras (`extraTexts`).

## Etapa 2 — O Inspetor Contextual (UX Universal)
- [x] Identificar a seleção atual ativa (`selectedId`) na barra lateral e separar as rotas de renderização do painel: "Nada Selecionado" vs "Texto Selecionado".
- [x] Abstrair os controles individuais (Cor, Tamanho, Efeito, Opacidade, Família de Fonte, Z-Index) da `CanvasSidebar.tsx` e `CanvasMobileDrawer.tsx` em um bloco de `PropertyInspector`.
- [x] Conectar os eventos do Inspetor Universal dinamicamente ao nó correspondente (se for `headline`, salva na raiz do slide; se for `extraTexts`, salva no array usando `documentCommands.ts`).
- [x] Limpar as seções legadas de controle de "Cor do Título" e "Cor do Corpo" presas na aba principal quando há algo selecionado, focando na UX moderna.

## Etapa 3 — Rich Text Engine + Mini-Barra Flutuante
- [x] Definir o schema JSON interno estruturado para representar as palavras multiformatadas em vez de strings planas.
- [x] Atualizar o motor de renderização `CanvasPostStage.tsx` para desenhar os fragmentos estruturados lado a lado calculando posições com `measureText` nativo.
- [x] Configurar `textBaseline = 'alphabetic'` em todo o motor gráfico para garantir alinhamento perfeito entre tamanhos de fonte variáveis.
- [x] Desenvolver o componente da Toolbar Flutuante que captura e intercepta o texto destacado (highlight) no DOM durante o modo de edição em `contentEditable`.
- [x] Acoplar as mutações cirúrgicas (trocar cor e tamanho) vindas da Toolbar para o novo schema estruturado.
