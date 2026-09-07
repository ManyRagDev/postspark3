---
name: konva-engine-guide
description: >
  Diretrizes canônicas, arquitetura de cena, ciclo de vida de fontes, padrões de performance,
  transformações, recorte, drag-and-drop e exportação de alta fidelidade no Konva.js (CanvasLab e PostSpark).
  Consulte sempre que criar ou modificar palcos (Stage), camadas (Layer), grupos, formas, textos ou efeitos Konva.
---

# Skill: Guia Mestre Konva.js (PostSpark Engine)

Esta habilidade consolida o conhecimento técnico e as melhores práticas oficiais do framework **Konva.js / react-konva** aplicadas ao PostSpark, integrando as pesquisas e referências documentadas em [`konva.md`](file:///c:/Users/emanu/Documents/Projetos/PostSpark%203/konva.md).

---

## 1. Arquitetura da Árvore de Cena (Scene Graph)

A hierarquia do Konva segue uma árvore estrita de nós:

```
Stage (Contêiner raiz acoplado ao elemento DOM)
 └── Layer (Elemento <canvas> independente: cena visível + hit graph invisível)
      └── Group (Contêiner lógico para agrupar, transladar e rotacionar formas)
           └── Shape (Rect, Circle, Text, Image, Line, Path, Shape customizado via sceneFunc)
```

### Regras de Camadas (Layer Management):
1. **Orçamento de Layers:** Cada `Layer` aloca dois elementos `<canvas>` no DOM (o canvas visível e o canvas de detecção de toque/colisão - *hit graph*). Em telas Retina (DPI 2x/3x), cada camada consome dezenas de megabytes de memória RAM.
2. **Limite para Mobile Safari:** O Safari em iOS impõe teto rígido de memória para elementos `<canvas>` (256–384 MB). Ultrapassar esse teto faz o canvas ficar completamente em branco sem erro explícito. Mantenha o editor com no máximo 2 a 3 camadas.
3. **Silenciamento (`listening: false`):** Todo nó decorativo, fundo estático ou forma que não necessite de eventos de mouse/toque deve conter explicitamente `listening={false}`. Isso remove a forma do *hit graph*, reduzindo drasticamente o tempo de processamento por frame de interação.

---

## 2. Tipografia e Resolução de Fontes (Anti-FOUC & Métricas)

### O Desafio do Canvas com Fontes da Web:
Diferente do DOM HTML (onde o navegador refaz o layout automaticamente quando uma fonte `@font-face` termina de baixar), o Canvas 2D desenha bitmaps estáticos. Se o Konva medir ou desenhar o texto antes da fonte web estar completamente carregada:
1. O método `context.measureText()` utilizará uma fonte de fallback do sistema (como *Arial* ou *Times*).
2. Como a largura dos glifos da fonte de fallback difere da fonte final (ex.: *Syne* é ~30% mais larga que *Arial*), as quebras de linha (`wrap: "word"`) serão calculadas erroneamente.
3. Quando a fonte real for desenhada, caracteres ultrapassarão os limites da caixa (estouro de linha ou clipping involuntário).

### Padrão Canônico:
1. **Pré-carregamento Antecipado:** Sempre invoque `loadCatalogFonts()` no bootstrap do aplicativo ou da galeria para que as fontes oficiais (*Syne*, *Anton*, *Playfair Display*, *Space Mono*, etc.) entrem no cache do navegador antes do primeiro render do Konva.
2. **Escuta de Prontidão (`document.fonts.ready`):**
   ```ts
   useEffect(() => {
     if (typeof document !== "undefined" && document.fonts) {
       document.fonts.ready.then(() => {
         // Força atualização ou redesenho das métricas no Konva
         stageRef.current?.batchDraw();
       });
     }
   }, [post.fontFamily]);
   ```
3. **Medição Canônica (`getKonvaTextMetrics`):**
   Nunca calcule quebras de linha com fórmulas aproximadas (`text.length * 0.5`). Sempre utilize o módulo `getKonvaTextMetrics` (`textMetrics.ts`), garantindo que o texto, o efeito de fundo (`box-card`, `strip-line`) e o `Transformer` compartilhem rigorosamente as mesmas medidas.

---

## 3. Seleção, Redimensionamento e Transformação (`Transformer`)

O componente `Konva.Transformer` é um grupo especializado que gerencia rotação, escala e alças táteis.

### Invariantes do Transformer:
1. **Escala vs Dimensões:** O `Transformer` **não altera** `width` e `height` do nó; ele modifica `scaleX` e `scaleY`. Ao salvar ou persistir dados após `transformend`:
   ```ts
   const node = targetRef.current;
   const scaleX = node.scaleX();
   const scaleY = node.scaleY();
   
   // Para textos ou caixas de largura definida: normaliza largura e reseta escala para 1
   const newWidth = Math.max(20, node.width() * scaleX);
   node.scaleX(1);
   node.scaleY(1);
   ```
2. **Preservação de Proporção:** Utilize `keepRatio={true}` em elementos que não devem sofrer distorção anamórfica (como logos e imagens), ou permita `keepRatio={false}` para caixas de texto ajustáveis em largura.
3. **Encaixes de Rotação (`rotationSnaps`):** Facilite o alinhamento com ângulos cardeais:
   ```tsx
   <Transformer
     rotationSnaps={[0, 90, 180, 270]}
     rotationSnapTolerance={5}
     anchorSize={8}
   />
   ```
4. **Interceptação de Duplo-Clique:** O `Transformer` fica à frente do nó selecionado. Para permitir edição de texto inline com duplo-clique sobre um texto já selecionado, o próprio `<Transformer>` deve propagar o evento via `onDblClick` / `onDblTap`.

---

## 4. Drag-and-Drop & Guias Magnéticas (`dragBoundFunc`)

1. **Ativação Nativa:** Ative via `draggable={isInteractive}`.
2. **Limites e Snap Magnético:** Use `dragBoundFunc` para restringir o movimento à prancheta ou engatar linhas de grade (snap):
   ```ts
   const createSnapBoundFunc = (elementWidth: number, elementHeight: number) => {
     return (pos: { x: number; y: number }) => {
       const margin = 24;
       const minX = margin;
       const maxX = baseWidth - elementWidth - margin;
       const minY = margin;
       const maxY = baseHeight - elementHeight - margin;

       // Limite rígido dentro da prancheta
       let x = Math.max(minX, Math.min(maxX, pos.x));
       let y = Math.max(minY, Math.min(maxY, pos.y));

       // Encaixe magnético no centro horizontal (tolerância de 6px)
       const centerX = (baseWidth - elementWidth) / 2;
       if (Math.abs(x - centerX) < 6) x = centerX;

       return { x, y };
     };
   };
   ```

---

## 5. Recorte, Máscaras e Formas Customizadas (`clipFunc` e `sceneFunc`)

1. **Recortes Circulares e Orgânicos (`clipFunc`):** Para enquadramento de avatares, fotos ou janelas arredondadas em grupos:
   ```tsx
   <Group
     clipFunc={(ctx) => {
       ctx.beginPath();
       ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, false);
       ctx.closePath();
     }}
   >
     <KonvaImage image={img} ... />
   </Group>
   ```
2. **Formas Customizadas (`sceneFunc`):**
   - Recebe o contexto 2D Konva e a própria instância do shape.
   - Chame sempre `context.fillStrokeShape(shape)` ao final para que as propriedades declarativas (`fill`, `stroke`, `shadow`) sejam aplicadas com suporte a hit-testing automático.
   - Evite alocar objetos ou buffers dentro de `sceneFunc`, pois é invocado a cada frame de redesenho.

---

## 6. Filtros e Manipulação de Pixel (`cache()` obrigatório)

Para aplicar efeitos de pixel (como `Konva.Filters.Blur`, `Contrast`, `Brighten`):
1. O nó alvo deve ser colocado em cache explicitamente:
   ```ts
   imageNode.cache();
   imageNode.filters([Konva.Filters.Blur, Konva.Filters.Contrast]);
   imageNode.blurRadius(10);
   imageNode.getLayer()?.batchDraw();
   ```
2. Ao alterar as dimensões da imagem, invoque `imageNode.clearCache()` antes de re-executar `.cache()`.

---

## 7. Exportação de Ultra Fidelidade (4K & Retina)

1. Utilize `stage.toDataURL({ pixelRatio: 4, mimeType: "image/png" })`.
2. **Pré-condição de Exportação Limpa:**
   - Deselecione o elemento ativo (`setSelectedId(null)`).
   - Zere os nós do Transformer (`transformerRef.current?.nodes([])`).
   - Dispare `stage.getLayers().forEach(l => l.batchDraw())` para consolidar o frame antes da rasterização.

---

## 8. Arquivo de Referência Detalhada

Para consultar a documentação aprofundada de todas as classes, tabelas de propriedades e casos de uso do Konva.js, leia o arquivo-mestre [`konva.md`](file:///c:/Users/emanu/Documents/Projetos/PostSpark%203/konva.md) na raiz do repositório.
