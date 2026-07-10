# Backlog pos-testes: renderizacao de posts

Data: 2026-07-08

Itens descobertos durante a implementacao das correcoes da auditoria.

## 1. Coordenadas manuais de `textElements` ainda usam pixels reais no Workbench

O preview/export agora escala `textElements` gerados a partir do documento logico
360x360, mas o modo `edit` foi mantido com `scale=1` para nao quebrar o motor de
drag atual.

Motivo:

- `AdvancedTextNode` renderiza elementos em coordenadas escaladas.
- `textElementFromCommit` grava commits de drag/resize em pixels reais.
- Se o modo edit tambem escalasse, um drag manual poderia gravar coordenadas
reais e depois sofrer escala novamente.

Verificar depois:

- decidir se o contrato futuro dos `textElements` sera percentual, 360-space ou
  pixel real;
- atualizar `readTextGeometry` / `textElementFromCommit` para converter entre
  espaco renderizado e espaco persistido;
- migrar snapshots antigos se o contrato mudar.

## 2. Gate visual atual e heuristico, nao mede DOM real

`visualFitValidator` estima caixas de texto com base em comprimento, largura e
aspect ratio. Ele resolve a classe de erro mais comum sem depender do browser,
mas nao substitui uma medicao real de DOM.

Verificar depois:

- adicionar validacao com Playwright/happy-dom para fixtures reais;
- medir `getBoundingClientRect` de headline/body/sections/card/textElements;
- comparar contra screenshots de HoloDeck e Workbench.

## 3. Backend registra fit visual apenas no shadow graph

O gate canonico agora tambem pode rodar no backend quando `AI_GRAPH_SHADOW=true`:
o shadow graph cria `PostVisualSnapshot` via `shared/variationSnapshot` e roda
`validateVisualFit`. No caminho normal sem shadow, o backend segue retornando o
output legado sem bloquear por fit visual.

Verificar depois:

- transformar os eventos `generation_graph_shadow` em metricas agregadas;
- decidir quando o fit visual deixa de ser auditoria shadow e passa a bloquear o
  caminho principal;
- registrar no `generationMeta` quando um fallback visual foi aplicado.

## 4. `generationMeta` nao tem campo para telemetria visual

Durante a implementacao, evitei gravar `visualFit` em `generationMeta` porque o
contrato compartilhado nao declara esse campo.

Verificar depois:

- criar um campo tipado para diagnosticos visuais se essa telemetria for
  persistida;
- decidir se isso exige incremento de `snapshotVersion`.

## 5. Falhas pendentes no motor de interacao

A auditoria anterior encontrou 7 falhas em
`client/src/editor/interaction/interaction.test.ts` relacionadas a slop, snap e
click.

Verificar depois:

- corrigir slop independente de zoom;
- corrigir snap esperado (`x=70` vs `x=72`);
- impedir commit quando movimento deveria ser click.

## 6. Conferir seletor de familia visual em cenarios sem `creativeDirection`

`adaptContentForFamily` agora cria uma `creativeDirection` deterministica quando
ela esta ausente e depois força `familyId`.

Verificar depois:

- testar uma variacao restaurada antiga sem `creativeDirection`;
- testar troca repetida de familia no HoloDeck;
- confirmar que cores, layout manual e imagem do usuario continuam preservados.

## 7. Redesenhar edicao do card inteiro sem recriar wrapper visual

`PostCardV2` agora usa `ThemeRenderer` com `wrapContentInCard=false` para evitar
o "quadro dentro do canvas". Com isso, `cardLayout` e `isEditingCard` deixam de
criar o `DraggableBlock` interno nesse fluxo.

Motivo:

- o layout renderizado por `PostCardV2` ja e o documento visual completo;
- embrulhar esse documento em `.inner-card-layer` cria uma segunda moldura com
  background, border radius e clipping;
- reativar o drag do card inteiro nesse ponto traria de volta a duplicacao.

Verificar depois:

- decidir se ainda existe necessidade real de mover/redimensionar o card inteiro;
- se existir, implementar essa interacao no canvas externo ou no snapshot
  canonico, sem criar uma segunda camada visual;
- remover `cardLayout` do caminho de render se for confirmado que a funcao nao
  e mais usada pelo produto.

## 8. Validar visualmente todos os templates estruturados em DOM real

Foi corrigida uma causa global de overlap: `DraggableBlock` nao fixa mais a
pegada de fluxo fora de drag, e `PostCardV2` agora aplica os clamps calculados
por `useTextAutoFit`.

Verificar depois:

- gerar fixtures para `feature-grid`, `numbered-list` e `step-by-step` em
  `1:1`, `5:6` e `9:16`;
- medir no browser se headline, body, badge, sticker e sections nao se
  sobrepoem;
- confirmar que a primeira interacao de drag ainda preserva o espaco do bloco;
- decidir se templates estruturados devem ganhar um layout dedicado separado dos
  layouts esteticos (`centered`, `split`, `modern-card`).

## 9. Criar score de direcao de arte pos-composicao

Os gates atuais agora rejeitam incoerencia numerica em posts estruturados e
melhoram microcopy/legibilidade, mas ainda nao existe um ranking estetico real
apos `composeVariation`.

Verificar depois:

- renderizar cada variacao candidata em browser/headless antes de aprovar;
- medir areas ocupadas, respiro, contraste local, tamanho minimo de texto,
  densidade de ornamentos e equilibrio de hierarquia;
- atribuir score de direcao de arte separado de `visualReadability`;
- usar esse score para escolher/revisar familias criativas, tokens e templates
  antes de mostrar no HoloDeck.

## 10. Remover duplicatas locais apos extracao para `shared/` — resolvido em 2026-07-10

Neste primeiro corte da Fase 0, o caminho executado passou a usar
`shared/validation`, mas algumas funcoes locais antigas permaneceram no arquivo
por diferencas de encoding que tornam patches textuais arriscados.

Resolvido (verificação em auditoria de 2026-07-10, DOCUMENTO_MESTRE §67.4):

- `applyDeterministicCopyGuards` local de `server/routers.ts`: removido. O
  router importa a função de `@shared/validation`.
- `advertisedItemCounts` local de `server/ai/postEvaluation.ts`: removido. O
  módulo importa de `@shared/validation`.
- Wrappers internos inutilizados em `client/src/lib/variationSnapshot.ts`: não
  existem mais. O arquivo só mantém `buildVariationSnapshot` (legitimamente
  local, depende de `EditorState`) e re-exports de `@shared/variationSnapshot`.

Pendência remanescente (menor):

- Considerar normalizar o encoding dos arquivos mais antigos antes de novos
  refactors grandes, para reduzir o risco de patches textuais.

## 11. Confirmar capacidade real de replay do `generationTrace` — resolvido no corte 2026-07-08

O blueprint assume que o shadow mode da Fase 1 pode reaproveitar artefatos do
`generationTrace` sem chamar LLM de novo. A auditoria confirmou que a premissa
nao estava atendida pelo formato persistido anterior, porque `prompt_snapshot`
removia `messages` e `response`.

Implementado:

- `promptSnapshot.version = 2`;
- `promptSnapshot.replayable = false` por padrao, sem persistir conteudo sensivel;
- com `AI_TRACE_STORE_CONTENT=true`, `promptSnapshot.calls[]` inclui `messages`
  e `response`, permitindo replay offline sem nova chamada de LLM.

Pendencia residual:

- a Fase 1 ainda precisa implementar o runner/replay reader que consumira esse
  formato versionado.

## 12. Conectar shadow graph ao `post.generate` — expandido no corte 2026-07-09

O runner generico (`shared/graphEngine.ts`) e o replay reader
(`server/ai/generationGraph/replay.ts`) ja existem. O primeiro shadow graph foi
conectado ao `post.generate` atras de `AI_GRAPH_SHADOW`.

Implementado (corte 2026-07-08):

- `server/ai/generationGraph/shadow.ts` roda replay/schema audit sem LLM;
- registra `generation_graph_shadow` em `generationTrace.events`;
- nao altera a resposta do usuario;
- `AI_GRAPH_PIPELINE` segue reservado e desligado.

Expansao implementada (corte 2026-07-09):

- Shadow graph expandido de 3 para 6 nos deterministicos:
  ```
  replay_audit -> schema_validation -> copy_validation -> sections_validation
  -> copy_guards -> visual_fit_validation -> completed
  ```
- `copy_validation` audita completude de copy (headline, body, caption, CTA,
  imagePrompt)
- `sections_validation` audita templates estruturados (3 secoes validas,
  coerencia numero vs secoes)
- `copy_guards` aplica truncamentos determinísticos e registra alteracoes
- Metricas agregadas capturam taxa de falha de copy/estrutura em producao
- Teste adicional `detects copy and sections validation failures` valida deteccao
  de falhas

Proximo passo:

- implementar infraestrutura de metricas agregadas do shadow graph para baseline
  de paridade (corte 2026-07-09):
  - criado `ShadowGraphMetrics` com metricas especificas de divergencia
  - implementado `extractShadowGraphEvents` e `calculateShadowGraphMetrics`
  - expandido `getGenerationOperationalMetrics` para incluir `shadowGraph`
  - adicionados 10 testes em `server/db.test.ts`
- proximo passo tecnico: adicionar persistencia de events em `generation_runs`
  (tabela `generation_events` ou coluna `events`) para analise historica completa;
- manter `AI_GRAPH_PIPELINE` desligado ate houver baseline de paridade estabelecida.
