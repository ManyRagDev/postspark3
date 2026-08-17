# NOVO — Diagnóstico e Correções (2026-08-15)

> Auxiliar de [NOVO-MOTOR-VISUAL.md](NOVO-MOTOR-VISUAL.md). Registro do que estava
> quebrado, a evidência que provou, e o que mudou. Serve para não refazer a
> investigação e para não reintroduzir os defeitos.

## Sintomas relatados

1. Geração levando **2–3 minutos**, às vezes terminando em **HTTP 504**
2. Elementos de texto **sobrepostos** nos posts gerados
3. Das 9 opções apresentadas (3 proporções × 3 variações), no máximo 3 saíam sem
   necessidade de retoque

## Método

Toda conclusão foi verificada por **sonda executável** — script rodando o código
real com o medidor fontkit registrado — não por leitura de código ou de
documentação. A documentação anterior continha afirmações contraditórias e
premissas que o código já não honrava.

---

## Defeito 1 — Duas autoridades de layout que nunca se encontravam

**Cadeia causal:**

1. O LLM produzia geometria (`aspectRatioOptimizations`) que a composição por
   família **descartava** (precedência em `variationSnapshot.ts`)
2. O juiz de qualidade media `layoutIntegrity` **na geometria descartada**,
   porque rodava antes da composição
3. O juiz reprovava → reparo generativo disparava (+34 s) para consertar layout
   que não seria entregue
4. A geometria que **era** entregue nunca era validada
5. Ela também nunca era resolvida em produção: as 10 fontes `.ttf` nunca tinham
   sido commitadas (`git status` reportava `?? shared/typography/fonts/`)
6. Sem tipografia resolvida, o cliente dimensionava por contagem de caractere,
   mas os blocos continuavam em `position: absolute` → sobreposição

**Evidência de latência** (`OPERATIONAL_ERRORS.txt`, runs `c041215e`, `d241c373`):
`post_generation` 34 s + 3× `post_evaluation` 4 s + `generation_repair` 34 s =
**154.980 ms** → HTTP 504.

**Correções:**

| Área | Mudança |
|---|---|
| Instrumentação | `summarizeGeneratedVariation` expõe `familyId`, `typographyResolved`, `typographyResolutionError`, `visualFitIssues` |
| Fontes | 10 `.ttf` versionados; `fontkit` → dependência de produção; `FONT_DIR` resolve por candidatos (esbuild move o módulo); `vercel.json` `includeFiles`; check de boot com log `TYPOGRAPHY_FONTS_MISSING` |
| Geometria | `glitch-signal` e `kinetic-type` passam a declarar `bodyHeightPercent`; `brutal-split`, `data-punch`, `versus`, `mosaic-grid` usam `ornaments.body: "hide"` |
| Invariante | `composeVariation` lança se headline absoluto conviver com body em fluxo com texto |
| Latência | `aspectRatioOptimizations` sem geometria (−55% tokens de saída); `copyRules` enxuto; orçamento de reparo proporcional; juiz LLM pulado em slots já reprovados; deadline 90 s → 150 s com guarda de orçamento; reuso de `recentPostsPromise` |

**Gap encontrado durante a implementação:** `hasRequiredCopy` rejeitava variações
de famílias headline-only, porque `ornaments.body: "hide"` esvazia `composed.body`
e a validação exigia body não-vazio. Corrigido aceitando
`hiddenOrnaments.body` — o texto existe, só foi realocado.

---

## Defeito 2 — Seções estruturadas sem geometria

O primeiro defeito corrigiu **headline × body**. O print do usuário mostrou um
caso diferente: **headline × seções** (`template: "feature-grid"`).

**Cadeia causal, medida:**

1. `composeVariation` usava `output.template || variation.template` — só 2 das 12
   famílias declaram template próprio; as outras 10 herdavam o do LLM sem saber
   posicionar seções
2. `fitsContent` só rejeitava família que **exige** seções sem tê-las. O inverso
   — variação **com** seções indo para família que não as posiciona — nunca era
   checado
3. Bloco absoluto do headline não reserva espaço de fluxo → seções fluíam por baixo
4. `validateVisualFit` media `headlineRect` e `bodyRect`, **nunca seções**

**Medição (sonda, 12 famílias × 3 proporções, variação com 3 seções):**

```
ANTES:  36/36 com headline absoluto + seções em fluxo
        36/36 sem NENHUMA issue mencionando seções
DEPOIS: 0/36 em risco
```

**Correções:**

| Arquivo | Mudança |
|---|---|
| `shared/creative/directCreative.ts` | Gate simétrico em `fitsContent` |
| `shared/creative/layoutArchetypes.ts` | Novo `sectionGrid()`; removido `STRUCTURED_TEMPLATE_HEADLINE_ONLY` (constante morta que descrevia o desenho pré-CR-003 e induzia a erro) |
| `shared/creative/families.ts` | `versus` e `mosaic-grid` declaram `sectionLayouts` |
| `shared/creative/compose.ts` | Demoção de segurança: família sem `needsSections` que receba seções vira `template: "simple"` |
| `shared/visualFit.ts` | `explicitRect()` + detecção de `section_overlap` / `section_missing_geometry` |
| `shared/postspark.ts`, `shared/postsparkSchemas.ts`, `server/ai/postEvaluation.ts` | Dois tipos de issue novos (três lugares — o schema zod é cópia duplicada, fácil de esquecer) |

### A restrição que moldou o desenho

O usuário levantou: *"precisamos garantir que a geometria não vai ser remexida
quando já estiver acertada"*.

Verificação mostrou que a garantia **existia, mas por motivo errado**. O corretor
de runtime era binário e cego:

```
geometryResolved=true  → não toca em nada — inclusive numa colisão REAL comprovada
geometryResolved=false → achata tudo para fluxo e apaga sectionLayouts
```

Não havia meio-termo. E o guard usava `resolvedTypography` como procuração de
"geometria está correta" — mas a resolução é **por bloco**: prova que o texto cabe
na caixa dele, não que as caixas não colidem.

Por isso a correção foi na **construção** (família declara geometria não-colidente,
teste prova) e não no corretor. Assim "nunca remexe" deixou de ser acidente e
virou garantia provada: 3 passadas consecutivas de `createPostVisualSnapshot`
produzem `layoutSettings` idêntico nos 144 casos.

---

## Defeito 3 — Ornamentos que ecoavam a copy

Ver [NOVO-ORNAMENTOS-E-MARCA.md](NOVO-ORNAMENTOS-E-MARCA.md) para o detalhe.

Resumo: `copyAngle.badge` e `copyAngle.stickerText` eram gerados pelo LLM dentro
de um objeto de estratégia, sem acesso ao nome da marca — então ecoavam a copy
("…com confiança" → badge "Confiança", sticker "SEGURO"). Removidos do schema;
nascem vazios; entrada manual preservada; marca real é `brandMeta`/`BrandOverlay`.

---

## Defeito 4 — Geometria congelada na proporção de composição

Os 3 defeitos acima corrigiram sobreposição **dentro** de uma proporção. Este é
diferente: o mesmo post ficava correto numa proporção e quebrado nas outras
duas. Print do usuário: 9 variações (3 proporções × 3 posts), padrão "cada
variação sai boa em exatamente uma proporção".

**Cadeia causal, confirmada por leitura mecânica linha a linha:**

1. `composeVariation` ([compose.ts](shared/creative/compose.ts)) calculava a
   geometria (headline/body/sectionLayouts) para **uma única proporção** — a de
   composição — e guardava em `composed.layoutSettings`. As famílias já sabiam
   calibrar por proporção (`HEADLINE_HEIGHT_PCT[classe][ar]`); o problema era
   que isso só rodava **uma vez**.
2. Existe um campo desenhado exatamente para isto —
   `layoutSettingsByAspectRatio: Partial<Record<AspectRatio, AdvancedLayoutSettings>>`
   — mas `composeVariation` nunca o preenchia. Só era escrito reativamente pelo
   editor, quando o usuário arrastava um elemento (`editorStore.ts`).
3. **O mecanismo fino:** em `normalizeLayoutSettings`
   ([variationSnapshot.ts](shared/variationSnapshot.ts)), o guard
   `sameRatioSnapshotLayout` compara `variation.aspectRatio === aspectRatio` —
   mas `createPostVisualSnapshot` chama `applyAspectRatioToVariation` **antes**
   desse check, e essa função **sobrescreve** `variation.aspectRatio` para a
   proporção pedida, sempre. No momento da comparação, os dois lados já são o
   mesmo valor — é uma tautologia. Resultado: a geometria congelada vencia
   **mesmo vendo numa proporção diferente da de composição**.
4. Isso batia exatamente com `HoloDeck.tsx`'s `getPreviewVariation`, que troca
   de proporção chamando `createPostVisualSnapshot(variation, aspectRatio, { preserveVisualIdentity: true })`
   sem proteção própria — diferente do editor, que tenta compensar manualmente
   (mas só a partir da segunda visita à mesma proporção).
5. Segundo defeito, que deixava isso invisível: `layoutRect`
   ([visualFit.ts](shared/visualFit.ts)) media a altura de headline/body
   **sempre** por heurística de contagem de caractere, ignorando `pos.height`
   mesmo quando declarado — a validação media uma caixa diferente da que o
   resolvedor tipográfico realmente preenchia.

**Correções:**

| Arquivo | Mudança |
|---|---|
| `shared/creative/compose.ts` | `composeVariation` chama `family.compose()` para as 3 proporções (seed fresca por chamada) e popula `layoutSettingsByAspectRatio` |
| `shared/variationSnapshot.ts` | Captura `originalAspectRatio` **antes** de `applyAspectRatioToVariation` sobrescrever; `layoutSettingsByAspectRatio[ratio]` ganha precedência sobre `variation.layoutSettings` congelado |
| `shared/visualFit.ts` | `layoutRect` usa `pos.height` declarado quando presente, em vez de só heurística |
| `shared/creative/familyGeometry.test.ts` | Nova matriz cruzada: compor em X, ver em Y (12 famílias × 3×3 proporções = 108 casos + bloco de seções) |

### Os defeitos de calibração que a validação honesta revelou

Corrigir `layoutRect` para respeitar a altura declarada tornou a validação
capaz de ver colisões que sempre existiram mas nunca tinham sido medidas
corretamente. Três apareceram, todos a mesma classe — número calibrado sem
margem real:

1. **Gap < mínimo exigido.** `GAP_PCT`/`gapPercent` padrão (2/3%) eram menores
   que `MIN_TEXT_GAP` (4%) que o próprio validador exige entre blocos de texto.
   Afetava `glitch-signal`, `quote-authority` (headline×body) e `versus`/
   `mosaic-grid` (headline×seções).
2. **Âncora vertical na safe area.** `versus`/`mosaic-grid` ancoravam o
   headline com `yCenterPercent` que deixava o TOPO da caixa declarada dentro
   da margem de segurança de 5% (1:1/5:6). Nova constante `HEADLINE_TOP_ANCHOR`
   por proporção.
3. **Largura na safe area.** `brutal-split` usava `headlineWidthPercent: 90`
   (cabia na margem de 5% de 1:1/5:6, estourava a de 6% de 9:16). Reduzido
   para 88.

**Correção de acabamento (relato de acompanhamento do usuário):** depois da
correção acima, o usuário reportou que posts *trocados* para 9:16 ficavam bons
"com um ajuste milimétrico", mas os *nativos* em 9:16 ainda sobrepunham. Sonda
via pipeline completo (`generatePostVariations` com LLM mockado, replicando
exatamente `generationOrchestrator.ts`) mostrou o motivo: eu tinha corrigido o
gap para **exatamente** `MIN_TEXT_GAP` (4%) — na borda do que `overlaps()`
aceita, sem nenhuma folga real. `GAP_PCT` e o default de `gapPercent` em
`stack()` subiram de 4 para **6** (50% de margem sobre o mínimo, não só
tecnicamente `>=`). Mesma razão de `RESOLUTION_WIDTH_SAFETY = 0.96` existir
para largura: medição e renderização real nunca batem 100%, então uma margem
que só encosta no mínimo teórico é margem nenhuma na prática.

**Verificação de fechamento** — sonda replicando o caminho exato do HoloDeck
(compor em 1:1, "trocar" para as 3 proporções como o carrossel faz) com o
mesmo tipo de prompt do relato ("3 passos para..."), 12 famílias × 3
proporções: **0/36 em risco**.

---

## Estado final verificado

```
npx tsc --noEmit   → limpo
pnpm test          → 661/661 (50 arquivos)
pnpm build         → api/index.js gerado sem erro
```

Sondas de fechamento:

```
geometria (Defeitos 1-3):  0/36 combinações em risco (era 36/36)
geometria entre proporções (Defeito 4): 0/36 em risco no caminho exato do HoloDeck
ornamentos: 0/36 renderizando badge ou sticker automaticamente
tipografia: 36/36 resolvidas
idempotência: 270/270 casos byte-idênticos em 3 passadas (144 mesma-proporção + 108 cruzados + 18 de seções)
```

## Armadilhas para quem for mexer aqui

1. **Sonda sem `setTypographyMeasurer`** reporta "tipografia não resolvida" em
   100% dos casos — falso. O servidor registra em `generationOrchestrator.ts:62`,
   o cliente em `main.tsx`, os testes em `vitest.setup.ts`. Sonda avulsa precisa
   registrar por conta própria.

2. **Sonda em `/tmp`** não resolve os imports do projeto. Crie o arquivo na raiz
   e apague depois.

3. **`VisualFitIssueType` tem cópia zod** em `shared/postsparkSchemas.ts`. O
   `tsc` não pega, mas `post.save` rejeita o snapshot em runtime.

4. **`LAYOUT_INTEGRITY_PENALTY` é `Record` exaustivo** — adicionar tipo de issue
   quebra o build até adicionar a penalidade.

5. **A documentação antiga contradiz o código.** `STRUCTURED_TEMPLATE_HEADLINE_ONLY`
   era uma constante nunca lida afirmando que famílias estruturadas não têm
   headline em posição livre — o oposto do que o código fazia desde o CR-003.
   Ao encontrar afirmação de documento antigo, **verifique rodando** antes de
   confiar.

6. **Cuidado com checks de "mesma proporção" depois de qualquer função que
   sobrescreva `.aspectRatio`.** `applyAspectRatioToVariation` sempre retorna
   `{...variation, aspectRatio: <pedido>}` — comparar `variation.aspectRatio`
   contra o parâmetro pedido **depois** dessa chamada é sempre verdadeiro,
   nunca detecta proporção diferente. Capture o valor original antes.

7. **Margem que só toca o mínimo teórico não é margem.** `GAP_PCT` foi
   corrigido para `>= MIN_TEXT_GAP` (4) e ficou **exatamente** 4 — passava no
   teste automatizado, mas sem folga nenhuma contra divergência real de
   renderização. Constantes de margem/gap precisam de folga real acima do
   mínimo que o validador exige (ver `RESOLUTION_WIDTH_SAFETY` para o
   equivalente em largura), não só satisfazer a desigualdade.

## Pendências declaradas

- Elementos decorativos `cd-kicker` / `cd-sticker-rot` / `cd-scanline-tag`:
  remover (texto sem informação, hardcoded idêntico em todo post da família)
- `cd-attribution` de `quote-authority`: alimentar de `brandMeta.brandName`
- Geometria para `numbered-list` / `step-by-step`: não necessária hoje porque
  `versus`/`mosaic-grid` forçam `feature-grid`; será necessária se isso mudar
- Resolução tipográfica por slide de carrossel: nada no servidor popula
  `slide.editorState.resolvedTypography`, então todo slide renderiza pelo caminho
  legado
- Drift de `textElements` decorativos entre proporções: mesma causa raiz do
  Defeito 4 (posição em px calculada com o `docHeight` da proporção de
  composição, lida depois contra o `canvasHeight` da proporção vista em
  `textElementRect`), mas sem contrapartida `textElementsByAspectRatio` no
  tipo — documentado, não corrigido
- Zonas elásticas / tipo tipográfico constante entre proporções: redesenho
  maior, discutido e propositalmente adiado
