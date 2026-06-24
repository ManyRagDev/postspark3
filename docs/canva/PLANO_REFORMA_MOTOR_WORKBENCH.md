# Plano de reforma do motor de interação do Workbench

## Progresso de execução

| Fase | Status | Início | Conclusão | Evidências |
| --- | --- | --- | --- | --- |
| 0 — Integridade | Concluída | 2026-06-23 | 2026-06-23 | Typecheck; 25 testes focados; suíte completa com 103 testes |
| 1 — Kernel | Concluída | 2026-06-23 | 2026-06-23 | Typecheck; inspeção estática; 34 testes do kernel; suíte completa com 137 testes |
| 2 — FSM | Concluída | 2026-06-23 | 2026-06-23 | Typecheck; inspeção estática; 35 testes do motor; suíte completa com 172 testes |
| 3 — Blocos | Reaberta — estabilização | 2026-06-23 | — | Primeiro drag corrigido e coberto em DOM; matriz visual pendente |
| 4 — Texto/imagem | Reaberta — estabilização | 2026-06-23 | — | Viewport raiz e descriptor comum implementados; matriz visual pendente |
| 5 — Limpeza | Reaberta — estabilização | 2026-06-23 | — | Pointer lifecycle centralizado; validação visual pendente |
| 5.1 — Invariância do primeiro gesto | Implementada — validação visual pendente | 2026-06-23 | — | Typecheck; 140 testes focados; teste React/DOM com `happy-dom` |
| 6 — Histórico | Bloqueada pelo Snapshot v3 | — | — | Algoritmo revisado; implementação não iniciada |
| 7 — Snapshot v3 | Bloqueada pelo gate visual | — | — | Contrato com âncora definido; implementação não iniciada |
| 8 — Guias | Backlog | — | — | — |

### Gate reaberto — Fase 5.1

- [x] Um canvas raiz define o `CanvasViewport`.
- [x] Registry contém medição, geometria e constraints por descriptor.
- [x] `useInteractiveElement` centraliza pointer lifecycle e início do gesto.
- [x] `DraggableBlock` mantém o mesmo nó na transição flow → drag.
- [x] Overflow preexistente não provoca salto no primeiro frame.
- [x] Imagem carregada tardiamente cancela apenas o próprio target.
- [x] Overlay não mede DOM durante render e respeita `snapEligible`.
- [x] Provider/overlay não são montados em export.
- [x] Teste DOM comprova identidade do nó e continuidade da captura.
- [ ] Matriz visual manual nos targets, formatos, escalas e carrossel.

O gate visual não pôde ser executado em 2026-06-23: o servidor local iniciou em
`http://localhost:3001`, mas `agent-browser` não estava instalado e o navegador
integrado da sessão não estava disponível. Snapshot v3, histórico e smart guides
permanecem bloqueados por essa evidência ausente.

### Checklist da Fase 0

- [x] Tipo e schemas
- [x] Store carousel-aware
- [x] Remoção da projeção paralela
- [x] Testes de contrato
- [x] Testes completos
- [x] Documento-mestre

Evidências da conclusão:

- `npm run check`: concluído sem erros;
- testes focados de schemas, store e snapshot: 3 arquivos e 25 testes passando;
- `npm test`: 19 arquivos e 103 testes passando;
- `DOCUMENTO_MESTRE.md` atualizado com persistência e escopo de carrossel;
- Fase 0 foi concluída antes do início da Fase 1.

### Checklist da Fase 1

- [x] Tipos e validação
- [x] Viewport e transformações
- [x] Bounds e constraints
- [x] Resize
- [x] Testes do kernel
- [x] Testes completos
- [x] Documento-mestre

Evidências da conclusão:

- `npm run check`: concluído sem erros;
- inspeção estática: nenhum import ou acesso a React, Zustand, DOM, `@shared` ou
  `variationSnapshot` nos módulos do kernel;
- `npm test -- --run client/src/editor/geometry`: 1 arquivo e 34 testes passando;
- `npm test`: 20 arquivos e 137 testes passando;
- `DOCUMENTO_MESTRE.md` atualizado com o contrato e o estado de integração;
- nenhum consumidor de runtime foi migrado durante a Fase 1.

### Checklist da Fase 2

- [x] Contratos e transient store
- [x] FSM e geometria transitória
- [x] Controller, RAF e pointer capture
- [x] Testes do motor
- [x] Inspeção estática e typecheck
- [x] Testes completos
- [x] Documento-mestre

Evidências da conclusão:

- `npm run check`: concluído sem erros;
- inspeção estática: nenhum import ou acesso a React, Zustand, DOM, `@shared`,
  `editorStore` ou `variationSnapshot` nos módulos do motor;
- `npm test -- --run client/src/editor/interaction`: 1 arquivo e 35 testes
  passando;
- `npm test`: 21 arquivos e 172 testes passando;
- `git diff --check`: concluído sem erros de whitespace;
- `DOCUMENTO_MESTRE.md` atualizado com o contrato transitório e sua fronteira;
- nenhum consumidor de runtime foi migrado e a Fase 3 permanece não iniciada.

### Checklist da Fase 3

- [x] Adapter percentual e snap temporário
- [x] Commit geométrico atômico no store
- [x] Provider e ponte React
- [x] Blocos, sections e card interno
- [x] Testes de adapter e store
- [x] Typecheck e testes completos
- [ ] Validação visual nos formatos e escalas previstos
- [x] Revisão React
- [x] Documento-mestre

### Checklist da Fase 4

- [x] `TextElement` compartilhado e adapters de texto/imagem
- [x] Resize horizontal de texto e proporcional de imagem
- [x] Bounds visuais rotacionados
- [x] Commit atômico estático e carousel-aware
- [x] Preview transitório sem escrita durante `pointermove`
- [x] Edição de conteúdo e exclusão separadas da geometria
- [x] Testes de kernel, adapters, FSM, store e snapshot
- [ ] Validação visual de texto/imagem, escalas e carrossel

### Checklist da Fase 5

- [x] `InteractiveElement` e registry por canvas
- [x] Overlay irmão da raiz exportável
- [x] Provider movido para o stage editável
- [x] Renderers sem imports ou mutações diretas do store
- [x] Pointer lifecycle centralizado
- [x] AutoPilot, loading, ímã e carrossel extraídos do workspace
- [x] Motores e componentes antigos removidos
- [x] Inspeção estática, typecheck e suíte completa
- [ ] Validação visual e exportação sem controles

Evidências técnicas da macroentrega:

- `npm run check`: concluído sem erros;
- testes focados: 8 arquivos e 133 testes passando;
- `npm test`: 25 arquivos e 218 testes passando em 2026-06-23;
- inspeção estática: renderers sem `editorStore`, pointer lifecycle ausente nos três
  componentes de elemento e motores antigos sem referências;
- `git diff --check`: concluído sem erros de whitespace;
- a automação visual não pôde ser executada porque o runtime de browser desta
  sessão não estava disponível; por isso as Fases 3, 4 e 5 permanecem em validação.

### Checklist da Fase 6

- [ ] Módulo de histórico puro (types + historyStack)
- [ ] Testes de pilha pura
- [ ] Integração com `setWithSnapshot` (`historyLabel` + `coalesceKey`)
- [ ] Registro nas ações editáveis
- [ ] `undo()`, `redo()`, `clearHistory()` no store
- [ ] `restoreFromSnapshot` interno
- [ ] Hook `useEditorHistory` (`Ctrl+Z` / `Ctrl+Shift+Z`)
- [ ] Botões de Undo/Redo na barra superior
- [ ] Cancelar gesto ativo antes de undo/redo
- [ ] Testes de store e integração
- [ ] Typecheck e suíte completa
- [ ] Validação visual
- [ ] Documento-mestre

### Checklist da Fase 7

- [ ] Gate 0 — Fechar Fase 6
- [ ] Contrato v3 (types em `shared/postspark.ts`)
- [ ] Migração v1/v2 → v3 (`snapshotMigration.ts`)
- [ ] Testes de migração
- [ ] Schema v3 (`postsparkSchemas.ts`)
- [ ] Testes de schema v3
- [ ] Adapter v3 (`layoutPositionAdapter.ts`)
- [ ] Testes de adapter v3
- [ ] Store hidratação v3 (`editorStore.ts`)
- [ ] Renderers e componentes (`DraggableBlock`, `PostCardV2`, `LayoutBlock`)
- [ ] Persistência e rotas (`server/routers.ts`, `server/db.ts`)
- [ ] Testes de integração
- [ ] Typecheck e suíte completa
- [ ] Validação visual
- [ ] Documento-mestre

### Checklist da Fase 8

- [ ] Gate 0 — Fechar Fase 7
- [ ] Módulo de smart guides puro (types + snapEngine)
- [ ] Testes do motor de snap
- [ ] Coleta de candidatos no início do gesto (`CanvasInteractionProvider` + `ElementRegistry`)
- [ ] Integração do snap no reducer (`interactionReducer` + types)
- [ ] Threshold, histerese e modificador Alt
- [ ] Overlay com linhas dinâmicas (`InteractionOverlay`)
- [ ] Remoção da grade fixa e snap de commit (`layoutPositionAdapter`)
- [ ] Toggle `isMagnetActive` controla smart guides
- [ ] Testes de integração
- [ ] Typecheck e suíte completa
- [ ] Validação visual
- [ ] Documento-mestre

## 1. Objetivo

Reformar a camada de geometria e interação do Workbench para que drag, resize,
seleção e futuras guias inteligentes usem o mesmo núcleo matemático e o mesmo
ciclo transacional, sem romper o snapshot visual canônico nem reescrever o
renderer.

O objetivo não é reproduzir o Canva. A pesquisa em `docs/canva` serve como
referência de princípios; o desenho final parte das necessidades e contratos do
PostSpark.

## 2. Leitura crítica da pesquisa

### Evidências úteis

Os pontos mais sólidos e aplicáveis são:

- separação entre documento persistido, estado transitório da interação e
  estado renderizado;
- pipeline explícito de eventos com limiar de arrasto, preview e commit;
- coordenadas de documento independentes da escala visual do workspace;
- elementos identificáveis e geometria mensurável;
- overlays de seleção/guias separados do conteúdo exportável;
- uma ação contínua de ponteiro deve produzir um único commit lógico;
- texto, imagem e bloco podem ter semânticas diferentes de resize, mas devem
  compartilhar a mesma infraestrutura de entrada e transformação.

### Pontos que não devem orientar decisões como se fossem fatos

Os materiais não comprovam, para o editor principal do Canva:

- uso de Zustand;
- uso de CRDT no modelo citado;
- R-Tree especificamente para snapping;
- tolerâncias, debounce ou precisão decimal exatos;
- implementação concreta do pipeline de exportação;
- estrutura interna completa do scene graph;
- heurísticas exatas de snapping e histerese.

Esses itens podem ser opções técnicas futuras, mas não requisitos desta reforma.

## 3. Diagnóstico confirmado no PostSpark

### 3.1 Motores concorrentes

O fluxo ativo possui mecanismos diferentes:

1. `DraggableBlock` + `useDragElement`
   - coordenadas percentuais;
   - origem no centro do elemento;
   - preview local e commit no fim do drag;
   - usado por headline, body, elementos decorativos, sections e card interno.

2. `AdvancedTextNode`
   - coordenadas em pixels lógicos;
   - origem no canto superior esquerdo;
   - corrige o delta pela escala renderizada;
   - atualiza o Zustand e reconstrói `visualSnapshot` em cada `pointermove`.

3. `ImageElementBlock`
   - coordenadas em pixels lógicos;
   - origem no canto superior esquerdo;
   - atualiza o Zustand em cada `pointermove`;
   - não normaliza o delta pela escala CSS do workspace, diferentemente do
     texto avançado.

4. `useResizeElement`
   - ciclo próprio baseado em listeners globais e overlay criado no `body`;
   - suporta somente largura, apesar de `DraggableBlock` exibir oito handles;
   - não possui caminho explícito de rollback em `pointercancel`.

### 3.2 Snap atual

O ímã atual é uma grade fixa de 10% a 90%. Ele não mede outros elementos, não
alinha bordas/centros e não é uma implementação de smart guides. Há ainda
decisão de snap duplicada entre `DraggableBlock` e `PostCardV2`.

### 3.3 Estado e persistência

- `editorStore.visualSnapshot` já é a fronteira autoritativa correta.
- Blocos comuns fazem commit no fim do gesto.
- Texto avançado e imagem escrevem no documento autoritativo a cada movimento.
- Não existe transação de interação comum nem histórico undo/redo de edição.
- Antes da Fase 0, `imageElements` era removido pelo schema Zod e mantinha uma
  projeção paralela no store. A Fase 0 centralizou o tipo, incluiu o campo no
  snapshot e nos overrides de slide, removeu a projeção e fez as ações públicas
  atravessarem `updateVariation` com semântica `current/all` coberta por testes.
- `AdvancedTextCanvas` e `AdvancedTextSelectionBox` não são consumidos pelo
  fluxo ativo e representam uma implementação paralela incompleta.

### 3.4 Renderização e exportação

Há uma base adequada que deve ser preservada:

- `PostRenderer` é a entrada comum de preview, edição e exportação;
- a exportação captura o canvas lógico, sem a escala externa do workspace;
- controles, seleção e futuras guias não devem fazer parte da raiz exportável;
- a renderização DOM atual é suficiente para o volume e para a tipografia do
  PostSpark. Migrar para Fabric, Konva, Canvas 2D ou WebGL não faz parte desta
  reforma.

## 4. Arquitetura-alvo

### 4.1 Camadas

```text
Pointer Events
    -> Interaction Controller (FSM)
        -> Geometry Kernel (funções puras)
        -> Transient Interaction Store (preview)
        -> Overlay Layer (handles/guias/seleção)
        -> Commit Adapter
            -> editorStore
                -> visualSnapshot
                    -> PostRenderer / Save / Export
```

### 4.2 Espaço geométrico interno

O núcleo usará coordenadas do documento em pixels lógicos, independentes do
zoom visual. O canvas lógico mantém largura 360 e altura derivada do aspect
ratio:

- `1:1`: 360 × 360;
- `5:6`: 360 × 432;
- `9:16`: 360 × 640.

Durante a primeira migração, adaptadores traduzirão esse espaço canônico para os
formatos persistidos atuais:

- `LayoutPosition.freePosition`: percentual e origem central;
- `textElements`/`imageElements`: pixel e origem superior esquerda.

Isso permite unificar o motor sem alterar imediatamente o snapshot. A
unificação do contrato persistido será uma fase própria e exigirá snapshot v3.

### 4.3 Estrutura proposta

```text
client/src/editor/
  geometry/
    types.ts
    canvasMetrics.ts
    transforms.ts
    bounds.ts
    constraints.ts
  interaction/
    types.ts
    interactionReducer.ts
    useCanvasInteraction.ts
    transientStore.ts
  adapters/
    layoutPositionAdapter.ts
    textElementAdapter.ts
    imageElementAdapter.ts
    cardAdapter.ts
  registry/
    elementRegistry.ts
  overlays/
    InteractionOverlay.tsx
    SelectionBounds.tsx
```

O motor não conhece Zustand, React, `PostVariation` ou templates. Os adapters
são a única camada autorizada a converter geometria em mutações do documento.

### 4.4 Máquina de estados mínima

```text
idle
  -> pressing
      -> dragging
      -> resizing
      -> editingText
  -> cancelling
  -> committing
  -> idle
```

Regras:

- `pointerdown` captura identidade, geometria inicial e métricas do canvas;
- o limiar de movimento separa clique de drag;
- `pointermove` altera apenas estado transitório, limitado a um update por frame;
- `pointerup` produz exatamente um commit;
- `pointercancel` e `Escape` restauram a geometria inicial sem commit;
- troca de slide/aspect ratio durante gesto ativo deve cancelar a interação;
- modificadores de teclado entram como dados da sessão, não como listeners
  particulares dos componentes.

### 4.5 Status dos snippets deste plano

Os snippets abaixo são **contratos de referência**, não código para copiar sem
adaptação. São normativos quanto a:

- separação entre screen space e document space;
- ausência de `PostVariation` e Zustand no kernel;
- preview transitório e commit único;
- adapters como única fronteira com o modelo persistido;
- união discriminada para impedir estados de interação inválidos.

Nomes de arquivos e detalhes internos podem mudar durante a implementação, mas
qualquer alternativa deve preservar essas propriedades ou registrar a decisão
em um ADR.

### 4.6 Contratos geométricos

Tipos diferentes devem impedir que pixels de tela, pixels do documento e
percentuais sejam misturados acidentalmente:

```ts
export type ScreenPoint = Readonly<{ x: number; y: number }>;
export type DocumentPoint = Readonly<{ x: number; y: number }>;
export type DocumentSize = Readonly<{ width: number; height: number }>;

export type DocumentRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type CanvasViewport = Readonly<{
  documentSize: DocumentSize;
  screenRect: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  scaleX: number;
  scaleY: number;
}>;

export type ElementGeometry = Readonly<{
  id: string;
  kind: "block" | "text" | "image" | "card";
  rect: DocumentRect;
  rotationDeg: number;
}>;

export type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";
```

Invariantes:

- `DocumentRect.x/y` sempre representam o canto superior esquerdo;
- `width/height` são sempre não negativos;
- rotação usa graus no contrato público e centro do retângulo como pivot;
- percentuais só existem dentro dos adapters v2;
- valores `auto` são resolvidos por medição antes de entrar no kernel;
- o kernel não recebe `DOMRect`, `HTMLElement` ou CSS transform.

### 4.7 Conversão screen/document

O cálculo da escala deve derivar da dimensão renderizada e da dimensão lógica,
sem usar constantes duplicadas do workspace:

```ts
export function createViewport(
  screenRect: CanvasViewport["screenRect"],
  documentSize: DocumentSize,
): CanvasViewport {
  return {
    screenRect,
    documentSize,
    scaleX: screenRect.width / documentSize.width,
    scaleY: screenRect.height / documentSize.height,
  };
}

export function screenToDocument(
  point: ScreenPoint,
  viewport: CanvasViewport,
): DocumentPoint {
  return {
    x: (point.x - viewport.screenRect.left) / viewport.scaleX,
    y: (point.y - viewport.screenRect.top) / viewport.scaleY,
  };
}

export function documentToScreen(
  point: DocumentPoint,
  viewport: CanvasViewport,
): ScreenPoint {
  return {
    x: viewport.screenRect.left + point.x * viewport.scaleX,
    y: viewport.screenRect.top + point.y * viewport.scaleY,
  };
}

export function screenPxToDocumentPx(
  screenPx: number,
  viewport: CanvasViewport,
): DocumentSize {
  return {
    width: screenPx / viewport.scaleX,
    height: screenPx / viewport.scaleY,
  };
}
```

O motor deve tolerar pequenas diferenças entre `scaleX` e `scaleY`, mas o
workspace deve manter escala uniforme. Um teste deve falhar se a diferença
relativa ultrapassar `0,1%`, pois isso indicaria deformação do canvas.

### 4.8 Registro e medição de elementos

O registry fornece identidade e geometria medida sem transformar o DOM na fonte
da verdade:

```ts
export interface RegisteredElement {
  id: string;
  kind: ElementGeometry["kind"];
  getNode(): HTMLElement | null;
  readModelGeometry(): ElementGeometry;
}

export interface ElementRegistry {
  register(element: RegisteredElement): () => void;
  get(id: string): RegisteredElement | undefined;
  list(): readonly RegisteredElement[];
  measureAll(viewport: CanvasViewport): readonly ElementGeometry[];
}
```

Regras de medição:

- medir viewport e candidatos no início do gesto;
- não executar `getBoundingClientRect()` dentro de todo `pointermove`;
- invalidar métricas em resize do workspace, troca de aspect ratio, troca de
  slide e conclusão do carregamento de fontes;
- durante um gesto, manter a geometria-base estável e alterar apenas o draft;
- elementos invisíveis, bloqueados ou fora do slide ativo não são candidatos.

### 4.9 Estado da interação

O estado deve ser uma união discriminada. Não usar vários booleanos independentes
como `isDragging`, `isResizing` e `isEditing`:

```ts
type Modifiers = Readonly<{
  shift: boolean;
  alt: boolean;
  meta: boolean;
  control: boolean;
}>;

type InteractionState =
  | { phase: "idle" }
  | {
      phase: "pressing";
      pointerId: number;
      elementId: string;
      startPointer: DocumentPoint;
      initial: ElementGeometry;
      grabOffset: DocumentPoint;
      modifiers: Modifiers;
    }
  | {
      phase: "dragging";
      pointerId: number;
      elementId: string;
      startPointer: DocumentPoint;
      initial: ElementGeometry;
      draft: ElementGeometry;
      grabOffset: DocumentPoint;
      modifiers: Modifiers;
    }
  | {
      phase: "resizing";
      pointerId: number;
      elementId: string;
      handle: ResizeHandle;
      initial: ElementGeometry;
      draft: ElementGeometry;
      modifiers: Modifiers;
    }
  | { phase: "committing"; elementId: string; draft: ElementGeometry }
  | { phase: "cancelling"; elementId: string; initial: ElementGeometry };
```

Eventos mínimos:

```ts
type InteractionEvent =
  | { type: "POINTER_DOWN"; pointerId: number; point: DocumentPoint; element: ElementGeometry; modifiers: Modifiers }
  | { type: "POINTER_MOVE"; pointerId: number; point: DocumentPoint; modifiers: Modifiers }
  | { type: "POINTER_UP"; pointerId: number; point: DocumentPoint; modifiers: Modifiers }
  | { type: "POINTER_CANCEL"; pointerId: number }
  | { type: "ESCAPE" }
  | { type: "CANVAS_INVALIDATED" };
```

### 4.10 Política de atualização por frame

Eventos físicos podem chegar acima da taxa de renderização. O controller deve
reter somente o ponto mais recente e processá-lo no próximo frame:

```ts
let queuedMove: InteractionEvent | null = null;
let frameId: number | null = null;

function queuePointerMove(event: InteractionEvent) {
  queuedMove = event;
  if (frameId !== null) return;

  frameId = requestAnimationFrame(() => {
    frameId = null;
    const latest = queuedMove;
    queuedMove = null;
    if (latest) transientStore.dispatch(latest);
  });
}
```

`pointerup` deve drenar o último movimento pendente antes do commit, evitando
que a posição final fique um frame atrás do ponteiro.

### 4.11 Contrato dos adapters

O controller não conhece o formato de `LayoutPosition`, texto, imagem ou
carrossel:

```ts
export interface GeometryCommitContext {
  aspectRatio: AspectRatio;
  slideIndex: number;
  applyScope: "current" | "all";
}

export interface GeometryAdapter<Model> {
  readonly kind: ElementGeometry["kind"];
  read(model: Model, measuredRect: DocumentRect): ElementGeometry;
  commit(
    model: Model,
    geometry: ElementGeometry,
    context: GeometryCommitContext,
  ): void;
}
```

Conversão v2 dos blocos percentuais:

```ts
export function documentRectToFreePosition(
  rect: DocumentRect,
  canvas: DocumentSize,
): FreePosition {
  return {
    x: ((rect.x + rect.width / 2) / canvas.width) * 100,
    y: ((rect.y + rect.height / 2) / canvas.height) * 100,
  };
}

export function freePositionToDocumentRect(
  position: FreePosition,
  measuredSize: DocumentSize,
  canvas: DocumentSize,
): DocumentRect {
  const centerX = (position.x / 100) * canvas.width;
  const centerY = (position.y / 100) * canvas.height;
  return {
    x: centerX - measuredSize.width / 2,
    y: centerY - measuredSize.height / 2,
    ...measuredSize,
  };
}
```

Essa conversão deve existir em um único arquivo e ser testada como round-trip.

### 4.12 Fronteira de commit atômico

O store deve expor uma ação semântica única para o motor. O renderer não deve
escolher diretamente entre `updateLayoutSettings`, `updateVariation` e
`updateSingleImageElement`:

```ts
type GeometryCommit = Readonly<{
  elementId: string;
  kind: ElementGeometry["kind"];
  geometry: ElementGeometry;
  slideIndex: number;
  applyScope: "current" | "all";
}>;

interface EditorState {
  commitGeometry(command: GeometryCommit): void;
}
```

`commitGeometry` deve, numa única chamada a `setWithSnapshot`:

1. localizar o elemento pelo ID estável;
2. delegar a conversão ao adapter correto;
3. aplicar corretamente `current/all` e o slide ativo;
4. atualizar projeções compatíveis;
5. reconstruir `visualSnapshot` uma única vez;
6. futuramente registrar a mesma operação no histórico.

### 4.13 Preview e composição visual

O snapshot permanece imóvel durante o gesto. O renderer do elemento ativo
combina geometria persistida e draft transitório:

```ts
const persisted = adapter.read(model, measuredRect);
const draft = useInteractionDraft(elementId);
const effectiveGeometry = draft ?? persisted;
```

Somente o elemento ativo e o overlay devem observar o draft. `PostCardV2`
inteiro não deve assinar o estado transitório de alta frequência.

### 4.14 Semântica por tipo

| Tipo | Drag | Resize lateral | Resize de canto | Persistência v2 |
| --- | --- | --- | --- | --- |
| Bloco/section | move rect | altera largura | inicialmente igual ao lateral | `%` pelo centro + largura `%` |
| Texto avançado | move rect | reflow, mantém fonte | fase posterior: escala tipográfica | px top-left + width/height |
| Imagem | move rect | altera bounds/crop quando existir | escala proporcional | px top-left + width/height |
| Card | move rect interno | altera largura | proporcional quando suportado | `layoutSettings.card` |

Não simular handles sem semântica implementada. Até o resize bidimensional
existir, exibir somente handles compatíveis com a operação real.

## 5. Plano de execução

### Fase 0 — Integridade e baseline

Objetivo: eliminar perdas silenciosas antes da reforma estrutural.

- adicionar `imageElementSchema` ao contrato compartilhado;
- aceitar `imageElements` em snapshot e patches de slide onde aplicável;
- garantir round-trip Store -> Snapshot -> Zod -> Save -> Restore;
- adicionar testes de persistência para texto, imagem e sections;
- adicionar testes que reproduzam drag em escalas 0,5, 1 e 2;
- documentar as semânticas atuais de origem/unidade sem mudá-las.
- criar um teste que demonstre a remoção atual de `imageElements` pelo schema e
  fazê-lo passar com a correção;
- registrar fixtures v1 e v2 reais para proteger leitura retrocompatível.
- definir e testar a semântica de `imageElements` no carrossel:
  `current` grava somente em `slides[index].editorState.variation` e `all`
  aplica coerentemente a todos os slides sem promover o slide atual à raiz;
- remover ou tornar derivada a projeção paralela `editorStore.imageElements`,
  impedindo que ela concorra com `visualSnapshot`.

Critério de saída: nenhum elemento visual suportado pelo editor é removido pelo
schema ou pelo salvamento.

### Fase 1 — Kernel geométrico puro

Objetivo: criar uma matemática única sem alterar a UI.

- definir `DocumentPoint`, `DocumentRect`, `ScreenPoint`, `CanvasViewport` e
  `ElementGeometry`;
- implementar screen -> document e document -> screen;
- implementar bounds, clamp, centro, resize e tolerâncias;
- remover cálculos geométricos dispersos apenas depois de testes de equivalência;
- testar aspect ratios e escalas fracionárias.
- proibir imports de React, Zustand e contratos de persistência dentro de
  `client/src/editor/geometry`;
- validar finitude (`Number.isFinite`) e normalizar `-0` nos limites públicos.

Critério de saída: funções puras cobrem todas as conversões usadas pelos três
motores atuais.

### Fase 2 — Sessão transitória e transação de commit

Objetivo: separar preview do documento autoritativo.

- introduzir a FSM e o transient store;
- consolidar Pointer Events, capture, slop, cancelamento e `requestAnimationFrame`;
- definir `beginInteraction`, `previewInteraction`, `commitInteraction` e
  `cancelInteraction`;
- garantir zero mutações de `editorStore` durante `pointermove`;
- garantir um único `setWithSnapshot` por gesto concluído.
- definir a política de captura/liberação do ponteiro em um único controller;
- drenar o último frame pendente no `pointerup`;
- cancelar o gesto ao desmontar elemento, trocar slide ou invalidar viewport.

Critério de saída: um drag longo gera no máximo um comando de commit, e cancelar
não altera estado persistido. A comprovação de um único `setWithSnapshot` real
fica vinculada ao primeiro adapter de blocos da Fase 3, evitando uma ação de
store provisória sem consumidor.

### Fase 3 — Migração dos blocos percentuais

Objetivo: migrar o caminho de menor risco primeiro.

- adaptar headline, body, accent bar, badge, sticker e seta;
- migrar sections;
- migrar resize horizontal;
- preservar flow mode e criar posição absoluta somente após ação manual;
- migrar o card interno do `ThemeRenderer`;
- manter o ímã de grade com o comportamento atual via plugin temporário do
  motor, sem implementar smart guides.
- instrumentar temporariamente o número de commits e o erro entre grip point e
  ponteiro para comparar motor antigo e novo em desenvolvimento.

Critério de saída: comportamento e snapshots equivalentes aos atuais nos três
aspect ratios e em carrossel.

### Fase 4 — Migração de texto avançado e imagens

Objetivo: eliminar os motores paralelos.

- substituir pointer handlers próprios por adapters do motor comum;
- aplicar a mesma correção de escala para todos os tipos;
- manter semântica específica de resize por tipo;
- remover `AdvancedTextCanvas` e `AdvancedTextSelectionBox` após confirmação de
  ausência de consumidores;
- remover `useDragElement` e `useResizeElement` quando o último consumidor for
  migrado.
- corrigir o drag de imagem em canvas escalado por meio da conversão comum, não
  com um fator local adicionado em `ImageElementBlock`;
- manter IDs estáveis e impedir atualização por índice do array.

Critério de saída: existe um único controlador de drag/resize no fluxo ativo.

### Fase 5 — Desconcentração dos renderers

Objetivo: impedir novo acoplamento.

- tornar `PostCardV2` predominantemente renderer/compositor;
- mover registro, seleção, handles e interação para wrappers/overlays;
- separar captura/exportação, AutoPilot e menus da responsabilidade declarada
  de `CanvasWorkspace`;
- proibir mutações diretas do store dentro de renderers de elementos.
- criar uma API única de registro (`InteractiveElement`) para que novos tipos
  não implementem pointer handlers próprios;
- mover overlays para um sibling de `data-post-export-root`, nunca para dentro
  da árvore capturada pelo `html2canvas`.

Critério de saída: renderers recebem geometria efetiva e callbacks sem conhecer
o ciclo global da interação.

### Fase 6 — Histórico transacional

Objetivo: tornar edição recuperável.

- introduzir undo/redo baseado em transações do documento;
- registrar um comando por gesto, não por frame;
- incluir conteúdo, layout, texto, imagem, background e mudança de formato;
- invalidar redo após nova mutação;
- definir limites de memória e política de compactação.
- armazenar `before` e `after` da operação sem reexecutar lógica de pointer;
- não registrar seleção, hover, guias ou estado transitório no histórico.

Critério de saída: drag, resize e edição podem ser desfeitos/refeitos sem
divergência do snapshot.

### Fase 7 — Snapshot geométrico v3

Objetivo: remover heterogeneidade também do contrato persistido.

- definir geometria comum em document space para elementos livres;
- preservar flow mode como conceito explícito;
- criar migração v1/v2 -> v3;
- preservar layouts específicos por aspect ratio e overrides por slide;
- atualizar schemas, SavedPosts, rotas, testes e `DOCUMENTO_MESTRE.md` em uma
  única entrega.

Esta fase só começa após as fases anteriores estabilizarem. Ela não deve ser
misturada à primeira migração do motor.

### Fase 8 — Smart guides (backlog)

Depois da reforma, guias serão um consumidor do kernel:

- candidatos: canvas, margens e elementos registrados;
- âncoras: left/center/right e top/middle/bottom;
- tolerância definida em pixels de tela e convertida pelo viewport;
- snap independente por eixo;
- histerese e modificador para suspensão temporária;
- overlay fora da raiz exportável;
- espaçamento igual entra somente numa segunda entrega.

Não é necessário R-Tree inicialmente. Para a quantidade atual de elementos,
uma varredura linear sobre o registry é mais simples e suficientemente barata.
Indexação espacial só será adotada com medição que demonstre necessidade.

## 6. Testes obrigatórios

### Unitários

- transformações screen/document em escalas 0,5, 0,75, 1, 1,5 e 2;
- clamp de bounds para todos os aspect ratios;
- conversão percentual-centro <-> pixels-top-left;
- resize por tipo de elemento;
- cancelamento e commit da FSM;
- adapters de cada família de elemento.
- equivalência `screen -> document -> screen` com erro máximo de `0,01px`;
- round-trip de `FreePosition` com erro máximo de `0,01%`;
- grip offset preservado durante todo o drag;
- último movimento pendente aplicado antes do commit.

### Integração

- exatamente uma mutação autoritativa por gesto;
- nenhuma mutação em `pointermove`;
- `pointercancel` e Escape restauram o estado;
- troca de slide não vaza geometria para outro slide;
- `applyScope=current/all` permanece correto;
- flow mode não ganha geometria absoluta sem ação do usuário;
- imagem adicionada sobrevive a save/reload.
- desmontagem do elemento ativo cancela sem commit;
- alteração de seleção durante drag não troca o alvo da transação;
- o elemento ativo permanece sob o mesmo grip point do ponteiro;
- nenhum handler antigo permanece ativo após a migração do tipo.

### Contrato e handoff

- ampliar `variationSnapshot.test.ts`;
- ampliar `editorStore.test.ts`;
- ampliar `postsparkSchemas.test.ts`;
- comparar HoloDeck -> Workbench -> Save -> SavedPosts;
- verificar preview, edição e exportação sobre o mesmo snapshot.

### Browser

- mouse e touch/pointer;
- drag para fora do card e retorno;
- canvas escalado em viewport pequena e grande;
- resize durante fonte ainda carregando;
- troca de aspect ratio;
- carrossel com escopo atual e todos;
- inspeção visual do PNG exportado.
- drag iniciado em diferentes pontos internos do mesmo elemento;
- movimentos rápidos e lentos, incluindo mudança brusca de direção;
- `pointercancel`, perda de foco e Escape;
- ausência de salto no primeiro frame do drag;
- ausência de controles/overlays no PNG.

### Snippets mínimos de teste

O teste de geometria deve trabalhar apenas com funções puras:

```ts
it.each([0.5, 0.75, 1, 1.5, 2])(
  "preserva coordenadas no round-trip com scale %s",
  (scale) => {
    const viewport = createViewport(
      { left: 40, top: 20, width: 360 * scale, height: 640 * scale },
      { width: 360, height: 640 },
    );
    const documentPoint = { x: 123.25, y: 456.75 };
    const result = screenToDocument(
      documentToScreen(documentPoint, viewport),
      viewport,
    );
    expect(result.x).toBeCloseTo(documentPoint.x, 8);
    expect(result.y).toBeCloseTo(documentPoint.y, 8);
  },
);
```

O teste de persistência deve atravessar a fronteira real do schema:

```ts
it("preserva imageElements no snapshot persistível", () => {
  const snapshot = buildFixtureSnapshot({
    imageElements: [buildFixtureImageElement()],
  });
  const parsed = postVisualSnapshotSchema.parse(snapshot);
  expect(parsed.imageElements).toEqual(snapshot.imageElements);
});
```

O teste transacional deve observar a fronteira do store, não detalhes do DOM:

```ts
it("faz um único commit após vários movimentos", () => {
  beginDrag(fixture);
  movePointer({ x: 20, y: 20 });
  movePointer({ x: 40, y: 50 });
  movePointer({ x: 80, y: 90 });
  endPointer({ x: 80, y: 90 });

  expect(commitGeometry).toHaveBeenCalledTimes(1);
  expect(commitGeometry).toHaveBeenLastCalledWith(
    expect.objectContaining({ geometry: expect.any(Object) }),
  );
});
```

## 7. Critérios de qualidade percebida

“Gostoso de mexer” precisa ser tratado como requisito verificável, não somente
como opinião visual.

### Precisão

- nenhum salto perceptível ao iniciar drag (`<= 1px` de tela);
- o ponto agarrado permanece sob o ponteiro com erro visual `<= 1px`;
- resultado final idêntico em escalas 0,5, 1 e 2, quando convertido para
  document space;
- limites não permitem que o elemento fique inacessível;
- cancelamento retorna exatamente à geometria inicial.

### Fluidez

- preview começa no primeiro frame após superar o touch slop;
- não realizar leitura de layout por `pointermove`;
- não realizar mutação do snapshot por `pointermove`;
- em máquina de desenvolvimento de referência, frame de interação p95 abaixo de
  `16,7ms` em uma cena de teste representativa;
- não criar animação CSS de suavização sobre o elemento durante drag, pois ela
  introduz atraso entre mão e objeto.

### Previsibilidade

- touch slop inicial recomendado: `4px` de tela para mouse e `8px` para touch,
  mantido configurável após teste manual;
- clique simples nunca altera geometria;
- resize exibe somente handles com comportamento real;
- comportamento não depende do template visual usado;
- modificadores e Escape funcionam durante toda a sessão.

Os números são baselines iniciais do PostSpark, não alegações sobre o Canva.
Devem ser calibrados por teste manual sem alterar o modelo matemático.

## 8. Matriz de impacto por módulo

| Módulo | Papel durante a reforma | Resultado esperado |
| --- | --- | --- |
| `shared/postspark.ts` | contrato persistido atual | incluir integridade de imagens; v3 somente na fase 7 |
| `shared/postsparkSchemas.ts` | validação runtime | round-trip completo sem stripping |
| `variationSnapshot.ts` | fronteira canônica | permanece único normalizador; recebe migração v3 posteriormente |
| `editorStore.ts` | commit autoritativo | ganha `commitGeometry`; não recebe preview de alta frequência |
| `PostRenderer.tsx` | entrada comum | permanece estável e passivo |
| `PostCardV2.tsx` | renderer/compositor | perde lógica de pointer, snap e conversão |
| `CanvasWorkspace.tsx` | viewport/orquestração | fornece métricas; export e menus serão desconcentrados |
| `DraggableBlock.tsx` | adapter temporário | removido após migração |
| `AdvancedTextNode.tsx` | renderer específico | perde motor próprio, mantém edição textual |
| `ImageElementBlock.tsx` | renderer específico | perde motor próprio, mantém apresentação/crop futuro |
| `ThemeRenderer.tsx` | composição visual | card passa pelo adapter comum |
| `Home.tsx`/`SavedPosts.tsx` | save/restore | continuam consumindo snapshot completo |
| `server/routers.ts`/`server/db.ts` | persistência | acompanham schema; sem regra geométrica |

## 9. Estratégia de migração e rollback

- migrar por família de elemento, nunca por duplicação permanente de motores;
- se for necessária flag temporária, usar uma única flag de desenvolvimento na
  fronteira do controller e removê-la ao concluir a fase 4;
- não persistir qual motor produziu o documento;
- manter snapshots v1/v2 legíveis durante toda a reforma;
- cada fase deve poder ser revertida sem migrar dados do usuário;
- snapshot v3 só será gravado quando leitura v1/v2 e downgrade operacional
  estiverem testados;
- não apagar motores antigos até o teste de equivalência da família migrada;
- após equivalência, apagar o caminho antigo na mesma entrega para evitar duas
  fontes de comportamento.

## 10. Observabilidade de desenvolvimento

Em desenvolvimento, disponibilizar contadores não persistentes:

```ts
interface InteractionDiagnostics {
  pointerMoveCount: number;
  renderedFrameCount: number;
  authoritativeCommitCount: number;
  layoutReadCount: number;
  maxGripErrorScreenPx: number;
  cancelled: boolean;
}
```

Esses dados devem ser acessíveis por testes e logs opt-in, sem entrar em
`visualSnapshot`, banco ou analytics de produção. Remover logs por frame antes
do merge.

## 11. Padrões proibidos

- adicionar `onPointerMove` próprio em novos elementos;
- converter escala com constante local ou ler `transform: scale(...)` por regex;
- usar índice de array como identidade de elemento;
- chamar `useEditorStore.getState().update*` dentro de renderers durante drag;
- executar `getBoundingClientRect()` para todos os elementos a cada evento;
- manter simultaneamente posição em state local, Zustand e atributo DOM;
- aplicar `transition: transform` ao elemento enquanto ele acompanha o ponteiro;
- inserir guia ou handle dentro de `data-post-export-root`;
- incrementar snapshot version sem migrador e fixtures de versões anteriores;
- introduzir uma biblioteca gráfica para resolver apenas drag/resize.

## 12. Guardrails arquiteturais

1. `visualSnapshot` continua sendo a única fonte persistível.
2. Estado transitório nunca entra no snapshot.
3. Renderers não convertem coordenadas nem escrevem diretamente no store.
4. Toda conversão de unidade/origem passa pelos adapters.
5. Um gesto corresponde a uma transação.
6. Não introduzir uma biblioteca de canvas sem benchmark e ADR específico.
7. Não implementar smart guides antes da conclusão da migração dos três tipos
   de elemento.
8. Mudança de contrato persistido exige nova versão e leitura retrocompatível.

## 13. Ordem recomendada de entregas

Cada fase deve ser uma entrega pequena e reversível:

1. integridade de `imageElements` e testes de round-trip;
2. kernel geométrico sem UI;
3. FSM/transient store sem migração completa;
4. blocos e sections;
5. textos avançados e imagens;
6. limpeza/desconcentração;
7. undo/redo;
8. snapshot v3;
9. smart guides.

Não deve haver uma branch longa contendo toda a reforma. Cada entrega precisa
passar typecheck, testes de contrato e verificação visual antes da próxima.

### Definition of Done de cada entrega

- typecheck sem novos `any` na camada do editor;
- testes unitários e de contrato relevantes passando;
- teste browser nos três aspect ratios;
- verificação de carrossel com `current` e `all` quando aplicável;
- comparação save/reload e export quando a fase tocar persistência/render;
- nenhuma nova mutação direta dentro dos renderers;
- `git diff` sem motor paralelo ou código morto deixado “para depois”;
- `DOCUMENTO_MESTRE.md` atualizado quando o comportamento efetivo mudar;
- limitações ou decisões divergentes deste plano registradas no mesmo PR.
