# DOCUMENTO_MESTRE — estado final pretendido (rascunho bloqueado)

> **Status:** ⛔ **NÃO USAR PARA CUTOVER.** A conferência global de 2026-08-12 reabriu as seis specs como parciais.
> Correções obrigatórias: [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
> Substituirá `DOCUMENTO_MESTRE.md` (raiz) somente após novo aceite técnico e autorização do dono. O documento anterior foi
> preservado integralmente em `docs/reforma/legado/DOCUMENTO_MESTRE-LEGADO-2026-08-10.md`
> (SHA-256: `e137bff18ae446bab132c21ad73d4e55e43b7a034dd4efa469784505c4bd4593`) e **não é normativo**.

> **Atenção sobre o legado:** o hash acima corresponde à cópia feita antes do delta SPEC-006. O `DOCUMENTO_MESTRE.md` atual da raiz já diverge dessa cópia. No cutover real, será obrigatório copiar novamente o mestre vigente, verificar igualdade byte a byte e registrar um novo SHA-256.

## Propósito

PostSpark é uma aplicação full stack para gerar, editar, salvar e exportar posts e carrosséis
para redes sociais com apoio de IA. Entrada por texto, URL ou imagem; autenticação Supabase;
geração assistida por LLM; edição visual no Workbench; persistência em Supabase; billing por
plano/saldo de Sparks.

## Arquitetura

| Área | Estado confirmado |
|---|---|
| Frontend | React 19 + Vite (`client/`), Tailwind, Zustand (editor), React Query |
| Backend | Express + tRPC (`server/`); bundle de deploy em `api/index.js` (gerado) |
| Contratos | `shared/` (tipos Zod + snapshot + creative) |
| Auth | Supabase no cliente + bridge de cookie httpOnly; controle de acesso via `manylabs.app_access` |
| Persistência | Supabase direto (`server/db.ts`), schema `postspark`; Drizzle documenta parte do modelo |
| Billing | Stripe + Sparks; reserva/commit/refund transacional |
| Build | `vite build` + esbuild → `api/index.js` |

## Fluxo principal (geração única — SPEC-003)

```
post.generate (borda fina: auth, reserva, trace, logs)
   ↓  server/ai/generationOrchestrator.ts (único orquestrador produtivo)
   1 chamada generativa (copy/caption/slides)  +  no máx. 1 reparo (slots rejeitados)
   ↓  validação (estrutura ∪ qualidade ∪ diversidade)  →  Originality em paralelo
   ↓  composição visual determinística + snapshot v4
   ↓  GenerationOutcome: approved | rejected | failed  (rejected/failed → refund)
   ↓  HoloDeck / Workbench / salvar / reabrir / exportar consomem o MESMO PostVisualSnapshot
```

Orçamento de chamadas (contrato, provado por testes com provider falso): caminho feliz =
1 chamada generativa; reparo = ≤1; juízes LLM em paralelo; embeddings paralelos; retries de
transporte registrados no trace.

## Autoridades únicas (invariantes)

1. **Tipografia**: `shared/typography/resolve.ts` (snapshot v4 `resolvedTypography`); o medidor
   fontkit é registrado pelo servidor (`shared/typography/measurer.ts`); `useTextAutoFit`/clamp
   só leem snapshots legados v1-v3 ou falhas estruturadas.
2. **Cor/contraste**: `shared/creative/color.ts` (única implementação produtiva).
3. **Layout/geometria**: `shared/creative/layoutArchetypes.ts` + famílias (`families.ts`);
   safe area por proporção (`safeAreaMarginsPercent`).
4. **Geração**: `server/ai/generationOrchestrator.ts` — sem segunda máquina de estado
   (grafos shadow/pipeline removidos na SPEC-003/005).
5. **Estratégia**: determinística (`planContentStrategiesDeterministic`).
6. **Captions**: chamada principal + fallback determinístico marcado.
7. **Snapshot**: `PostVisualSnapshot` é o documento visual autoritativo
   (`shared/variationSnapshot.ts`, `snapshotVersion: 4`); versões v1-v3 continuam legíveis.

## Persistência e infraestrutura

- **Verificador**: `npm run verify:runtime` — manifesto em `server/runtimeManifest.ts`,
  validação SQL pelo parser real do Postgres (`@pgsql/parser`), sondas remotas read-only,
  relatório JSON anonimizado em `verify-output/` com timestamp e hashes; exit code ≠ 0 em
  requisito crítico ausente.
- **Billing transacional**: RPCs `reserve_sparks` / `commit_spark_reservation` /
  `refund_spark_reservation` (tabela `spark_reservations`); idempotência por chave derivada;
  máquina de estados provada por testes.
- **Estado remoto (auditado 2026-08-12, projeto `spbu…hfir`)**: migrations 0005/0007/0012/0013/
  0014 nunca aplicadas; faltam tabelas `spark_reservations`, `site_intelligence`,
  `content_fingerprints` e colunas `generation_runs.events`/`events_version`; faltam as 3 RPCs
  de reserva e `get_billing_profile`. **Correção**: `drizzle/0015_harden_manifest_corrective.sql`
  (idempotente) — aplicação em produção **pendente de autorização do dono**.
- **Contrato de eventos de geração**: `generation_runs.events_version = 2`.

## Integrações externas

- Supabase (auth, postgres, RLS); Stripe (checkout/webhook); OpenRouter (LLM principal),
  Groq/Gemini (fallbacks/microcopy/vision); Forge (storage proxy — sem buckets Supabase no
  runtime); serviço de screenshot (Railway). Variáveis em `server/_core/env.ts` e `.env.example`.

## Verificação e comandos

```powershell
npm run check          # tsc
npm test               # 45 arquivos / ~368 testes
npm run build          # client + api/index.js a partir das fontes
npm run harness -- --aspect 1:1,5:6,9:16   # 2664 casos, 0 pulados
npm run verify:runtime # auditoria runtime↔migrations↔Supabase (read-only)
npm run verify:e2e -- --runs=3  # evidência de ponta a ponta (artefatos hashados)
```

## Riscos abertos

1. Aplicação da migration `0015` e re-rodada do `verify:runtime` até `✅ OK`.
2. Instabilidade transitória do provider (OpenRouter) observada em execuções reais (falhas
   operacionais registradas no trace; reparo e deadline já são tratados pelo orquestrador).
3. Dívidas visuais registradas nas specs 001/002 (calibração de famílias, safe area 9:16,
   política de score "unproven") — julgamento de gosto é do dono.
4. `postJudge.ts` mantido como compatibilidade (endpoint público) com critério de retirada.
5. Ledger do Next em `docs/reforma/NEXT-LEDGER.md`; decisão de retenção/arquivamento é do dono.

## Histórico das seis entregas

| Spec | Entrega | Estado |
|---|---|---|
| SPEC-001 | Autoridade tipográfica única (snapshot v4, harness 0 pulados) | 🟡 reaberta — CR-001/CR-002/CR-003 |
| SPEC-002 | Resolvedor visual/cor únicos (compose puro, safe area, órfãos removidos) | 🟡 reaberta — CR-001/CR-003 |
| SPEC-003 | Orquestrador único com orçamento de chamadas; grafos removidos | 🟡 reaberta — CR-004/CR-005 |
| SPEC-004 | Cadeia de evidência infra (verify:runtime, manifesto, 0015, billing tipado) | 🟡 reaberta — CR-005/CR-006 |
| SPEC-005 | Consolidação/remoção de paralelos, build corrigido, ledger do Next | 🟡 reaberta — CR-007 |
| SPEC-006 | Aceite E2E (verify:e2e) e corte documental (este documento) | 🟡 reaberta — CR-008/CR-009 |

Pedidos de conferência: `docs/reforma/conferencias/SPEC-001..006-PEDIDO.md`. O veredito global atual
é `🟡 PROGRAMA PARCIAL — NÃO APROVADO PARA CUTOVER`. As correções e provas obrigatórias estão em
`docs/reforma/CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`.
