# Harness de medição

Oráculo das etapas **E2 a E5** de `docs/plano-implementacao.md`. Existe para que
"o layout está bom" deixe de ser opinião e vire comando com código de saída.

```bash
pnpm harness                                  # perfil baseline (estado atual)
pnpm harness --profile e2                     # portão da prova de encaixe
pnpm harness --profile e3                     # encaixe em produção
pnpm harness --profile e5                     # cor garantida
pnpm harness --family editorial-poster        # uma família
pnpm harness --aspect 1:1,5:6,9:16            # múltiplos formatos
pnpm harness --json relatorio.json            # relatório completo por caso
pnpm harness:corpus                           # puxa a âncora real do Supabase
```

Sai com **0 = aprovado**, **1 = reprovado**.

## Regra de ouro

> Uma etapa NUNCA está concluída sem `pnpm harness --profile <etapa>` verde.
> Relatório vazio, casos pulados ou fonte ausente **reprovam** — não aprovam
> com ressalva.

Isso é deliberado. O modo de falha que este harness previne é o relatório verde
e falso: medir com fonte substituta, medir zero casos, ou confundir "não medido"
com "zero por cento".

## O que ele mede

| Métrica | Como | Precisa de fonte? |
|---|---|---|
| Truncamento (baseline atual) | replica `useTextAutoFit` + multiplicador da família + `line-clamp` | sim |
| Encaixe acima do piso | busca binária de corpo contra o slot medido | sim |
| Sobreposição entre blocos | interseção de caixas em px | sim |
| Fora do canvas | caixa vs. documento | sim |
| Contraste | `shared/creative/color.ts` (implementação única, decisão 3) | não |
| Diversidade | famílias, pares tipográficos, paletas, layouts distintos | não |
| Modo de posicionamento | `free` vs `grid` por slot | não |

## Estrutura

```
harness/
  run.ts             orquestrador · CLI · códigos de saída
  fit.ts             algoritmo sob teste (busca binária) + replica do baseline
  slots.ts           geometria de slot a partir de composeVariation
  metrics.ts         métricas puras (contraste, sobreposição, canvas, diversidade)
  corpus.ts          varredura sintética 20–90 chars + adversariais + âncora real
  thresholds.ts      critérios de aceitação por perfil
  pullCorpus.ts      puxa títulos reais de postspark.posts
  measure/
    types.ts         interface Measurer (o harness só fala com ela)
    fontkitMeasurer.ts   implementação de referência
  fonts/
    registry.ts      família → arquivo, com falha explícita
    files/           .ttf variáveis
```

## Fontes

O harness **não substitui fonte ausente**. Medir Playfair com Inter produziria
um relatório verde e mentiroso.

Presentes: `fraunces.ttf`, `inter.ttf`, `space-grotesk.ttf` (copiadas de
`postspark-next/packages/fonts/files/`).

Faltam, e precisam ser baixadas como **`.ttf` variável** (não estático) para
`harness/fonts/files/`: `archivo.ttf`, `bricolage-grotesque.ttf`,
`playfair-display.ttf`, `anton.ttf`, `archivo-black.ttf`, `space-mono.ttf`,
`lora.ttf`.

As três primeiras são as fontes de destino (D14). As demais são de linha de
base — as que as 12 famílias declaram hoje, necessárias para provar o critério
da E3 ("13 de 14 cortados vira 0 de 14" exige medir o antes com as fontes do
antes).

## Corpus

Sintético por construção, e isso é intencional. `postspark.posts` tem 23
registros: mín. 25, mediana 36, p90 46, máx. 51 caracteres, **zero acima de 60**.
A ausência de cauda é estrutural — `applyDeterministicCopyGuards` corta em 60
(`shared/validation.ts:69`), então o corpus real foi amputado pela guarda que a
arquitetura remove.

O harness varre de 20 a 90 caracteres em degraus de 5, acrescenta casos
adversariais (palavras longas, token sem espaço) e usa os reais como âncora de
sanidade.

## Limitação conhecida

Slots posicionados por **grade** (`position: "center"` etc., sem
`freePosition`) não têm orçamento vertical derivável — o posicionamento real é
resolvido por `PostCardV2`, que o harness não modela. Esses casos aparecem como
`n/d`, nunca como aprovados.

Medição em 2026-08-10: entre as famílias mensuráveis, **100% posicionam o título
por grade**. Migrar esses slots para `freePosition` é pré-requisito da E2, e é
a mesma mudança que dá às famílias o orçamento vertical explícito que a E3 exige.

## Contradição arquitetural registrada

O `Measurer` é interface plugável por um motivo: **D10 e D9 se contradizem**.
D10 diz que o encaixe vinculante roda no DOM do cliente; D9 diz que a árvore
resolvida é gravada no snapshot. Se o encaixe é do browser do usuário, a árvore
gravada varia por browser, e a verdade-pixel do export cai.

Enquanto isso não for resolvido, o harness serve aos dois desenhos: basta uma
segunda implementação de `Measurer` sobre DOM para medir a divergência, que já
é critério declarado do perfil `e2` (`maxMeasurerDivergence`).
