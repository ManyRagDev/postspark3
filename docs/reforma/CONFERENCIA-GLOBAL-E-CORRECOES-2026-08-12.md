# Conferência global e correções obrigatórias — 2026-08-12

**Veredito global:** 🟡 **PROGRAMA PARCIAL — NÃO APROVADO PARA CUTOVER**

**Escopo conferido:** SPEC-001 a SPEC-006, código ativo, testes, harness, build, artefatos E2E e Supabase configurado.

**Regra de leitura:** este documento substitui os vereditos anteriores quando houver divergência de status. Ele não invalida o trabalho útil já implementado; identifica o que ainda precisa ser corrigido e como provar o encerramento.

## Resumo executivo

As seis specs possuem implementação material. A base compila, os 368 testes passam e o bundle atual é reproduzível. Ainda assim, os critérios finais não foram cumpridos: os perfis reais de aceite visual reprovam, o orçamento de chamadas não cobre todos os modos produtivos, o estado financeiro pode não chegar a um terminal confirmado, a infraestrutura remota carece de seis requisitos críticos e a matriz E2E está incompleta.

O `DOCUMENTO_MESTRE.md` da raiz **não deve ser substituído** pelo rascunho novo até que todos os bloqueios P0 deste documento sejam encerrados e a SPEC-006 seja reconferida.

## Status de execução das correções (atualização 2026-08-13)

Estado: 🟡 **IMPLEMENTAÇÃO CORRETIVA CONCLUÍDA — AGUARDANDO CONFERÊNCIA INDEPENDENTE** (implementador não aprova; cada item abaixo precisa de veredito de conferência).

| CR | Status | Evidência produzida |
|---|---|---|
| CR-001 | 🟡 implementada — aguardando conferência | `PostCardV2` consome `ResolvedTextBlock` vinculantemente (fontSizePx·zoom, lineHeight, fontWeight, textTransform, pre-line, box maxWidth/minHeight; calc/clamp só no legado); `PostCardV2.resolved.test.tsx` (3 testes: preview=edição=export, v3 legado com clamp) |
| CR-002 | 🟡 implementada — aguardando conferência | `shared/typography/wrap.ts` (quebra gulosa única); `client/src/lib/browserMeasurer.ts` (canvas + `document.fonts.check`) registrado em `main.tsx`; prova medida×carregada em `shared/typography/equivalence.test.ts` (@napi-rs/canvas, <3%); editorStore: 3 testes novos exigem resolução VÁLIDA pós-edição e ida/volta determinística (sem aceitar erro) |
| CR-003 | 🟡 implementada — aguardando conferência | `e2`/`e3`/`e5` ✅ 0% truncamento, 97,1% encaixe, 0% overlap, 0% safe area, AA 4.5:1; truncamento = caminho produtivo (quebras irrecuperáveis separadas, 2,9% ≤ piso 5%); versus/mosaic/data-punch com contrato mensurável; contraste por construção (`paletteToDesignTokens`) e fundo EFETIVO (overlay dominante ≥55% blenda — fonte única com o produto); duotone wash escuro + texto de alto contraste; scrim de proteção para fundo de imagem em `createPostVisualSnapshot`; testes negativos em `server/ai/cr003Negative.test.ts` |
| CR-004 | 🟡 implementada — aguardando conferência | intent router e context budget 100% determinísticos (rotas `high_ticket_*` removidas do caminho síncrono e do `modelRouter`/env); 1 chamada generativa + ≤1 reparo + juízes nos DOIS modos; testes em `post.test.ts` (execution sem high_ticket; contexto acima do budget sem chamada extra) |
| CR-005 | 🟡 implementada — aguardando conferência | commit `false` → falha terminal (refund+failed); refund `false` → `SPARK_REFUND_FAILED` + trace failed com nota; testes em `post.test.ts` |
| CR-006 | 🟡 parcial — aplicação remota BLOQUEADA (aguarda autorização do dono) | `drizzle/0015_harden_manifest_corrective.sql` revisada (idempotente); `verify:runtime` reexecutado: 42 sondas, exatamente os 6 críticos ausentes que 0015 cobre, 0 inválidos novos; descoberta: o remoto só tem `postspark.next_reserve_sparks_v2` (sem commit/refund) — o trio do runtime está mesmo ausente |
| CR-007 | 🟡 implementada — aguardando conferência | `postJudge.compat.test.ts` reescrito sobre o contrato REAL (`overallScore`, dimensions 5 chaves, verdict, fallback 70 sem NaN) |
| CR-008 | 🟡 implementada — aguardando conferência | matriz completa em `verifyE2E.ts` (--matrix): texto/url/imagem × estático/carrossel × ideation/execution, HoloDeck (reabertura hash canônico idêntico), Workbench (edição re-resolve VÁLIDO), export hashado, sessão expirada, isolamento 2 usuários, saldo/double-submit (bloqueadas: 0015), Stripe; **última execução: 9/9 aprovadas, 0 falhas, 0 divergências de hash, 0 edições inválidas**; 2 bugs reais corrigidos (schema carrossel strict — `template`/`sections` em required; input imagem sem URL válida não envia `image_url`); 2 bugs de geometria corrigidos (fallback legado não destrói geometria v4 explícita; família é autoridade sobre `aspectRatioOptimizations`) |
| CR-009 | 🟡 parcial — julgamento visual e corte BLOQUEADOS (dono) | novo mestre validado sem referências a módulos removidos e sem links relativos quebrados; cópia byte a byte do mestre vigente gerada em `docs/reforma/legado/DOCUMENTO_MESTRE-LEGADO-2026-08-13-CR009.md` — SHA-256 `4c65074f7522af9843bb20ac903d83b94d22a8de4f6de5484a39f99295cb5c72` (228 645 bytes); inspeção visual das 36 combinações pendente do dono |

**Evidência rederivada pós-correções (2026-08-13):**

| Verificação | Resultado | Leitura correta |
|---|---:|---|
| `npm run check` | ✅ | TypeScript limpo |
| `npm test` | ✅ 48 arquivos / 386 testes | Suíte local verde |
| harness `e2` / `e3` / `e5` (1:1, 5:6, 9:16) | ✅ os 3 aprovados | truncamento 0%; encaixe 97,1%; overlap 0%; fora do canvas 0%; safe area 0%; contraste AA |
| harness `baseline` | ✅ | Apenas mede |
| `verify:runtime` | ❌ exit 1 (6 críticos ausentes — exatamente os que 0015 cobre) | Honesto até a migração ser aplicada (bloqueada por autorização) |
| `verify:e2e --matrix` | ✅ 9/9 aprovadas, 0 falhas, 2 bloqueadas (0015) | Matriz completa; hash canônico salvo×reaberto idêntico em todas as células; edição com resolução válida em todas |

## Evidência rederivada

| Verificação | Resultado | Leitura correta |
|---|---:|---|
| `npm run check` | ✅ | TypeScript limpo |
| `npm test` | ✅ 45 arquivos / 368 testes | Suíte local verde; não encerra critérios externos/visuais |
| build frontend e backend, com saída em `C:\tmp` | ✅ | Fontes produzem bundles válidos |
| SHA-256 do backend recompilado × `api/index.js` | ✅ idêntico | Bundle versionado é reproduzível |
| harness `baseline` | ✅ 2664/0 | Apenas mede; o perfil declara que não julga qualidade |
| harness `e2` | ❌ | truncamento 20,2%; encaixe 77,1% < 95% |
| harness `e3` | ❌ | falhas do E2 + sobreposição 4,8% |
| harness `e5` | ❌ | falhas do E3 + 36 casos abaixo de 4,5:1 |
| `verify:runtime --health` | ❌ | `ok:false`; 6 requisitos críticos ausentes |
| último `artifacts/verification/summary.json` | ❌ | 2/3 runs aprovados; status agregado `failed` |
| hashes dos snapshots E2E aprovados existentes | ✅ | zero divergências arquivo × relatório |

## Correções obrigatórias

### CR-001 — fazer o renderer consumir a tipografia resolvida integralmente

**Prioridade:** P0  
**Specs afetadas:** 001, 002 e 006

**Problema confirmado:** `PostCardV2` usa `fontSizePx`, mas não renderiza de forma vinculante `box`, `lines`, `lineHeight`, `fontWeight` e `textTransform`. Há multiplicadores tardios de tamanho (`1.15` e `1.4`) mesmo quando o snapshot já possui resolução. Portanto, o renderer ainda altera uma decisão que deveria ser autoritativa.

**Correção exigida:**

1. renderizar headline/body v4 com todos os campos de `ResolvedTextBlock`;
2. remover multiplicadores, line-clamp e decisões de fluxo do caminho v4 resolvido;
3. garantir que HoloDeck, Workbench e export usem a mesma projeção geométrica;
4. manter fallback somente para versões legadas explicitamente suportadas, não para snapshots v4 novos.

**Prova de encerramento:** teste renderizado que compare geometria/linhas entre preview, edição e export; busca sem multiplicadores tardios sobre `resolvedHeadline`/`resolvedBody`; perfis `e2` e `e3` verdes.

### CR-002 — resolver tipografia após edição sem retornar ao autofit/clamp

**Prioridade:** P0  
**Specs afetadas:** 001 e 006

**Problema confirmado:** o browser nunca registra um medidor em `shared/typography/measurer.ts`. Ao editar copy ou proporção, a re-resolução pode produzir `missing-font`; o teste atual considera qualquer `typographyResolutionError` suficiente e não prova uma nova resolução correta.

**Correção exigida:** definir uma única política vinculante para edição — resolução server-side antes do próximo documento persistido, ou medidor browser comprovadamente equivalente — e impedir que snapshot v4 recém-editado volte silenciosamente para autofit/clamp.

**Prova de encerramento:** teste que edita headline e body e exige `resolvedTypography` coerente, sem aceitar erro como alternativa; teste de fonte medida × fonte carregada; ida e volta da edição preservando as mesmas linhas/caixas.

### CR-003 — fechar encaixe, contraste e safe area nos perfis de aceite

**Prioridade:** P0  
**Specs afetadas:** 001 e 002

**Problema confirmado:** `baseline` foi citado como aprovação, embora declare `maxTruncationRate: 1`, `minFitAboveFloorRate: 0` e não imponha contraste. Os perfis `e2`, `e3` e `e5` reprovam. `versus` e `mosaic-grid` permanecem sem slot explícito; existem falhas de encaixe/overlap e 36 casos abaixo de 4,5:1.

**Correção exigida:** calibrar geometria/copy/pisos, eliminar sobreposição sistemática, resolver as famílias estruturadas ou formalizar outro contrato medido para elas, corrigir contraste e recalibrar safe area 9:16. Fundo por imagem `unproven` precisa de proteção visual efetiva ou bloqueio explícito, não apenas redução de score.

**Prova de encerramento:**

```powershell
npm run harness -- --profile e2 --aspect 1:1,5:6,9:16
npm run harness -- --profile e3 --aspect 1:1,5:6,9:16
npm run harness -- --profile e5 --aspect 1:1,5:6,9:16
```

Os três comandos devem sair com código zero. Adicionar também os dois testes já pedidos e ainda ausentes: fundo inválido chegando a `deterministicEvaluation` e fixture visual deliberadamente sabotada que precisa reprovar.

### CR-004 — tornar o orçamento de chamadas verdadeiro para todo `post.generate`

**Prioridade:** P0  
**Spec afetada:** 003

**Problema confirmado:** o modo `ideation` respeita uma chamada principal + no máximo um reparo. Porém `creationMode: "execution"` chama `routeHighTicketIntent`, que usa LLM, antes do orquestrador; `applyContextBudget` também pode usar LLM. Logo, o orçamento documentado não cobre todo o endpoint.

**Correção exigida:** incorporar essas decisões ao contrato principal, torná-las determinísticas ou declarar e testar um orçamento discriminado por modo. Toda chamada deve aparecer na métrica e no trace, inclusive retries de transporte.

**Prova de encerramento:** testes de integração para `ideation` e `execution`, com contexto pequeno e acima do budget, contando todas as chamadas; execução real de texto, URL e imagem; baseline antes/depois no mesmo corpus com p50, p95, tokens e custo.

### CR-005 — fazer commit/refund financeiro integrarem o resultado terminal

**Prioridade:** P0  
**Specs afetadas:** 003, 004 e 006

**Problema confirmado:** `commitSparkReservation` e `refundSparkReservation` retornam `false` quando a RPC falha, mas o router ignora o retorno. Assim, uma geração pode ser entregue como aprovada sem confirmação do commit, ou terminar sem refund confirmado.

**Correção exigida:** falha de commit/refund deve ser estado operacional explícito, observável e recuperável; nunca sucesso silencioso. Definir política de reconciliação/idempotência sem criar fila ou worker sem necessidade comprovada.

**Prova de encerramento:** testes do router em que commit e refund retornam `false`; cada execução precisa terminar em `committed` ou `refunded`, ou expor falha terminal nominal que impeça resposta de sucesso.

### CR-006 — alinhar o Supabase real ao manifesto

**Prioridade:** P0 externo  
**Specs afetadas:** 004 e 006  
**Depende do dono:** autorização para aplicar migration no ambiente alvo.

**Problema confirmado:** permanecem ausentes `spark_reservations`, `generation_runs.events`, `generation_runs.events_version` e as RPCs `reserve_sparks`, `commit_spark_reservation`, `refund_spark_reservation`.

**Correção exigida:** revisar e aplicar `drizzle/0015_harden_manifest_corrective.sql` no ambiente autorizado, então reexecutar o verificador. Não reescrever migrations historicamente aplicadas nem executar contra outro projeto sem conferir o identificador mascarado.

**Prova de encerramento:** `npm run verify:runtime` com exit code zero, mesmo projeto-alvo, relatório novo com hashes/timestamp e nenhum requisito crítico ausente ou incompatível.

### CR-007 — corrigir a prova de compatibilidade do `postJudge`

**Prioridade:** P1  
**Spec afetada:** 005

**Problema confirmado:** o mock de `postJudge.compat.test.ts` não respeita `PostEvaluation`; o teste verifica `overall`, mas o contrato real possui `overallScore`. A suíte passa enquanto o runtime de teste imprime `score: NaN`.

**Correção exigida:** usar fixture aderente ao schema real e testar `overallScore`, dimensões, verdict e fallback de erro. Depois decidir se o endpoint permanece em compatibilidade ou é removido com decisão explícita do dono.

**Prova de encerramento:** teste sem casts que escondam contrato e sem `NaN` em output/log.

### CR-008 — transformar `verify:e2e` em verificação da matriz completa

**Prioridade:** P0  
**Spec afetada:** 006

**Problema confirmado:** o comando atual cobre apenas texto + estático + ideation + geração + `post.save`. Não cobre carrossel, URL, imagem, HoloDeck, Workbench, edição, reabertura, export, sessão expirada, isolamento entre usuários ou billing test mode. Falha no save não muda o outcome de geração para failed.

**Correção exigida:**

1. cobrir todas as linhas da matriz da SPEC-006;
2. exigir save e readback do snapshot persistido;
3. comparar hash lógico antes/depois da reabertura;
4. produzir e hashear export real, não apenas `snapshot.json`;
5. provar isolamento com dois usuários de teste;
6. cobrir saldo insuficiente, double-submit, provider/schema/persistência e sessão expirada;
7. separar métricas de approved-only das falhas;
8. considerar o run reprovado se save, readback ou export falharem.

**Prova de encerramento:** lote reproduzível com relatório agregado `approved`, artefatos completos por run e cobertura nominal de cada cenário.

### CR-009 — concluir julgamento visual e corte documental

**Prioridade:** P0 de release  
**Spec afetada:** 006  
**Depende do dono:** julgamento de gosto/brand e autorização final do cutover.

**Problema confirmado:** não houve inspeção visual renderizada das 12 famílias × 3 proporções; o novo mestre é rascunho; o hash do legado não é igual ao arquivo atual da raiz porque um delta SPEC-006 foi acrescentado depois da cópia. A validação documental também encontrou nove links quebrados no mestre vigente, apontando para módulos removidos (`visualFitValidator`, `shared/highTicket*` e partes de `server/ai/highTicket/`).

**Correção exigida:** após CR-001 a CR-008, executar inspeção visual, registrar decisão do dono, gerar uma nova cópia byte a byte do mestre vigente, recalcular SHA-256 e somente então substituir a raiz pelo novo documento curto revisado. O novo mestre deve remover ou atualizar os nove links obsoletos; o legado preservado permanece intocado como registro histórico.

**Prova de encerramento:** 36 combinações revisadas ou dispensa explícita; hashes raiz pré-corte × legado idênticos; cada spec com veredito final; zero link relativo quebrado no novo mestre; nenhum risco crítico escondido sob ✅.

## Ordem de execução recomendada

1. CR-001 e CR-002 — fechar a autoridade tipográfica real.
2. CR-003 — tornar `e2/e3/e5` gates verdadeiros.
3. CR-004 e CR-005 — fechar geração e terminalidade financeira.
4. CR-006 — aplicar e verificar infraestrutura com autorização.
5. CR-007 — corrigir a compatibilidade remanescente.
6. CR-008 — executar a matriz E2E completa.
7. CR-009 — julgamento visual e cutover documental.

Não criar uma SPEC-007. Cada correção reabre a spec indicada e deve receber novo pedido de conferência focado no critério que falhou.

## Condição para o próximo veredito global

O máximo permanece `🟡 parcial` enquanto qualquer CR P0 estiver aberta. O programa só pode receber ✅ quando:

- todos os P0 estiverem confirmados por evidência rederivada;
- `check`, testes, build e `e2/e3/e5` estiverem verdes;
- `verify:runtime` estiver verde no ambiente-alvo;
- a matriz E2E estiver integralmente aprovada;
- o dono tiver aprovado ou dispensado explicitamente o julgamento visual;
- o corte documental tiver preservado o mestre vigente byte a byte.
