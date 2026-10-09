# Arsenal V2 — implementação e evidências, 2026-10-01

**Estado: implementação local e catálogo draft entregues; publicação humana e aceite operacional pendentes.** Não houve geração paga nesta etapa. O fluxo V2 ainda não está ativado para usuários ou administradores. A geração observada anteriormente com famílias antigas foi explicada pelo ramo V1 e pelas dependências ausentes; sem o run original, não há atribuição comprovada àquela execução específica.

## Funcionalidades implementadas

Catálogo V2 versionado, import idempotente com dry-run/procedência, assets privados verificados, biblioteca real Admin2, publicação transacional guardada no banco, evidências técnicas/humanas distintas, perfis/âncoras versionados, busca exata L1 de 48 eixos, shortlist diversa de até cinco cartões, hidratação tardia e contratos estritos iguais no principal/reparo. Bundles e grants são persistidos antes do sucesso; fallback conserva conteúdo e falha funcional segue estorno. Inicial/gerar mais/histórico usam adaptador comum. CanvasLab permanece autoritativo, com assets por hash, troca explícita de variante, edição, overrides e persistência do modelo materializado. Relatos de compilação têm ownership, hashes, limites e idempotência; motivos de entrega/fallback ficam duráveis no run.

Conteúdo da LLM não recebe receitas/vetores ou autoridade do catálogo. A disponibilidade de listas, cardinalidade, métricas/citações/comparação entra nos filtros; copy factual ainda exige evidência literal. Marca só usa designs com papéis/fontes autorizados; incompatibilidade é explícita. Não foram introduzidos HNSW, mídia automática, novos carrosséis ou alteração de billing.

## Ambiente e migrations efetivamente aplicadas

Projeto confirmado: `spbuwcwmxlycchuwhfir`, schema `postspark`, extensão vector **0.8.0 / extensions**. O MCP autenticado foi usado após a reconexão do proprietário. `0018` já existia e não foi reaplicada.

| Fonte local | Histórico remoto | Entrega |
| --- | --- | --- |
| `drizzle/0019_design_arsenal_v2.sql` | `20261001205515 postspark_design_arsenal_v2` | Índice/evidências/assets/grants, guardas e entrega transacional |
| `drizzle/0020_design_arsenal_brand_fonts.sql` | `20261001212651 postspark_design_arsenal_brand_fonts` | Conjunto autorizado de fontes |
| `drizzle/0021_design_arsenal_publication_presence.sql` | `20261001213432 postspark_design_arsenal_publication_presence` | Campos obrigatórios e proteção contra SQL NULL |
| `drizzle/0022_design_arsenal_native_l1.sql` | `20261001213658 postspark_design_arsenal_native_l1` | L1 nativa exata, mesma métrica/pesos |
| `drizzle/0023_arsenal_generation_trace_columns.sql` | `20261001220228 postspark_arsenal_generation_trace_columns` | Colunas de eventos e motivo de falha no run |

As seis tabelas novas têm RLS e leitura direta exclusiva de backend; bucket `design-arsenal` privado. Conferência real recusou RPC/tabela para anônimo, URL pública de fonte e URL assinada realmente expirada. Grants retêm acesso após arquivamento/off. Não houve reset de banco, exclusão de dados ou rehash V1.

Advisors de segurança consultados pelo MCP: os apontamentos do catálogo são `INFO rls_enabled_no_policy`. Isso corresponde à política deliberada de acesso exclusivo do backend/service_role; não foram adicionadas policies de leitura para usuários para silenciar o aviso. A autorização passa pelo backend e pelos grants, com recusas remotas verificadas.

## Acervo real

Manifesto: `artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z/manifest.json`, 69 arquivos.

| Medida | Resultado |
| --- | ---: |
| Versões persistidas | 10 draft |
| Variantes importadas | 18 |
| Documentos de busca / evidências técnicas | 18 / 18 |
| Fontes privadas verificadas | 4 |
| Variantes sem foto | 7 |
| Versões aprovadas / variantes elegíveis | **0 / 0** |
| Arquivos que exigem autoria adicional | 51 |

Relatório por arquivo: `artifacts/arsenal-v2/import-2026-10-01T20-59-00-631Z/report.json`. Repetição idempotente: `import-2026-10-01T21-16-01-495Z/report.json`, sem aumento do catálogo. As recusas incluem peso real de fonte diferente da receita, efeitos não suportados e texto sem papel identificado. Originais/backups foram preservados. Famílias nativas convertidas: Brutal Split, Glass Veil, Minimal Air e Duotone Wash, três formatos cada; seis combinações têm variante 5:6. Não confundir arquivo de origem, versão, variante e aprovação.

Minimal Air é a proposta inicial sem mídia nos três formatos. Versão `21b3f6c0-8c18-429a-af12-10ae791f1864`, definição SHA `50b6868ec1f037f77a226fa70bad38489b1113f8e26f08001251e1d72b773677`. As três prévias, PNGs oficiais, briefing e hashes estão em `artifacts/arsenal-v2/browser-previews/21b3f6c0-8c18-429a-af12-10ae791f1864_*`. Revisão humana foi solicitada; não existe registro remoto de aprovação. Duas combinações Papel têm título ocluído por uma superfície: ficam draft, apesar de a auditoria de caixas não apontar issues. Validade técnica não é aprovação estética.

## Resultados e denominadores

| Conferência | Resultado | Limitação |
| --- | --- | --- |
| TypeScript | `pnpm check` passou | Não comprova operação |
| Vitest | **101 arquivos, 939 testes passaram** | Inclui testes isolados/simulados, não chamada paga |
| Builds Vite/esbuild | Passaram, saída em `/tmp` | Vite conserva aviso de bundle grande; `api/index.js` não editado |
| Banco isolado | **24 verificações passaram** | PGlite/PostgreSQL+pgvector; atores/evidências sintéticos nunca enviados ao catálogo remoto |
| Runtime remoto | **Falhou: quatro requisitos críticos preexistentes de billing** | Tabelas/bucket Arsenal e novas colunas de trace presentes; 0012 histórica inválida não foi aplicada |
| Busca 500 / 5.000 variantes | 100 consultas/tamanho; p95 **7,576 / 47,754 ms** | Vetores variados sintéticos, PGlite/WASM local, quente após uma consulta; não latência Supabase |
| Distâncias SQL/JS | Erro máximo **1,181e-8**, inferior a `1e-5` | Float32; sem alegação bit a bit |
| Busca remota | 100 RPCs; p95 **40,480 ms** | Zero versões aprovadas, âncora null; não mede ranking de acervo elegível |
| Navegador, cache | 30 lotes / 90 composições; **90 válidas**, p95 **28,2 ms** | Mesmo briefing nos três formatos Minimal Air |
| Navegador, carga inicial | 30 recargas / 90 composições; **90 válidas**, p95 **738,1 ms** | Fontes privadas fetch no-store, módulo/font promises novos; mesma copy |

Navegador real Opera/Chromium/Linux, 12 threads, sessão administrativa existente, APIs Supabase/fontes reais, Stage oficial. Não há mock de transporte nestas prévias. Rede não foi limitada artificialmente. `adapted` sem issues conta como técnico; `needs_adjustment` não conta. Os benchmarks percorrem preview normal/adapt e carregamento de fontes, não a geração comercial completa.

Evidências: `artifacts/arsenal-v2/{remote-probe,database-probe,search-benchmark-native,browser-benchmark-cache,browser-benchmark-cold}.json`; PNGs e screenshot em `browser-previews/`. A soma SQL anterior dos 48 componentes falhou a meta isolada de 5.000 (528,338 ms); a migration 0022 preservou a métrica e adotou o operador nativo, com resultado acima. Esse resultado anterior foi conservado em `search-benchmark.json`.

O corpus fixo de 30 briefings está preparado em `harness/arsenalV2/evaluationCorpus.json` (12 títulos/apoios, seis listas, seis mídia, seis factuais). **Não foi executado nem avaliado por humanos**; casos com foto precisam de foto real autorizada. A taxa ≥90% de shortlist adequada, ≥95% de materialização e ≤5% de fallback inesperado permanece sem resultado. Não extrapolar as 180 composições do benchmark para esses critérios.

## Geração real, modo e bloqueio exato

O verificador de runtime fez 55 sondas: 44 presentes, dez ausentes e uma não verificável. As quatro ausências críticas são `postspark.spark_reservations` e as RPCs `reserve_sparks`, `commit_spark_reservation`, `refund_spark_reservation`. O remoto possui `next_spark_reservations`/RPCs `next_*`, com outras assinaturas/idempotência; não foram tratadas como equivalentes nem foi criado um ledger paralelo. São lacunas preexistentes documentadas no mestre §13.7. Conta DEV/FOUNDER tem bypass existente de Sparks e permite o piloto admin após aprovação, mas isso não valida usuários com saldo. A reconciliação de billing permanece necessária antes de rollout. Relatório atual: `verify-output/verify-runtime-2026-10-01T22-04-16-700Z.json` (exit 1); não declarar runtime completo.

A migration aditiva `0023` resolveu somente as colunas do trace necessárias ao Arsenal. Não reaplicou migrations históricas, não alterou tarifas/reservas e não debitou saldo. Prévia real inspecionada em viewport 390×844, sem overflow lateral; screenshot `browser-previews/review-mobile.jpg`. Essa inspeção não substitui geração/edição/salvamento/IME em mobile.

**Run/trace de geração V2 real: não existe nesta entrega.** Nenhuma LLM foi chamada para gerar um post com estes drafts; nenhum candidato pode ser elegível sem revisão humana. Não existe evidência remota de geração inicial/gerar mais → galeria → editor → salvar → reabrir → exportar. A autorização de outro proprietário, persistência, arquivamento/off e regressões possuem testes isolados; falta o percurso real. O check responsivo M1 anterior não comprova o percurso M3 desktop/mobile ou IME.

`DESIGN_ARSENAL_V2_MODE`: **off**, padrão atual. Não foi ativado `admin` ou `all`. O bloqueio imediato é a decisão humana sobre as três prévias Minimal Air da mesma versão/hash. Os PNGs estão prontos, a pergunta está pendente e o Admin2 permite registrá-la. O contrato proíbe inventar aceite; a decisão técnica não o substitui. Depois de aprovado, registrar evidência das três variantes, publicar transacionalmente, ativar **admin** e medir o percurso real. `all` depende dos demais critérios M4 e aprovações.

## Como gerar, editar e salvar após a ativação admin

1. Administrador abre `/admin2`, revisa os três PNGs Minimal Air, registra a revisão de cada variante e publica a versão. Publicar antes dessa evidência é recusado pelo banco.
2. Ativar `DESIGN_ARSENAL_V2_MODE=admin` no processo local e reiniciar/recarregar o backend; confirmar o diagnóstico de prontidão em `/thevoid`. Isso será feito na continuação após o aceite, não foi antecipado.
3. Pedir um post estático curto com título/apoio, sem foto ou marca arbitrária, por exemplo “Crie um post sobre transformar ideias em conteúdo claro”. Conferir no run os cartões oferecidos, a seleção e a composição efetivamente materializada; estética semelhante sozinha não comprova Arsenal.
4. Abrir a variação na galeria, editar no CanvasLab e salvar. Reabrir pelo histórico e exportar pelo Stage oficial. A foto, quando uma composição a exige, entra por upload no editor; não é adquirida automaticamente.
5. Executar gerar mais e conferir autoria/grants, conteúdo integral, undo/formato, fonte indisponível/recuperação, flag off e mobile. Registrar o run, post e PNG reais antes de declarar M3 operacional.

## Novo design sem deploy

No Admin2, enviar os bytes reais de fontes/assets com licença/procedência e conferir hash, família/peso e limites. Importar um pacote `arsenalImportSchema` com peças e definição V2 completos; recipe portátil ou CanvasPostModel não são esse pacote. A importação prepara draft/índice/evidência técnica, nunca aprovação humana. Prévia usa conteúdo representativo por variante; gerar PNG, revisar, registrar decisão ligada ao mesmo hash e então publicar. Alteração da definição ou transformação de proporção exige nova versão/revisão.

O novo documento aprovado é pesquisável sem deploy e pode aparecer como vizinho das âncoras existentes ou no ranking de metadados. Novas capacidades de motor e novos perfis/âncoras exigem implementação/configuração versionada; não são inferidos por upload. Arquivar exclui de novas seleções e conserva posts/grants/assets anteriores. O rollout continua governado pela flag e critérios.

## Reproduzir as verificações

```bash
pnpm check
timeout 240 pnpm test
timeout 180 pnpm exec vite build --outDir /tmp/postspark-arsenal-v2-build
timeout 90 pnpm exec esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outfile=/tmp/postspark-arsenal-v2-api.js
# Dry-run, sem escrever no Supabase:
timeout 180 node --import tsx harness/arsenalV2/importCorpus.ts
# Banco isolado; dependência temporária do harness:
ARSENAL_DBTOOLS=/tmp/postspark-arsenal-dbtools timeout 180 node --import tsx harness/arsenalV2/databaseProbe.mjs artifacts/arsenal-v2/import-2026-10-01T20-59-00-631Z/packages/02de75fd-37bc-449f-8e6a-ffc163d6269b.json --native --benchmark
# Navegador autenticado no mesmo hostname do backend:
node harness/arsenalV2/serve.mjs
```

Abrir `http://localhost:5180/harness/arsenalV2/index.html`; carga inicial exige recarregar entre lotes, cache exige preparar prévias primeiro. O backend local deve estar ativo em `localhost:3000`. Não confundir este harness com o TheVoid de produção. Não execute `--apply` do importador com ator inventado: exige UUID de conta administrativa real e ambiente confirmado. Não repetir migrations já aplicadas.

Compass indisponível nesta sessão: foram usadas leitura local e buscas dirigidas. O documento-mestre e os contratos foram atualizados; demais alterações existentes no workspace e artefatos de build foram preservados.

## Conteúdo variável V3 — implementação e evidências

Nova autorização do proprietário: abandonar campos visuais universalmente fixos em novas gerações estáticas, mantendo contrato + guardrails. O Studio anuncia V3 e entra no orquestrador nativo mesmo sem ofertas de catálogo. Compatibilidade V2, carrosséis, hashing, billing e gates de publicação permanecem.

Implementação: `shared/variableContent.ts`, helpers em `arsenalContent.ts`, bindings/compiler V3 em `designArsenal.ts`, schemas/orquestrador/API, fallback completo e painel variável no CanvasLab. Quantidades/faixas/negações vêm do pedido original; listas somam o total solicitado, não multiplicam a contagem. Overflow não remove conteúdo; editar/reabrir não reaplica limites de geração. Posts/bundles persistem os blocos; bundle/trace persistem o contrato.

Migration `0024` aplicada remotamente como `20261001232448 postspark_design_arsenal_variable_content`. Normalização de `block:body:4:text → body`, `block:list:0:items → items` e `block:quote:0:text → attribution.quote` confirmada. Helper SQL não executável por `authenticated`, executável por `service_role`. Zero versões aprovadas; nenhum aceite humano fabricado. Probe SQL isolado teve 27 checks, incluindo V3 sem título ainda bloqueado sem revisão, publicação com evidência sintética isolada e recuperação sem exigir título em pedido de corpo.

Evidência do provedor real: `artifacts/arsenal-v2/variable-live-generation.json`, via `node --import tsx harness/arsenalV2/variableGenerationProbe.ts`. Três variações com exatamente um texto em “apenas uma frase”; três com 15 itens totais em “15 dicas”, sem reparo. O probe usa geração/validação produtivas e double de originalidade; não cria posts nem altera reservas, grants ou publicações. Não substitui uma sessão HTTP autenticada, billing de usuário regular ou avaliação visual.

Verificação de editor inclui painel React, 1/15 blocos e 15 itens, edição direta por ID, reordenação, inclusão/exclusão, overrides/fontes preservados, projeção de formato, arquivo portátil/hash e payload de salvar/reabrir. Suíte completa: 103 arquivos/978 testes; tipagem sem erros e builds em `/tmp` (sem regenerar `api/index.js`). Conexão CUA ao navegador expirou em duas tentativas: conferência visual V3 no Stage do navegador e percurso HTTP salvar/reabrir/exportar permanecem pendentes. As quatro lacunas de billing regular registradas acima também permanecem; não foi realizado deploy/rollout geral.

A execução final de `verify:runtime` confirmou somente os quatro críticos preexistentes de billing, com 24 migrations aplicáveis válidas e nenhum erro novo de migration. Relatório: `verify-output/verify-runtime-2026-10-01T23-38-03-072Z.json`. A rodada real final levou 5.829 ms (uma frase) e 11.681 ms (15 dicas), uma chamada principal por pedido e nenhum reparo. Essas medidas são de dois pedidos sintéticos, não p95 nem evidência do corpus de 30 briefings.

## Quantidade livre — contrato versão 2 e prompt positivo

O ajuste autorizado removeu os padrões editoriais 8/4/15. `VariableContentContract.version: 2` aceita `blocks: null` e `listItems: null`; a IA escolhe a estrutura quando o pedido deixa a quantidade aberta. Quantidades explícitas continuam com schema/validação próprios. Contratos versão 1 permanecem legíveis, sem alteração dos dados/hashes. O conteúdo continua V3, bundle/composição V2 e portátil V4; não foi necessária migration.

Arrays livres no schema da LLM não têm `maxItems`. O servidor mantém os limites técnicos de 32 blocos e 64 itens totais, caracteres e metadados. O prompt V3 orienta organização, papéis, evidências e preservação positivamente, sem serializar o contrato inteiro. Prompt principal e reparo usam o mesmo schema por variação; excesso persistente continua rejeitado e conteúdo não é truncado. Contextos editoriais de outros módulos não foram reescritos globalmente.

Validação desta rodada: **986 testes/103 arquivos**, `pnpm check`, build Vite em `/tmp/postspark-free-content-build` e API em `/tmp/postspark-free-content-api.js`, todos concluídos. O build conserva o aviso preexistente de chunks grandes. Testes novos comprovam mais de 15 itens em lista livre (20), mais de 8 blocos livres (20), orçamento técnico inclusive soma entre listas, reparo de excesso, contratos antigos e edição/salvar/reabrir/arquivo portátil. `api/index.js` não foi regenerado.

Evidência real em `artifacts/arsenal-v2/variable-free-generation.json`, gerada por `node --import tsx harness/arsenalV2/variableGenerationProbe.ts`:

| Pedido | Resultado nas três variações | Duração | Reparo |
|---|---|---:|---:|
| Apenas uma frase | 1 bloco de texto em cada | 10.901 ms | 0 |
| Exatamente 15 dicas | 15 itens totais em cada | 11.346 ms | 0 |
| Post livre | 4 blocos em cada; uma variação escolheu lista de 3 itens | 12.604 ms | 0 |
| Lista livre | 3/4/3 blocos e 4/3/3 itens | 17.991 ms | 0 |

Cada pedido teve uma chamada principal e aprovação canônica. Os resultados livres mostram quantidades escolhidas pela IA; a aceitação acima de 15 foi comprovada pelos testes, não por estes quatro exemplos do provedor. O probe usa um double isolado de originalidade e não verifica sessão HTTP, billing nem gravação remota. A evidência histórica anterior permanece em seu arquivo original.

Uma nova tentativa de disponibilidade do navegador via CUA (`getState`, 30 s) expirou. Verificação visual e o percurso HTTP gerar/editar/salvar/reabrir/exportar continuam pendentes de ambiente. As lacunas anteriores de billing regular e revisão humana do catálogo permanecem; nenhum deploy, publicação de catálogo ou alteração da flag ocorreu. O documento-mestre foi atualizado em §13.38 e os contratos/plano foram reconciliados com o comportamento novo.

## Preparação posterior do piloto admin

Após pedido do proprietário para adiantar a ativação, `.env` local foi configurado com `DESIGN_ARSENAL_V2_MODE=admin`. O módulo runtime confirmou `{mode:admin, admin:true, user:false}`. Um servidor piloto foi iniciado em `http://localhost:3001` (3000 ocupada), com GET `/admin2` HTTP 200. O processo original foi preservado; precisa reiniciar para ler a nova flag se for usado. Não foi alterado ambiente de produção.

Minimal Air foi conferido remotamente: versão/definição/hash correspondem às três prévias oficiais de 1:1, 5:6 e 9:16, com evidência técnica, zero humana e estado draft. Os PNGs foram inspecionados e hashes de bytes conferidos. `artifacts/arsenal-v2/pilot-activation-ready.json` deixa a publicação preparada, aguardando decisão visual explícita; nenhuma aprovação foi fabricada. O pedido de continuidade não foi tratado como aceite de imagens ainda não avaliadas. Próximo passo é registrar a decisão real e publicar pela função/RPC guardada, antes da verificação de geração com candidato aprovado. Documento-mestre atualizado em §13.39.


### Correção do retrato (2026-10-01)

Novas gerações usam 4:5 (1080×1350), conservando leitura de 5:6 histórico. Canvas/galeria/fundos/exportação compartilham dimensões corretas. Minimal Air versão 2 foi importado como draft em `8ed8a6f1-dd4d-4878-83be-534404e1b2fd`, com nova variante nativa `4x5-instagram-v1`; versão 1 intacta, aceite/publicação pendentes. Evidências locais em `artifacts/arsenal-v2/instagram-4x5` e PNG do Stage em `browser-previews/8ed8a6f1-dd4d-4878-83be-534404e1b2fd_4x5-instagram-v1.png`. Prévia bundled de fontes idênticas, sem validação de auth/billing/persistência HTTP. Suíte completa: 1.139 testes; TypeScript e builds passaram. Ver §13.40 do documento-mestre.
