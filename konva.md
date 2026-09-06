# Konva.js — Guia Completo do Framework de Canvas 2D
## Visão Geral
Konva é um framework JavaScript de código aberto para construir gráficos 2D interativos sobre o elemento HTML5 Canvas, criado em 2015 (derivado do KineticJS, iniciado em 2012) por Anton Lavrenov e mantido sob licença MIT. Em vez de manipular diretamente a API de baixo nível do canvas, Konva fornece um modelo de objetos orientado a nós — semelhante ao DOM — onde formas, grupos e camadas podem ser criados, estilizados, animados e conectados a eventos de forma declarativa. O framework é escrito em JavaScript/TypeScript com tipagem embutida, distribuído via npm como o pacote `konva`, e funciona tanto no navegador (desktop e mobile) quanto no lado servidor via Node.js, usando o pacote `canvas`.[^1][^2][^3]

Empresas como Meta (Facebook/Instagram), Microsoft, Labelbox e Zazzle usam Konva em produção, além de projetos open-source como o peaks.js da BBC e o Label Studio. A Polotno, um SDK comercial de editor de design construído sobre Konva pelos próprios mantenedores, ilustra o tipo de aplicação avançada viável com o framework.[^3][^1]
## Arquitetura: Stage, Layer, Group e Shape
A arquitetura do Konva segue uma hierarquia estrita de nós virtuais, análoga ao DOM:[^3][^4]

```
Stage (uma por área de canvas)
 └── Layer (cada layer é um elemento anvas> separado)
     └── Group (opcional, para organizar formas)
         └── Shape (Rect, Circle, Text, Image, Line, etc.)
```

- **Stage**: o contêiner raiz, anexado a um elemento DOM (`div`). Contém uma ou mais Layers e define largura/altura da área de desenho.[^4]
- **Layer**: cada Layer é, na prática, um elemento `anvas>` independente com dois renderizadores — um canvas de cena (visível) e um canvas de detecção de colisão (hit graph), oculto e usado para detecção de eventos de alta performance. Usar múltiplas layers permite otimizar redraws: um fundo estático não precisa ser redesenhado quando apenas formas interativas mudam.[^1][^4]
- **Group**: contêiner opcional para agrupar formas e movê-las, rotacioná-las ou escaná-las (scale) em conjunto.[^3]
- **Shape**: o elemento visual — Rect, Circle, Ellipse, Line, Arrow, Text, Image, Path, Star, Ring, Arc, RegularPolygon, Wedge, Sprite, TextPath, Label, ou uma forma customizada.[^3]

Exemplo mínimo de inicialização:

```javascript
const stage = new Konva.Stage({
  container: 'container',
  width: 500,
  height: 400,
});

const layer = new Konva.Layer();
stage.add(layer);

const rect = new Konva.Rect({
  x: 50, y: 50, width: 100, height: 80,
  fill: 'cornflowerblue',
  shadowBlur: 5,
  cornerRadius: 4,
  draggable: true,
});
layer.add(rect);

rect.on('click tap', () => {
  rect.fill(Konva.Util.getRandomColor());
});
```

Esse trecho já demonstra criação de forma, estilização, arraste nativo e resposta a evento — sem loops de renderização manuais.[^1]
## Instalação e Configuração
Konva pode ser instalado via npm (`npm install konva`) ou incluído diretamente por script tag/CDN (`https://unpkg.com/konva@10/konva.min.js`). Não há dependências externas obrigatórias para o uso vanilla em navegador.[^1]

| Ambiente | Pacote | Comando de instalação |
|---|---|---|
| Vanilla JS | `konva` | `npm install konva` |
| React | `react-konva` | `npm install react-konva konva` |
| Vue 3 | `vue-konva` | `npm install vue-konva konva` |
| Svelte | `svelte-konva` | `npm install svelte-konva konva` |
| Angular 20+ | `ng2-konva` | `npm install ng2-konva konva` |
| Node.js (servidor) | `konva` + `canvas` | Renderização server-side via pacote `canvas`[^3] |
## Formas (Shapes) Disponíveis
Konva oferece uma biblioteca completa de formas primitivas prontas, cada uma implementada como classe própria e documentada individualmente:[^5]

| Forma | Descrição |
|---|---|
| `Rect` | Retângulos com bordas arredondadas (`cornerRadius`), preenchimento, traço e sombra[^5] |
| `Circle` | Círculos com raio, preenchimento, traço, opacidade e sombras[^5] |
| `Ellipse` | Elipses com `radiusX`/`radiusY` independentes[^5] |
| `Line` | Linhas simples, tracejadas/pontilhadas, splines suaves (`tension`), polígonos (`closed: true`) e formas orgânicas tipo blob[^5] |
| `Arrow` | Setas com pontas customizáveis, traço e preenchimento[^5] |
| `Arc` | Arcos com raio interno/externo, ângulo e direção horária/anti-horária[^5] |
| `Ring` | Anéis (formato de rosquinha) com raio interno e externo[^5] |
| `Wedge` | Fatias de pizza (ângulo, raio, rotação)[^5] |
| `Star` | Estrelas com número de pontas, raio interno/externo[^5] |
| `RegularPolygon` | Polígonos regulares — triângulos, pentágonos, hexágonos, etc.[^5] |
| `Path` | Formas complexas a partir de dados de path SVG[^5] |
| `Text` | Texto com família de fonte, tamanho, estilo, alinhamento, quebra de linha, padding e decoração[^5] |
| `TextPath` | Texto renderizado ao longo de uma trajetória curva[^5] |
| `Image` | Imagens carregadas de URLs, com recorte, redimensionamento e filtros[^5] |
| `Sprite` | Sprite sheets para animações quadro a quadro[^5] |
| `Label` | Rótulos com texto e "tag" (fundo), úteis para tooltips e callouts[^5] |
| `Shape` (custom) | Forma totalmente customizada via `sceneFunc`[^6] |

Cada shape aceita propriedades de estilo padronizadas: `fill` (cor sólida, gradiente ou padrão de imagem), `stroke`/`strokeWidth`, `shadowColor`/`shadowBlur`/`shadowOffset`/`shadowOpacity` e `opacity`.[^7][^4]
### Formas Customizadas
Para desenhos que vão além das primitivas, `Konva.Shape` permite definir uma função `sceneFunc` que recebe um `Konva.Context` (wrapper do contexto 2D nativo) e a própria instância da forma:[^6]

```javascript
const triangle = new Konva.Shape({
  sceneFunc: function (context, shape) {
    context.beginPath();
    context.moveTo(20, 50);
    context.lineTo(220, 80);
    context.lineTo(100, 150);
    context.closePath();
    context.fillStrokeShape(shape); // aplica fill/stroke automaticamente
  },
  fill: '#00D2FF',
  stroke: 'black',
  strokeWidth: 4,
});
```

Boas práticas recomendadas pela documentação oficial: otimizar a função (evitar criar imagens/objetos grandes dentro dela, pois pode ser chamada muitas vezes por segundo), não gerar efeitos colaterais (mover formas, alterar estado da aplicação), definir um `hitFunc` customizado quando aplicar estilos complexos ou desenhar imagens, e nunca aplicar manualmente posição/escala — deixar o Konva gerenciar isso via propriedades do shape. Se `hitFunc` não for definido, o próprio `sceneFunc` é reaproveitado para detecção de colisão.[^7][^6]
## Estilização: Preenchimento, Gradientes, Sombra e Padrões
Todas as formas suportam quatro categorias principais de estilo:[^4][^8]

- **Fill**: cor sólida, padrão de imagem (`fillPatternImage`), gradiente linear (`fillLinearGradientColorStops`) ou gradiente radial (`fillRadialGradientColorStops`); a propriedade `fillPriority` permite alternar entre esses modos sem remover as configurações.[^9]
- **Stroke**: cor e largura do traço, com opções de `lineJoin` (miter, round, bevel), `lineCap` e arrays de `dash` para linhas tracejadas.[^9]
- **Shadow**: cor, offset X/Y, blur e opacidade da sombra, com controle fino via `shadowForStrokeEnabled` para desabilitar sombra específica do traço (ganho de performance).[^10]
- **Opacity**: transparência geral do nó.

Um exemplo de fundo com gradiente e transparência, aplicado com `Konva.Rect`:

```javascript
const background = new Konva.Rect({
  x: 0, y: 0, width: stage.width(), height: stage.height(),
  fillLinearGradientStartPoint: { x: 0, y: 0 },
  fillLinearGradientEndPoint: { x: stage.width(), y: stage.height() },
  fillLinearGradientColorStops: [0, 'yellow', 0.5, 'blue', 0.6, 'rgba(0,0,0,0)'],
  listening: false, // remove do hit graph para melhor performance
});
```

É possível adicionar fundo ao canvas de duas formas: desenhando um `Rect` do tamanho do stage, ou aplicando CSS diretamente no elemento DOM contêiner (mais simples, mas invisível em exportações via `toDataURL()`).[^11]
## Recorte (Clipping)
Konva suporta recortes retangulares simples via a propriedade `clip` (`x`, `y`, `width`, `height`) em Groups ou Layers, e recortes de forma arbitrária via `clipFunc`, que recebe o contexto 2D para desenhar qualquer caminho de recorte (círculos, formas compostas, etc.):[^12][^13]

```javascript
const group = new Konva.Group({
  clipFunc: function (ctx) {
    ctx.beginPath();
    ctx.arc(200, 120, 50, 0, Math.PI * 2, false);
  },
});
```
## Sistema de Eventos
Konva reproduz um modelo de eventos semelhante ao DOM, com propagação (bubbling) de formas através de grupos e camadas. Suporta eventos de mouse (`click`, `dblclick`, `mouseover`, `mouseout`), toque (`touchstart`, `touchmove`, `tap`, `dbltap`), arraste (`dragstart`, `dragmove`, `dragend`) e mudança de atributos (`xChange`, `fillChange`, `scaleXChange`):[^1][^4]

```javascript
circle.on('mouseout touchend', () => console.log('interação do usuário'));
circle.on('xChange', () => console.log('posição alterada'));
circle.on('dragend', () => console.log('arraste finalizado'));
```

A **delegação de eventos** permite vincular um handler a um nó pai (Layer ou Group) e capturar eventos disparados por qualquer filho, acessando o alvo original via `event.target`. É possível ativar/desativar a escuta de eventos por nó com a propriedade `listening` — desabilitá-la em formas ou layers que não precisam reagir a input melhora significativamente a performance, pois reduz o custo de verificação de listeners a cada interação.[^14][^15][^16]
## Drag and Drop (Arraste)
O suporte a arrastar é nativo: basta definir `draggable: true` em qualquer nó. Não existem eventos nativos de "drop" (`drop`, `dragenter`, `dragleave`), mas eles podem ser implementados manualmente combinando eventos de `dragmove` com detecção de colisão entre bounding boxes. É possível:[^1][^4]

- Limitar a área de arraste com `dragBoundFunc`.
- Escutar `dragstart`, `dragmove` e `dragend` para lógica customizada (ex.: trazer o elemento para o topo do z-index).[^17]
- Otimizar performance movendo temporariamente o elemento arrastado para uma layer dedicada durante o `dragstart`, retornando-o à layer original no `dragend`, evitando redesenhar toda a cena a cada frame de movimento.[^16]
## Animações e Tweens
Konva oferece dois mecanismos complementares de animação:[^4]

1. **`Konva.Animation`** — animação baseada em frames, ideal para lógica contínua e customizada (ex.: física, contadores):

```javascript
const anim = new Konva.Animation((frame) => {
  const { time, timeDiff, frameRate } = frame;
  // atualizar propriedades manualmente
}, layer);
anim.start();
```

2. **`Konva.Tween`** — interpolação declarativa de propriedades numéricas entre estado atual e estado final, com mais de 30 funções de easing (`Konva.Easings`). Qualquer propriedade numérica de Shape, Group, Layer ou Stage pode ser animada: `x`, `y`, `rotation`, `width`, `height`, `radius`, `strokeWidth`, `opacity`, `scaleX`, `scaleY`, `offsetX`, `offsetY`.[^3][^18]

```javascript
const tween = new Konva.Tween({
  node: rect, duration: 1, x: 140, rotation: Math.PI * 2, opacity: 1, strokeWidth: 6,
});
tween.play();

// atalho equivalente
circle.to({ duration: 1, fill: 'green' });
```

Tweens suportam controle total de reprodução: `play()`, `pause()`, `reverse()`, `reset()`, `finish()` e `seek(t)` para saltar para um instante específico. Para animações mais sofisticadas (ex.: interpolação de gradientes complexos), a documentação recomenda o plugin GreenSock (GSAP) para Konva.[^19][^20][^21]
## Seleção e Transformação (Transformer)
O componente `Konva.Transformer` é um tipo especial de Group que adiciona alças interativas de redimensionamento e rotação a qualquer nó ou conjunto de nós. Uso básico:[^22]

```javascript
const transformer = new Konva.Transformer();
layer.add(transformer);
transformer.nodes([shape]); // anexa ao(s) nó(s) selecionado(s)
```

Pontos importantes:

- O Transformer **não altera** `width`/`height` ao redimensionar — em vez disso, modifica `scaleX`/`scaleY`.[^23][^22]
- Suporta seleção múltipla (SHIFT/CTRL para adicionar/remover da seleção) e seleção por área (rubber-band selection).[^23]
- Propriedades configuráveis incluem `resizeEnabled`, `rotateEnabled`, `rotationSnaps` (ângulos de encaixe), `keepRatio` (preserva proporção em cantos, pode ser mantido temporariamente com SHIFT mesmo se desabilitado) e `centeredScaling`.[^24][^22]
- Em React, não há um wrapper declarativo puro — é necessário instanciar o `Konva.Transformer` manualmente e anexá-lo via refs.[^25]
- Recursos avançados como snapping a outros objetos, guias de alinhamento e bounding box compartilhado para multi-seleção precisam ser implementados pelo desenvolvedor sobre a base do Transformer.[^25][^23]
## Filtros e Efeitos de Imagem
Konva inclui um conjunto de filtros de pixel aplicáveis a qualquer nó (tipicamente imagens), incluindo Blur, Brightness, Contrast, Grayscale, HSL, HSV, Invert, Noise, Pixelate, Posterize, Sepia, Threshold, Emboss, Enhance e Mask. Para aplicar filtros, o nó precisa ser previamente colocado em cache com `cache()`:[^3][^26]

```javascript
image.cache();
image.filters([Konva.Filters.Blur, Konva.Filters.Contrast]);
image.blurRadius(10);
image.contrast(50);
```

Múltiplos filtros podem ser combinados na mesma chamada de `filters()`, sendo aplicados em sequência. Também é possível criar **filtros customizados**: uma função que recebe o `ImageData` do canvas e o modifica diretamente, pixel a pixel.[^27][^28]
## Serialização e Persistência (JSON)
Toda a árvore de nós pode ser serializada em JSON com `stage.toJSON()` e restaurada com `Konva.Node.create(json, container)`. Limitações importantes: **handlers de evento e imagens não são serializáveis** — precisam ser reanexados manualmente após a restauração. Em aplicações React, a recomendação oficial é gerenciar o estado da aplicação separadamente e serializar esse estado, em vez de serializar o próprio stage.[^1][^4][^29]

Para arquiteturas mais robustas de salvamento/carregamento, a documentação recomenda separar o **estado dos dados** (ex.: array de coordenadas de bolas) da **reconstrução visual**, implementando funções `create(state)` para montar a cena do zero e `update(state)` para atualizar apenas propriedades alteradas sem recriar toda a estrutura.[^30]
## Exportação de Alta Qualidade
`stage.toDataURL()` e `stage.toImage()` exportam a cena como imagem PNG/JPEG em base64. Por padrão, o `pixelRatio` de exportação é 1 (resolução 1:1 com o stage), mas pode ser aumentado para exportações em alta resolução (ex.: retina, impressão):[^31]

```javascript
const dataURL = stage.toDataURL({ pixelRatio: 2 }); // dobro da resolução
```

Como a maioria dos nós Konva é armazenada como dados vetoriais (exceto bitmaps e nós em cache), o resultado exportado mantém alta fidelidade mesmo em escalas maiores. Exportação para PDF não é nativa, mas é viável via bibliotecas terceiras combinadas com a saída de imagem do Konva.[^3][^31]
## Cache e Otimização de Performance
Konva oferece um conjunto extenso de técnicas de otimização, organizadas pela documentação oficial em categorias:[^16]

**No nível do Stage:**
- Evitar stages excessivamente grandes (menos bytes para mover da memória para a tela).
- Configurar viewport em mobile para evitar escalonamento desnecessário.
- Ajustar `Konva.pixelRatio = 1` em dispositivos retina quando a performance for crítica.

**No nível de Layer:**
- Manter o número de layers ao mínimo (cada layer aloca dois canvases: cena e hit graph — aproximadamente 41 MB por layer em um stage 1920x1080 em tela retina; o Konva alerta acima de 5 layers).[^16]
- Usar `layer.listening(false)` em layers sem necessidade de eventos.
- Mover formas para uma layer dedicada durante o arraste.

**No nível de Shape:**
- **Cache de forma** (`shape.cache()`): renderiza o nó em um canvas-buffer, evitando recompor a partir de instruções de desenho a cada frame — especialmente eficaz para texto, sombras e traços complexos.[^4][^32]
- Ocultar ou remover nós invisíveis (`opacity: 0` ou fora da área visível).
- `shape.listening(false)` para formas sem necessidade de eventos.
- Desabilitar "perfect drawing" (`perfectDrawEnabled(false)`) quando não houver combinação crítica de fill+stroke+opacity.
- Desabilitar sombra de traço (`shadowForStrokeEnabled(false)`) quando não necessária.[^10]

**Memória e cenas muito grandes:**
- Mobile Safari impõe um limite rígido de memória de canvas (256–384 MB dependendo do dispositivo); ao exceder, o canvas fica em branco em vez de degradar graciosamente. As alavancas de mitigação são: reduzir layers, reduzir o tamanho do stage e usar `Konva.pixelRatio = 1`.[^16]
- Para cenas maiores que o viewport, usar `visible(false)` em nós fora da tela ("culling") em vez de removê-los e recriá-los — mais barato computacionalmente.[^16]
- Durante arraste, a detecção de colisão é desabilitada por padrão (`Konva.hitOnDragEnabled = true` reativa isso, com custo extra).[^16]
- Para milhares de itens simultâneos, é mais eficiente usar uma única forma customizada com `sceneFunc` desenhando tudo internamente do que milhares de nós individuais — trade-off: perde-se eventos e arraste por item.[^16]
## Seletores (Find/FindOne)
Konva implementa um sistema de busca de nós inspirado em seletores CSS, útil em aplicações grandes:[^4]

```javascript
const circle = new Konva.Circle({ radius: 10, fill: 'red', id: 'face', name: 'red circle' });
layer.add(circle);

layer.find('Circle');   // todos os círculos (por tipo)
layer.findOne('#face'); // por id
layer.find('.red');     // por nome (como classe CSS)
```
## Integrações com Frameworks Front-End
Konva mantém bindings oficiais para os quatro principais frameworks JavaScript, todos mapeando componentes Konva 1:1 para componentes do framework correspondente:[^3]

| Framework | Padrão de componente | Observações |
|---|---|---|
| **React** (`react-konva`) | `<Stage>`, `<Layer>`, `<Rect>`, `<Circle>`, `<Text>`, etc., com props e hooks nativos do React | A versão major do `react-konva` deve corresponder à do React instalado; funciona apenas em navegador — **não roda em React Native** (sem DOM/canvas). Para apps nativos, recomenda-se React Native Skia[^1]. |
| **Vue 3** (`vue-konva`) | Componentes prefixados `v-` (`v-stage`, `v-layer`, `v-circle`) | Suporta registro global via plugin (`app.use(VueKonva)`) ou importação seletiva de componentes individuais[^1]. |
| **Svelte** (`svelte-konva`) | Componentes com mesmo nome do Konva (`Stage`, `Layer`, `Rect`) | Compatível com Svelte 3/4/5 e SvelteKit; permite sincronizar props de configuração com o estado interno após `dragend`/`transformend`, com opção `staticConfig` para desativar essa sincronia por performance[^33][^34]. |
| **Angular 20+** (`ng2-konva`) | Componentes prefixados `ko-` (`ko-rect`, `ko-circle`, `ko-stage`) | Recomenda-se usar Angular Signals para configs atualizadas por callbacks assíncronos (ex.: carregamento de imagem)[^1]. |

Exemplo de componente básico em React, demonstrando drag com atualização de estado:

```jsx
import { Stage, Layer, Rect, Circle, Text } from 'react-konva';

const App = () => {
  const [rectPosition, setRectPosition] = useState({ x: 20, y: 50 });
  return (
    <Stage width={window.innerWidth} height={window.innerHeight}>
      <Layer>
        <Text text="Arraste as formas" fontSize={15} />
        <Rect
          x={rectPosition.x} y={rectPosition.y} width={100} height={100}
          fill="red" shadowBlur={10} draggable
          onDragEnd={(e) => setRectPosition(e.target.position())}
        />
      </Layer>
    </Stage>
  );
};
```

Casos de uso típicos documentados para React-Konva incluem editores de design com histórico e exportação de imagem, whiteboards infinitos com pan/zoom, editores de nós (node editors) com arestas dinâmicas, ferramentas de anotação de imagem, mapas de planta baixa/reserva de assentos e whiteboards multiplayer via Yjs.[^1]
## Casos de Uso e Demos
Konva é amplamente utilizado para construir editores de design (estilo Canva), aplicativos de desenho livre/whiteboard, ferramentas de anotação de imagem (rotulagem para ML), mapas de reserva de assentos, mapas interativos de edifícios/plantas baixas e construtores de diagramas/fluxogramas com objetos conectados. O site oficial mantém uma biblioteca de mais de 60 demos interativos cobrindo esses cenários.[^1]

Para quem precisa de um editor de design completo, pronto para produção, em vez de montar tudo a partir das primitivas do Konva, a **Polotno** é um SDK comercial (`npm install polotno`) construído pelos próprios mantenedores do Konva, com templates, edição de texto e exportação prontos, oferecendo integrações específicas para React, Vue e Angular.[^1]
## SDKs, Bibliotecas Relacionadas e Ecossistema
| Componente | Tipo | Função |
|---|---|---|
| `konva` | Núcleo (vanilla JS/TS) | Biblioteca base — todos os demais dependem dela[^3] |
| `react-konva` | Binding oficial | Integração declarativa com React[^1] |
| `vue-konva` | Binding oficial | Integração declarativa com Vue 3[^1] |
| `svelte-konva` | Binding oficial | Integração declarativa com Svelte 3–5[^1] |
| `ng2-konva` | Binding oficial | Integração declarativa com Angular 20+[^1] |
| `konva-devtool` | Extensão de navegador | Inspeciona a árvore de nós Konva no Chrome DevTools (o canvas nativo não expõe essa estrutura)[^35] |
| Polotno | SDK comercial | Editor de design completo construído sobre Konva[^1] |
| GreenSock (GSAP) plugin | Plugin de terceiros | Tweening avançado além do `Konva.Tween` nativo[^21] |
| `canvas` (npm) | Dependência server-side | Permite renderização Konva em Node.js sem navegador[^3] |

Konva também mantém canais de comunidade ativos — Discord oficial e tag `konvajs` no Stack Overflow — além de um repositório GitHub aberto para contribuições e relatório de bugs.[^3]
## Resumo das Capacidades Centrais
| Capacidade | O que oferece |
|---|---|
| Formas | 15+ primitivas prontas + formas 100% customizadas via `sceneFunc`[^3][^5] |
| Eventos | Sistema completo estilo DOM com bubbling, delegação e mais de 15 tipos de evento[^1][^15] |
| Drag and drop | Nativo, com limites, boundFunc e otimização por layer dedicada[^1][^16] |
| Transformação | `Transformer` com resize, rotate, snapping de ângulo e seleção múltipla[^22] |
| Animação | `Konva.Animation` (baseado em frame) e `Konva.Tween` (interpolação declarativa, 30+ easings)[^3][^18] |
| Filtros | 10+ filtros de imagem nativos + suporte a filtros customizados[^26][^28] |
| Serialização | `toJSON()`/`Node.create()` para salvar e restaurar cenas[^29] |
| Exportação | `toDataURL()`/`toImage()` com controle de `pixelRatio` para alta resolução[^31] |
| Performance | Cache de shape, multi-layer, culling, controle de listening, gestão de memória[^16] |
| Multiplataforma | Desktop, mobile (touch completo) e servidor via Node.js[^3] |
| Integrações | React, Vue, Svelte, Angular — bindings oficiais mantidos pelo core team[^3] |

---

## References

1. [Getting Started with Konva — HTML5 Canvas 2D Framework](https://konvajs.org/docs/index.html) - Konva is an HTML5 Canvas JavaScript framework for building interactive 2D graphics. It gives you an ...

2. [Konva.js Overview and Canvas Model - Codefinity](https://codefinity.com/courses/v2/0462e746-fee5-4a94-814b-17585a7beeca/9bd5ccf4-ea8d-4261-b966-f268977a7056/a813937b-ccb5-4396-9941-00a28806316b) - Konva.js is a powerful JavaScript library that helps you build interactive graphics applications on ...

3. [About Konva.js - Open-Source HTML5 Canvas JavaScript Framework](https://konvajs.org/docs/about.html) - It supports shapes, animations, events, drag-and-drop, filters, serialization, and high-quality expo...

4. [Konva Framework Overview | Konva - JavaScript Canvas 2d Library](https://konvajs.org/docs/overview.html) - Konva.js architecture overview: Stage, Layers, Groups, and Shapes. Learn how Konva organizes canvas ...

5. [Shapes | Konva - JavaScript Canvas 2d Library](https://konvajs.org/category/shapes) - Basic shapes in Konva. Learn how to draw arcs on HTML5 Canvas with Konva.js. Set inner/outer radius,...

6. [HTML5 canvas Custom Shape Tutorial | Konva - JavaScript ...](https://konvajs.org/docs/shapes/Custom.html) - Learn how to draw custom shapes on HTML5 Canvas with Konva.js. Use the Konva.Shape sceneFunc to crea...

7. [Shapes | konvajs/konva | DeepWiki](https://deepwiki.com/konvajs/konva/2.3-shapes) - This page provides an overview of the Shape base class and explains how to work with shapes, includi...

8. [HTML5 Canvas Set Fill Tutorial | Konva - JavaScript Canvas 2d Library](https://konvajs.org/docs/styling/Fill.html) - Learn how to fill shapes with colors, patterns, linear gradients, and radial gradients using Konva.j...

9. [Konva.Shape | Konva - JavaScript Canvas 2d Library](https://konvajs.org/api/Konva.Shape.html) - Shape constructor. Shapes are primitive objects such as rectangles, circles, text, lines, etc.

10. [HTML5 Canvas Optimize Strokes Performance Tip - Konva.js](https://konvajs.org/docs/performance/Optimize_Strokes.html) - Performance · All Performance Tips · Avoid Memory Leaks · Automatic Redraws · Disable Perfect Draw ·...

11. [How to add background to canvas? - Konva.js](https://konvajs.org/docs/sandbox/Canvas_Background.html) - Learn two ways to add a background to your Konva canvas: using a Rect shape or CSS styles on the con...

12. [Clipping Functions Tutorial | Konva - JavaScript Canvas 2d ...](https://konvajs.org/docs/clipping/Clipping_Function.html) - Learn how to use custom clipping functions with clipFunc to create complex clipping regions for grou...

13. [HTML5 Canvas Simple Clipping tutorial | Konva - JavaScript ...](https://konvajs.org/docs/clipping/Clipping_Regions.html) - Learn how to apply simple rectangular clipping regions to groups and layers in Konva using the clip ...

14. [HTML5 Canvas Listen or Don't Listen to Events with Konva](https://konvajs.org/docs/events/Listen_for_Events.html) - Learn how to enable or disable event listening on shapes in Konva using the listening property and s...

15. [HTML5 Canvas Event Delegation with Konva](https://konvajs.org/docs/events/Event_Delegation.html) - Learn how to use event delegation on HTML5 Canvas with Konva.js. Listen for events on layers or grou...

16. [HTML5 Canvas All Konva performance tips list](https://konvajs.org/docs/performance/All_Performance_Tips.html) - All Konva.js performance optimization tips: layer management, shape caching, listening false, batch ...

17. [HTML5 Canvas Drag and Drop Events - Konva.js](https://konvajs.org/docs/drag_and_drop/Drag_Events.html) - Learn how to handle drag events on HTML5 Canvas with Konva.js. Use dragstart, dragmove, and dragend ...

18. [Basic Tweening Tutorial | Konva - JavaScript Canvas 2d Library](https://konvajs.org/docs/tweens/Linear_Easing.html) - Learn how to create basic linear tween animations in Konva.js to transition shape properties like po...

19. [Konva.Tween | Konva - JavaScript Canvas 2d Library](https://konvajs.org/api/Konva.Tween.html) - Tween constructor. Tweens enable you to animate a node between the current state and a new state. Yo...

20. [All Tween Controls Tutorial | Konva - JavaScript Canvas 2d Library](https://konvajs.org/docs/tweens/All_Controls.html) - Learn how to control Konva.js tweens with play, pause, reverse, reset, finish, and seek methods.

21. [Complex Tweening Tutorial | Konva - JavaScript Canvas 2d Library](https://konvajs.org/docs/tweens/Complex_Tweening.html) - Learn how to create complex tween animations in Konva.js including gradient transitions and chained ...

22. [Konva.Transformer | Konva - JavaScript Canvas 2d Library](https://konvajs.org/api/Konva.Transformer.html) - Transformer is a special type of group that allow you transform Konva primitives and shapes. Transfo...

23. [HTML5 Canvas Shape select, resize and rotate - Konva.js](https://konvajs.org/docs/select_and_transform/Basic_demo.html) - Learn how to select, resize, and rotate shapes on HTML5 Canvas with Konva.js Transformer. Add intera...

24. [HTML5 Canvas Shape Resize With Ratio Preserved - Konva.js](https://konvajs.org/docs/select_and_transform/Keep_Ratio.html) - Learn how to preserve aspect ratio when resizing shapes with Konva Transformer using keepRatio and S...

25. [How to resize and rotate canvas shapes with React and Konva?](https://konvajs.org/docs/react/Transformer.html) - The idea: you need to create a Konva.Transformer node, and attach it to the required node manually. ...

26. [Konva.Filters | Konva - JavaScript Canvas 2d Library](https://konvajs.org/api/Konva.Filters.html) - Konva.Filters namespace reference for Konva.js: properties, methods and configuration for working wi...

27. [HTML5 Canvas Multiple Filters Tutorial | Konva - JavaScript ...](https://konvajs.org/docs/filters/Multiple_Filters.html) - Learn how to apply multiple filters like blur, brightness, and contrast simultaneously to images usi...

28. [HTML5 Canvas Custom Filter Tutorial | Konva - JavaScript ...](https://konvajs.org/docs/filters/Custom_Filter.html) - Learn how to create and apply custom image filters in Konva.js by manipulating canvas ImageData pixe...

29. [HTML5 Canvas Stage Serialization Tutorial - Konva.js](https://konvajs.org/docs/data_and_serialization/Serialize_a_Stage.html) - Learn how to serialize and save HTML5 Canvas state as JSON with Konva.js. Use stage.toJSON () to exp...

30. [Save and Load HTML5 Canvas Stage Best Practices - Konva.js](https://konvajs.org/docs/data_and_serialization/Best_Practices.html) - Best practices for saving and loading HTML5 Canvas state with Konva.js. Tips for serialization, data...

31. [HTML5 Canvas Export to High Quality Image Tutorial - Konva.js](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html) - Learn how to export HTML5 Canvas to high-quality PNG or JPEG images with Konva.js. Use stage.toDataU...

32. [Konva.Group | Konva - JavaScript Canvas 2d Library](https://konvajs.org/api/Konva.Group.html) - Each link below opens the full documentation of the method on the class that defines it. Group const...

33. [Getting started with Svelte and canvas via Konva](https://konvajs.org/docs/svelte/index.html) - svelte-konva is a JavaScript library for drawing complex canvas graphics using Svelte. It provides d...

34. [Binding the config prop | Konva - JavaScript Canvas 2d Library](https://konvajs.org/docs/svelte/Bindings.html) - Learn how svelte-konva keeps config props in sync with Konva node state after drag and transform eve...

35. [Konva.js is an HTML5 Canvas JavaScript framework for ... - GitHub](https://github.com/konvajs/konva) - Konva is an open-source 2D canvas framework for interactive graphics. Its scene graph gives each sha...

