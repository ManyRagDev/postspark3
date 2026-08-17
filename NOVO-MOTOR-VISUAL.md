# NOVO — Motor Visual do PostSpark

> **Status:** fonte da verdade a partir de 2026-08-15.
> Substitui a documentação anterior sobre geometria, tipografia e composição visual.
> Documentos antigos (docs/, .conductor/, SPEC-*, CR-*) podem conter informação
> contraditória — **este arquivo e seus auxiliares têm precedência.**

## Por que este documento existe

A documentação anterior cresceu em camadas (SPEC-001, SPEC-002, CR-003, CR-008…),
cada uma descrevendo o desenho vigente na época. Camadas posteriores contradisseram
as anteriores sem removê-las. O resultado prático: ler tudo custava contexto demais
e ainda deixava o leitor com premissas erradas — dois defeitos reais de sobreposição
sobreviveram meses porque a documentação afirmava que não podiam existir.

Estes arquivos `NOVO-*` descrevem **o que o código faz hoje**, verificado por
execução, não por leitura. Toda afirmação aqui foi confirmada rodando o código.

## Índice

| Arquivo | Conteúdo |
|---|---|
| **NOVO-MOTOR-VISUAL.md** (este) | Visão geral, cadeia de autoridade, invariantes |
| [NOVO-GEOMETRIA-E-TIPOGRAFIA.md](NOVO-GEOMETRIA-E-TIPOGRAFIA.md) | Como posição e tamanho são decididos — o contrato central |
| [NOVO-ORNAMENTOS-E-MARCA.md](NOVO-ORNAMENTOS-E-MARCA.md) | Badge, sticker, identidade de marca |
| [NOVO-DIAGNOSTICO-2026-08.md](NOVO-DIAGNOSTICO-2026-08.md) | O que estava quebrado, a evidência, o que mudou |

---

## O princípio que governa tudo

> **Regra na construção, não na validação.**

Uma regra tardia (juiz LLM + reparo generativo) custa ~34 s por rodada e não
conserta o defeito — ela mede uma coisa e o render entrega outra. Uma regra
precoce (invariante em `families.ts` / `composeVariation`) é um teste de dez
linhas e torna o defeito **impossível**.

Consequência prática: quando algo está visualmente errado, a correção certa quase
nunca é "adicionar um corretor de runtime". É fazer a família declarar a geometria
correta e provar isso num teste.

## Cadeia de autoridade

Cada etapa decide algo diferente. Confundir os papéis é a origem histórica dos bugs.

```
1. LLM                    → COPY (headline, body, caption, sections, copyAngle.type/label)
   generationOrchestrator    NÃO decide geometria. NÃO decide ornamentos.

2. directCreative         → QUAL FAMÍLIA visual atende esta variação
   shared/creative/          Gate simétrico: família com fit.needsSections ⟺ variação com seções

3. composeVariation       → GEOMETRIA (layoutSettings) + ornamentos keep/hide
   shared/creative/          A FAMÍLIA é a autoridade. Sobrepõe qualquer geometria do LLM.
                             Calculada para AS 3 PROPORÇÕES, não só a de composição
                             (layoutSettingsByAspectRatio) — o post é gerado numa
                             proporção mas visto em qualquer uma no HoloDeck/Workbench.

4. createPostVisualSnapshot → RESOLUÇÃO tipográfica (fontSize/linhas medidos com a fonte real)
   shared/variationSnapshot   + rede de segurança (applyVisualFitFallback)

5. PostCardV2             → RENDER verbatim do que foi resolvido
   client/.../WorkbenchV2     NÃO recalcula geometria
```

**Regra de ouro:** a geometria que o pipeline **mede** tem de ser a geometria que o
render **entrega**. Todo defeito grave que tivemos veio de violar isso.

## Invariantes (quebrar qualquer um destes é regressão)

1. **Todo slot com `freePosition` também declara `width` e `height`.**
   Sem os três, `resolveTypography` lança `missing-geometry` e o post cai no
   caminho legado (dimensionamento por contagem de caractere) — que sobrepõe texto.

2. **Nunca misturar bloco absoluto com bloco em fluxo no mesmo container.**
   O shell de um bloco absoluto usa `display: contents`
   ([DraggableBlock.tsx:200](client/src/components/canvas/DraggableBlock.tsx:200)) e
   reserva **zero** espaço de fluxo. O que fluir depois passa por baixo dele.
   Vale para body **e para seções**.

3. **Geometria correta nunca é remexida.**
   Provado por teste: 3 passadas consecutivas de `createPostVisualSnapshot`
   produzem `layoutSettings` idêntico. Ver
   [familyGeometry.test.ts](shared/creative/familyGeometry.test.ts).

4. **Fonte ausente é erro, nunca substituição.**
   Medir "Playfair Display" com Inter produz relatório verde e mentiroso.
   As 10 fontes vivem em `shared/typography/fonts/files/` e são versionadas.

5. **Ornamentos nascem vazios.**
   O LLM não gera `badge` nem `stickerText`. Ver [NOVO-ORNAMENTOS-E-MARCA.md](NOVO-ORNAMENTOS-E-MARCA.md).

6. **Geometria não congela na proporção de composição.**
   O post é gerado numa proporção só; o usuário troca de proporção sem regerar.
   `layoutSettingsByAspectRatio` guarda a geometria calibrada das 3 — sem isso,
   trocar de proporção reaproveita a caixa errada (headline calibrado para 1:1
   usado num canvas 9:16). Ver "Geometria por proporção" em
   [NOVO-GEOMETRIA-E-TIPOGRAFIA.md](NOVO-GEOMETRIA-E-TIPOGRAFIA.md).

7. **Margem/gap declarado precisa de folga real acima do mínimo que o
   validador exige, não só tecnicamente satisfazer `>=`.** Um gap exatamente
   igual a `MIN_TEXT_GAP` passa no teste automatizado (`layoutRect`) mas fica
   na borda do que a renderização real tolera — mesma razão de
   `RESOLUTION_WIDTH_SAFETY` existir para largura.

## Como verificar que o motor está são

```bash
npx tsc --noEmit
```
```bash
pnpm test
```

Os testes que guardam os invariantes acima:

| Teste | Guarda |
|---|---|
| `shared/creative/familyGeometry.test.ts` | 270 casos: 144 mesma proporção (12 famílias × 3 proporções × 2 copies × com/sem seções) + 108 cruzados (compor em X, ver em Y) + 18 de seções cruzadas. Geometria completa, zero colisão, tipografia resolvida, idempotência, geometria vista bate com composição nativa naquela proporção |
| `shared/creative/directCreative.test.ts` | Gate simétrico de seções |
| `shared/visualFit.test.ts` | Detecção isolada de colisão e geometria faltante |
| `shared/typography/equivalence.test.ts` | Divergência fontkit × canvas < 3% |

**Se um destes falhar, não relaxe a asserção.** Ela existe porque o defeito
correspondente já chegou em produção uma vez.

## Sonda rápida (quando precisar investigar)

O jeito mais barato de auditar o motor sem subir a app — cria um arquivo temporário
na raiz do projeto (não em /tmp, por causa da resolução de paths):

```ts
import { fontkitMeasurer } from "./shared/typography/fontkitMeasurer";
import { setTypographyMeasurer } from "./shared/typography/measurer";
setTypographyMeasurer(fontkitMeasurer);   // ← sem isto, a resolução falha e a sonda mente

import { FAMILIES } from "./shared/creative/families";
import { composeVariation } from "./shared/creative/compose";
import { createPostVisualSnapshot } from "./shared/variationSnapshot";
import { DEFAULT_DESIGN_TOKENS } from "./shared/postspark";

for (const fam of FAMILIES) for (const ratio of ["1:1","5:6","9:16"] as const) {
  const composed = composeVariation(/* variação */, DEFAULT_DESIGN_TOKENS as never);
  const snap: any = createPostVisualSnapshot(composed, ratio);
  console.log(fam.id, ratio, (snap.visualFitIssues ?? []).map((i:any)=>i.type));
}
```

O servidor registra o medidor em
[generationOrchestrator.ts:62](server/ai/generationOrchestrator.ts:62); o cliente em
`client/src/main.tsx`; os testes em `vitest.setup.ts`. Uma sonda avulsa precisa
registrar por conta própria — esquecer isso produz "tipografia não resolvida" falso.

## Stack relevante

- **Composição/geometria:** `shared/creative/` (famílias, arquétipos, paletas, seed)
- **Tipografia canônica:** `shared/typography/` (resolve, fit, fontkit, registry)
- **Validação geométrica:** `shared/visualFit.ts`
- **Snapshot v4:** `shared/variationSnapshot.ts`
- **Orquestração:** `server/ai/generationOrchestrator.ts`
- **Render:** `client/src/components/views/WorkbenchV2/PostCardV2.tsx`
