# Baseline factual da reforma

**Status:** 🟡 candidata em uso; seis specs com implementação material, mas conferência global reabriu SPEC-001..006 e bloqueou o cutover (2026-08-12)
**Data:** 2026-08-10 (atualizada 2026-08-12)
**Código observado:** `f402518`, com worktree fortemente modificado

**Correções normativas:** [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md). Em caso de divergência de status, o veredito global mais recente prevalece.

## Como ler

- **Fato:** observado em código ativo, contrato ou execução local.
- **Inferência:** conclusão provável sustentada por mais de uma evidência.
- **Pendente:** depende de produção, banco hospedado, segredo, tráfego real ou decisão ainda não implementada.

Esta baseline descreve o estado encontrado. Ela não tenta legitimar toda decisão histórica nem antecipar a arquitetura final.

## Produto que será reformado

**Fato.** O PostSpark 3 é uma aplicação full stack para gerar, editar, salvar e exportar posts e carrosséis com apoio de IA. Seu fluxo principal combina entrada por texto, URL ou imagem; autenticação; geração de conteúdo e composição visual; edição no Workbench; persistência; e cobrança por plano ou saldo de Sparks.

**Decisão da reforma.** O produto, sua shell e seus fluxos utilizáveis permanecem. Módulos problemáticos serão substituídos no lugar em que hoje exercem sua responsabilidade. Não será criado um terceiro PostSpark.

## Arquitetura confirmada

| Área | Estado observado | Fontes principais |
|---|---|---|
| Frontend | React 19 + Vite; páginas e experiência principal em `client/` | `client/src/App.tsx`, `client/src/pages/Home.tsx` |
| API | Express + tRPC, com endpoints REST complementares | `server/_core/index.ts`, `server/routers.ts` |
| Contratos | Tipos e regras compartilhados em `shared/` | `shared/postspark.ts`, `shared/variationSnapshot.ts` |
| Autenticação | Supabase no cliente e bridge de autenticação/cookie no servidor | `client/src/lib/supabaseClient.ts`, `server/_core/supabaseAuth.ts`, `server/_core/sdk.ts` |
| Persistência runtime | Cliente Supabase direto | `server/db.ts` |
| Modelo declarativo | Drizzle e SQLs locais descrevem parte do banco | `drizzle/schema.ts`, `drizzle/*.sql` |
| Billing | Stripe e reserva/commit/refund de Sparks no fluxo de geração | `server/billing.ts`, `server/routers.ts` |
| Build/deploy | Vite para o cliente e bundle do servidor para `api/index.js` | `package.json`, `server/_core/index.ts` |

**Pendente.** O estado das migrations no banco hospedado, variáveis de ambiente, webhooks, storage e serviços externos não pode ser inferido apenas do repositório.

## Fluxo ativo de geração e edição

**Fato.** `post.generate` em `server/routers.ts` concentra hoje um fluxo amplo: reserva de Sparks, chamadas ao modelo, diversificação e revisão, composição de diversidade visual, criação de snapshots, persistência de rastros e commit ou refund da reserva.

**Fato — atualizado em 2026-08-12 pela SPEC-003; conferência global parcial.** `post.generate` virou borda fina e a topologia principal vive em `server/ai/generationOrchestrator.ts`. A chamada principal e o reparo obedecem ao orçamento declarado, mas modos de execução e obtenção de contexto ainda podem acrescentar chamadas LLM; o orçamento global do request não está comprovado (CR-004). Estratégia e captions do caminho principal são determinísticas ou vêm da chamada principal. `GenerationOutcome` distingue `approved`/`rejected`/`failed`, mas o chamador ainda precisa tratar falha de `commit`/`refund` como estado terminal explícito (CR-005). Métricas versionadas incluem chamadas, fallbacks, tokens e custo estimado.

**Fato — SPEC-003, confirmado na conferência global.** Flags `AI_GRAPH_SHADOW`/`AI_GRAPH_PIPELINE`, módulos `server/ai/generationGraph/`, `shared/generationGraph.ts` e `shared/graphEngine.ts` removidos; `runGenerationShadowGraph`/`runGenerationPipeline` não existem mais. Não há segunda máquina de estado de geração.

**Fato — SPEC-005, conferência global parcial (2026-08-12).** Foram removidos módulos, caminhos LLM paralelos, métricas/flags de grafos e dependências sem uso com evidência de grafo de importação. `server/postJudge.ts` permanece como compatibilidade do endpoint público `post.evaluateQuality`; porém, seu teste atual não valida corretamente o campo retornado e deve ser corrigido antes de provar equivalência (CR-007). Ledger do Next: `docs/reforma/NEXT-LEDGER.md`.

**Fato.** A composição das 12 famílias visuais já participa do caminho do servidor por meio de `composeVisualDiversityPlan`. Portanto, a afirmação antiga de que `shared/creative/` é somente cliente não representa mais este worktree.

**Fato.** O frontend normaliza as variações recebidas e carrega um `PostVisualSnapshot` no Zustand. HoloDeck, Workbench e posts salvos já se apoiam nesse contrato, embora ainda existam decisões visuais recalculadas no renderer.

**Fato histórico, superado pela SPEC-003.** `runGenerationShadowGraph` e `runGenerationPipeline` eram chamados no fluxo sob flags desabilitados; esses caminhos e flags foram removidos.

## Autoridade visual atual

O contrato desejado já aparece parcialmente no código:

```text
post.generate
    ↓
normalizador canônico
    ↓
PostVisualSnapshot
    ↓
HoloDeck / Workbench / salvar / reabrir / exportar
```

**Fato.** `shared/variationSnapshot.ts` cria snapshots `snapshotVersion: 3` e aplica `applyVisualFitFallback`.

**Fato — integrado em 2026-08-12 (SPEC-001, veredito com ressalvas).** `shared/variationSnapshot.ts` agora emite `snapshotVersion: 4` com `resolvedTypography` (medido via `shared/typography/resolve.ts`, Fontkit, busca de tamanho por caixa real). `PostCardV2.tsx` só chama `useTextAutoFit`/aplica line-clamp quando `resolvedTypography` está ausente (snapshots v1-v3, ou v4 cuja resolução falhou de forma estruturada — ~23% dos casos medidos no harness, por copy que não cabe no piso). `useTextAutoFit.ts` continua existindo só para esse caminho legado; não decide mais nada quando a resolução determinística teve sucesso.

**Integrado em 2026-08-12 (SPEC-002, veredito com ressalvas).** Única definição de contraste/paleta em `shared/creative/color.ts`; `composeVariation` puro e determinístico; `applyVisualFitFallback` registra `visualFitIssues`/`removedTextElementIds` (fallback observável); safe area por proporção (`safeAreaMarginsPercent`) absorvida do Next; `designRules.ts`/`visualFitValidator.ts` removidos. Dívidas registradas: 3 violações de safe area em 9:16 (`editorial-poster`, `duotone-wash`, `brutal-split`); política de score "unproven" (teto 70) sem validação de produto.

**Conferência global: parcial.** 10 das 12 famílias declaram geometria explícita (`freePosition`+`width`+`height`) via `shared/creative/layoutArchetypes.ts`; `versus`/`mosaic-grid` ficam fora por decisão documentada. O renderer ainda não aplica integralmente o bloco tipográfico resolvido e edições no browser não provocam nova medição (CR-001/CR-002). Carrossel: resolução por slide implementada, mas não persistida no momento da geração.

## O que já existe para corrigir o encaixe

**Fato.** O PostSpark 3 já contém um harness com:

- medição determinística via Fontkit;
- quebra de linhas por largura real;
- busca de tamanho entre teto e piso;
- falha explícita quando o texto não cabe no piso;
- corpus sintético e adversarial;
- métricas de truncamento, encaixe, sobreposição, canvas e uso de grade.

**Fato medido em 2026-08-10 (antes da SPEC-001).** `npm run harness` reportou 13,1% de truncamento no baseline mensurável, 94,1% de encaixe acima do piso, 0% de sobreposição e 0% fora do canvas, com 306 de 612 casos pulados por falta de fonte. A execução **reprovou**.

**Fato medido em 2026-08-10 (depois da implementação da SPEC-001; conferência global parcial).** Com as 7 fontes baixadas, geometria explícita em 10/12 famílias e âncora de corpus real (23 títulos), `npm run harness -- --aspect 1:1,5:6,9:16` mede 2664 casos, **0 pulados**: 20,2% de truncamento, 77,1% de encaixe acima do piso, 4,8% de sobreposição e 0% fora do canvas. O perfil `baseline` passa porque não reprova por limiar numérico; ele **não equivale ao aceite**. Os perfis reais `e2`, `e3` e `e5` reprovam e bloqueiam o fechamento (CR-003).

**Fato.** `postspark-next/packages/design-system` contém outra implementação de medição, resolução de layout, paleta e carrossel. Ela é mais abrangente em empilhamento e constraints, enquanto o harness atual do PostSpark 3 já oferece um núcleo menor de medição e fit.

**Decisão.** A implementação deverá comparar as duas peças, escolher uma única base canônica e absorvê-la no runtime do PostSpark 3. Não manterá dois fitters em paralelo.

## Famílias visuais

**Fato.** Há 12 famílias no contrato atual:

`editorial-poster`, `chromatic-block`, `brutal-split`, `glitch-signal`, `glass-veil`, `kinetic-type`, `data-punch`, `versus`, `quote-authority`, `minimal-air`, `mosaic-grid` e `duotone-wash`.

**Decisão.** As famílias continuam como intenções visuais. Elas podem definir preferência, teto, peso, densidade e distribuição, mas não podem ser a última autoridade sobre um tamanho que já foi resolvido e persistido.

## Persistência, migrations e infraestrutura

**Fato.** O runtime usa Supabase diretamente; Drizzle não é a única camada de acesso.

**Fato — SPEC-004; conferência global parcial (2026-08-12).** `npm run verify:runtime` (`server/verifyRuntime.ts` + `server/runtimeManifest.ts`) valida migrations com o parser real do Postgres, sonda o Supabase configurado em modo read-only e grava relatório JSON anonimizado. Na conferência, terminou com exit code 1 e **6 requisitos críticos ausentes**; a infraestrutura não está aceita (CR-006).

**Fato — auditoria remota (2026-08-12, projeto `spbu…hfir`, read-only via information_schema + histórico de migrations).** `0012` NUNCA foi aplicada (sintaxe inválida — o gate a classifica como artefato histórico); `0005`, `0007`, `0013`, `0014` e `high_ticket_tables.sql` não constam do histórico remoto. Ausentes no banco real: tabelas `spark_reservations`, `site_intelligence`, `content_fingerprints`, `analytics_pageviews`, `analytics_events`, `privacy_logs`; colunas `generation_runs.events`/`events_version`; RPCs `reserve_sparks`, `commit_spark_reservation`, `refund_spark_reservation`, `get_billing_profile` (as RPCs manylabs existem com args; `ensure_manylabs_app_access` não é sondada por ser write). `drizzle/0015_harden_manifest_corrective.sql` consolida a correção idempotente (contrato `events_version: 2`, que o runtime agora grava); **aplicação em produção pendente de autorização explícita do dono** — até lá o runtime degrada com warns e o billing transacional falha reserva para planos não-ilimitados.

**Fato — transações de billing (SPEC-004).** `server/billing.transactions.test.ts` prova com ledger fake a máquina de estados reserva→commit/refund: idempotência de double-submit e de chamadas repetidas, débito único no commit, transições inválidas rejeitadas e estados terminais sempre alcançados. `server/billing.ts` perdeu os casts `as any` (wrapper tipado `rpcCall`).

## PostSpark Next: papel permitido

`postspark-next/` é um repositório Git independente dentro desta árvore. Ele oferece candidatos valiosos: medição com Fontkit, resolução determinística, paleta acessível, estruturas de engine e crítica visual.

Seu papel na reforma é de **doador**:

- uma capacidade é extraída somente quando resolve uma lacuna concreta;
- o código doado é comparado com o que já existe no PostSpark 3;
- a capacidade escolhida entra no caminho principal;
- a implementação substituída é removida ou fica limitada à leitura legada;
- não nasce uma segunda orquestração permanente.

## Contradições que esta baseline resolve

| Tema | Leitura antiga | Estado confirmado / direção |
|---|---|---|
| Base do produto | reconstrução paralela | reformar PostSpark 3 no lugar |
| `shared/creative/` | não conectado ao servidor | famílias já usadas no caminho de geração |
| Autoridade tipográfica | DOM/browser como lei final | resolver deterministicamente antes de renderizar; browser verifica |
| Snapshot | uma entre várias fontes | documento visual autoritativo |
| Harness | prova pronta | ferramenta útil, hoje incompleta por fontes e corpus |
| Next | futuro substituto | doador seletivo |
| Documentação | descrição automaticamente verdadeira | hipótese até cruzamento com código/runtime |

## Lacunas abertas

1. Eliminar a autoridade tipográfica concorrente sem quebrar posts salvos em snapshot v1–v3.
2. Consolidar as implementações de contraste e paleta.
3. Reduzir o número de etapas sequenciais de LLM no caminho síncrono.
4. Decidir o destino do shadow graph e do pipeline experimental depois de medir sua utilidade.
5. Verificar o Supabase hospedado e a sequência real de migrations.
6. Confirmar módulos órfãos por grafo de importação e cobertura antes de removê-los.
7. Fazer o corte definitivo do documento-mestre na SPEC-006, depois das entregas técnicas e conferências.

## Programa fechado de reforma

As lacunas acima foram agrupadas em seis entregas sequenciais, descritas em [`EXECUCAO-AUTONOMA.md`](./EXECUCAO-AUTONOMA.md): autoridade tipográfica; resolvedor visual/cor; geração única/latência; persistência/billing/infraestrutura; remoção de paralelos; e aceite/corte documental. Esse agrupamento é planejamento, não afirmação de implementação concluída.

## Invariantes da reforma

1. Cada propriedade visual tem um único dono no runtime.
2. Toda variação atravessa uma única vez o normalizador canônico e vira `PostVisualSnapshot`.
3. HoloDeck, Workbench, exportação, persistência e histórico consomem o mesmo snapshot.
4. Edições atualizam o snapshot atomicamente; em carrosséis, estado de slide não vaza para a base.
5. Mudança de contrato incrementa `snapshotVersion` e preserva leitura das versões anteriores.
6. Um caminho novo só está integrado quando o caminho antigo deixa de decidir o mesmo resultado.
7. Estado externo só é documentado como fato depois de verificação externa.
