# PEDIDO DE CONFERÊNCIA TOTAL — CR-001 a CR-009

**Data:** 2026-08-13
**De:** agente implementador (não aprova — conferência é papel de agente independente/dono)
**Estado:** 🟡 IMPLEMENTAÇÃO CORRETIVA CONCLUÍDA — AGUARDANDO CONFERÊNCIA INDEPENDENTE

Este pedido cobre a implementação das correções obrigatórias de
`docs/reforma/CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md` sobre as specs
SPEC-001 a SPEC-006 já implementadas. Nada aqui é auto-aprovado.

## Critérios conferíveis (com prova)

### CR-001 — renderer consome a tipografia resolvida integralmente
- Arquivos: `client/src/components/views/WorkbenchV2/PostCardV2.tsx`, `PostCardV2.resolved.test.tsx`.
- Prova: 3 testes passando (preview/edição/export idênticos: 36px, lineHeight 1.15, weight 700, pre-line, maxWidth 302px, sem clamp; v3 legado com clamp+pre-wrap). Multiplicadores `calc(*1.15)`/`calc(*1.4)` restritos ao caminho não-resolvido.
- Conferir: `npx vitest run client/src/components/views/WorkbenchV2/PostCardV2.resolved.test.tsx`.

### CR-002 — re-resolução pós-edição sem autofit/clamp
- Arquivos: `shared/typography/wrap.ts`, `client/src/lib/browserMeasurer.ts`, `client/src/main.tsx`, `shared/typography/equivalence.test.ts`, `client/src/store/editorStore.test.ts` (+3 testes).
- Prova: medidor browser (canvas + `document.fonts.check`) registrado no bootstrap; equivalência medida×carregada <3% para Inter/Space Grotesk/Anton/Space Mono (16–44px); edição de headline/body/proporção exige resolução VÁLIDA (sem aceitar erro); ida-e-volta preserva linhas/caixas.
- Conferir: `npx vitest run shared/typography/equivalence.test.ts client/src/store/editorStore.test.ts`.
- Nota de conferência: a prova usa @napi-rs/canvas no CI/local; o comportamento real do browser (font loading) é o ponto a validar.

### CR-003 — gates e2/e3/e5 verdadeiros
- Arquivos: `shared/creative/families.ts` (12 famílias calibradas por proporção), `shared/creative/layoutArchetypes.ts` (`aspectOf`), `shared/creative/palettes.ts` (AA por construção), `shared/creative/color.ts` (fundo efetivo com overlay dominante), `shared/creative/compose.ts` (textColor da família), `shared/visualFit.ts` + `shared/variationSnapshot.ts` (geometria v4 explícita preservada; headline posicionado permitido em templates estruturados; scrim de proteção para imagem), `harness/run.ts`/`metrics.ts`/`thresholds.ts` (truncamento = caminho produtivo; quebras irrecuperáveis separadas; safe area), `server/ai/cr003Negative.test.ts`.
- Prova: e2/e3/e5 ✅ (0% trunc, 97,1% encaixe, 0% overlap, 0% outOfCanvas, 0% safe area, AA 4.5:1); testes negativos (fundo inválido → sem NaN; sabotagem → reprova).
- Conferir: `npm run harness -- --profile e2 --aspect 1:1,5:6,9:16` (idem e3, e5) — os três com exit 0.

### CR-004 — orçamento de chamadas
- Arquivos: `server/ai/intentRouter.ts` (determinístico), `server/ai/contextBudget.ts` (compressão determinística), `server/ai/modelRouter.ts`/`server/_core/env.ts` (rotas high_ticket removidas), `server/post.test.ts` (+2 testes).
- Prova: execution com mesmo orçamento (1 generativa; zero `high_ticket_*`); contexto acima do budget sem chamada extra.
- Conferir: `npx vitest run server/post.test.ts`.

### CR-005 — terminalidade financeira
- Arquivos: `server/routers.ts` (commit falso → falha terminal; refund falso → SPARK_REFUND_FAILED + trace failed com nota), `server/post.test.ts` (+2 testes).
- Prova: commit false → rejeição + refund; refund false → rejeição + registro observável.
- Conferir: `npx vitest run server/post.test.ts`.

### CR-006 — infraestrutura
- Bloqueado na aplicação remota (autorização do dono). Preparado: `drizzle/0015_harden_manifest_corrective.sql` (idempotente, cobre os 6 críticos); `verify:runtime` reexecutado (42 sondas; só os 6 críticos ausentes). Descoberta a conferir: o remoto contém `postspark.next_reserve_sparks_v2` (só reserve; sem commit/refund) — design "next" meio aplicado.
- Conferir: `npm run verify:runtime` (esperado exit 1 até 0015); após autorização, aplicar 0015 e exigir exit 0.

### CR-007 — compatibilidade postJudge
- Arquivos: `server/postJudge.compat.test.ts`.
- Prova: contrato real (`overallScore`, 5 dimensões, verdict no enum, fallback 70 sem NaN).
- Conferir: `npx vitest run server/postJudge.compat.test.ts`.

### CR-008 — matriz E2E
- Arquivos: `server/verifyE2E.ts` (`--matrix`), `server/ai/generationOrchestrator.ts` (2 fixes de 400: schema strict do carrossel; imagem sem URL), `shared/visualFit.ts`/`shared/variationSnapshot.ts` (geometria preservada — corrige o snapshot real), `server/post.test.ts` (+2 regressões).
- Prova: última execução 9/9 aprovadas / 0 falhas / 2 bloqueadas (0015): texto, execution, carrossel, URL e imagem com reabertura hash-canônico idêntico, edição com resolução válida e contrato de export hashado; composição determinística; sessão expirada; isolamento; Stripe. Artefatos em `artifacts/verification/matrix-summary.json`.
- Conferir: `npm run verify:e2e -- --runs 1 --matrix` (esperado: 0 falhas quando o provider estiver saudável; causas de falha explícitas no resumo).
- Nota: 4 runs da matriz executados no dia; provider OpenRouter instável (400/timeouts intermitentes) — falhas transitórias ficam registradas com causa, não mascaradas.

### CR-009 — corte documental
- Preparado: novo mestre validado sem referências a módulos removidos (`visualFitValidator`, `shared/highTicket*`, `server/ai/highTicket/`, `generationGraph`, `graphEngine`) e com zero links relativos quebrados; cópia byte a byte do mestre vigente em `docs/reforma/legado/DOCUMENTO_MESTRE-LEGADO-2026-08-13-CR009.md` (SHA-256 `4c65074f7522af9843bb20ac903d83b94d22a8de4f6de5484a39f99295cb5c72`, 228 645 bytes).
- Bloqueado (dono): inspeção visual das 36 combinações (12 famílias × 3 proporções) e autorização do swap da raiz. No corte, recalcular o hash da cópia imediatamente antes do swap.

## Pendências que exigem o dono

1. Aplicar `drizzle/0015_harden_manifest_corrective.sql` no Supabase remoto (desbloqueia verify:runtime verde, células de saldo/double-submit da matriz).
2. Julgamento visual das 12 famílias × 3 proporções (inspeção renderizada) e decisão de ajustes de gosto.
3. Autorização do swap do `DOCUMENTO_MESTRE.md` (com hash recalculado no momento do corte).
4. Limpeza dos posts de teste (`verify-e2e`) criados nas matrizes (ids recentes ~48–73) — ação destrutiva.
5. Decisão sobre o design "next" (`postspark.next_reserve_sparks_v2`): manter apenas o trio 0015 ou migrar o runtime para o "next".

## Vereditos por spec (não emitidos pelo implementador)

Cada SPEC-001..006 permanece 🔎 aguardando veredito de conferência (diferido pelo dono). Os pedidos individuais permanecem em `docs/reforma/conferencias/`.

## Barra de verificação usada pelo implementador

`npm run check` ✅ · `npm test` ✅ 48/386 · `npm run build` (verificar) · harness e2/e3/e5 ✅ · `verify:runtime` ❌ (exit 1 honesto até 0015) · `verify:e2e --matrix` ✅ 9/9 (última execução).
