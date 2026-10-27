# Correções da auditoria de entrega — handoffs de IA

16/10/2026. **Proposta pronta para execução sequencial; nenhuma correção implementada nesta etapa.**

Este adendo responde a D1–D4 e R1 da [auditoria de entrega](../../../agent-work/correcao-contexto-ia/auditoria-entrega.md). O relatório é local e ignorado pelo Git; os achados necessários estão resumidos aqui para que as ordens não dependam de `/tmp`. A convenção adotada continua `docs/reforma/correcao-contexto-ia`. Os resultados anteriores são registros históricos, não prova de fechamento das pendências.

Base conferida: raiz PostSpark 3, branch `main`, HEAD `40c08323d9f4f3d0fd097a04844f81f9dc9d4b61`, numerosas alterações locais e arquivos novos, nenhum staged. Conferidos implementação atual, produtores/consumidores, diffs locais/staged, scripts e runner. Compass indisponível; leitura dirigida com `rg`. Não houve delegação, teste funcional novo, operação remota ou alteração de contrato executável nesta etapa.

Sem confirmação de exclusividade sobre código/contratos compartilhados, este pacote é uma **proposta**, não mutação dos contratos em uso. Antes de executar, o responsável pela sessão confirma um único escritor nos caminhos da ordem. Não é necessário checkout limpo; alterações preexistentes devem ser preservadas. Não há liberação de execução paralela.

## Resultado observável e decisão de fronteira

| Achado | Decisão de implementação | Ordem |
| --- | --- | --- |
| D1, P1: entrada nova altera a chave Jev e contorna efeito histórico completed/uncertain quando prepared ainda não foi salvo | Recusar preparação histórica já paga sem prova da entrada compatível; para trabalhos novos, fixar entrada antes dos modelos no journal existente. Prepared salvo continua autoritativo. | C-01 |
| D3, P2: requisitos tipados aceitos pela API não aparecem na seleção/Jev | Projetar os requisitos efetivos existentes, com atributos, na mesma entrada fixada. É falha preexistente coberta pelo aceite, não regressão nova. | C-01 |
| D2, P2: snapshot coage tipos e presume ausência de warnings | Validar localmente os campos consumidos, distinguir desconhecido de vazio e conservar evidências exatas. | C-02 |
| D4: testes/relatos não provam toda a cadeia, histórico e retomada | Corrigir provas dentro dos testes existentes, verificar integração real local e reconciliar as declarações. | C-03 |
| R1: diretório anterior alegado como isolado contém `.env` e `.aws` | Nova cópia descartável sem credenciais e com rede não mockada bloqueada. Não inferir vazamento nem apagar dados antigos. | Todas; fechamento C-03 |

A fronteira de C-01 inclui agora o trecho de retomada em `generationRuntime.ts`: o preparador precisa saber que não pode começar uma entrada nova depois de efeito antigo. A autorização é local e expressa na ordem; não se estende a store, SQL, billing, whitelist replay-safe ou reescrita de recibos. Requisitos tipados e proteção de retomada são uma única entrega, pois mudar o payload sem a proteção repetiria D1.

O [adendo contratual](./CONTRATOS.md) resolve a transição. A nova operação local `prepare:selection_input` usa o journal já existente e não acrescenta chamada de modelo, tabela, hash próprio ou versionador. Ela é necessária porque `record.prepared` só é salvo depois dos efeitos cuja recompra foi demonstrada. O transporte público, política 7, preparação 3, perfil editorial 5 e perfis compactos 2 permanecem.

## Ordens e dependências

| Ordem | Estado | Dependência | Entrega |
| --- | --- | --- | --- |
| [C-01 — seleção e retomada](./ordens/01-selecao-retomada.md) | PRONTA | Exclusividade dos caminhos antes de iniciar | Sem recompra entre versões; requisitos efetivos visíveis em Jev/seleção. |
| [C-02 — snapshot](./ordens/02-validacao-snapshot.md) | PRONTA | Após resultado verificado de C-01 | Rejeição de tipos inválidos e proveniência/qualidade sem coerção. |
| [C-03 — integração e evidências](./ordens/03-integracao-evidencias.md) | PRONTA | Após C-01 e C-02 | Aceites completos, passagem integrada e registros corrigidos. |

Cada executor escreve somente seu resultado exclusivo. Não atualizar este roadmap como quadro compartilhado. C-03 não pode consertar módulos produtivos: falha funcional descoberta volta à ordem dona; caminho insuficiente exige `[BLOQUEIO DE FRONTEIRA]`, sem flexibilizar aceite.

## Passagem e ambiente

Todos os comandos funcionais partem de uma **cópia nova do conteúdo local atual**, não só de HEAD e não de `/tmp/postspark-test-run`. Incluir arquivos novos e dependências instaladas. Excluir `.git`, `.env*`, `.aws`, credenciais, configurações privadas, backups privados e `OPERATIONAL_ERRORS.txt` original; não herdar variáveis de credenciais. O logger escreve relativo ao cwd. Não copiar outputs de volta ao checkout.

Incluir os assets públicos/fixtures necessários e, para a suíte completa, as seis receitas locais referidas por `shared/assemblyPilotKit.json`; a auditoria teve um ENOENT por omiti-las na primeira cópia. Não copiar indiscriminadamente toda a pasta de artefatos privados. Registrar presença dos insumos e ausência dos caminhos proibidos sem imprimir conteúdo ou valores de segredos. Logs, cache e builds ficam somente na cópia e em `/tmp`.

Testes novos/alterados bloqueiam `fetch` não mockado antes da ação e restauram os globals. Transporte externo é HTTP controlado; PGlite é descartável. Não abrir UI conectada para gerar, iniciar worker/dev, fazer scrape, benchmark pago, `verify:runtime`, `verify:e2e` remoto, migration ou deploy.

C-01/C-02 executam seus comandos focados e `pnpm exec tsc --noEmit --incremental false`. C-03 executa uma vez, na raiz da cópia atualizada, a passagem existente:

```bash
pnpm exec vitest run
node --import tsx scripts/evaluateEditorialReplay.ts
pnpm exec tsc --noEmit --incremental false
pnpm exec vite build --outDir /tmp/postspark-contexto-ia-correcao-client
pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-contexto-ia-correcao-server.mjs
```

Não usar `pnpm build`: grava `api/index.js`. Não criar dependência, runner ou script novo para executar esta passagem. Os comandos foram conferidos no projeto; **não foram executados neste replanejamento**. Os casos adicionais ainda serão implementados.

Conclusão exige matriz dos aceites originais e corretivos, D1–D4 resolvidos e evidência sanitizada de isolamento. Contagens anteriores não são reutilizadas como resultado atual. Replay continua 33 casos com apenas quatro pareceres históricos reais e nenhum V7 medido; fixtures e `ready` não são homologação semântica. RLS, concorrência remota, billing comercial e produção permanecem fora da passagem local. As investigações INV-01–06 continuam bloqueadas para implementação.
