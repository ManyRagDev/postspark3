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

## 3. Backend ainda nao registra flags visuais

O gate roda no boundary do cliente (`createPostVisualSnapshot`). O backend segue
validando apenas campos, diversidade, sections/slides e contraste textual.

Verificar depois:

- adicionar resumo visual ao `generationTrace` quando um fallback for aplicado;
- decidir se `post.generate` deve receber um passo pos-composicao server-side
  ou manter o gate no cliente por depender de renderer.

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
