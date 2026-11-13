# Motor PostSpark — implementação e integração

Contrato de junção atualizado em 11/11/2026, 23h03: [Supabase próprio na VPS](contrato-integracao-supabase-vps.md). Esse contrato incorpora os avanços posteriores da infraestrutura e explicita as lacunas de baseline/Auth/Storage; prevalece para preparar a integração. Este arquivo conserva a descrição da implementação e seus ensaios locais.

Estado em 11/11/2026 (Brasília): implementação local integrada e verificada nos escopos abaixo; **não liberada no destino**. Este registro complementa `plano_implementacao_motor.md`. Instalação, migração física, DNS/proxy e backups continuam sob responsabilidade do chat da VPS. Nenhum serviço remoto foi iniciado por esta entrega.

## Inventário e fronteiras

Base Git: `103b3f5f71048e824095d84cce8efa7f03fd5ac3`. Foram preservadas as alterações anteriores de progresso/histórico compacto, encerramento de acompanhamento, saldo e admissão. O patch inicial foi preservado em `/tmp/postspark-motor-initial.patch` durante a execução.

| Caminho | Dono e contrato |
| --- | --- |
| `/thevoid`, `/studio` | `StudioAppV2BPage`: envio explícito, chave idempotente, três propostas, editor CanvasLab. |
| `generation.start` | Proprietário da sessão; hash da entrada do cliente; catálogo/modelos/política fixados no servidor; RPC de admissão e reserva atômicas. Repetição recupera o mesmo pedido antes de consultar disponibilidade. |
| Geração externa | `generation_v5_requests` e diário de operações são duráveis. `generationWorker` escuta sinais, reclama trabalho com lease e executa `generationRuntime`. |
| Captura de marca | `brandCapture.startCapture` → `brand_capture_start`; mesma supervisão externa e concorrência global. Leitura/reaproveitamento não inicia nova inferência. |
| Liquidação | `generation_settle`/`generation_reconcile`; falha de liquidação de pedido terminal não volta para geração. Stripe entra por `/api/stripe/webhook`, separado do executor. |
| Catálogo/fontes | Revisão imutável, hashes verificados, cache de catálogo e bytes de fontes. Mudança de publicação gera nova revisão; pedido existente permanece fixado. |
| Persistência | `post.save/update/get` → Supabase em `server/db.ts`; `posts.canvas_model` continua documento autoritativo, com CAS por `posts.revision`. Drizzle não é o acesso de runtime. |
| Sessão | Supabase Auth, cookie bridge e tRPC protegido mantidos. Credencial service role somente no backend. |
| Storage | Assets do arsenal, mídia privada do usuário e URLs persistidas precisam estar acessíveis no destino. O helper legado `server/storage.ts` também usa proxy Forge: inventariar URLs legadas antes do corte. |
| Análise | `generationTelemetry.record`: lote descartável, separado de Sparks. `brief_hash` não identifica jornada. |

A falha antiga de acesso à origem foi resolvida segundo o README da VPS. Houve exportação seletiva de usuários, posts e marcas, sem filas/execuções/saldos antigos; não houve importação no destino. A reconciliação de pedidos/reservas ainda não foi demonstrada por esta frente. `scripts/sql/motor-preactivation.sql` prepara a leitura agregada para os ambientes confirmados.

## Executor e custos residuais

A migração `0065` emite `NOTIFY postspark_work` na transação de inserção/mudança, somente com tipo e ID opaco. O listener executa `LISTEN` antes de recuperar pendências. Reinício/reconexão reconstrói a agenda; sinais duplicados apenas pedem nova drenagem. A tabela e os leases continuam sendo a autoridade. A sessão usa limites do servidor (statement 10 s, lock 3 s) anteriores ao timeout cliente de 15 s; timeout de leitura invalida a sessão e força reconexão. Isso segue a ordem documentada pelo [PostgreSQL LISTEN](https://www.postgresql.org/docs/current/sql-listen.html) e a entrega após commit do [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).

Uma tarefa por processo, alternando geração/captura; o limite global existente de três leases é preservado. Há renovação de lease durante trabalho ativo. Não há heartbeat persistido de disponibilidade nem loop ocioso de claim a cada 1–5 segundos. A varredura de segurança padrão ocorre a cada 300 segundos, com envelope de metadados e reconciliação em lotes de 50. O teste de uma hora **virtual** contou inicialização + 12 varreduras (26 claims vazios). Isso não mede uma hora física nem tráfego real PostgreSQL.

Readiness é solicitada na admissão/capabilities e consulta renderer e banco local. Healthchecks do supervisor são custo operacional separado e sua frequência deve ser contabilizada. `/healthz` indica processo; `/readyz` responde 503 se listener/dependências/renderer indisponíveis ou durante cooldown. Credenciais/quota inválidas, rate limit e erro transitório possuem espera persistida; reiniciar não a remove. O diário impede repetição cega de efeitos externos incertos. Sem recibo recuperável, a operação exige reconciliação. O cooldown é gravado no instante do erro conhecido, antes de prosseguir; falha dessa gravação mantém readiness fechada e tenta persistir na recuperação. Se o banco estiver indisponível e o processo morrer antes da gravação, não há como garantir durabilidade desse cooldown; o diário anterior continua protegendo a operação ambígua.

`generation_resources` agrega chamadas e bytes de corpo observáveis por tentativa, separando API do banco, Storage, Auth, provedor e outras fontes/assets. Registra duração, CPU do processo e RSS inicial/final. Não mede pico de memória, overhead TCP/TLS, conexão PostgreSQL, bytes servidor→navegador nem custo exato de concorrência; tais limites estão no próprio evento. Cobrança reportada/estimada/desconhecida permanece no diário existente. O coletor não retém corpos, URLs, chaves ou briefings.

## Seleção e compatibilidade

`POSTSPARK_SELECTION_POLICY=capability_v1` ativa somente pedidos novos. Ausência/`legacy` conserva semântica anterior. O valor enviado pelo cliente é ignorado; repetir a chave usa o pedido antigo. Filhos herdam a política do pedido pai. Recibos de seleção e hashes de revisão preservam a leitura histórica.

A política nova transporta estrutura e capacidades correlacionadas por raiz/oferta, com origem/hash, sem somar máximos incompatíveis. Requisitos distinguem declaração, inferência e limite físico, obrigatoriedade/preferência e trecho de origem. `criteria` continua em cada pergunta ao endpoint; limites de bytes e múltiplos lotes continuam válidos. `fragmentCount` identifica fragmentos e mantém leitura compatível de `minWords` histórico. Encaixe continua sendo verificado pelo medidor existente com fontes reais e novamente após adaptações; presets CanvasLab não receberam alterações de cores.

O corpus em `scripts/selectionMotor/corpus.ts` contém 96 casos. `audit.ts` aceita um snapshot explicitamente identificado e gera relatório com hash do corpus, catálogo e método. A busca final encontrou o pacote `artifacts/design-audit-20261111`, que referencia as definições reais em outra worktree. O snapshot congelado `artifacts/selection-motor/acervo82-build08-snapshot.json` confirma **170/170 IDs e hashes**, correspondentes às 82 famílias do registro atual. Hash canônico: `5617a3b9c2d21c46c7808d36cf7a9a129808da2c6be09c100fe199406ed37c98`; também foram conferidos 53 assets locais por bytes/SHA. Esses arquivos locais não demonstram publicação no banco de destino.

O replay identificado em `artifacts/selection-motor/acervo82-replay.json` usa score constante de teste, não julgamento pago. Houve três planos em **20/96 casos para ambas políticas**, sem violações estruturais detectadas. O corpus inclui 72 casos fora de 4:5, sem cobertura nesse acervo. Nos 24 casos 4:5, há três planos em 12/12 estáticos e 8/12 carrosséis; quatro carrosséis possuem apenas um plano. Isso explicita inviabilidade em vez de quebrar obrigação. O transporte observado passou de 76.899 bytes em dois lotes (legado) a 133.707 bytes em três lotes (capability); maior lote 63.929 bytes, com critérios por pergunta. O dado não autoriza afirmar economia nem melhora editorial; avaliação cega e custo de inferência permanecem pendentes.

O diagnóstico original foi reproduzido no pacote identificado: 23 combinações de eixos autorais (59 repetições), 49 divergências de densidade entre fontes e seis raízes com divergências de papéis de mídia, abrangendo oito slots omitidos; quatro discrepâncias de tipografia foram conferidas contra as famílias de fontes da definição. As 82 disponibilidades estáticas foram construídas para pedidos estáticos: copiar `cover` da raiz não comprovaria uma oferta real de carrossel.

Três escolhidos de um caso 4:5 foram compostos e renderizados com as amostras nativas e fontes/assets locais, sem inferência. Geometria reaberta igual e PNGs byte a byte iguais aos originais do build08. **Isso comprova reprodução, não aprovação visual**: inspeção central encontrou rótulos fora das pílulas em CON-05, texto encoberto em CON-06 e quebra de seta no rodapé de R9-11. Os originais já apresentam esses problemas, enquanto readiness retorna lista vazia. A lacuna do auditor e a correção dessas amostras/contratos são pendências de aceite antes de ativação; não se alterou o catálogo para esconder o problema. Textos são amostras autorais, não respostas ao briefing do corpus.

O replay anterior do cache histórico (428 cards, revisão 4, 25 famílias estáticas elegíveis) permanece separado em `artifacts/selection-motor/local-replay.json`. Ele não corresponde ao registro atual dos 82 e não é usado como seu diagnóstico.


## Editor e telemetria

Proveniência contém `requestId`, `proposalId` e revisão, preservados no modelo e na reabertura. Escolha continua por identidade da proposta. Atualização de CanvasPostModel exige a última revisão confirmada; a comparação ocorre atomicamente no banco. Conflito mantém a edição local e permite salvar uma cópia ou reabrir a biblioteca. A migração `0067` deve anteceder a aplicação; clientes antigos sem revisão recebem conflito explícito ao atualizar documentos CanvasLab.

Telemetria reúne exposição, escolha, alterações consolidadas, salvar, reabrir, PNG e ZIP. Limites: 20 eventos/8 KiB por lote, 120 eventos/minuto/proprietário, deduplicação, retenção de 30 dias e remoção limitada a 1.000 registros por chamada. O servidor verifica pedido/proposta/revisão e proprietário. Não inclui briefing/documento completo. Falha de análise não bloqueia salvar/exportar. Sem evento novo não há timer permanente. Retenção é executada oportunisticamente e na varredura do worker; com aplicação/worker parados, limpeza aguarda retomada.

## Entrega para a VPS

O contrato recebido do outro chat está em `../infraestrutura-vps/README.md`: PostgreSQL 17.6; REST/Auth/Storage de ensaio privados em loopback do host `:18000` ou `api-gw:8000` na rede; banco `db:5432` sem porta pública. Schema/dados e usuários de ensaio ainda não importados. O catálogo já foi empacotado e copiado à VPS, mas não publicado; os bytes de mídia dos usuários continuam pendentes. Não há endpoint final de produção confirmado.

Variáveis sem valores secretos:

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | API/billing/Storage apontam ao mesmo banco do listener. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Build do frontend com Auth do destino; conferir OAuth e URLs da bridge. |
| `GENERATION_WORKER_MODE=external` | Executor dedicado; não iniciar local-demand simultaneamente. |
| `GENERATION_LOCAL_DEMAND_ENABLED=false` | Evita consumidor local paralelo. |
| `GENERATION_ADMISSION_PAUSED=true` | Manter durante preparação/reconciliação. |
| `GENERATION_DATABASE_SESSION_URL` | Conexão PostgreSQL dedicada de sessão, sem pool transacional. |
| `GENERATION_WORKER_HEALTH_HOST`, `GENERATION_WORKER_HEALTH_PORT` | Padrão `127.0.0.1:9465`; entre contêineres usar interface privada e não publicar porta no host. |
| `GENERATION_WORKER_READINESS_URL` | URL alcançável pela API. Uma API serverless externa não alcança loopback da VPS. Topologia deve ser combinada antes da ativação. |
| `GENERATION_WORKER_SAFETY_SCAN_MS` | Padrão 300000; custo/latência medidos antes de alterar. |
| `REVIEW_RENDERER_BUNDLE`, `REVIEW_CHROMIUM_EXECUTABLE_PATH` | Bundle e Chromium compatíveis; não há instalação automática nesta entrega. |
| `OPENROUTER_API_KEY`, `OPENROUTER_RECONCILIATION_KEY` | Inferência e reconciliação; modelos/rotas fixados por configuração existente. Reconciliação é opcional conforme integração. |
| `POSTSPARK_SELECTION_POLICY` | `legacy` por padrão; ensaio restrito pode usar `capability_v1`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, preços existentes | Conferir ambiente e assinatura; cópia de ensaio não deve disparar eventos reais. |

Node 22, dependências com lockfile (`pg` passou a dependência de runtime), renderer compilado e diretório gravável `.postspark-local/catalog` são necessários. Falha de cache em disco não elimina verificação de integridade. Segredos chegam por arquivo privado/injeção na VPS, nunca por chat ou repositório.

Migrações incrementais, sobre **todas as predecessoras realmente aplicadas**: `0064_generation_progress_reads.sql` → `0065_demand_executor.sql` → `0066_generation_telemetry.sql` → `0067_post_revision.sql`. Um banco vazio precisa do baseline completo e compatibilidade de Auth/RPCs antes dessas quatro. Revisar grants: novos RPCs de executor/telemetria são service-role, sem acesso de anon/authenticated. O papel de sessão precisa dos EXECUTE correspondentes; não entregar credencial administrativa inteira.

O worker compara `demand_executor_control.installation_id` via PostgreSQL e REST antes de aceitar trabalho. Uma cópia física preserva esse UUID: a integração deve rotacionar a identidade **do destino** antes da comparação. Nenhuma rotação foi executada aqui.

Comandos preparados (executar no ambiente confirmado, com configuração injetada):

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm motor:preflight
pnpm motor:preflight --online
pnpm start
pnpm generation:worker
```

Preflight é somente leitura, não inicia worker nem aplica SQL. O primeiro modo confere configuração/arquivos; `--online` confere funções, identidade do banco, catálogo e pendências agregadas. `SIGTERM` fecha admissão de claims e aguarda o trabalho atual; supervisão deve conceder prazo compatível com o deadline de geração, sem matar cedo para contornar cooldown.

## Ativação, reversão e pendências de aceite

1. Confirmar um único ambiente de execução/escrita; manter worker antigo parado e admissão pausada.
2. Reconciliar pedidos, reservas e operações ambíguas na origem confirmada. Não apagar recibos nem copiar pedidos ativos para dois consumidores.
3. Aplicar schema ordenado sob coordenação; verificar assets, Auth, dois usuários e isolamento/Sparks no destino.
4. Preparar ensaio pago identificado com modelos/preços atuais, estimativa e orçamento explícito. Nenhuma chamada paga foi feita nesta implementação.
5. Executar a jornada completa real e falhas de conexão/processo/provedor/liquidação, com catálogo identificado. Comparar qualidade final às cegas e inspecionar render/export.
6. Observar uma hora ociosa real e janela de 24 horas; medir PostgreSQL→servidor, servidor→navegador, Storage, provedores, CPU/memória e cache frio. Definir envelopes a partir dos resultados, sem limitar qualidade por suposição.
7. Ativar restritamente somente após esses critérios. Para reverter seleção de pedidos novos, usar `legacy`; os existentes conservam sua política. Para reverter executor, pausar novos pedidos e drenar/reconciliar antes da troca. Não reiniciar worker antigo nem apontar a uma cópia velha dos dados como rollback automático. Manter migrações/colunas compatíveis.

P0–P4 possuem implementação local e evidências específicas, incluindo snapshot dos 82; melhora editorial, aceite visual das amostras, serviços reais e consumo final continuam pendentes. P5/P6 **não estão concluídos** sem o destino e o ensaio acima. As métricas locais não autorizam anunciar economia percentual, execução externa exatamente uma vez nem jornada de produção aprovada.

## Evidências locais reproduzíveis

- `pnpm check`: TypeScript sem erros.
- `pnpm test:egress`: 113 testes aprovados; sem acesso externo.
- `pnpm test:local-demand`: 278 testes e dois harnesses aprovados; sem acesso externo.
- `pnpm test:motor`: 171 testes aprovados em 24 arquivos, incluindo timeout do listener, cooldown imediato, proteção do diário e readiness com backlog.
- Build frontend Vite, API esbuild e renderer esbuild aprovados; saídas temporárias fora dos artefatos versionados. O aviso de bundle frontend maior que 500 KiB permanece.
- `node --import tsx scripts/testing/motor-journey.browser.ts` (Chromium do Playwright ou `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`): navegador Chromium com React/Konva reais. TheVoid → três propostas → escolha por ID → edição → PNG → salvar → biblioteca → reabrir → PNG/ZIP. Documento reaberto equivalente, PNG 3840×3840 byte a byte idêntico, ZIP de duas páginas, nenhum erro de página e nenhuma consulta de geração/cobrança na janela ociosa de 6,5 segundos.

No ensaio de navegador, API, autenticação, provedor, cobrança e persistência são simulados. Os testes PostgreSQL usam PGlite local. Isso verifica partes concretas da jornada, mas não prova integração com a VPS, isolamento do Storage remoto, qualidade de inferência ou consumo de produção. O teste real continua pendente.

[Registro de evidências](motor-validacao.json) conserva hashes, método do replay e chamadas/eventos da jornada. Capturas e exports da execução estão em `/tmp/postspark-motor-journey`; o harness permite regenerá-los. A verificação de configuração com ambiente vazio falha como esperado; nenhum preflight online do destino foi realizado.

Para repetir a evidência do acervo, indicar o diretório imutável `build-08` registrado em `acervo82-build08-provenance.json`:

```sh
node --import tsx scripts/selectionMotor/freezeCatalog.ts --build-dir "<diretório do build>" --revision acervo82-local-3-build08
node --import tsx scripts/selectionMotor/audit.ts --snapshot artifacts/selection-motor/acervo82-build08-snapshot.json --out artifacts/selection-motor/acervo82-replay.json
node --import tsx scripts/selectionMotor/renderSelected.ts --build-dir "<diretório do build>"
```

O último comando usa renderer/Chromium local previamente disponível, com chamadas externas bloqueadas no ensaio registrado. Não instala dependências nem publica catálogo. Os snapshots, assets e renders volumosos permanecem em `artifacts/`; o registro resumido versionável conserva método, hashes e limitações.
