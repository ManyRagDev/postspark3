# NOVO — Geometria e Tipografia

> Auxiliar de [NOVO-MOTOR-VISUAL.md](NOVO-MOTOR-VISUAL.md). Descreve o contrato
> central: como posição e tamanho de cada bloco de texto são decididos.

## Sistema de coordenadas

Documento canônico de **360 px de largura**. Altura derivada da proporção
(`1:1` → 360, `5:6` → 432, `9:16` → 640).

Três lugares precisam concordar com esse número, ou a caixa medida no servidor
não bate com o que o cliente desenha:

- `shared/typography/resolve.ts` → `CANONICAL_CANVAS_WIDTH`
- `shared/visualFit.ts` → `REFERENCE_CANVAS_WIDTH`
- `client/.../CanvasWorkspace.tsx` → `POST_BASE_WIDTH`

`freePosition.x` / `freePosition.y` são sempre o **centro** do bloco — contrato do
renderer, que aplica `translate(-50%, -50%)`.
Todos os valores em **% do canvas**.

## O contrato de slot

```ts
{
  position: "top-left" | "center" | ...,  // posição simbólica (legado v1-v3)
  textAlign: "left" | "center" | "right",
  freePosition: { x, y },                 // CENTRO do bloco, em % do canvas
  width: number,                          // % do canvas
  height: number,                         // % do canvas
}
```

**`freePosition` + `width` + `height` andam juntos, sempre.** Um slot com
`freePosition` mas sem `height` faz `resolveBlock`
([resolve.ts:67](shared/typography/resolve.ts:67)) lançar `missing-geometry`, o
snapshot perde `resolvedTypography` e o cliente cai no dimensionamento por
contagem de caractere — o caminho que sobrepõe texto.

## Arquétipos — nunca invente geometria à mão

`shared/creative/layoutArchetypes.ts` já garante o contrato acima. Use sempre:

| Função | Uso |
|---|---|
| `stack()` | Pilha vertical a partir de um topo declarado |
| `centeredStack()` | Pilha centrada no canvas (ou em `yCenterPercent`) |
| `posterBottom()` | Bloco ancorado perto da base |
| `split()` | Duas colunas — uma para imagem, outra para texto |
| `sectionGrid()` | Grade horizontal de N caixas (feature-grid) |
| `safeAreaMarginsPercent()` | Margens seguras por proporção (9:16 tem rodapé maior — zona de UI do Instagram) |

### Constantes calibradas — use, não invente número

Em [families.ts:17-30](shared/creative/families.ts:17):

```ts
HEADLINE_HEIGHT_PCT.compact  // 4 linhas no piso  → 1:1=33  5:6=28  9:16=19
HEADLINE_HEIGHT_PCT.display  // 5 linhas no piso  → 1:1=41  5:6=34  9:16=23
HEADLINE_HEIGHT_PCT.mono     // 6 linhas no piso  → 1:1=49  5:6=41  9:16=28
BODY_HEIGHT_PCT.standard     //                   → 1:1=24  5:6=20  9:16=14
GAP_PCT = 6                  // >= MIN_TEXT_GAP (4) COM folga real — ver nota abaixo
BOTTOM_MARGIN_PCT            //                   → 1:1=6   5:6=6   9:16=13
HEADLINE_TOP_ANCHOR          // yCenterPercent de headline ancorado no topo (versus, mosaic-grid) → 1:1=26  5:6=23  9:16=20
```

Vieram do pior caso do corpus (texto quebrado no piso de legibilidade) com margem
de segurança. Reduzir qualquer uma reintroduz corte de texto.

**Margem precisa ter folga real, não só satisfazer `>=`.** `GAP_PCT` já passou por
2 → 4 → 6. Em 4 ele satisfazia `>= MIN_TEXT_GAP` (`shared/visualFit.ts`) mas
ficava **exatamente** no limite — testes automatizados passavam, mas a
renderização real (posts nativos numa proporção) mostrava sobreposição visível.
Mesma razão de `RESOLUTION_WIDTH_SAFETY = 0.96` existir para largura: medição e
render nunca batem 100%. Qualquer nova constante de gap/margem precisa de folga
de verdade acima do mínimo teórico (aqui, 50%), não só cruzar a linha.

## A regra absoluto × fluxo

Esta é a causa raiz dos dois defeitos de sobreposição que corrigimos em 2026-08.

O shell de um bloco absoluto usa `display: contents`
([DraggableBlock.tsx:200](client/src/components/canvas/DraggableBlock.tsx:200)):

```ts
const reservedFlowFootprint = flowFootprint && (!isAbsolute || isDragging) ? flowFootprint : null;
// isAbsolute && !isDragging  →  null  →  display: contents  →  footprint ZERO
```

Um bloco absoluto **não ocupa espaço de fluxo**. Qualquer coisa que flua no mesmo
container começa do topo e passa por baixo dele.

**Portanto, em um mesmo container, ou tudo é absoluto, ou tudo flui.**

Isto vale para três pares, e todos os três já quebraram na prática:

| Par | Estado |
|---|---|
| headline absoluto × body em fluxo | Corrigido — famílias declaram `bodyHeightPercent`, ou `ornaments.body: "hide"` |
| headline absoluto × seções em fluxo | Corrigido — `versus`/`mosaic-grid` declaram `sectionLayouts` via `sectionGrid()` |
| headline absoluto × textElements decorativos | Conhecido, tolerado — `cd-*` sobrepõem por desenho (glitch, kinetic) |
| geometria de uma proporção × canvas de outra | Corrigido — ver "Geometria por proporção" abaixo. Mesma família de bug: um bloco calibrado para um contexto sendo usado literalmente noutro |

### Os dois invariantes que impedem a regressão

Em [compose.ts](shared/creative/compose.ts), no fim de `composeVariation`:

```ts
// 1. Família sem suporte a seções nunca renderiza seções (demoção de segurança)
if (!family.fit.needsSections && (composed.sections?.length ?? 0) > 0) {
  composed.template = "simple";
  composed.sections = undefined;
}

// 2. Headline absoluto + body em fluxo com texto = erro de AUTORIA de família
if (!isStructured && ls?.headline?.freePosition && !ls?.body?.freePosition && body.trim()) {
  throw new Error(...);
}
```

O `throw` é deliberado: é um erro de autoria, pego em teste, nunca em produção
com input de usuário.

## Geometria por proporção

O post é gerado numa proporção (`variation.aspectRatio`), mas o usuário troca
de proporção no HoloDeck/Workbench sem regerar. `composeVariation`
([compose.ts](shared/creative/compose.ts)) chama `family.compose()` até 3
vezes — uma por proporção (`"1:1"`, `"5:6"`, `"9:16"`), cada uma com seu
próprio `ctx.doc.height` e uma seed `mulberry32(dir.seed)` **fresca** (mesma
sequência pseudoaleatória nas 3 chamadas, para que `splitImagePosition`/
rotação de sticker saiam idênticos — só a geometria calibrada por `ar` deve
variar) — e guarda os 3 resultados em `variation.layoutSettingsByAspectRatio`.

`normalizeLayoutSettings` ([variationSnapshot.ts](shared/variationSnapshot.ts))
lê esse campo com prioridade sobre `variation.layoutSettings` (que é só a
proporção de composição, congelada) sempre que a proporção pedida for
diferente da nativa do objeto:

```ts
const selected =
  sameRatioSnapshotLayout ??                       // objeto já é ESTA proporção — respeita edição ao vivo
  variation.layoutSettingsByAspectRatio?.[aspectRatio] ??  // proporção DIFERENTE — usa a calibrada
  variation.layoutSettings ??                       // fallback para dado legado sem o campo
  fromArOpt ??
  layoutToAdvanced(variation.layout);
```

**Cuidado ao mexer no check `sameRatioSnapshotLayout`:** ele compara
`variation.aspectRatio === aspectRatio`, mas `createPostVisualSnapshot` já
sobrescreveu `.aspectRatio` (via `applyAspectRatioToVariation`) antes desse
ponto. Se comparar contra o valor JÁ sobrescrito, a comparação vira tautologia
e este ramo sempre vence — capture a proporção original **antes** de chamar
`applyAspectRatioToVariation` (feito em `createPostVisualSnapshot` via
`originalAspectRatio`).

## Resolução tipográfica

`resolveTypography` ([resolve.ts:161](shared/typography/resolve.ts:161)) mede o
texto com a **fonte real** (fontkit) e decide `fontSize`/`lineHeight`/quebras que
cabem na caixa declarada. Nunca corta texto: se não couber, lança
`TypographyResolutionError` estruturado.

Razões de falha: `missing-font`, `missing-geometry`, `unbreakable-word`, `below-floor`.

**Escopo importante:** a resolução é **por bloco**. Ela prova que *o texto cabe na
caixa dele* — **não** prova que as caixas não colidem entre si. Confundir as duas
coisas foi um erro real: o guard `geometryIsAuthoritative` em `visualFit.ts` usa
`resolvedTypography` como procuração de "geometria está correta", o que não é
verdade. Colisão entre blocos é responsabilidade de `validateVisualFit`.

### Medição de largura com margem

`RESOLUTION_WIDTH_SAFETY = 0.96` — a resolução mede contra 96% da largura
declarada. O browser renderiza a fonte *carregada* (Google Fonts), não a do
registro; a divergência provada é <3%, e uma linha medida a 100% poderia estourar
e adicionar uma linha no browser.

### Fontes

10 arquivos `.ttf` versionados em `shared/typography/fonts/files/`.
`fontkit` é dependência de **produção**. `vercel.json` inclui as fontes no bundle
da função via `includeFiles`. O servidor loga `TYPOGRAPHY_FONTS_MISSING` no boot
se faltar alguma.

`FONT_DIR` resolve por candidatos (registry.ts) porque após o esbuild o módulo vive
dentro de `api/index.js` e `import.meta.url` aponta para o lugar errado.

## Validação geométrica

`validateVisualFit` ([visualFit.ts](shared/visualFit.ts)) mede e emite issues:

| Issue | Significado |
|---|---|
| `headline_body_overlap` | Caixas de headline e body se sobrepõem |
| `section_overlap` | Caixa de seção colide com headline, body ou outra seção |
| `section_missing_geometry` | Template estruturado + headline absoluto, mas seção sem `freePosition`/`width`/`height` |
| `structured_absolute_layout` | Body ou card com `freePosition` em template estruturado |
| `card_too_narrow` | Card abaixo da largura mínima |
| `outside_safe_area` | Bloco invade a margem de segurança |
| `text_element_outside_canvas` / `text_element_overlaps_copy` | Decorativos `cd-*` |
| `text_exceeds_visible_area` | Texto estimado excede o clamp do renderer |

Headline e body usam `layoutRect` (heurística de altura por contagem de caractere).
Seções usam `explicitRect` — geometria declarada direta, sem heurística, porque
`sectionGrid` já fixa a altura.

**Ao adicionar um tipo de issue, três lugares precisam ser atualizados** (o `tsc`
pega os dois primeiros, o terceiro é silencioso):

1. `VisualFitIssueType` em `shared/postspark.ts`
2. `LAYOUT_INTEGRITY_PENALTY` em `server/ai/postEvaluation.ts` (`Record` exaustivo)
3. `visualFitIssueSchema` em `shared/postsparkSchemas.ts` ← **cópia zod duplicada, fácil de esquecer**

## A garantia de preservação

Geometria correta **nunca** é alterada por reprocessamento. Provado em
`familyGeometry.test.ts`: três passadas consecutivas de `createPostVisualSnapshot`
produzem `layoutSettings` byte-idêntico, nos 270 casos (144 mesma proporção +
108 cruzados, compor em X e ver em Y + 18 de seções cruzadas).

Isso não é acidente do corretor estar desligado — é consequência de a geometria
chegar correta da construção. O corretor de runtime
(`applyVisualFitFallback`) existe como rede de segurança para snapshots legados
(v1-v3) e edição manual, não como parte do caminho feliz.
