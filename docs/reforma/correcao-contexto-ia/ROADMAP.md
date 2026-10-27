# Roadmap de correção dos handoffs de IA

15/10/2026 — **planejamento concluído; nenhuma correção implementada**. Três ordens PRONTAS após suas dependências. Decisões sem evidência suficiente permanecem BLOQUEADAS para implementação, com investigação delimitada.

## Base e resultado esperado

Leitura integral de [MAPA-PIPELINE-IA.md](../../../MAPA-PIPELINE-IA.md), [DIAGNOSTICO-QUALIDADE.md](../../../DIAGNOSTICO-QUALIDADE.md) e [PLANO-AVALIACAO.md](../../../PLANO-AVALIACAO.md). Documento-mestre consultado, especialmente §3.2, §8–12, §13.86, §13.115 e §13.119–125; §13.126 registra este planejamento.

Base: branch `main`, HEAD `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61`, com alterações locais relevantes, inclusive arquivos não rastreados de V7/perfis compactos. Sem staged. O plano considera o conteúdo local, não um deploy ou apenas o HEAD. Conferidos raiz, status, diffs locais/staged, scripts e runners. Node `v22.23.2`, pnpm `10.4.1`. Compass indisponível; conferência por `rg` e leitura dirigida. Sem delegação, rede ou acesso administrativo.

Destino adaptado à convenção versionável existente: `docs/reforma/correcao-contexto-ia`, com `ordens/` e resultados exclusivos. O destino padrão da skill, `docs/agent-work`, é ignorado pela regra `docs/*`; `docs/reforma/**` já tem exceção e documentos versionados. Não foi alterado o `.gitignore` nem feito staging forçado.

Resultado funcional pretendido: dados já fornecidos pelo usuário e evidências já carregadas chegam aos consumidores corretos, com autoridade identificada e retomada compatível. A melhoria verificável inicial é a integridade do transporte; ganho de criatividade, conversão ou qualidade editorial exige avaliação própria.

## Agrupamento e prioridade

| Grupo / evidência | Causa e alcance comprovados | Prioridade / decisão |
| --- | --- | --- |
| G1 — C2 e instrução complementar de C7 | Em execution, o helper do briefing omite contexto adicional e `request.content` da seleção. Jev e copy veem projeções diferentes. | **P1 / OS-01**: corrigir a entrada da seleção, antes de ajustar critérios/modelos. Afeta texto/URL/snapshot e ambos os tamanhos de catálogo. |
| G2 — C1 editorial + C3 | Projeções parciais descartam público/essência no adaptador e tom no contexto do revisor. | **P1 / OS-02**: uma entrega vertical Kit/modal → contrato → seleção/copy → revisão. Mais ampla que OS-01 por envolver contrato público e compatibilidade pinada. |
| G3 — parte de C6 | A projeção de snapshot perde IDs/URLs/qualidade e injeta regras antigas no contexto tratado como fonte. | **P2 / OS-03**: transportar proveniência e distinguir síntese, orientação e evidências já salvas. Sem ampliar coleta ou prometer recuperar cortes anteriores. |
| C1 visual — paleta/fonte | A perda é comprovada, mas transmiti-las aos campos atuais ativa filtros de elegibilidade de designs, podendo esvaziar o catálogo. | **BLOQUEADA / INV-03**: decidir semântica visual e medir disponibilidade antes de ligar os campos. Não escondida dentro de G2. |
| C4 — URL não chama DNA completo | Caminho confirmado; falta decidir se análise automática é comportamento desejado, com seu custo/latência/falha. | **BLOQUEADA / INV-01**. Scrape simples continua válido. |
| C5 — imagem serializada/referência sem evidência factual | Transporte confirmado; primeira criação do Studio usa texto/URL e referência de composição não implica fonte factual. | **BLOQUEADA / INV-02**: distinguir papéis e consumidores antes de alterar transporte. |
| restante de C6 — cortes anteriores | Limites de coleta/síntese comprovados; perda material num site real e representação recuperável não demonstradas. | **BLOQUEADA / INV-04**. OS-03 torna a limitação observável, sem retirar limites. |
| restante de C7 e H1–H6 | Diversidade textual, consumo da recuperação, modelo/temperatura, pontos cegos compartilhados e diluição de prompt não têm causalidade quantitativa demonstrada. | **BLOQUEADA / INV-05–06** para correções correspondentes. Avaliar depois de controlar G1/G2. |

P1 significa perda de informação fornecida em fluxo ativo, sem evidência de incidente que justifique P0. P2 atende um ramo explícito de snapshot e depende menos do uso habitual. Dentro de P1, OS-01 vem primeiro pelo alcance e menor superfície de mudança. Não há estimativas de ganho ou gravidade de produção inventadas.

Os contratos mínimos e as regras históricas estão em [CONTRATOS.md](./CONTRATOS.md). Não foram alterados tipos, schemas ou contratos executáveis nesta etapa.

## Ordens e dependências

| Ordem | Estado | Dependência e propriedade | Melhoria entregue |
| --- | --- | --- | --- |
| [OS-01 — seleção](./ordens/01-contexto-selecao.md) | PRONTA | Sem dependência funcional. Primeiro escritor de preparação/testes relacionados. | Seleção passa a receber fonte adicional e pedido complementar efetivos. |
| [OS-02 — marca](./ordens/02-contexto-marca.md) | PRONTA | Após OS-01: compartilha preparação/testes; integra a nova marca ao payload corrigido. | Público/essência sobrevivem ao envio; revisão recebe orientação de marca sem criar veto estético. |
| [OS-03 — snapshot](./ordens/03-contexto-snapshot.md) | PRONTA | Correção funcional independente de OS-01/02; fechamento integrado aguarda ambas. | Consumidores distinguem evidências de síntese/fallback e conservam origem; fluxo integrado continua entregável. |

**Execução padrão: OS-01 → OS-02 → OS-03**, um escritor por vez. OS-01/02 precisam ser sequenciais por caminhos compartilhados. A correção de snapshot é independente das outras no comportamento e no código produtivo, mas o documento-mestre é compartilhado e OS-03 também detém o fechamento integrado. Não há liberação de execução paralela neste checkout. Se houver necessidade futura, primeiro replanejar propriedade do documento, integração e bases em worktrees que incluam as alterações locais; pastas diferentes sozinhas não bastam.

Não existe ordem só de preparação, documentação ou teste. OS-03 acumula a integração para não criar uma unidade sem melhoria funcional. Cada executor escreve somente seu próprio resultado; o roadmap não é quadro de status concorrente. Antes de executar, confirmar exclusividade dos caminhos com o responsável pela sessão. Status Git não comprova ausência de outro escritor; se houver conflito de propriedade, emitir `[BLOQUEIO DE FRONTEIRA]`, sem exigir checkout limpo ou desfazer alterações.

## Passagem e validação

Os comandos abaixo existem no projeto; **não foram executados nesta etapa documental**. Casos novos são especificados nas ordens, ainda não existem. Usar `pnpm exec vitest run ...`, pois `pnpm test -- ...` executou a suíte inteira na investigação anterior.

Testes devem rodar numa cópia descartável do conteúdo local, incluindo não rastreados necessários e dependências instaladas, com raiz própria e sem `.git`, `.env*`, `.aws`, credenciais, artefatos privados ou o log operacional original. Não preparar a cópia apenas de HEAD. Não exportar credenciais do processo para os testes. O motivo concreto é `server/_core/operationalLog.ts`: grava e pode rotacionar `OPERATIONAL_ERRORS.txt` relativo ao cwd; a investigação anterior observou append nesse arquivo. Não alterar o logger como parte destas ordens. Logs/caches/builds da cópia são temporários; nenhum retorno automático de arquivos ao checkout.

Em cada cópia, a partir da raiz equivalente, executar o comando focado da ordem e `pnpm exec tsc --noEmit --incremental false`. Em OS-03, executar uma vez o conjunto integrado:

```bash
pnpm exec vitest run
node --import tsx scripts/evaluateEditorialReplay.ts
pnpm exec tsc --noEmit --incremental false
pnpm exec vite build --outDir /tmp/postspark-contexto-ia-client
pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-contexto-ia-server.mjs
```

Não usar `pnpm build` no checkout: escreve `api/index.js`. Não iniciar dev/worker, benchmark pago, `verify:runtime` ou `verify:e2e` remoto para esta passagem local. Testes novos capturam mensagens com transporte/revisor controlados e bloqueiam `fetch` não mockado; testes PostgreSQL usam a infraestrutura PGlite existente. Não criar runner, dependência ou script de teste novo.

Passagem requer: aceites mapeados a evidências, integração atual aprovada, nenhuma recompra em completed/uncertain, protocolos históricos preservados, e nenhum arquivo fora da lista alterado pelo executor. Falha preexistente é registrada separadamente; não vira teste removido nem dispensa aceite. O replay histórico não mede V7 nem qualidade da copy; manter ausentes como não medidos e fixtures fora de métricas de modelo.

## Fora desta liberação

Investigações e decisões pendentes estão em [INVESTIGACOES.md](./INVESTIGACOES.md). São trabalhos de evidência, não ordens disfarçadas de implementação. Melhorias opcionais: placar editorial separado, diversidade semântica conjunta, outro modelo/revisor, mais recuperações, DNA automático, múltiplas URLs e transporte visual ampliado. Nenhuma é necessária para corrigir G1/G2/G3.

Avaliação online futura segue o PLANO-AVALIACAO: corpus autorizado, rótulos independentes, condições pareadas e orçamento/tentativas definidos antes das chamadas. O pedido atual autoriza planejamento; não autoriza novas compras, mutações remotas ou implantação. RLS, billing comercial real, configuração/worker de produção e qualidade geral não foram homologados.
