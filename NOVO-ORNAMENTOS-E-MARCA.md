# NOVO — Ornamentos e Identidade de Marca

> Auxiliar de [NOVO-MOTOR-VISUAL.md](NOVO-MOTOR-VISUAL.md). Descreve badge,
> sticker, elementos decorativos e como a marca aparece no post.

## Regra central

> **O LLM não decide ornamento visual. Ornamento nasce vazio.**

`copyAngle` é um objeto de **estratégia de copy** (qual ângulo de persuasão).
Ele carregava dois campos visuais — `badge` e `stickerText` — que não têm nada a
ver com estratégia. Isso foi removido em 2026-08.

## Badge e sticker

### Estado atual

O schema que o LLM recebe
([generationOrchestrator.ts](server/ai/generationOrchestrator.ts)) pede apenas:

```ts
copyAngle: { type, label }   // badge e stickerText NÃO estão no schema
```

`buildComposition` preenche ambos com `""`. O render já é silencioso com string
vazia:

- `renderTopBar`: `if (!copyAngle?.badge || compact) return null;`
- `renderBottomBar`: `const hasSticker = Boolean(copyAngle?.stickerText)`

**Resultado:** 0 de 36 combinações família×proporção renderizam badge ou sticker
automaticamente.

### Por que foram removidos

O badge era gerado dentro de `copyAngle`, um contexto que **não tem o nome da
marca**. O LLM fazia a única coisa possível: extraía uma palavra da copy que ele
mesmo acabara de escrever.

Caso real que motivou a mudança:

```
headline: "Escolha verduras frescas com confiança"
badge:    "Confiança"          ← eco da última palavra do headline
sticker:  "SEGURO"             ← sinônimo da mesma ideia
```

Três camadas dizendo a mesma coisa. E não por acaso — **por construção**.

Agravante: o card em questão (`mosaic-grid`, template estruturado) já tinha
headline + 3 labels + 3 descrições. Badge e sticker eram a 9ª e 10ª unidade de
texto competindo por atenção. Das 12 famílias, apenas **duas** mostram badge *e*
sticker (`brutal-split` e `mosaic-grid`) — e uma delas é justamente a que carrega
mais conteúdo. Estava invertido.

### Entrada manual (preservada)

O usuário pode preencher quando quiser, em dois lugares que já existiam:

- `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx` — inputs
  "Badge (ex: FOCO)" e "Sticker (ex: UAU!)"
- `client/src/components/CopyEditorPanel.tsx` — editor completo de copyAngle,
  com templates por ângulo (`client/src/lib/copyAngleTemplates.ts`)

Verificado: entrada manual sobrevive à composição e **respeita a curadoria da
família** (ver tabela abaixo). Ex.: digitar um sticker numa família com
`sticker: "hide"` não o faz aparecer — a família decide onde o ornamento pode viver.

## Curadoria por família

Cada família declara `ornaments` em `compose()`. `keep` = pode renderizar se
houver conteúdo; `hide` = move para `creativeDirection.hiddenOrnaments` e
esvazia.

| Família | badge | sticker | accentBar | body |
|---|---|---|---|---|
| editorial-poster | keep | hide | keep | — |
| chromatic-block | hide | keep | hide | — |
| brutal-split | keep | keep | hide | **hide** |
| glitch-signal | hide | hide | hide | — |
| glass-veil | keep | hide | hide | — |
| kinetic-type | hide | keep | hide | — |
| data-punch | keep | hide | keep | **hide** |
| versus | keep | hide | hide | **hide** |
| quote-authority | hide | hide | hide | — |
| minimal-air | keep | hide | keep | — |
| mosaic-grid | keep | keep | hide | **hide** |
| duotone-wash | hide | keep | keep | — |

`body: "hide"` existe para famílias headline-only, que não têm orçamento vertical
para um bloco de body. O texto **não é perdido** — vai para
`hiddenOrnaments.body` e continua na caption. `hasRequiredCopy`
([validation.ts](shared/validation.ts)) aceita body vazio quando existe no stash.

## Identidade de marca real

A marca **não** é o badge. É `brandMeta`:

```ts
brandMeta?: { logoUrl?: string; brandName?: string; favicon?: string }
```

- **Populado** por `server/brandThemeGenerator.ts` a partir do `BrandDNA`
  extraído do site do usuário
- **Renderizado** por `<BrandOverlay logoUrl brandName ... />` em
  `PostCardV2.tsx`

Existiam dois sistemas paralelos de marca no card: um real (`brandMeta` → logo +
nome, do site do usuário) e um inventado (`copyAngle.badge` → palavra ecoando a
copy). O segundo não era uma versão pobre do primeiro — era um impostor ocupando
o mesmo espaço conceitual. Foi removido.

## Elementos decorativos `cd-*` — pendência conhecida

Quatro famílias criam `textElements` decorativos que leem o stash de ornamentos,
com fallback hardcoded:

| Família | Elemento | Fallback | Avaliação |
|---|---|---|---|
| editorial-poster | `cd-kicker` | `"EDITORIAL"` | Texto-como-decoração, sem informação |
| chromatic-block | `cd-sticker-rot` | `"NOVO"` | Idem |
| glitch-signal | `cd-scanline-tag` | `"//SYS"` | Idem |
| quote-authority | `cd-attribution` | `"AUTORIDADE"` | **Legítimo** — atribuição de citação é informação real, mas bebendo da fonte errada |

**Importante:** esses fallbacks **já eram** o comportamento real antes da remoção
do badge/sticker. Verificado por sonda: em geração fresca,
`creativeDirection.hiddenOrnaments` está vazio (o `compose` lê o stash da
variação de *entrada*, e `directCreative` nunca o preenche), então o `||` sempre
caía no hardcoded. A remoção do badge/sticker **não regrediu** nada aqui.

**Encaminhamento decidido, ainda não implementado:**

- `cd-kicker`, `cd-sticker-rot`, `cd-scanline-tag` → remover. São texto sem
  informação, repetido idêntico em todo post da família. Pode ser que a
  composição peça uma forma geométrica no lugar — decidir com o visual na mão.
- `cd-attribution` (quote-authority) → manter, mas alimentar de
  `brandMeta.brandName`. Atribuir a citação à marca é informação real. Omitir
  quando não houver marca.

## Ao adicionar um ornamento novo

1. Declare em `FamilyOutput.ornaments` (`shared/creative/types.ts`)
2. Trate `keep`/`hide` em `composeVariation` (`shared/creative/compose.ts`),
   guardando o valor em `creativeDirection.hiddenOrnaments`
3. Garanta que o render seja **silencioso com valor vazio**
4. Se ele ocupar espaço no canvas, ele precisa de geometria declarada —
   ver [NOVO-GEOMETRIA-E-TIPOGRAFIA.md](NOVO-GEOMETRIA-E-TIPOGRAFIA.md)

E a pergunta que deve vir antes de tudo: **esse elemento carrega informação que o
post ainda não tem?** Se a resposta for não, ele é ruído — independente de quão
bonito seja o desenho.
