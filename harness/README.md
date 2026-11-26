# Harness de medição

O harness mede texto e layout com perfis reproduzíveis. Seus perfis E2, E3 e E5 preservam critérios de verificação do plano antigo. Para a jornada atual de geração, use as evidências descritas no [mapa do motor](../docs/motor-integracao.md).

```sh
pnpm harness
pnpm harness --profile e3 --family editorial-poster
pnpm harness --aspect 1:1,4:5,9:16 --json relatorio.json
```

O comando retorna 0 quando o conjunto passa pelo perfil e 1 quando reprova. Uma fonte ausente impede a verificação.

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

## Fontes e corpus

O [registro de fontes](./fonts/registry.ts) determina os arquivos requeridos. O harness mistura casos sintéticos e, quando disponível, uma amostra local em `harness/corpus.real.json`. A amostra é privada. `pnpm harness:corpus` faz uma leitura do Supabase configurado para regenerá-la.

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
