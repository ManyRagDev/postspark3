# PEDIDO DE CONFERÊNCIA — SPEC-001: autoridade tipográfica única

**Data:** 2026-08-10
**Commit-base:** `f402518` (worktree local, não commitado)
**Executor:** agente autônomo (sessão única, sem checkpoint humano intermediário)

## Objetivo (5 linhas)

Eliminar a autoridade tipográfica concorrente: até aqui, `useTextAutoFit`
(contagem de caracteres) decidia tamanho no browser depois do snapshot já
estar "congelado". Esta entrega cria `resolvedTypography` — uma decisão
medida com fonte real (Fontkit), persistida no snapshot v4 — e restringe
`useTextAutoFit`/line-clamp a ler snapshots legados (v1-v3) ou falhas
estruturadas de resolução, nunca a decidir sobre v4 resolvido com sucesso.

## Diff e arquivos tocados

Novos:
- `shared/typography/` (`types.ts`, `fontkitMeasurer.ts`, `fit.ts`, `resolve.ts`, `resolve.test.ts`, `constants.ts`, `fonts/registry.ts`, `fonts/files/*.ttf`)
- `shared/creative/layoutArchetypes.ts`
- `docs/reforma/conferencias/SPEC-001-PEDIDO.md` (este arquivo)

Modificados (produção):
- `shared/postspark.ts` — `ResolvedTextBlock`/`ResolvedTypography`, `PostVisualSnapshot.snapshotVersion: 1|2|3|4`, `resolvedTypography`, `typographyResolutionError`; `LayoutPosition.height`; `CarouselSlideEditorState.resolvedTypography`
- `shared/postsparkSchemas.ts` — schemas correspondentes, `superRefine` estendido para v4
- `shared/variationSnapshot.ts` — `resolveSnapshotTypography`, wiring em `createPostVisualSnapshot` e `projectSnapshotForSlide`
- `shared/visualFit.ts` — comentário de escopo (não muda comportamento)
- `shared/creative/families.ts` — 10/12 famílias migradas para geometria explícita
- `client/src/components/views/WorkbenchV2/PostCardV2.tsx` — usa `resolvedTypography` quando presente
- `client/src/components/views/HoloDeck.tsx`, `client/src/pages/Home.tsx`, `client/src/store/editorStore.ts` — aceitam v3 e v4 como "frozen"
- `client/src/lib/snapshotMigration.ts` — `migrateV3ToV4`, `isSnapshotV4`
- `client/src/hooks/useTextAutoFit.ts` — comentário de restrição de escopo (não muda comportamento)
- `harness/*` — `slots.ts` (correção de bug real, ver "desconfio"), `run.ts` (fit real de body), `fit.ts`/`fonts/registry.ts`/`measure/*` (pontes de compatibilidade para `shared/typography/`), `thresholds.ts` (reexporta constantes)

Modificados (testes):
- `client/src/lib/variationSnapshot.test.ts`, `client/src/lib/snapshotMigration.test.ts`, `client/src/store/editorStore.test.ts` — expectativas atualizadas para v4 + 1 teste novo de atomicidade

## Contagem de testes

| | Antes | Depois |
|---|---|---|
| Arquivos de teste | 44 | 45 |
| Testes | 369 | 375 |

Novos: `shared/typography/resolve.test.ts` (5), `editorStore.test.ts` +1 (atomicidade de recomputação).

## Afirmo que / como rederivar / evidência

| Afirmação | Como rederivar | Evidência |
|---|---|---|
| `npx tsc --noEmit` limpo | `npx tsc --noEmit -p .` na raiz | saída vazia, sem erro |
| 375 testes passam | `npx vitest run` | `Test Files 45 passed (45)`, `Tests 375 passed (375)` |
| Harness aprova com 0 casos pulados nos 3 formatos | `npm run harness -- --aspect 1:1,5:6,9:16` | `casos: 2664 medidos, 0 pulados`, `✅ APROVADO no perfil "baseline"` |
| Sobreposição residual (4,8%) é 100% explicada por falha de encaixe real, não bug de geometria | `node -e` sobre o JSON do harness (`--json`), filtrar `overlapPairs>0` e cruzar com `bodyFitsAboveFloor===false \|\| fitsAboveFloor===false` | rodado nesta sessão: 128/128 casos de overlap têm `fitsAboveFloor`/`bodyFitsAboveFloor` false |
| Edição de headline recalcula `resolvedTypography` atomicamente, nunca deixa stale | `npx vitest run client/src/store/editorStore.test.ts -t atomically` | teste novo passa; força headline antigo ≠ novo em `resolvedTypography.headline.text` |
| `useTextAutoFit`/clamp não decidem para v4 resolvido com sucesso | leitura de código: `PostCardV2.tsx`, bloco `resolvedHeadline`/`resolvedBody` — `headingSize`/`bodySize`/`*LineClamp` só usam `autoFit` quando `resolved*` é `undefined` | grep `resolvedHeadline ? ... : autoFit` em `PostCardV2.tsx` |
| Fontes: 7 baixadas de `google/fonts` (OFL), 3 delas (Anton, Archivo Black, Space Mono) só existem estáticas | `curl -s https://api.github.com/repos/google/fonts/contents/ofl/anton` etc. | listado nesta sessão; arquivos em `shared/typography/fonts/files/` |
| Corpus real: 23 títulos reais puxados do Supabase hospedado via `pnpm harness:corpus` | rodar o mesmo comando com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no ambiente | `harness/corpus.real.json` (fora do git por design — não anexo aqui) |

## Exclusões declaradas

1. **`versus` e `mosaic-grid`** (template `feature-grid`) não têm `resolvedTypography` de headline/body — decisão documentada em `shared/creative/layoutArchetypes.ts` e no header das duas famílias. Resolução de texto em seções fica para trabalho futuro.
2. **Falha de resolução não aborta geração.** `post.generate` continua retornando a variação com `typographyResolutionError` preenchido; não há retry/rewrite automático. A variação afetada renderiza pelo caminho legado (autofit+clamp) até uma entrega futura (SPEC-003, "encurtar geração") fechar esse loop.
3. **Carrossel não persiste resolução na geração.** `projectSnapshotForSlide` computa `resolvedTypography` por slide sob demanda (determinístico, mesmos inputs → mesmo resultado), mas `server/routers.ts` não foi alterado para gravar isso em `slide.editorState` no momento da criação do carrossel.
4. **Sem verificação fonte-medida × fonte-browser.** Nenhum mecanismo compara a fonte que o Fontkit mediu com a que o `<canvas>`/DOM efetivamente carregou.
5. **Corpus real não versionado/anonimizado.** Está fora do git por decisão de privacidade pré-existente (`pullCorpus.ts`); registrei isso como divergência do texto literal do critério de aceitação, não como algo a corrigir às pressas.
6. **Sem verificação visual renderizada.** Toda a evidência de "HoloDeck → Workbench → export → histórico usam o mesmo valor" é por leitura de código (mesmo componente `PostCardV2`, export é screenshot do DOM) e testes de contrato — não rodei o dev server nem tirei screenshot comparativo das 12 famílias × 3 proporções.

## Onde o executor desconfia do próprio trabalho

1. **Os números de altura/posição em `layoutArchetypes.ts` e nas 10 famílias migradas foram escolhidos por mim, sem verificação visual renderizada.** Calibrei via harness (sobreposição/fora-do-canvas caíram a zero-exceto-falhas-legítimas), mas isso mede geometria abstrata, não como o card realmente parece. É plausível que alguma família fique com proporção estranha (texto grande demais ou pequeno demais em relação ao resto do design) mesmo sem bug de encaixe. Recomendo fortemente rodar o dev server e olhar as 12 famílias nos 3 formatos antes de aprovar.
2. **O bug de `harness/slots.ts` que corrigi (tratava `freePosition.y` como topo em vez de centro) já existia ANTES desta entrega** — só não era visível porque nenhuma família declarava `body` livre. Isso significa que qualquer leitura anterior do harness sobre posição vertical de headline (mesmo antes da SPEC-001) já estava sutilmente errada. Não voltei atrás para reavaliar relatórios históricos.
3. **A divisão entre "falha estruturada registrada" e "geração aborta"** foi uma decisão minha sob a pressão de terminar a spec numa sessão sem parar — o texto original da spec ("a geração/edição retorna falha estruturada em vez de cortar texto") pode ser lido como exigindo que a geração pare/retente, não apenas registre. Se essa leitura for a correta, o critério 4 da aceitação não está cumprido, só o 8 (nunca corta silenciosamente).
4. **Não tenho certeza se os tetos/pisos de fonte do body (`BODY_CEILING_PX=22`, `BODY_FLOOR_PX=17`) são os números certos** — escolhi por proporção com os do headline (`HEADLINE_CEILING_PX=56`, `LEGIBILITY_FLOOR_PX=24`, ambos preexistentes no harness), sem uma fonte de verdade de design para o corpo.
5. **`shared/postsparkSchemas.test.ts`** aparece modificado no `git status`, mas não fui eu quem tocou — já estava assim no início da sessão (trabalho local do usuário). Não abri esse arquivo para confirmar se ele cobre os campos novos do schema v4.

## Degraus de verificação cumpridos e pendentes

Cumpridos:
1. Checagem automática mais barata: `npx tsc --noEmit` ✅
2. Checagem contra expectativa registrada: testes unitários (375) ✅
3. Verificação de comportamento observável (parcial): harness determinístico ✅; amostra visual renderizada ❌ (não cumprido, ver "desconfio" #1)
4. Execução real com custo: corpus real puxado do Supabase hospedado (`pnpm harness:corpus`, credenciais reais) ✅

Pendentes:
5. Julgamento humano: **este pedido de conferência** — gosto visual das 12 famílias, decisão sobre se falha de resolução deveria abortar geração, e veredito final.

## VEREDITO — 2026-08-12 (dono, com apoio de agente de conferência)

**Aprovada com ressalvas.** Rederivado nesta data: `npx tsc --noEmit` limpo; `npx vitest run` → 47 arquivos / 386 testes (contagem pós-SPEC-002, não regrediu); `npm run harness -- --aspect 1:1,5:6,9:16` → 2664 medidos, 0 pulados, ✅ APROVADO; `PostCardV2.tsx` usa autofit/clamp apenas quando `resolvedHeadline`/`resolvedBody` ausentes; `snapshotVersion: 4` confirmado no emissor e no schema.

Ressalvas aceitas como dívida registrada: verificação visual renderizada das 12 famílias pendente (a fazer antes da SPEC-006); falha de resolução não aborta geração; carrossel não persiste resolução na geração. Decisão sobre abortar geração em falha de resolução fica aberta para a SPEC-003.
