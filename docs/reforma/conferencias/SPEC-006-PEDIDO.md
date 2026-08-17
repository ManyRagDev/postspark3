# PEDIDO DE CONFERÊNCIA — SPEC-006: aceite de produto e corte documental

**Data:** 2026-08-12
**Commit-base:** `f402518` (worktree local, não commitado), sobre SPEC-001..005 (conferências diferidas pelo dono para o fim do processamento)
**Executor:** agente autônomo (sessão única)
**Conferência exigida:** total — aceite técnico + julgamento do dono nos itens visuais/brand; veredito global só após conferência em sessão limpa ou por outra pessoa/modelo.

## Objetivo (5 linhas)

Provar o fluxo de ponta a ponta com evidência derivada (`verify:e2e`: runId,
snapshot hashado, post persistido, relatório por run + agregado com p50/p95,
tokens, custo e chamadas do mesmo corpus) e preparar o corte documental:
legado preservado byte a byte com SHA-256 e novo mestre curto redigido como
rascunho. O swap na raiz e o veredito dependem da conferência do dono.

## Evidência derivada (artefatos)

- `artifacts/verification/<runId>/snapshot.json` + `report.json` + `REPORT.md` por run (SHA-256 do snapshot em cada relatório).
- `artifacts/verification/summary.json` — agregado do último lote.
- Execuções reais (provider OpenRouter, corpus fixo, billing dev-mode sem cobrança):
  - lote A: 2/3 aprovados (posts 40-41; tokens 13957/16667; US$ 0.0118/0.0133; 47s/55s); 1 falha operacional registrada.
  - lote B: 2/3 aprovados (posts 43-44; tokens 16592/17929; US$ 0.0147/0.0158; 57s/61s); 1 falha registrada.
  - p50/p95 do último lote (inclui run falho com retries): 60,7s / 110,1s.
  - 3 postagens por usuário de teste dedicado (uuid por run) para evitar o limite FREE (5) — o trigger de limite foi exercitado e funcionou.
- `verify:runtime` reexecutado: exit 1 honesto — 6 críticos ausentes no Supabase real (ver SPEC-004).

## Bugs reais encontrados e corrigidos nesta spec

1. **NUL vindo do LLM quebrava o save** (PostgREST: "unsupported Unicode escape sequence"): o modelo emitiu `\u0000` literal em `description`. Corrigido com `stripUnsupportedControlChars` no orquestrador (sanitização recursiva na chamada principal e no reparo) — após a correção, 6/6 saves de teste passaram.
2. **Build quebrado herdado da SPEC-001** (`node:fs` no bundle do cliente via registry de fontes): corrigido na SPEC-005 com a indireção `shared/typography/measurer.ts`; `npm run build` gera client + `api/index.js` a partir das fontes.

## Afirmo que / como rederivar / evidência

| Afirmação | Como rederivar | Evidência |
|---|---|---|
| `npm run check` limpo | `npm run check` | saída vazia |
| Suíte completa passa | `npm test` | 45 arquivos / 368 testes |
| Build a partir das fontes | `npm run build` | client ✓ + `api/index.js` 470kb regenerado |
| Harness sem casos pulados | `npm run harness -- --aspect 1:1,5:6,9:16` | 2664 medidos, 0 pulados, ✅ |
| `verify:runtime` honesto contra o ambiente | `npm run verify:runtime` | projeto `spbu…hfir`; 6 críticos ausentes; exit 1 |
| `verify:e2e` produz artefatos correlacionados | `npm run verify:e2e -- --runs=3` | snapshots SHA-256 + reports por run + summary; posts persistidos na fonte de verdade |
| Carrossel não vaza estado entre slides | testes de contrato existentes (SPEC-001) + `editorStore.test.ts` | suíte verde |
| Mesmo snapshot consumido por HoloDeck/Workbench/persistência/export | invariante + código (`PostVisualSnapshot` único, renderers leem `resolvedTypography` verbatim) | leitura de código + testes de contrato |
| Auth bridge usa o mesmo userUuid | `server/_core/sdk.ts:90` | `ctx.user.id = user.id` (auth UUID) em posts/runs/fingerprints/RLS |

## Pendências que mantêm a spec em `🟡 parcial` (exigem o dono)

1. **Conferências das SPEC-001..005** — pedidos prontos em `docs/reforma/conferencias/`; vereditos pendentes.
2. **Aplicação da migration `0015`** no Supabase (autorização explícita) + re-rodada do `verify:runtime` até `✅ OK` — sem isso, billing transacional falha reservas para planos não-ilimitados e o trace não persiste.
3. **Julgamento visual/brand** (12 famílias × 3 proporções; calibração safe area 9:16; política de score "unproven") — o dono decide gosto e marca.
4. **Billing em Stripe test mode** (reserva/commit/refund reais em test mode) — não executado (a chave do ambiente não foi validada como test key; nenhuma cobrança real foi feita).
5. **Isolamento entre dois usuários de teste** (auth bridge + RLS em posts/assets/runs) — não executado (exigiria criar usuários de teste no projeto; deixado para a conferência).
6. **p50/p95 com lote 3/3 aprovados** — a instabilidade do provider (≈1/3 falhas hoje) impediu um lote limpo; o agregado registra as falhas honestamente.
7. **Corte documental** — legado copiado + hashado (`e137bff1…4593`, 227142 bytes) e novo mestre em rascunho (`docs/reforma/NOVO-DOCUMENTO-MESTRE.md`); o swap na raiz e a atualização do `AGENTS.md` (se necessário) ocorrem na conferência.

## Onde o executor desconfia do próprio trabalho

1. **O rascunho do novo mestre** foi escrito por mim a partir da baseline e do código — a conferência deve validar cada afirmação antes do swap; o hash do legado foi calculado sobre a cópia (idêntica à raiz no momento), mas deve ser re-verificado na hora do corte.
2. **A medida de latência/custo mistura lotes com falhas**: o resumo é honesto (status failed quando há run falho), mas p50/p95 não refletem apenas caminhos felizes — decidir se o relatório final deve segregar approved-only.
3. **Os posts de teste (40-44 + anteriores) permanecem no banco real** sob usuários `verify-e2e`/uuid dedicados — remoção é ação destrutiva que exige autorização do dono; sugeri a limpeza na conferência.
4. **`verify:e2e` depende de `debug: true` + `AI_UI_DEBUG_ENABLED`** para capturar o trace (o AsyncLocalStorage vaza entre chamadas sequenciais no mesmo processo) — se o flag for desligado em produção, o comando deve ser adaptado.
5. **Não validei o export visual (DOM)** — a matriz de aceite inclui "exportar"; a correlação por hash do snapshot está pronta, mas o screenshot/export real é client-side e fica para a conferência com o dono.

## Degraus de verificação cumpridos e pendentes

Cumpridos: check, testes, build, harness, verify:runtime, verify:e2e (artefatos + runIds + hashes), bugfix NUL, rascunho do corte documental.
Pendentes: conferências das 6 specs, migration 0015 autorizada, visual/brand (dono), Stripe test mode, isolamento 2 usuários, swap do mestre, limpeza de posts de teste (autorização).
