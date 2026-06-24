# Plano definitivo de recuperação do motor do Workbench

> Status: plano consolidado após auditoria de 2026-06-24.  
> Documento anterior: `PLANO_REFORMA_MOTOR_WORKBENCH.md`.  
> Regra de precedência: quando houver divergência sobre estado atual, gates ou
> ordem de execução, este documento prevalece. O documento anterior continua
> válido como referência da arquitetura desejada e da pesquisa que a originou.

## 1. Finalidade e regra para a IA executora

Este plano existe para que uma IA executora implemente a recuperação sem precisar
decidir arquitetura, precedência de dados, ordem das fases ou critérios de aceite.

Regras obrigatórias:

1. Não reescrever o editor do zero.
2. Não resetar, descartar ou sobrescrever a árvore de trabalho atual.
3. Executar uma macroentrega por vez e não iniciar a próxima enquanto o gate da
   anterior estiver vermelho.
4. Antes de editar um subsistema, ler seus produtores, consumidores, testes e o
   trecho correspondente do `DOCUMENTO_MESTRE.md`.
5. `visualSnapshot` continua sendo a única fonte persistível de renderização,
   save, reload e exportação.
6. Não criar outro normalizador visual fora de `variationSnapshot.ts`.
7. Não introduzir Fabric, Konva, Canvas 2D, WebGL ou outra biblioteca gráfica.
8. Não implementar smart guides antes de contrato, interação, exportação e
   histórico estarem verdes.
9. Não declarar uma fase concluída apenas porque typecheck e testes unitários
   passam; as fases que alteram UI exigem a matriz browser deste documento.
10. Ao encontrar comportamento diferente deste plano, parar somente a fase
    afetada, registrar evidência no quadro de progresso e atualizar este plano
    antes de inventar uma solução local.

## 2. Estado auditado e evidências

### 2.1 O que está aproveitável

- `client/src/editor/geometry` oferece um kernel puro com transformações,
  constraints, bounds e resize.
- `client/src/editor/interaction` oferece FSM, touch slop, pointer capture,
  preview por RAF, cancelamento e commit único.
- Adapters e integração inicial existem para blocos, sections, texto e imagem.
- Os motores antigos foram removidos da árvore ativa.
- `PostVisualSnapshot` v2, persistência de `imageElements` e a fronteira
  `Home -> HoloDeck -> Workbench -> Save` foram parcialmente consolidados.
- Em ambiente com acesso normal aos junctions de `node_modules`, `npm run check`
  e a suíte de 25 arquivos/218 testes passam.

Esses resultados provam que há uma base aproveitável. Eles não provam que as
fases 3–5 estão concluídas.

### 2.2 Falhas confirmadas

| Prioridade | Falha | Evidência da auditoria | Consequência |
| --- | --- | --- | --- |
| P0 | Override de `textElements` vaza do slide atual para a raiz | Reprodução em memória retornou `base.x=12`, `root.x=999`, `override.x=999` | Save/reload pode contaminar todos os slides |
| P0 | Exportação não possui gate confiável | Teste browser não recebeu download em 30 segundos | Usuário pode ficar preso ou obter PNG divergente |
| P1 | Resize por handles é inconsistente | Tentativas browser perderam seleção/captura e produziram resultado não determinístico | Função central do editor não é confiável |
| P1 | Geometria não é estável entre formatos | Após edição em 1:1, 9:16 apresentou colisão de texto livre, headline e imagem | Layout por formato não é preservado |
| P1 | Cleanup do registry depende de identidade obsoleta | O hook registra um descriptor, depois `update()` o substitui; cleanup antigo não remove o novo | Descriptors e nodes desmontados podem permanecer registrados |
| P1 | Overlay lê layout durante interação | `InteractionOverlay` depende de `interactionState` e executa `getBoundingClientRect()` no layout effect | Layout thrashing e perda de fluidez |
| P1 | Medição de elementos rotacionados com `auto` é ambígua | Bounding box visual rotacionado é reutilizado como dimensão lógica | Salto, clamp e resize incorretos |
| P1 | Renderer ainda resolve design | `PostCardV2` mantém prioridades locais de tokens, cor, background, layout e imagem | HoloDeck, editor e export podem divergir |
| P1 | Histórico de gerações está quebrado | Browser recebeu `generation_runs.createdAt does not exist` | `/history` não carrega dados |
| P2 | Logs de debug permanecem em caminhos quentes | Logs em render, clone de background e setters | Ruído, custo e vazamento acidental de metadados |
| P2 | Logger trata 304 como erro | `OPERATIONAL_ERRORS.txt` ganhou mais de 18 mil linhas | Arquivo cresce com tráfego normal de desenvolvimento |
| P2 | Fases finais não foram iniciadas | Ausência de v3, undo/redo e smart guides | Reforma permanece incompleta |

### 2.3 Resultado do teste browser

- A aplicação carregou em `/thevoid` com usuário de desenvolvimento.
- Workbench abriu usando uma fixture local com dois slides, texto livre e imagem.
- Drag de texto e imagem funcionou no cenário básico.
- Edições com escopo `current` foram isoladas e restauradas ao navegar entre
  slides.
- Resize não foi determinístico e não pode ser aprovado.
- Troca para 9:16 exibiu colisão visual clara.
- Exportação não gerou evento de download dentro de 30 segundos.
- A tela de histórico revelou a divergência de schema descrita acima.

## 3. Arquitetura final obrigatória

```text
post.generate
    -> createPostVisualSnapshot (único normalizador)
    -> PostVisualSnapshot v3
    -> HoloDeck
    -> editorStore.visualSnapshot
       + UI/projeções compatíveis
       + transient interaction store
       + history store
    -> PostRenderer passivo
       + overlay editável como sibling
    -> save / SavedPosts / export usando o mesmo snapshot
```

### 3.1 Estados permitidos

- Documento: `editorStore.visualSnapshot`.
- Projeções compatíveis: `activeVariation`, `baseVariation`, slides, settings e
  campos usados por controles antigos. Nunca são persistidos diretamente.
- Estado transitório: pointer ativo, viewport capturado, geometria inicial,
  draft, guias, hover e seleção. Nunca entra no snapshot.
- Histórico: pares imutáveis `beforeSnapshot`/`afterSnapshot`. Nunca armazena
  eventos DOM ou drafts.

### 3.2 Fronteiras

- `variationSnapshot.ts`: normalização, projeção de slide e migração de versões.
- `editorStore.ts`: transações autoritativas e projeções carousel-aware.
- `client/src/editor/geometry`: matemática pura.
- `client/src/editor/interaction`: FSM pura e coalescimento de eventos.
- `client/src/editor/adapters`: conversão entre contrato persistido e geometria.
- Integration/provider: medição inicial, registry, seleção e bindings React.
- Renderer: apresentação pura do snapshot efetivo.
- Overlay: seleção, handles e guias; sempre fora da raiz exportável.

## 4. Estratégia de branches, commits e rollback

Não manter toda a recuperação em um único commit. A ordem obrigatória é:

1. `checkpoint/background-provider`: isolar e preservar a melhoria
   OpenRouter/Pollinations já testada.
2. `fix/snapshot-v2-integrity`: corrigir vazamentos e no-ops do snapshot atual.
3. `fix/interaction-stability`: registry, medição, resize e pointer lifecycle.
4. `refactor/passive-render-export`: renderer passivo e exportação determinística.
5. `feat/snapshot-v3`: contrato final e layouts por aspect ratio.
6. `feat/editor-history`: undo/redo transacional.
7. `feat/smart-guides`: alinhamento inteligente.
8. `fix/operational-contracts`: histórico de gerações e logger operacional, caso
   não tenham sido entregues antes em commits próprios.

Cada commit deve passar seu gate. Não deixar flag permanente de motor antigo e
novo. Se uma família de elementos for migrada e aprovada, remover o caminho
substituído na mesma entrega.

## 5. Macroentrega 0 — Preservação e baseline reproduzível

### Alterações

- Preservar toda a árvore atual.
- Separar `server/imageGenerateBackground.ts`, seu teste e a atualização do
  comentário do router em commit independente.
- Não incluir as linhas geradas de `OPERATIONAL_ERRORS.txt` em commit. Se forem
  úteis, copiá-las para artefato ignorado antes de restaurar o arquivo rastreado.
- Garantir que este documento, o plano original e o documento-mestre sejam
  versionáveis.
- Criar fixtures determinísticas para:
  - post estático;
  - carrossel de dois slides;
  - texto e imagem livres;
  - design tokens;
  - layouts 1:1, 5:6 e 9:16;
  - snapshots v1, v2 e, posteriormente, v3.
- Converter cada falha P0/P1 em teste vermelho antes da correção correspondente.

### Gate

```text
npm run check
npm test
git diff --check
```

Registrar quantidade de testes, falhas reproduzidas e limitações ambientais.

## 6. Macroentrega 1 — Integridade definitiva do snapshot v2

### Implementação

1. Em `buildVariationSnapshot`, usar sempre a variação-base para campos raiz de
   carrossel. Remover a leitura especial de `active.textElements`.
2. Para `applyScope=current`, gravar `textElements`, `imageElements`, cores,
   background e layout apenas em `slides[current].editorState`.
3. Para `applyScope=all`, usar o valor efetivo do slide atual como autoritativo e
   aplicá-lo à raiz e a todos os slides.
4. `projectSnapshotForSlide` é read-only e nunca altera o argumento.
5. `setWithSnapshot` não reconstrói o snapshot quando o patch é semanticamente
   idêntico ou quando a ação altera somente seleção, escopo, hover ou ímã.
6. Antes de hidratar o store, validar snapshot persistido. V1/v2 inválidos devem
   produzir erro controlado e mensagem ao usuário, não fallback silencioso que
   remonte o design com campos legados.
7. Remover logs de `cloneBgValue`, `setBgValue` e render de `PostCardV2`.

### Testes obrigatórios

- `current` de texto não altera raiz.
- `current` de imagem não altera raiz.
- Navegação restaura ambos os slides.
- `all` replica raiz e todos os slides.
- Handoff HoloDeck → store preserva o objeto visual selecionado.
- Store → Zod → JSON → restore mantém todos os campos.
- No-op mantém a mesma referência de `visualSnapshot`.
- Save usa somente `visualSnapshot`.

### Gate

Nenhuma reprodução de vazamento pode permanecer. HoloDeck, Workbench,
SavedPosts e save devem consumir o mesmo snapshot.

## 7. Macroentrega 2 — Motor de interação estável

### 7.1 Registry

- `register()` deve devolver um token/versão de registro.
- `update()` atualiza os dados do mesmo registro sem trocar a identidade usada
  para cleanup.
- `unregister(id, token)` remove apenas a versão correspondente.
- Unmount do componente sempre remove o descriptor atual.
- Se o elemento desmontado for o target ativo, cancelar com
  `element-unmounted` antes de removê-lo.

### 7.2 Medição e overlay

- Medir canvas e target no `beginInteraction`.
- Armazenar a geometria idle selecionada em cache do registry/overlay.
- Invalidar a medição somente em mudança de seleção, resize do canvas, mudança
  de formato, carregamento de fonte/imagem ou atualização semântica do elemento.
- Durante drag/resize, overlay usa exclusivamente `draft.rect`.
- `layoutReadCount` deve permanecer zero após o início do gesto.

### 7.3 Seleção e Pointer Events

- Remover a mistura entre `onMouseDown` do workspace e Pointer Events do motor.
- Fundo, elemento e handles devem ter políticas explícitas de seleção.
- Pointerdown em handle nunca desmarca o elemento.
- Capture/release pertencem ao controller comum.
- O node capturado e o handle não podem ser substituídos durante o gesto.
- Clique abaixo do slop seleciona sem alterar geometria.

### 7.4 Geometria rotacionada e dimensões auto

- Guardar tamanho lógico não rotacionado separadamente de `visualBounds`.
- Texto `height:auto` usa medição de conteúdo sem rotação.
- Imagem `height:auto` usa proporção natural conhecida; antes de carregar, não
  oferecer handle que dependa da proporção.
- Clamp usa bounds visuais, mas o adapter persiste o retângulo lógico.
- Preservar overflow inicial também para elementos rotacionados.

### 7.5 Resize por tipo

- Blocos flow: resize horizontal sem criar `freePosition`.
- Blocos absolutos: resize horizontal preservando o centro/âncora.
- Texto: handles esquerdo/direito, mínimo 24 px, altura `auto` após reflow.
- Imagem: quatro cantos, proporção preservada, mínimo 40×40 px.
- Card: política horizontal definida pelo mesmo adapter de blocos.
- Handles exibidos devem corresponder exatamente às operações suportadas.

### Gate

- Nenhuma escrita no Zustand em pointermove.
- Um commit por gesto concluído.
- Zero commits em cancelamento.
- Zero descriptors órfãos após unmount.
- Zero layout reads por frame.
- Matriz browser da seção 13 aprovada para drag e resize.

## 8. Macroentrega 3 — Renderer passivo e exportação confiável

### Renderer

- `PostRenderer` recebe `PostVisualSnapshot` obrigatório.
- Projetar o slide exatamente uma vez antes de `PostCardV2`.
- `PostCardV2` não deve:
  - resolver prioridades de cor;
  - escolher entre `bgValue`, `imageUrl`, theme e tokens;
  - reaplicar otimização de aspect ratio;
  - inventar defaults visuais;
  - importar store;
  - iniciar pointer lifecycle.
- Defaults e escolhas explícitas são resolvidos no normalizador canônico.
- `ThemeRenderer` torna-se puramente visual; remover `DraggableBlock` de dentro
  dele. O wrapper interativo do card pertence ao modo editável.
- Edição inline recebe callbacks por bindings, mas não conhece persistência.

### Exportação

- A raiz `data-post-export-root` contém apenas conteúdo do post.
- Overlay, ímã, carousel controls, loading e menus são siblings.
- Não trocar todo o renderer para um ramo diferente apenas para exportar; usar o
  mesmo snapshot e a mesma composição visual passiva.
- Antes de capturar:
  1. cancelar interação ativa;
  2. aguardar `document.fonts.ready`;
  3. aguardar imagens dentro da raiz com sucesso ou erro;
  4. aguardar dois RAFs;
  5. capturar com timeout explícito;
  6. sempre limpar `isExporting` em `finally`.
- Timeout ou erro mostra mensagem acionável e nunca deixa o botão bloqueado.
- PNG deve usar dimensões derivadas do aspect ratio e escala de exportação
  documentada, não do zoom do workspace.

### Gate

- Download ocorre dentro do timeout de teste.
- PNG é aberto e inspecionado no teste.
- Dimensões são corretas.
- Nenhum controle aparece.
- Preview, editor sem overlays e PNG são visualmente equivalentes.

## 9. Macroentrega 4 — Snapshot geométrico v3

Esta macroentrega precede histórico. A auditoria confirmou que o contrato v2 não
preserva adequadamente layouts editados por formato.

### Contrato

- `snapshotVersion` aceita `1 | 2 | 3`; novas gravações usam apenas `3`.
- Elementos livres usam geometria comum em document space, com origem/âncora
  explícita conforme o contrato detalhado em `planos individuais/fase7.md`.
- Flow mode permanece um modo explícito, sem geometria absoluta artificial.
- Cada aspect ratio preserva sua geometria/layout independentemente.
- Slides preservam overrides dentro de `slides[].editorState`.
- IDs são estáveis; nenhuma atualização por índice.

### Migração

- Implementar migradores puros e encadeados `v1 -> v2 -> v3`.
- Migrar sempre na leitura; não atualizar banco em massa nesta entrega.
- Migrador é idempotente e não remove campos desconhecidos suportados.
- SavedPosts, histórico restaurado e geração nova terminam em v3 antes de
  hidratar o store.
- Schemas Zod validam discriminadamente cada versão.

### Troca de formato

- Ao sair de um formato, persistir seu layout no slot correspondente.
- Ao entrar em outro, restaurar seu slot; se nunca editado, derivar uma única vez
  do snapshot normalizado daquele formato.
- Nunca copiar automaticamente geometria livre editada de 1:1 para 9:16.
- Aplicação explícita a todos os formatos deve ser uma ação futura separada; não
  inferir essa intenção do usuário.

### Gate

- Fixtures v1/v2 continuam legíveis.
- Novos saves são v3.
- Alternar formatos repetidamente preserva cada layout.
- A colisão observada na auditoria não reaparece.

## 10. Macroentrega 5 — Histórico transacional

### API

Criar uma única fronteira de transação documental com o equivalente a:

```ts
interface DocumentTransaction {
  label: string;
  beforeSnapshot: PostVisualSnapshotV3;
  afterSnapshot: PostVisualSnapshotV3;
  coalesceKey?: string;
}
```

- `commitGeometry` produz uma transação.
- Ações semânticas de texto, imagem, background, formato e layout passam pela
  mesma fronteira.
- Undo restaura `beforeSnapshot`; redo restaura `afterSnapshot`.
- Não reexecutar adapters ou eventos DOM no restore.
- Limite inicial: 100 transações.
- Nova mutação após undo invalida redo.
- Seleção, hover, guias, slide ativo e applyScope não entram no histórico.
- Cancelar gesto ativo antes de undo/redo.

### UX

- `Ctrl/Cmd+Z`: undo.
- `Ctrl/Cmd+Shift+Z` e `Ctrl+Y`: redo.
- Ignorar atalhos quando um campo de texto/contentEditable estiver consumindo o
  evento, exceto quando a política do editor textual delegar ao histórico global.
- Botões de undo/redo exibem disabled corretamente.

### Gate

- Um drag longo corresponde a um undo.
- Save/reload após undo preserva o resultado.
- Carrossel e formatos não divergem do snapshot.

## 11. Macroentrega 6 — Smart guides

- Implementar o motor puro previsto em `planos individuais/fase8.md`.
- Candidatos: canvas e elementos registrados do slide atual.
- Âncoras: left/center/right e top/middle/bottom.
- Tolerância inicial: 6 px de tela, convertida para document space.
- Histerese: manter o snap até `2x` a tolerância.
- Snap independente por eixo.
- `Alt` suspende temporariamente.
- Medir candidatos apenas no início do gesto.
- Remover `nearestGridCoordinate` do commit e a grade fixa 10%–90%.
- O toggle `isMagnetActive` controla engine e guias.
- Guias ficam no overlay e nunca entram no snapshot/exportação.
- Varredura linear é suficiente; não adicionar índice espacial.

## 12. Macroentrega 7 — Funções quebradas fora do canvas

### Histórico de gerações

Padronizar a coluna física como `created_at`, preservando `createdAt` na API:

1. Migração SQL idempotente:
   - se `"createdAt"` existe e `created_at` não, renomear;
   - se nenhuma existe, adicionar `created_at timestamptz not null default now()`;
   - recriar índices usando `created_at`.
2. Drizzle mantém propriedade TypeScript `createdAt`, mapeada para
   `timestamp("created_at")`.
3. `server/db.ts` ordena/filtra por `created_at` e mapeia o registro retornado
   para o contrato camelCase consumido pelo frontend.
4. Revisar inserts, métricas, GDPR e detalhes de geração para a mesma coluna.
5. Validar a migração contra o schema real antes de aplicá-la.

### Logging operacional

- `httpStatusFileLogger` registra somente `statusCode >= 400`.
- Não registrar 304, redirects normais ou assets do Vite.
- Manter redaction existente.
- Adicionar limite/rotação para impedir crescimento ilimitado.
- Não registrar data URIs, payloads de imagem ou tokens completos.

### Geração de background

- Preservar a refatoração OpenRouter/Pollinations em commit independente.
- Manter validação de assinatura binária e testes de fallback.
- Não acoplar essa entrega ao snapshot ou ao motor de interação.

## 13. Matriz obrigatória de testes browser

Executar para cada família de elemento aplicável:

| Dimensão | Casos |
| --- | --- |
| Formato | 1:1, 5:6, 9:16 |
| Escala visual | 0,5; 0,75; 1; 1,5; 2 |
| Documento | estático; carrossel |
| Escopo | current; all |
| Input | mouse; touch/pointer |
| Elemento | headline, body, decoração, section, card, texto livre, imagem livre |
| Gesto | click, drag curto, drag longo, resize, saída/retorno ao canvas |
| Cancelamento | Escape, pointercancel, unmount, troca de slide, troca de formato |

Critérios mensuráveis:

- salto inicial máximo de 1 px de tela;
- erro do grip point máximo de 1 px de tela;
- zero mutações autoritativas durante pointermove;
- exatamente um commit por gesto;
- zero commit em cancelamento;
- zero layout reads após início do gesto;
- frame p95 abaixo de 16,7 ms na fixture de referência;
- nenhuma guia, handle ou controle no PNG;
- geometria correta após save/reload;
- nenhum vazamento entre slides ou formatos.

## 14. Testes automatizados mínimos a adicionar

### Contrato/store

- Vazamento de `textElements` reproduzido e corrigido.
- Todos os campos visuais em current/all.
- Migração v1/v2/v3 e idempotência.
- Restore de snapshot inválido.
- No-op mantém identidade.

### Integração React

- Descriptor atualizado é removido no unmount.
- Target desmontado cancela interação.
- Handle não perde seleção no pointerdown.
- Resize de imagem é proporcional e determinístico.
- Texto rotacionado com auto não salta.
- Overlay não mede DOM por frame.

### Exportação

- Aguarda fontes/imagens.
- Timeout libera UI.
- PNG possui dimensões corretas.
- PNG não contém overlays.

### Histórico e guias

- Um comando por gesto.
- Redo invalidado por nova ação.
- Snap independente por eixo.
- Histerese e Alt.
- Candidatos limitados ao slide atual.

## 15. Definition of Done global

A recuperação só estará concluída quando:

1. Todos os P0/P1 tiverem teste de regressão e correção aprovada.
2. Typecheck, suíte completa e `git diff --check` estiverem verdes.
3. A matriz browser tiver relatório com evidências por formato.
4. Exportação produzir e validar PNG real.
5. Save/reload e SavedPosts preservarem snapshot v3.
6. Undo/redo operarem sobre transações.
7. Smart guides substituírem a grade fixa.
8. Histórico de gerações carregar no ambiente real.
9. Nenhum log por frame/render permanecer.
10. `DOCUMENTO_MESTRE.md` descrever o comportamento efetivo, não a intenção.
11. Não existirem dois motores, dois normalizadores ou duas fontes persistíveis.

## 16. Quadro de progresso a ser mantido pela execução

| Entrega | Estado inicial | Evidência exigida |
| --- | --- | --- |
| 0 — Baseline e separação | Não iniciada | checkpoint, testes vermelhos e commits isolados |
| 1 — Integridade v2 | Não iniciada | contratos e round-trip sem vazamento |
| 2 — Interação estável | Não iniciada | matriz drag/resize e métricas |
| 3 — Renderer/export | Não iniciada | PNG real e paridade visual |
| 4 — Snapshot v3 | Não iniciada | migração e layouts por formato |
| 5 — Histórico | Não iniciada | undo/redo transacional |
| 6 — Smart guides | Não iniciada | snap/histerese/Alt |
| 7 — Contratos operacionais | Não iniciada | History e logging validados |

Estados permitidos: `Não iniciada`, `Em andamento`, `Bloqueada com evidência`,
`Em validação` e `Concluída`. Nunca usar `Concluída` com gate browser pendente.

