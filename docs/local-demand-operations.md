# PostSpark: execução local sob demanda

Modo local ativado em 22/10/2026, após autorização específica, no projeto `spbuwcwmxlycchuwhfir`. O BizuMiner não faz parte desta alteração.

## Instalação ativada

As migrations preparadas 0040–0042 foram aplicadas com os registros `20261022183832` (`postspark_catalog_revisions`), `20261022183842` (`postspark_local_demand_generation`) e `20261022183851` (`postspark_gallery_previews`). Não reaplicá-las. A revisão inicial publicada é `1`, construída e validada a partir das 229 fichas existentes, com hash `f7fa6c4464633ba957ddba76bc5699c7876180451d5bcd5d4af741f26bb1d8db`.

A configuração local usa `GENERATION_LOCAL_DEMAND_ENABLED=true` e `GENERATION_WORKER_MODE=local-demand`. Iniciar o backend com `pnpm dev`; o comando `generation:worker` recusa execução quando essa ativação local está habilitada. O backend carrega `.env` antes dos módulos que leem a configuração. O renderer foi reconstruído e o executável existente do Chromium foi localizado, sem instalar browser ou executar geração paga.

Na conferência real do cache, dez usos no primeiro processo fizeram uma leitura do manifesto e um download do snapshot. Dez usos em outro processo fizeram apenas uma leitura do manifesto; o snapshot veio do disco. Uma verificação sintética confirmou prompts, respostas e eventos nos arquivos locais, mantendo inalteradas as contagens das tabelas remotas de diagnóstico. Isso não equivale a uma geração completa com IA.

### Observação real do backend

Na janela de 22/10/2026 18:41:42–19:11:42 UTC, a instrumentação local registrou zero chamadas a `generation_v5_claim`, `generation_reconcile`, `generation_v5_worker_heartbeat` e `generation_v5_worker_available`. A janela incluiu hot reload e novas tentativas de autenticação, portanto não demonstra 30 minutos de ociosidade absoluta. Foram 294 chamadas: 144 a Auth, 120 a provisionamento de acesso, 24 a verificação de acesso e seis leituras de dados/resumo. Houve outras 128 chamadas no carregamento anterior à janela, incluindo a recuperação inicial; elas não estão incluídas nas 294.

Os diagnósticos locais posteriores mostraram sincronizações paralelas do mesmo token, em grupos de seis, com cookie já igual e sem o identificador enviado pela ponte atual. O usuário informou uma única aba nova, sem interação: múltiplas abas não explicam esse relato. O Vite entrega os módulos novos com provider e ponte compartilhada, mas isso não comprova qual código originou as chamadas anteriores no navegador. A origem dos grupos sem identificador permanece em investigação. Um teste isolado com tRPC e ponte reais, cinco consumidores, novas renderizações, eventos repetidos da mesma sessão, foco e 30 minutos de relógio simulado não reproduziu a repetição. Após a correção do callback, o usuário confirmou login Google bem-sucedido e entrada no Studio. Não atribuir o pico anterior de autenticação a polling de fila, nem considerar toda a atividade eliminada só porque o worker ficou ocioso.

Na conferência seguinte, os registros locais mostraram mais 6.060 recebimentos da ponte sem identificador, entre 19:35 e 20:11 UTC, todos com cookie já igual ao token. Portanto, o curto silêncio anterior não comprovou resolução. Às 20:45 UTC, sockets locais identificaram conexões simultâneas de Firefox e Vivaldi com a porta 3000; isso não identifica qual navegador originou cada chamada. Após autorização explícita, ambos foram encerrados normalmente por SIGTERM e nenhuma conexão com a porta permaneceu. O backend continuou ligado sem worker de geração. A validação com um único navegador reaberto permanece pendente; ausência de chamadas com os navegadores fechados não comprova o aceite do Studio ocioso.

Os números acima medem requisições dos processos instrumentados. Não incluem todo o tráfego de ferramentas de publicação, migrations e verificações via MCP, não medem Egress faturado e não reconciliam consumo mensal ou de outros aplicativos no projeto.

## Comportamento

O backend de desenvolvimento passa a usar `local-demand` por padrão. Abrir o servidor não inicia Chromium ou um consumidor de fila. Depois da ativação, há uma recuperação inicial dos pedidos deste executor. Pedidos novos acordam um supervisor local depois do commit; ele inicia um filho por pedido e processa a fila conhecida sequencialmente. Quando acaba o trabalho, não há busca periódica de novos pedidos, reconciliação global ou heartbeat de disponibilidade.

O banco continua controlando admissão, idempotência, limites globais, lease, resultados incertos e Sparks. Um pedido local registra `execution_mode`, `executor_scope` e `catalog_revision` na mesma transação da reserva. O arquivo privado `.postspark-local/executor-id` identifica esta instalação; não é uma identidade histórica de cada processo. Não o remova enquanto existirem pedidos a recuperar.

Pedidos com lease válido aguardam seu vencimento por um agendamento único. Falhas de despacho têm cinco novas tentativas, em 1, 2, 5, 10 e 30 segundos. Depois, ficam disponíveis para retomada explícita; um agendamento no prazo final permite encerrar o pedido e tratar a reserva. Não há varredura ociosa. Uma falha de recuperação inicial é informada no console; reiniciar o backend ou retomar o pedido explicitamente permite nova tentativa.

Durante uma execução, a renovação de lease permanece a cada 10 segundos, sem sobreposição. A resposta local contém apenas o estado; ela não baixa novamente todos os documentos do pedido. Ao perder IPC, receber sinal ou ocorrer hot reload, o filho interrompe novas operações e fecha seus recursos. Resultados já registrados são reutilizados; operações pagas incertas não são repetidas cegamente. O lease cerca o executor antigo, inclusive quando dois backends compartilham a mesma identidade local.

## Catálogo e publicação

`catalog.manifest` é protegido e retorna revisão, formato, escopo e resumo. `generation.capabilities` usa o mesmo resumo pequeno. Nenhum desses caminhos carrega o catálogo inteiro.

A publicação valida definições, fichas, identidades, assets e regras de seleção autoral. `catalog_publish` verifica a revisão da área de preparação e troca o ponteiro ativo atomicamente. Uma escrita concorrente invalida a publicação desatualizada. Revisões publicadas e suas definições não admitem UPDATE/DELETE. Arquivamentos participam da escolha da revisão autoral, impedindo ressuscitar uma versão antiga.

A revisão contém fichas compactas; as definições completas ficam em `catalog_revision_definitions` e são buscadas somente após a seleção. Assets são verificados por SHA-256 e reutilizados em disco. Preparação, JEV, montagem e entrega usam a revisão admitida. A entrega local valida a versão fixada; o executor externo mantém sua verificação de elegibilidade atual.

Escritas de componentes, aprovação, arquivamento e manutenção do índice marcam o catálogo como alterado. Os caminhos locais de escrita publicam ao concluir; importação de componentes e publicação de carrosséis agrupam a publicação depois de validar o lote. Se a preparação falhar, a revisão antiga continua íntegra, mas novas admissões ficam bloqueadas até uma publicação válida. Escritas SQL diretas ou ferramentas antigas também marcam a revisão como alterada e exigem publicação explícita.

O navegador guarda fichas por projeto, formato, usuário, escopo e revisão em IndexedDB, com fallback em memória. Downloads concorrentes são compartilhados; Web Locks coordenam as abas que suportam essa API. Logout e troca de conta limpam dados privados e invalidam respostas tardias. O servidor nunca aceita as fichas do navegador como fonte autoritativa. O executor usa cache de disco privado por projeto/revisão e conteúdo validado. Arquivo corrompido ou falta de espaço permite buscar novamente os dados necessários. Não existe timer de atualização do catálogo.

## Interface, sessão e biblioteca

No modo local, capacidades são consultadas na entrada e nas ações de criação. O saldo é atualizado por operações e entrada nas telas, com atualização manual disponível na tela de billing. A assinatura de autenticação pertence a um único `AuthProvider`; componentes apenas consomem esse estado. O cookie bridge é deduplicado por token, com coordenação entre abas. Em desenvolvimento, tokens são renovados no uso, sem renovação automática contínua por ociosidade. As verificações de usuário e acesso permanecem no backend.

O retorno do Google aguarda `supabase.auth.getSession()`: o SDK pode ter consumido e removido o fragmento da URL antes da montagem da tela. A conclusão explícita do login repara o cookie por meio da ponte compartilhada, mesmo se um marcador local antigo tiver sobrevivido à remoção do cookie. O modal de login também usa essa ponte; não há caminhos paralelos de sincronização. O servidor continua validando token e acesso ao aplicativo.

O canal `GET /api/generation/events/:id` exige sessão válida e propriedade do pedido. Recebe eventos compactos do filho por IPC depois da persistência; não consulta o banco por relógio. Eventos iguais são descartados. Resultados completos são consultados quando há entrega, conclusão, entrada ou reconexão; eventos intermediários não carregam bundles. A renovação do lease não emite eventos repetidos.

Ao ocultar a aba, sair da tela ou encerrar a sessão, o canal fecha. Ao voltar, há leitura autoritativa e nova assinatura se houver trabalho. Reconexões automáticas se limitam a três tentativas, em 1, 2 e 5 segundos. A execução continua sem navegador. Pendências de liquidação são acompanhadas até a conclusão ou recuperação explícita, preservando a atualização do saldo.

A biblioteca usa `post.listSummary`, com páginas de 20 itens e contagem. O documento completo é buscado ao abrir. Novos salvamentos podem incluir uma miniatura derivada da capa, limitada a 100 KB; ela nunca substitui o `CanvasPostModel`. Posts antigos, capas indisponíveis e salvamentos feitos em outro slide mantêm a ação “Carregar prévia”. Não há migração destrutiva dos documentos nem alteração do modelo autoritativo, salvamento, reabertura ou exportação.

## Diagnóstico e retenção

No modo local ativado, prompts, respostas e evidências detalhadas vão para `.postspark-local/diagnostics`, ignorado pelo Git, com arquivos privados. A rotação limita cada arquivo a 5 MiB. A limpeza ocorre durante as gravações, removendo arquivos com mais de sete dias e os mais antigos acima de 500 MiB; não existe cron de limpeza ocioso. Falhas do gravador são visíveis no console. Credenciais e tokens são redigidos.

`auth-session.jsonl` registra localmente a fase de autenticação, origem da chamada e presença/correspondência do cookie. A correlação usa um hash abreviado da sessão; tokens, cookies e parâmetros de retorno OAuth não são gravados. Esse diagnóstico não substitui validação de sessão ou de acesso.

Checkpoints, operações incertas, resultados necessários à recuperação, referências de entrega, recibos e dados financeiros permanecem no Supabase. Registros históricos e logs da plataforma não são apagados. Diminuir conteúdo em tabelas, tráfego de saída e Log Ingestion são resultados distintos, a medir separadamente.

## Medição local de chamadas e bytes

`pnpm diagnose:start -- --minutes 30 --scenario observed` abre uma captura limitada e imprime seu identificador. O backend local e os filhos do executor observam `.postspark-local/network-capture.json` por evento de filesystem. Não há consultas ao Supabase para alimentar o diagnóstico. `pnpm diagnose:stop` encerra antecipadamente; `pnpm diagnose:report -- IDENTIFICADOR` gera JSON e Markdown em `.postspark-local/network-reports`. O relatório pode ser atualizado durante a captura, com indicação explícita de janela parcial. Também aceita a última captura sem identificador. Não pode haver duas capturas locais simultâneas. Ao atingir o prazo com o backend ligado, ele encerra o arquivo e executa uma única geração do relatório em um processo local, sem rede. Se o backend for interrompido, o relatório pode ser gerado manualmente e indicará a cobertura que faltou.

Os cenários disponíveis são `observed`, `backend-idle`, `studio-visible`, `studio-hidden` e `generation-active`. O nome é uma declaração de quem opera a medição; não prova sozinho que o usuário ficou inativo. Para comparar, abrir janelas distintas e registrar o estado real da interface. Capturas começam no momento do comando, não retroativamente. Se iniciadas antes do backend, incluem a recuperação inicial, identificada como `startup-recovery`. O relatório não extrapola a amostra para o mês.

Cada tentativa HTTP ao Supabase configurado recebe identificador, processo, papel, endpoint sanitizado, duração, status, conclusão e contadores de corpo enviado/recebido. As chamadas originadas da API são correlacionadas à rota, aba e visibilidade quando o navegador envia esses metadados; o navegador também é classificado pelo User-Agent, que não é prova absoluta de sua identidade. Query strings, nomes de objetos de Storage, corpos, cookies, tokens e credenciais não são armazenados. Chamadas em batch contam uma requisição HTTP; `api.operations` expõe separadamente a quantidade de procedimentos no batch. Os registros brutos contêm locais de chamada do backend quando disponíveis.

No Node 22/Undici 6, os canais oficiais não incluem chunks de corpo. O coletor conta seus comprimentos nos handlers `onData`/`onBodySent`, preservando argumentos, contexto, retorno, fluxo e backpressure. Não clona respostas nem cria chamadas extras. É uma integração dependente da versão: `pnpm diagnose:calibrate` verifica gzip, upload, chunks, erro HTTP, correlação Express, selo do arquivo e recusa de controle com origem externa usando somente servidores locais. Repetir a calibração ao atualizar Node/Undici. Interfaces incompatíveis produzem bytes desconhecidos em vez de zero. São bytes de corpo HTTP antes da descompressão, excluindo cabeçalhos, TLS/TCP e critérios de faturamento; não equivalem ao Egress faturado.

Em desenvolvimento no loopback, o navegador abre um canal SSE de controle local, sem heartbeat quando não há captura. Durante uma captura ele envia presença/visibilidade e metadados de fetch/Resource Timing a cada dez segundos, somente para o próprio computador. Esse tráfego é separado como `diagnosticOverhead`; não vai ao Supabase. Nenhum cabeçalho novo é adicionado a chamadas diretas ao Supabase, evitando preflight extra. Restrições de Timing-Allow-Origin deixam tamanhos cross-origin desconhecidos. Fetches diretos do navegador e consultas do backend são apresentados separadamente, sem somar suas contagens ou bytes como se representassem Egress. A página precisa carregar o código novo para participar. Navegadores sem EventSource, abas congeladas e throttling podem deixar a cobertura inconclusiva.

Pulsos locais a cada dez segundos, apenas durante a captura, verificam que o coletor está vivo. O encerramento grava um selo depois das gravações pendentes; falha de escrita, cobertura ausente, lacunas ou janela incompleta impedem um resultado conclusivo. Os pulsos e o canal local não consultam o banco. Arquivos têm retenção de sete dias/500 MiB compartilhada com os demais diagnósticos locais e rotação por arquivo de 5 MiB. Falhas de gravação são visíveis no console. O controle aceita somente loopback, host local e origem compatível. A instrumentação é desativada na Vercel/produção. Não cobre outros aplicativos, ferramentas, processos não instrumentados, clientes HTTP nativos, WebSocket/Realtime nem os logs internos da plataforma.

Um backend desligado não produz uma amostra de ociosidade válida. O relatório exige cobertura do backend e, para os cenários de interface, presença da página; a ausência de eventos não é tratada como prova de consumo zero fora desse escopo.

Os identificadores são técnicos, sem vínculo com a conta: `tabId` usa sessionStorage e pode ser copiado ao abrir uma aba por outra; `pageInstanceId` muda a cada carregamento. A combinação ajuda a separar reloads de documentos simultâneos, mas não deve ser usada isoladamente para afirmar quantas abas o usuário abriu.

Referências da integração de transporte utilizada na calibração: [canais do Undici 6.28](https://github.com/nodejs/undici/blob/v6.28.0/docs/docs/api/DiagnosticsChannel.md) e [handlers do Request nessa versão](https://github.com/nodejs/undici/blob/v6.28.0/lib/core/request.js). A compatibilidade de contagem de corpo é conferida pela calibração local, sem assumir que versões futuras tenham o mesmo comportamento.

## Ativação em outra instalação — requer autorização específica

1. Conferir o projeto de destino e o estado das migrations existentes, preservando o diff local. Esta entrega depende dos contratos de geração e billing já existentes, em particular 0034–0036.
2. Aplicar, após autorização e somente se ausentes, `0040_catalog_revisions.sql`, `0041_local_demand_generation.sql` e `0042_gallery_previews.sql`.
3. Validar o catálogo atual usando `pnpm exec tsx scripts/publishCatalogRevision.ts --project=spbuwcwmxlycchuwhfir --check`. Esse comando faz uma leitura remota: executá-lo somente na validação autorizada. Corrigir dados inconsistentes antes de publicar.
4. Publicar a revisão inicial com o mesmo comando e `--publish`, somente após autorização de escrita. A publicação inicial não é feita automaticamente pela migration ou pelo boot.
5. Preparar o renderer e verificar Chromium e configuração do provedor. `generation.start` verifica pré-requisitos locais antes de reservar Sparks. Instalações/downloads e testes pagos não foram executados nesta entrega.
6. Configurar `GENERATION_LOCAL_DEMAND_ENABLED=true`, manter `NODE_ENV=development` e usar `GENERATION_WORKER_MODE=local-demand` (ou o padrão de desenvolvimento). Ativar deliberadamente no backend escolhido. Não executar `generation:worker` junto com esse modo.
7. Fazer uma validação remota pequena e autorizada: uma geração, recuperação controlada e períodos ociosos. Contar autenticação, manifesto, recuperação e tráfego de resultados; comparar métricas da plataforma em janelas equivalentes.

Produção continua no modo `external`, com sua infraestrutura e comportamento existentes. `GENERATION_WORKER_MODE=external` também permite manter o modo anterior no desenvolvimento; a interface respeita o transporte de progresso informado pela API. Desativar o modo local não transfere seus pedidos para produção: eles continuam associados ao executor local e precisarão dele para retomada. Computador desligado não executa gerações.

## Verificação isolada e limites da evidência

A validação isolada usa PGlite (PostgreSQL local), provedores simulados e bloqueio de HTTP/HTTPS/fetch/conexões de rede pelo preload `scripts/testing/block-network.cjs`. Nenhum serviço real ou geração paga foi iniciado nessa etapa. Testes de componente usam ambiente DOM simulado; não equivalem a uma sessão real no navegador contra Supabase.

| Verificação | Evidência isolada |
| --- | --- |
| 30 minutos ociosos | Relógio simulado: uma recuperação inicial, zero leituras periódicas de fila/reconciliação; SSE não faz novas consultas por tempo |
| Dez usos de catálogo | Um download compartilhado; reinício do módulo reutiliza arquivo; definição completa só após seleção |
| Corrupção e disco cheio | Redownload validado e fallback em memória; dados de escopo errado rejeitados |
| Cinco componentes / duas abas | Uma assinatura de auth no provider; chamadas concorrentes de dois módulos independentes compartilham uma sincronização do cookie |
| Aba oculta, logout e reconexão | Fechamento de canal e limpeza de listeners; três tentativas automáticas no máximo |
| Admissão e cobrança | Repetição mantém pedido e reserva; outra máquina e executor externo não capturam pedido local |
| Queda e lease | Lease antigo rejeitado; operação paga interrompida fica incerta; dois backends com o mesmo escopo não adquirem duas tarefas |
| Publicação durante geração | Revisão antiga imutável e utilizável; publicação desatualizada rejeitada; arquivamento posterior não troca a revisão admitida |
| Biblioteca e editor | Resumos paginados; documento buscado por ação; testes existentes de persistência, reabertura, exportação e billing preservados |

Resultado da matriz selecionada após a ativação e a correção do retorno Google: **220 testes aprovados em 33 arquivos**, incluindo a recusa do consumidor antigo no modo local, callback após consumo da URL pelo SDK, espera pela inicialização, recusa de acesso, reparo deduplicado do cookie, privacidade dos diagnósticos locais de sessão e rotação de arquivo ativo por idade. Tipagem e builds de frontend/backend foram aprovados; os bundles foram gerados em diretório temporário e o renderer local foi reconstruído para a ativação. O build do frontend emitiu aviso de bundle grande; esta mudança não pretende resolver seu tamanho.

A matriz verifica mecanismos e falhas com simulações controladas. Não mede Egress faturado, latência real de Chromium/IA, comportamento de proxies SSE, concorrência de múltiplas conexões Postgres remotas ou o consumo mensal. Um download em dez usos corresponde a eliminar nove downloads repetidos nesse cenário de teste; não é uma promessa de 90% de economia mensal. A aceitação operacional remota e a medição de 30 minutos reais ficam para a etapa autorizada de ativação.

Reprodução da matriz selecionada: `pnpm test:local-demand`. Tipagem: `pnpm check`. Para testes individuais, usar `NODE_OPTIONS='--require=./scripts/testing/block-network.cjs' pnpm exec vitest run` com os arquivos relacionados à alteração. O preload é exclusivamente de teste e não deve ser usado para iniciar a aplicação.
