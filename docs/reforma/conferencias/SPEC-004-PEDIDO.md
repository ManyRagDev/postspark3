# PEDIDO DE CONFERÊNCIA — SPEC-004: persistência, billing e verdade da infraestrutura

**Data:** 2026-08-12
**Commit-base:** `f402518` (worktree local, não commitado), sobre SPEC-001/002/003 (vereditos diferidos pelo dono para o fim do programa)
**Executor:** agente autônomo (sessão única)
**Conferência exigida pela spec:** total — o conferente reexecuta o verificador contra a mesma fonte ou declara `NÃO VERIFICÁVEL`.

## Objetivo (5 linhas)

Criar a cadeia de evidência reproduzível entre código, migrations locais e o
Supabase hospedado: manifesto de requisitos derivado dos consumidores ativos,
`npm run verify:runtime` (validação SQL pelo parser real do Postgres + sondas
remotas read-only + relatório JSON anonimizado com hashes), correção
idempotente das migrations nunca aplicadas (`0015`), contrato de eventos v2,
billing tipado sem `as any` e máquina de estados da reserva provada por testes.

## Diff e arquivos tocados

Novos:
- `server/runtimeManifest.ts` — manifesto de requisitos (tabelas, colunas, RPCs; zero buckets exigidos — storage é proxy Forge)
- `server/verifyRuntime.ts` — verificador: validação de migrations (libpg_query WASM), sondas de tabela/coluna/RPC/bucket, relatório JSON, exit codes
- `server/verifyRuntime.test.ts` — 9 testes: gate da fixture sabotada, 0012 histórico, 0015 válida, classificação de erros remotos
- `server/billing.transactions.test.ts` — 10 testes da máquina de estados da reserva (ledger fake)
- `server/db.snapshot.test.ts` — 5 testes de ida e volta de snapshot (v4 atual + v1 legado)
- `drizzle/0015_harden_manifest_corrective.sql` — correção idempotente consolidada (events v2, site_intelligence, content_fingerprints, spark_reservations + 3 RPCs, get_billing_profile, analytics, privacy_logs)
- `drizzle/__fixtures__/sabotaged_invalid.sql` — fixture deliberadamente inválida (prova o gate)
- `verify-output/` (gitignored) — relatórios derivados com timestamp

Modificados (produção):
- `server/billing.ts` — `getSupabase()` tipado; novo wrapper `rpcCall<T>`; zero `as any` nas chamadas críticas
- `server/routers.ts` — `start_trial` usa `rpcCall` (removeu `as any`); import de `getSupabase` removido
- `server/_core/systemRouter.ts` — `system.health` agora reporta requisitos críticos ausentes (cache 60s, mensagem acionável sem segredos)
- `server/ai/generationTrace.ts` — `eventsVersion: 2` (contrato do orquestrador)
- `drizzle/0002_user_uuid_dual_write.sql` — BOM UTF-8 removido (o parser real do Postgres rejeita)
- `package.json` — script `verify:runtime`; `.gitignore` — `verify-output/`
- dependência dev nova: `@pgsql/parser` (libpg_query WASM)

Modificados (testes):
- `server/ai/generationTrace.test.ts` — `eventsVersion: 2`

## Contagem de testes

| | Antes (fim SPEC-003) | Depois |
|---|---|---|
| Arquivos de teste | 42 | 45 |
| Testes | 356 | 380 |

Novos: verifyRuntime (9) + billing.transactions (10) + db.snapshot (5) = 24.

## Afirmo que / como rederivar / evidência

| Afirmação | Como rederivar | Evidência |
|---|---|---|
| `npm run check` (tsc) limpo | `npm run check` | saída vazia |
| 380 testes passam | `npm test` | `Test Files 45 passed (45)`, `Tests 380 passed (380)` |
| Harness sem regressão | `npm run harness -- --aspect 1:1,5:6,9:16` | 2664/0, ✅ APROVADO (mesmos números) |
| Todas as migrations aplicáveis validam no parser real do Postgres | `npm run verify:runtime` (ou teste "todas as migrations aplicáveis") | 16 arquivos: 15 válidos, 1 histórico inválido documentado (0012), 0 inválidos |
| A fixture sabotada é DETECTADA | teste "fixture sabotada" | parser lança SqlError |
| 0012 classificada como histórico nunca aplicado (não quebra o gate) | teste "0012 é classificada" | status `invalid_historical` |
| `verify:runtime` sonda o Supabase REAL e falha honestamente | `npm run verify:runtime` (com `.env`) | projeto `spbu…hfir`; 42 sondas: 29 presentes, 12 ausentes, 0 incompatíveis, 1 não verificável (ensure_manylabs — write, não sondada); **6 críticos ausentes**: `spark_reservations`, `generation_runs.events`, `generation_runs.events_version`, `reserve_sparks`, `commit_spark_reservation`, `refund_spark_reservation`; exit code 1 |
| Estado remoto confirmado por auditoria independente (MCP, read-only) | histórico de migrations + information_schema | 0005/0007/0012/0013/0014 ausentes do histórico remoto; tabelas/colunas/RPCs acima inexistentes; RPCs manylabs existem com args (`has_manylabs_app_access` com p_user_id) |
| Billing idempotente e transições válidas | `npx vitest run server/billing.transactions.test.ts` | 10/10: double-submit mesma reserva, reservas concorrentes uma única, commit repetido true com débito único (100→90), refund repetido true sem débito, commit-após-refund false, refund-após-commit false, reserva inexistente false |
| Snapshot ida e volta (v4 e legado) | `npx vitest run server/db.snapshot.test.ts` | 5/5: createPost persiste v4 + campos legados, getPostById devolve v4 exato, legado v1 intacto, updatePost sem campos não chama banco |
| Runtime grava contrato de eventos v2 | `npx vitest run server/ai/generationTrace.test.ts` | `eventsVersion: 2` |
| Billing sem `as any` em chamadas críticas | grep `as any` em `server/billing.ts` | apenas tipos `err: any` de catch (sem casts de chamada); `rpcCall` tipado |
| Health falha cedo com mensagem acionável | `system.health` (query pública) | retorna `ok:false` + issues + ação (não expõe segredos) quando crítico ausente |
| Manifesto cobre o runtime | teste "manifesto cobre o runtime" + varredura `\.from\(`/`\.rpc\(` | cobertos: posts, background_assets, site_intelligence, generation_runs, content_fingerprints, brand_kits, personas, profiles, subscriptions, topup_packages, users, analytics×2, privacy_logs + RPCs (incl. manylabs ×2) |
| Bridge entrega o mesmo userUuid | leitura de `server/_core/sdk.ts:90` | `ctx.user.id = user.id` (UUID do Supabase Auth) usado em `posts.user_uuid`, `generation_runs.user_uuid`, fingerprints e políticas RLS; billing opera em `profiles.id` (= auth UUID) via ponte por e-mail |

## Exclusões declaradas

1. **Migration `0015` NÃO foi aplicada em produção** — exige autorização explícita do dono (regra da spec). Até a aplicação, o billing transacional falha reservas para planos não-ilimitados (FOUNDER/DEV seguem em bypass) e o trace não persiste (`generation_runs` sem colunas `events`). É a pendência remota que mantém a spec em `🟡 parcial` se a conferência assim julgar.
2. **`ensure_manylabs_app_access` não é sondada** pelo comando (função com efeito de escrita — auto-ativação). Presença confirmada por information_schema na auditoria MCP; o relatório a marca como `not_verifiable` com a razão.
3. **`high_ticket_tables.sql`** não é coberto pelo glob `\d{4}_*.sql` do gate (nome sem prefixo numérico) — foi validado manualmente com o mesmo parser (válido) e o conteúdo já consta aplicado remotamente como `postspark_high_ticket_pipeline_foundation`. Se o gate deve cobri-lo, é decisão de conferência.
4. **Tipos do Supabase não foram gerados** (item 8 da spec exigia "suficientes para retirar `as any` das chamadas críticas"): o wrapper `rpcCall` + `SupabaseClient<any,"postspark">` cumpriram isso sem gerar o banco de tipos completo — decisão de escopo registrada.
5. **`start_trial`/`debit_sparks`/`process_topup`/`get_billing_profile` sondados com sentinela** (uuid zero, amount 0, email inválido): sem efeito colateral por FK/validação, conforme detalhe do relatório.
6. **Ida e volta de snapshot legado v1–v3** testado em `db.snapshot.test.ts` no nível de persistência (o banco não transforma); a MIGRAÇÃO client-side v1→v4 é coberta pelos testes existentes de `variationSnapshot`/`snapshotMigration` (SPEC-001).

## Onde o executor desconfia do próprio trabalho

1. **O relatório de buckets lista 5 buckets de OUTROS apps** (historias-*, renders, brand-assets, brincareducando-*): o manifesto exige zero buckets e o verificador apenas lista. Não confirmei se algum fluxo legado do PostSpark usa storage do Supabase além do proxy Forge — a varredura de código não encontrou `storage.from(`/`upload(`.
2. **A classificação `incompatible` quase não é alcançável** via PostgREST (função com assinatura diferente aparece como `absent` — "Could not find the function ... in the schema cache"). O report separa o bucket, mas na prática a maioria cai em absent; a auditoria MCP preenche a lacuna no pedido.
3. **`verify:runtime` depende do `.env` local** (via `--env-file`): rodar em outro ambiente com credenciais diferentes sonda outro projeto — o relatório registra o identificador mascarado para o conferente conferir.
4. **O health usa cache de 60s** e roda o mesmo código do verificador: numa instância sem credenciais ele responde `mode: dev` ok — não falha o startup da aplicação (decisão: não derrubar o app em dev; `verify:runtime` é o gate de deploy).
5. **Não rodei a migration 0015 em Postgres descartável de verdade** (ex.: container local) — a validação é do parser (sintaxe) + revisão manual de semântica; a prova de execução real virá da aplicação autorizada em um ambiente, que não está no escopo sem autorização.
6. **O manifesto é estático** (derivado por varredura manual + teste de cobertura): se um futuro consumidor adicionar tabela/RPC sem atualizar o manifesto, o verificador não o saberá até a próxima auditoria — o teste de cobertura mitiga parcialmente.

## Degraus de verificação cumpridos e pendentes

Cumpridos:
1. Checagem automática mais barata: `npm run check` ✅
2. Checagem contra expectativa registrada: 380 testes ✅ (24 novos)
3. Verificação de comportamento observável: harness ✅; `verify:runtime` contra o Supabase real ✅ (exit 1 honesto); health endpoint ✅ (por código)
4. Auditoria remota read-only: ✅ (MCP: histórico de migrations, information_schema de tabelas/colunas/RPCs, buckets) — sem relatório anonimizado gerado pelo comando seria `NÃO VERIFICÁVEL`; aqui o comando gerou relatório com timestamp+hashes

Pendentes:
5. Aplicar `0015` em produção (autorização explícita do dono) e re-rodar `verify:runtime` até `✅ OK`
6. Julgamento humano: **este pedido** — autorização da migration; leitura de `not_verifiable` para `ensure_manylabs_app_access`; veredito final.
