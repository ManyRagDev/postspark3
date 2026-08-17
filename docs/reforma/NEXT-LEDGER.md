# Ledger do PostSpark Next (SPEC-005)

**Data:** 2026-08-12
**Regra:** `postspark-next/` é repositório Git independente (`.git` próprio) e permanece **intacto**. Este ledger classifica cada capacidade relevante do `packages/design-system` quanto ao destino no PostSpark 3. O corte definitivo (retenção, arquivo externo ou remoção) é decisão do dono — nenhuma exclusão foi feita nesta spec.

| Capacidade (Next) | Classe | Destino no PostSpark 3 | Evidência |
|---|---|---|---|
| `measure.ts` — medição Fontkit (width, wrap) | absorvida | `shared/typography/fontkitMeasurer.ts` + `shared/typography/fit.ts` (SPEC-001; harness 2664 casos, 0 pulados) | `npm run harness` ✅ |
| `resolve.ts` — resolução de layout/tipografia | rejeitada (parcial) | Hard-break silencioso de palavra contraria a exigência de falha explícita da SPEC-001; safe area absorvida separadamente | `shared/typography/resolve.ts` (falha estruturada `unbreakable-word`); SPEC-001-PEDIDO.md |
| `safeArea.ts` — margens de segurança por proporção | absorvida | `shared/creative/layoutArchetypes.ts` → `safeAreaMarginsPercent` (SPEC-002) | SPEC-002-PEDIDO.md; violações 9:16 registradas como dívida |
| `palette.ts` — paleta acessível/contraste | rejeitada (comparada) | Única definição produtiva em `shared/creative/color.ts` (SPEC-002); `postEvaluation`/`postJudge` delegam | SPEC-002-PEDIDO.md; zero `contrastRatio(` no client |
| `families.ts` — famílias visuais | absorvida (conceito) | 12 famílias em `shared/creative/families.ts` com geometria explícita (10/12) e arquétipos em `layoutArchetypes.ts` (SPEC-001/002) | `shared/creative/` |
| `menu.ts`, `negotiate.ts`, `negotiate-carousel.ts` | não necessária | Sem lacuna correspondente no caminho produtivo pós-SPEC-003 (orquestrador único não usa negociação de menu) | grafo de importação do PostSpark 3 |
| orquestração de geração (pipeline do Next) | rejeitada | SPEC-003 criou orquestrador próprio (`server/ai/generationOrchestrator.ts`) com orçamento de 1 chamada generativa + reparo único | SPEC-003-PEDIDO.md |
| crítica/reparo visual (críticos do Next) | não absorvida | Avaliação/revisão vive em `server/ai/postEvaluation.ts` + reparo único do orquestrador | SPEC-003/004 |

**Recomendação:** reter `postspark-next/` como referência até a conferência final (SPEC-006); depois, arquivar externamente ou remover com autorização explícita do dono — nunca antes. O repositório aninhado não participa do build nem do runtime do PostSpark 3.
