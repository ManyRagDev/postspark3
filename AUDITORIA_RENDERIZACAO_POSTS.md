# Auditoria tecnica: renderizacao e geracao visual dos posts

Data: 2026-07-08

## Escopo

Auditoria do fluxo que transforma `post.generate` em posts renderizados no HoloDeck/Workbench:

```text
server/routers.ts post.generate
  -> LLM gera PostVariation + aspectRatioOptimizations
  -> evaluateAndReviseCandidates valida copy/contraste textual
  -> caption synthesis
  -> composeVariation injeta motor criativo
  -> Home/HoloDeck chama createPostVisualSnapshot
  -> PostRenderer -> PostCardV2 -> ThemeRenderer/DraggableBlock/AdvancedTextNode
```

Tambem foram consideradas as duas imagens anexadas pelo operador, que mostram:

- headline/body sobrepostos;
- blocos absolutos cortados;
- card interno espremido/clippado;
- elementos decorativos fora de escala ou atravessando conteudo.

## Martelo batido

A causa definitiva nao e "o modelo gerou texto ruim". A causa e contratual/geometrica:

1. O pipeline aceita layouts sem uma validacao final de renderizacao.
2. A IA e o motor criativo escrevem geometria em um contrato que depende de altura real de texto, fonte, aspect ratio e camada de card, mas essa altura real so existe no browser.
3. A avaliacao do servidor aprova o candidato antes da composicao criativa final e mede apenas dimensoes textuais/contraste, nao bounding boxes, clipping, overlap, z-index ou escala.
4. O renderer aplica duas camadas de layout (`PostCardV2` e `ThemeRenderer`) com `overflow:hidden`; quando `card.width`, `layoutSettings`, `headlineFontSize`, sections e `textElements` entram em combinacoes ruins, o post fica formalmente valido e visualmente quebrado.

Portanto, a causa raiz e ausencia de um contrato visual verificavel de ponta a ponta. O sistema tem normalizadores e guardas parciais, mas nao tem uma prova final de que o snapshot renderizado cabe e nao se sobrepoe.

## Evidencias no codigo

### 1. O backend valida conteudo, nao layout renderizado

`server/ai/generationValidation.ts` valida quantidade de variacoes, campos obrigatorios, copy angle, sections e slides. Nao ha validacao de geometria, clipping, escala, area util ou colisao visual.

`server/ai/postEvaluation.ts` calcula `visualReadability` por contraste entre `textColor` e `backgroundColor`. Isso nao detecta texto em cima de texto, card espremido, texto fora da caixa ou elements em pixels absolutos.

### 2. A composicao criativa roda depois da avaliacao

Em `server/routers.ts`, a sequencia relevante e:

1. LLM gera variacoes.
2. `evaluateAndReviseCandidates` revisa candidatos.
3. caption synthesis roda.
4. `composeVariation` injeta familia criativa, `layoutSettings`, `textElements`, fontes e multiplicadores.
5. `validateVariationSet` roda, mas sem validacao visual.

Isso significa que o visual final do usuario nao e o mesmo objeto avaliado pelo judge de qualidade.

### 3. O normalizador atual corrige parte do problema, mas e uma rede de protecao parcial

`client/src/lib/variationSnapshot.ts` ja implementa saneamento importante:

- `formatOptimizationToLayoutSettings` recebe contexto de headline/body/template/aspect ratio;
- templates estruturados deixam de usar coordenadas absolutas da IA;
- headline/body simples usam estimativa de altura;
- card com largura abaixo de 45 volta para fluxo;
- `layoutSettingsByAspectRatio` tem precedencia sobre IA por ser edicao manual.

Essas defesas atacam os sintomas dos prints, mas continuam sem medir o DOM real. A estimativa usa constantes de referencia; o browser ainda pode quebrar diferente por fonte carregada, card interno, multiplicador de fonte, width real, linha, padding e template.

### 4. `ThemeRenderer` introduz uma segunda camada de card com clipping duro

`PostCardV2` sempre passa `layoutSettings.card` para `ThemeRenderer` quando ha `designTokens`.

`ThemeRenderer` renderiza um `DraggableBlock` para o card e dentro dele uma camada `inner-card-layer` com:

- `width: 100%`;
- `height: 100%`;
- `overflow: hidden`.

Quando a IA ou o normalizador produzem card estreito, ou quando a familia criativa injeta tipografia grande, o clipping e inevitavel. O segundo print mostra exatamente esse padrao: um card estreito com texto grande sendo cortado.

### 5. `textElements` ainda vivem em sistema de coordenadas inconsistente

`shared/creative/compose.ts` usa um documento logico fixo de 360x360 para criar elementos decorativos.

`client/src/components/views/WorkbenchV2/PostCardV2.tsx` renderiza esses elementos com `scale={1}` via `AdvancedTextNode`.

Resultado: o mesmo `textElement` que foi criado em coordenadas 360-space e renderizado como pixel real muda de proporcao quando o card tem 200px, 320px, 360px, 5:6 ou 9:16. Isso explica elementos decorativos fora de escala e atravessando conteudo.

### 6. Ha um erro secundario no seletor de familia visual

`client/src/lib/adaptContentForFamily.ts` chama:

```ts
composeVariation(variation, newCreativeDir as any)
```

Mas o segundo parametro de `composeVariation` e `brandTokens`, nao a nova direcao criativa. Alem disso, como `variation.creativeDirection` ja existe, `composeVariation` nao substitui a familia antes de compor.

Isso nao e a causa dos prints iniciais, mas afeta o botao "Estilo visual" e confirma fragilidade de contrato entre motor criativo e snapshot.

## Grafo de relacionamento relevante

```text
post.generate
  -> variationSchema / aspectRatioOptimizations
  -> evaluateAndReviseCandidates
      -> postEvaluation.visualReadability = contraste textual
  -> synthesizeCaptionsForVariations
  -> composeVariation
      -> FAMILIES
      -> layoutSettings
      -> textElements em 360x360
      -> designTokens
  -> validateVariationSet
      -> campos/quantidade/diversidade, sem layout visual
  -> Home/HoloDeck
      -> createPostVisualSnapshot
          -> formatOptimizationToLayoutSettings
          -> guards estimados
  -> PostRenderer
      -> projectSnapshotForSlide
      -> PostCardV2
          -> useTextAutoFit
          -> DraggableBlock headline/body/sections
          -> AdvancedTextNode scale=1
          -> ThemeRenderer
              -> DraggableBlock card
              -> inner-card-layer overflow:hidden
```

## Validacoes executadas

Passaram:

```text
node_modules/.bin/pnpm.cmd exec tsc --noEmit
node_modules/.bin/pnpm.cmd exec vitest run client/src/lib/variationSnapshot.test.ts client/src/store/editorStore.test.ts client/src/components/canvas/DraggableBlock.test.ts server/ai/generationValidation.test.ts
```

Resultado dos testes focados: 4 arquivos, 52 testes passando.

Falhou:

```text
node_modules/.bin/pnpm.cmd test
```

Resultado geral: 34 arquivos passaram, 1 arquivo falhou. Falhas em `client/src/editor/interaction/interaction.test.ts`:

- 5 falhas de slop independente de zoom;
- 1 falha de snap que esperava `x=70` e recebeu `x=72`;
- 1 falha de movimento abaixo do slop tratado como `committed` em vez de `click`.

Essas falhas nao explicam diretamente os prints de geracao, mas sao relevantes para o Workbench porque o mesmo motor governa drag/resize e pode dificultar correcao manual de layout.

## Conclusao

Martelo batido: posts horriveis aparecem porque o sistema aprova e renderiza snapshots sem uma etapa final de validacao visual real. O objeto passa em schemas e testes unitarios, mas nenhuma camada mede o DOM final para garantir:

- headline/body sem overlap;
- sections sem cruzar blocos absolutos;
- card sem clipping;
- texto dentro da area util;
- `textElements` escalados pelo tamanho real do canvas;
- comportamento consistente entre 1:1, 5:6 e 9:16.

As correcoes atuais em `variationSnapshot.ts` mitigam a classe de erro vista nos prints, mas ainda sao heuristicas. A solucao estrutural e criar um "visual fit gate" apos a composicao criativa e antes de exibir/salvar: renderizar o snapshot em ambiente de teste/browser, medir bounding boxes reais e rejeitar ou reflowar layouts com overlap/clipping.

## Recomendacao tecnica

Prioridade 1:

- mover a validacao visual para depois de `composeVariation`;
- criar `validateVisualSnapshotFit(snapshot, aspectRatio)` com medicoes reais ou aproximacao DOM via Playwright/happy-dom quando possivel;
- aplicar fallback deterministico para layout de fluxo quando houver overlap ou clipping;
- adicionar teste de regressao com fixture equivalente aos prints anexados.

Prioridade 2:

- unificar o espaco de coordenadas dos `textElements` para percentual/canvas logico ou aplicar escala real no renderer;
- corrigir `adaptContentForFamily` para trocar `creativeDirection.familyId` antes de chamar `composeVariation` e passar `brandTokens` reais;
- ampliar `generationValidation` para registrar flags visuais, mesmo que a rejeicao final fique no cliente.

Prioridade 3:

- corrigir as falhas do controlador de interacao (`interaction.test.ts`) para estabilizar drag/snap/click no Workbench.
