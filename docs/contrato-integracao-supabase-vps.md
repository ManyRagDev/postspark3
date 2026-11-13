# Contrato PostSpark ↔ Supabase próprio na VPS

**Leitura vigente (12/11/2026):** os relatos abaixo preservam a evolução do alinhamento. Para integrar, prevalecem os adendos mais recentes: baseline reconciliado seguido de **0064 → 0065 → 0066 → 0067 → 0068 → 0069**, mais **0070 para o ensaio restrito de catálogo**, acesso próprio (sem ManyLabs) e [login por e-mail/senha](#login-por-e-mail-e-senha--12112026). Usar os hashes corrigidos de 0064/0065 e o procedimento de importação restrita ao fim deste arquivo. A prontidão local não comprova deploy nem aceite do ambiente remoto.

Conferência: **11/11/2026, 23h03, Brasília**. Escopo: alinhamento, sem deploy, aplicação de SQL, importação, início de worker ou chamadas pagas. Fontes: código local e [README da infraestrutura](../../infraestrutura-vps/README.md), incluindo atualizações das 22h42/22h55. Não foi feita nova consulta à VPS nesta conferência. As entradas mais recentes do README prevalecem sobre seus relatos históricos de falha de acesso.

## Atualização: acesso próprio implementado localmente

Decisão posterior do usuário: manter Supabase Auth e substituir a dependência
ManyLabs por autorização própria. Os relatos ManyLabs abaixo descrevem o estado
anterior; para a entrega atual prevalece esta seção.

- `drizzle/0068_app_access.sql` cria `postspark.app_access` e RPC
  `postspark.has_app_access(uuid)`. Aplicar após o baseline/0064–0067 e antes
  da API nova. Nenhum usuário é automaticamente incluído pela migração.
- Bridge e autenticação por request consultam a mesma RPC somente leitura.
  Não há chamada runtime a `ensure_manylabs_app_access`, cadastro implícito,
  reativação no login ou fallback ao ManyLabs. Erro/ausência de schema nega acesso.
- Supabase Auth continua validando tokens. UUIDs e identidades são preservados;
  usuário Auth não recebe acesso ao PostSpark por existir ou por metadado editável.
- Somente operador de migração/administração concede ou revoga acesso; service_role
  executa a leitura via RPC, sem privilégios diretos na tabela. RLS ligada, função
  SECURITY DEFINER com search_path fixo, criada por proprietário de migração confiável.
  Conferir ACLs herdadas no destino. Sem permissão de escrita para o navegador.
- Provisionar grants somente para UUIDs com acesso legitimamente confirmado.
  Não promover os quatro Auth exportados por pertencerem ao pacote, nem deduzir
  plano/saldo/admin a partir do grant. Os 46 posts continuam sem atribuição presumida.
- Garimpa mantém seu controle próprio por role/membership/conta, associado ao
  mesmo Auth. Acesso ao PostSpark não concede acesso a contas Garimpa e vice-versa.
- Baseline novo deve omitir wrappers/triggers de provisionamento ManyLabs para
  este fluxo, após conferir dependências; não executar DROP CASCADE na origem.
  Ainda é preciso revisar efeitos de triggers Auth, perfil e billing legados.
- Ferramenta acervo82 local passa a aplicar a migração real e conceder apenas
  sua identidade de teste verificada. Não reativa grant revogado por ON CONFLICT.
- Validação local: 8 testes Vitest (SQL PGlite, bridge/request e RPC simulados),
  `pnpm check` aprovado. Não houve aplicação remota ou teste real de OAuth/SMTP,
  refresh/logout, PostgREST ou login nos dois domínios. Identidade compartilhada
  não significa que cookies sejam automaticamente compartilhados entre domínios.

Operação administrativa, por conexão SQL de migração separada, com parâmetros
vinculados pelo cliente (`$1` UUID confirmado, `$2` justificativa), nunca RPC pública:

```sql
-- Novo acesso; não reativa uma revogação existente silenciosamente.
INSERT INTO postspark.app_access(user_id, reason)
VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING;
-- Revogação passa a valer na próxima verificação de acesso.
UPDATE postspark.app_access SET revoked_at = now(), reason = $2 WHERE user_id = $1;
-- Reativação é uma ação administrativa explícita, não parte do login.
UPDATE postspark.app_access SET revoked_at = NULL, granted_at = now(), reason = $2
WHERE user_id = $1;
```

Revogar não cancela retroativamente uma operação já admitida/em execução e não
apaga os dados do usuário. Suspensão global de identidade/sessões pertence ao Auth.
Autoinscrição pública, se desejada futuramente, precisa de regra explícita; não
foi introduzida implicitamente nesta migração de usuários existentes.

## 1. Estado e bloqueios

| Frente | Confirmado | Falta para ensaio real |
| --- | --- | --- |
| Aplicação | Executor `LISTEN/NOTIFY`, recuperação, cooldown, leitura compacta, CAS de posts e telemetria implementados localmente. | Entrega integral do checkout: HEAD `103b3f5f71048e824095d84cce8efa7f03fd5ac3` **não contém sozinho** as alterações locais nem os arquivos novos. Fixar versão/manifesto da entrega. |
| Supabase | README registra PostgreSQL 17.6 e oito serviços saudáveis: db, auth, rest, storage, imgproxy, meta, studio, api-gw. | Schema e dados PostSpark ainda não importados. Health da stack não demonstra RPCs da aplicação. |
| Rede | Host `http://127.0.0.1:18000`; rede Docker `http://api-gw:8000`; SQL `db:5432` sem porta pública. | Conectar API e worker à rede privada, provisionar papel SQL e readiness alcançável pela API. Frontend precisa URL Auth/Storage acessível pelo navegador. |
| Origem | A falha antiga de senha/conexão foi resolvida; exportação seletiva concluída segundo README. | Restaurar/reconciliar pacote; **46 de 127 posts estão sem proprietário confirmado** e ficaram na origem. Não atribuir esses posts por suposição. |
| Exportação | 4 usuários Auth, 5 identidades, 4 perfis sem saldo/plano/Stripe, 1 usuário legado PostSpark, 81 posts, 2 projetos de marca; 47 metadados de arquivos. | Metadados não são bytes. Storage da origem teve HTTP 402; brand-assets/renders e referências ainda exigem reconciliação. |
| Catálogo | 82 famílias, 170 definições, 53 assets verificados. Pacote já copiado para `/opt/platform-staging/imports/catalog-5617a3b9c2d2.tar.gz`, SHA-256 `5ee5daf99a4a15966c66fd33203a7a6a4eed11c9f63408b541d36ed810e35cea`. | Ainda não extraído/importado/publicado. Registrar revisão ativa, permissões, vocabulário editorial e disponibilidade. Existem defeitos visuais nas amostras nativas; não há aprovação para ativação ampla. |
| Auth/acesso | Auth saudável; cadastro/e-mail desligados. Código conserva Supabase + cookie bridge. | Restaurar UUIDs/identidades; disponibilizar as RPCs ManyLabs e seus dados/dependências; dois usuários de teste com acesso. OAuth, SMTP e URLs ainda não configurados. |
| Billing | Reserva/liquidação idempotente implementadas. | Baseline SQL e perfil real com plano/saldo de ensaio. Usuário optou por **não migrar saldos/histórico de cobrança**; saldo inicial novo continua indefinido. |
| Execução | Worker antigo permanece parado; Node/Chromium têm requisitos conhecidos. | Novo serviço da aplicação/worker, renderer e bibliotecas ainda não validados no destino; nenhuma credencial de IA/cobrança provisionada no ensaio. |

Evidência local anterior: TypeScript/builds aprovados; 171 testes do motor, 113 egress e 278 testes + dois harnesses local-demand. Navegador React/Konva real percorreu geração simulada → escolha → edição → salvar → reabrir → PNG/ZIP, preservando PNG byte a byte. **API/Auth/billing/provedor/persistência eram simulados; testes SQL usam PGlite.** Esses resultados não foram repetidos no destino nem nesta conferência documental. Ver [evidências](motor-validacao.json).

## 2. Migrações e ordem de integração

### Banco existente equivalente até 0063

Após conferir objetos, assinaturas, grants e histórico realmente aplicados, a sequência incremental é:

| Ordem | Arquivo | Efeito |
| --- | --- | --- |
| 1 | `drizzle/0064_generation_progress_reads.sql` | RPCs compactas de progresso/histórico e renovação de lease. |
| 2 | `drizzle/0065_demand_executor.sql` | Sinais transacionais, agenda/identidade de instalação, cooldown, reconciliação e claims de geração/captura. Substitui definições anteriores de funções. |
| 3 | `drizzle/0066_generation_telemetry.sql` | Tabela/RPCs de eventos descartáveis, deduplicação, limites e retenção. |
| 4 | `drizzle/0067_post_revision.sql` | `posts.revision`, valor inicial 1 e trigger que incrementa revisão em toda atualização. |

Aplicar **antes do novo código**, com consumidores parados e admissão pausada. Registrar hash de cada arquivo e resultado por etapa; não reaplicar cegamente, pois nem todos usam `IF NOT EXISTS`. Após DDL, conferir o cache de schema do PostgREST e as assinaturas por REST, não somente por SQL.

### Banco vazio entregue pela VPS

As quatro migrações acima **não constituem um baseline**. Ordem de dependências para preparar o pacote de schema:

1. Supabase/Auth, roles, schema `extensions`, `uuid-ossp` e `vector` exigidos pela cadeia; preservar UUIDs dos usuários/identidades e dependências de acesso.
2. Reconciliar o esquema exportado `application-schema.sql` com o contrato de runtime, **antes de executá-lo**. O dump registrado limita-se a postspark/garimpa, sem donos/grants; pode referenciar schemas externos. Restaurar funções que chamam ManyLabs sem sua dependência não entrega login funcional.
3. Completar o equivalente às migrações históricas `0000`–`0063` e às definições fora dessa cadeia. A ordenação histórica é numérica, com `0012`/`0013` substituídas pela corretiva `0015`; **não usar `drizzle/*.sql` como lote**. Não reaplicar `CREATE` das migrações sobre objetos já restaurados. `high_ticket_tables.sql` é auxiliar histórico, não etapa adicional; excluir fixtures.
4. Validar baseline efetivo; aplicar `0064` → `0065` → `0066` → `0067` somente se ainda ausentes; conferir RLS/grants e cache REST.
5. Importar o subconjunto autorizado de dados e os objetos de Storage, preservar identidades, reconciliar proprietários e sequências de IDs. Perfis/plano/saldo novos devem estar definidos antes de admitir geração. Publicar catálogo identificado por mecanismo da aplicação, com seus assets/grants, e validar a revisão ativa.
6. Confirmar uma única origem de execução/escrita e preflight. Só posteriormente, com liberação de ensaio, iniciar os consumidores.

**Lacunas concretas que impedem fornecer hoje um comando único de instalação do baseline:**

- `0010` já referencia `postspark.profiles`, mas sua criação não está na cadeia numerada. `ops/acervo82/schema-prerequisites.sql` contém versões **locais de teste** de profiles, background_assets, privacy_logs, subscriptions e topup_packages; declara que não replica o billing/ManyLabs hospedado.
- `has_manylabs_app_access(uuid)` e `ensure_manylabs_app_access(uuid,text,text)` são exigidas por `server/_core/manylabs.ts`, bridge e autenticação de cada request. `ops/acervo82/auth-fixture.sql` oferece allowlist local, não migração de acesso produtivo. Não usar `BYPASS_AUTH` como solução.
- Conferir `debit_sparks`, reserva/commit/refund e dependências financeiras com `server/billing.ts`, `0036_generation_billing.sql` e `server/runtimeManifest.ts`; checkout/topups exigem ainda sua base Stripe. O perfil FREE mostrado por fallback de UI **não comprova** perfil/saldo persistido.
- A compatibilidade de `posts` precisa permitir escrita UUID sem `userId` inteiro obrigatório e conter colunas de layout/imagem consumidas por `server/db.ts`. O adaptador local `ops/acervo82/schema-compatibility.sql` evidencia essa diferença; suas restrições/grants não devem ser copiados sobre os dados antigos sem revisão de ownership.
- `drizzle/meta/_journal.json` registra apenas 0000/0001. `scripts/acervo82/bootstrap.mjs` exige roster até 0061, usa ambiente/identidade local e hoje rejeita roster alterado. Nem esse bootstrap nem o journal representam um migrador VPS atualizado.

O pacote de baseline reconciliado e sua validação em banco descartável são uma **entrega pendente**, não SQL aprovado por este documento. Não iniciar scripts de bootstrap/importação local contra a VPS.

## 3. Processos, rede, comandos e dependências

- **Web/API:** Express + tRPC servindo `dist/public` e API pelo mesmo host. `pnpm start` executa `api/index.js`; porta preferencial 3000 via `PORT`. Confirmar a porta efetivamente aberta: o servidor pode procurar outra se houver conflito.
- **Worker:** processo Node dedicado `pnpm generation:worker`, sem endpoint público. Uma tarefa por processo, alternando captura/geração; claims preservam limite global de três leases. Não levantar o worker antigo ou local-demand em paralelo.
- **Renderer:** bundle `dist/review-renderer/renderer.js`, Chromium compatível com Playwright e bibliotecas de sistema; fontes/assets com hash íntegro e cache gravável `.postspark-local/catalog`. A referência antiga `/usr/bin/chromium` precisa ser comprovada na nova imagem. Não substituir fontes silenciosamente. GPU não é requisito deste motor 2D.
- **Dependências:** Node 22, pnpm fixado por `packageManager`, lockfile, `pg` em runtime, fontes, módulos e arquivos de schema/contratos. O comando do worker usa `tsx`, atualmente em **devDependencies**: `install --prod` sozinho não entrega esse entrypoint. Empacotar dependências necessárias ou produzir um artefato próprio do worker antes de optar por imagem reduzida.
- **Supabase:** REST/Auth/Storage necessários; pooler, Realtime e Edge Functions não são exigidos pelo transporte atual do motor. SQL de sessão é dedicado, fora de pool transacional; não há Redis/broker adicional.
- **Saída:** acesso aos provedores configurados e, quando a jornada inclui URL/captura/imagem externa, às fontes permitidas pelas validações do app. Não há instalação automática nem pré-aquecimento pago requerido para ficar pronto.

Comandos abaixo são o contrato para a **etapa futura autorizada**, não foram executados aqui:

```sh
# preparação de artefatos com ambiente de build correto
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test:motor
pnpm test:egress

# diagnóstico, com configuração segura previamente injetada
pnpm motor:preflight
pnpm motor:preflight --online

# somente após liberação da execução
pnpm start
pnpm generation:worker
```

`pnpm build` gera frontend, `api/index.js` e renderer. Não basta transferir a API ou um build antigo. O worker ainda depende dos fontes `server/`, `shared/` e resolução TypeScript. Não incluir `.env` antigo do Supabase gerenciado no pacote.

`/healthz` indica processo; `/readyz` retorna contrato JSON `contractVersion:1`, `transport:"postgres-notify"`, `ready:true` quando listener, recuperação, banco, renderer e configuração estão prontos. Retorna 503 durante falha/cooldown. Não comprova permissão/crédito/modelo válido no provedor só por existir chave.

Entre contêineres, usar bind privado como `GENERATION_WORKER_HEALTH_HOST=0.0.0.0`, sem publicar a porta 9465 no host, e URL `http://<serviço-worker>:9465/readyz` na API. O código aceita esse bind. Loopback de outro contêiner ou de API serverless não alcança o worker. O cliente de readiness atual não envia credencial de gateway: a opção pronta é rede privada; um gateway autenticado exige adaptar/validar o cliente. Healthchecks do supervisor têm custo e frequência próprios.

`SIGTERM` interrompe novos claims e aguarda trabalho ativo. Prazo do supervisor deve comportar o deadline restante, renderer e liquidação; reinício rápido não corrige quota. Timeout SQL de statement 10 s/lock 3 s antecede timeout cliente 15 s, que invalida a sessão se disparar.

## 4. Variáveis, sem valores secretos

| Escopo | Variáveis/contrato |
| --- | --- |
| API e worker | `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; API `PORT`. URL interna pode ser `http://api-gw:8000` na mesma rede. |
| Frontend no build | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Endpoint alcançável pelo navegador (túnel de ensaio ou domínio posteriormente autorizado), nunca nome Docker `api-gw`. Alterá-los exige rebuild. Nunca expor service role no bundle. |
| Controle inicial | `GENERATION_WORKER_MODE=external`, `GENERATION_LOCAL_DEMAND_ENABLED=false`, `GENERATION_ADMISSION_PAUSED=true`. Pause impede nova admissão, **não impede worker de drenar pedidos existentes**; mantê-lo parado até liberar. |
| Listener | `GENERATION_DATABASE_SESSION_URL`: papel SQL próprio com conexão de sessão em `db:5432`. TLS conforme rede efetiva; não transportar parâmetros de rede privada para endpoint público. `DATABASE_URL` de scripts antigos não substitui esta variável. |
| Saúde | `GENERATION_WORKER_READINESS_URL` na API; `GENERATION_WORKER_HEALTH_HOST`, `GENERATION_WORKER_HEALTH_PORT=9465`, `GENERATION_WORKER_SAFETY_SCAN_MS=300000` no worker. |
| Renderer | `REVIEW_RENDERER_BUNDLE`, `REVIEW_CHROMIUM_EXECUTABLE_PATH`. Pré-instalar os binários no artefato apropriado. |
| Seleção/catálogo | `POSTSPARK_SELECTION_POLICY=legacy` inicialmente; `capability_v1` apenas no ensaio identificado. Conferir `COMPONENT_ARSENAL_MODE` e `DESIGN_ARSENAL_V2_MODE` (`off/admin/all`) contra os usuários de ensaio. `GENERATION_LOCAL_CATALOG_REVISION` é override local e não publica catálogo no modo external. |
| Retrieval/review | `GENERATION_LEXICAL_RETRIEVAL`, `DESIGN_RETRIEVAL_DIRECTORY`, `REVIEW_LENIENT_DELIVERY`, `GENERATION_STRATEGY_VERSION`: fixar política do ensaio. Defaults de produção podem diferir do desenvolvimento; não importar flags `.acervo82-local` para contorná-los. |
| IA | `OPENROUTER_API_KEY`; `OPENROUTER_RECONCILIATION_KEY` conforme recuperação. Conferir as rotas/modelos persistidos e `OPENROUTER_DESIGN_SELECTION_MODEL`, `OPENROUTER_BRIEF_INTERPRETATION_MODEL`, `OPENROUTER_PROPOSAL_REVIEW_MODEL`, `OPENROUTER_V5_IMAGE_MODEL` e demais overrides utilizados em `server/_core/env.ts`. Disponibilidade/preço do ensaio requerem validação própria; este documento não confirma os IDs default. |
| Captura | `AI_SITE_INTELLIGENCE_ENABLED`; credenciais/rotas de IA aplicáveis. Manter desabilitada no ensaio se captura não estiver liberada. |
| Billing comercial | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_AGENCY_MONTHLY`, `STRIPE_PRICE_AGENCY_ANNUAL`, `STRIPE_PRICE_TOPUP_STARTER`, `STRIPE_PRICE_TOPUP_POWER`, `STRIPE_PRICE_TOPUP_MEGA`. Não são necessárias para ensaio de geração com saldo real de teste já provisionado; checkout/webhooks exigem ambiente de teste próprio. Não importar chaves/eventos reais. |
| Fluxos condicionais/legados | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` para helpers ainda em `server/storage.ts`; `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` para e-mail do backend. SMTP/OAuth do serviço Auth são configuração separada da stack. Inventariar dependências antes de declarar legado migrado. |

Injetar por arquivo privado fora do repositório, modo 600, ou mecanismo equivalente da infraestrutura. Não entregar o `.env` administrativo completo da stack ao worker. Não usar `BYPASS_AUTH`, identidade fictícia ou plano DEV/FOUNDER para certificar o teste de reserva/débito normal.

## 5. Permissões e compatibilidade

- PostgREST precisa expor `postspark` na configuração da stack e permitir `USAGE`/RPCs ao papel adequado. Exposição e grants/RLS são controles distintos ([documentação Supabase](https://supabase.com/docs/guides/api/using-custom-schemas)). A política aqui **não** é conceder todas as tabelas/funções a anon/authenticated.
- Backend usa service role por REST, atrás da autenticação/autorização tRPC; conservar grants seletivos das migrações e imutabilidade de catálogo. Novas RPCs de executor/telemetria negam PUBLIC/anon/authenticated. Frontend usa chave pública para Auth e mecanismos autorizados de assets; testar tentativa de leitura por outra conta.
- Papel SQL do listener: `CONNECT` no banco, `USAGE` em `postspark` e `EXECUTE` em `demand_work_schedule()`, `demand_executor_backoff(text)`, `generation_reconcile()`, `demand_reconcile_captures()` e `generation_prune_telemetry()`. `LISTEN postspark_work` na sessão. Preferir papel dedicado sem superuser/BYPASSRLS; provisionar esses grants explicitamente, pois os arquivos novos concedem a `service_role`, não a um nome futuro de papel. Claims/operações usam REST pelo backend. O preflight online também lê contagens de `generation_v5_requests`: usar papel de auditoria apropriado ou grant SELECT específico para essa verificação, não ampliar o worker inteiro por conveniência.
- `installation_id` SQL e REST devem coincidir. Restauração física copia esse ID; rotacionar **no destino**, de forma coordenada, antes de habilitar consumidores. Nenhuma rotação realizada por este contrato.
- `0067` não reescreve `canvas_model`: posts antigos começam com revisão 1; alterações incrementam revisão. A API nova exige `expectedRevision` em atualizações CanvasLab. Clientes antigos sem isso recebem conflito: publicar frontend/API de modo coordenado. Preservar edição local; não resolver conflito sobrescrevendo documento vencedor.
- Pedidos antigos sem `selectionPolicy` conservam legacy; novos pedidos herdam configuração do servidor e filhos herdam o pai. Não refazer semântica de pedidos persistidos. O escopo seletivo atual não migra filas/logs/execuções antigas; permanecem na origem para reconciliação, sem consumidor em paralelo.
- Preservar `auth.users.id`, identidades e vínculos `user_uuid`; metadados e cookie de login antigo não garantem sessão no destino. A exportação não levou sessões/tokens, a stack tem credenciais novas: prever **novo login**, bridge `/api/auth/supabase-session`, logout, refresh e retorno OAuth. Não remapear os 46 proprietários não confirmados. Cookie bridge é HttpOnly, SameSite=Lax e Secure conforme HTTPS; validar proxy/host.
- Storage: `postspark-media` privado, caminho proprietário/hash; `design-arsenal` privado, assets por hash e grants de catálogo. Preservar referências internas de mídia, copiar e verificar bytes, reemitir URLs assinadas. URLs absolutas hospedadas/Forge/brand-assets/renders não mudam só por trocar `SUPABASE_URL`; localizar inclusive dentro de `canvas_model`/composições. Não tornar buckets públicos para corrigir acesso. Testar download/render/export depois da migração.
- O tar do catálogo não é publicação SQL. Reproduzir manifest/revisão e catálogo editorial, vincular definições/assets/grants e comparar snapshot canônico `5617a3b9c2d21c46c7808d36cf7a9a129808da2c6be09c100fe199406ed37c98`. O acervo congelado cobre 4:5; não comprova cobertura de outros ratios. Preservar os dados imutáveis; corrigir defeitos de amostras exige nova revisão, não editar hashes em uso.

## 6. Ensaio e prova de encerramento das consultas

**Preparação sem executar trabalho:** validar schema/assinaturas/grants, isolamento de duas contas, usuários/perfis reais, saldo explícito, Auth/bridge, buckets/bytes, revisão e assets, renderer e rede. `motor:preflight` verifica configuração/arquivos; `--online` compara identidade SQL/REST, algumas funções/colunas, catálogo e pendências. É somente leitura, **parcial**: não valida ManyLabs, baseline inteiro, objetos Storage, checkout, modelo/provedor, nem ausência de toda captura pendente. Complementar com `scripts/sql/motor-preactivation.sql`, inspeção de runtime e testes abaixo. `server/runtimeManifest.ts` ainda contém referências históricas a heartbeat; existência dessas funções não exige reativá-las.

**Depois da autorização específica de ensaio:**

1. Iniciar API/worker privados com orçamento/provedores configurados. Com admissão pausada e banco sem trabalho antigo, comprovar LISTEN antes de recuperação, saúde e readiness. Só liberar admissão para as contas do ensaio quando esse contrato estiver satisfeito.
2. No navegador real, login → ENTER → admissão e reserva → claim → seleção/composição → três propostas → escolha por ID → edição → salvar → biblioteca → reabrir → PNG/ZIP. Conferir documento, geometria, fontes, imagens, contraste e isolamento. Incluir imagem/URL/carrossel nas capacidades efetivamente ofertadas; insuficiência deve ser explícita.
3. Conferir pedido terminal **e** `billing_settled_at`, reserva/ledger, saldo esperado e ausência de segunda cobrança. Repetir envio idempotente e simular resposta perdida. Saldo de fallback e plano ilimitado não provam liquidação.
4. Testar controle de versão com duas abas: atualização obsoleta deve preservar o vencedor e manter edição local para cópia. Outra conta não pode recuperar post/pedido/asset.
5. Em ambiente isolado, exercitar queda após admissão, perda/reconexão do listener, sinais duplicados, aba fechada, erro/quota de provedor, timeout de resultado desconhecido e falha de liquidação. Conferir checkpoints/diário e reconciliação, sem repetir cegamente inferência incerta. Não reiniciar serviços compartilhados para o teste.
6. Capturar tráfego por processo/rota e período: idle anterior → pedido ativo → entrega/liquidação → CanvasLab idle. Correlacionar requestId, chamadas/bytes REST, SQL, Storage, Auth, provedor, browser, duração, CPU e memória. Medidas `generation_resources` são parciais (corpos observáveis, CPU compartilhada e RSS inicial/final), sem TCP/TLS/SQL/pico; completar com medição do ambiente.

**Resultado esperado específico do código atual:**

| Momento | Tráfego permitido/esperado | Reprovação |
| --- | --- | --- |
| TheVoid/CanvasLab sem pedido ativo | Sem intervalo de geração/capabilities/saldo. Consultas por montagem, foco, ação explícita, refresh Auth e flush limitado de telemetria são separados. | Claims, snapshots completos ou saldo sendo consultados continuamente sem ação. |
| Geração external ativa | `generation.progress` compacto a cada ~1,5 s; `generation.get` inicial e quando há entrega/mudança relevante. | Full snapshot a cada tick, dois consumidores ou polling de disponibilidade. |
| Propostas entregues, cobrança pendente | Acompanhamento continua até liquidação/estado recuperável explícito. | Encerrar antes de saber a liquidação ou relançar geração para tentar cobrar. |
| Terminal **e** `billingPending=false` | Cessa o intervalo de progress; sem stream ativo, heartbeat de lease ou consultas periódicas de saldo no editor. Pode haver resposta em voo e flush final de análise. | Polling que continua depois de drenar requisições em voo; cobrança duplicada. |
| Worker ocioso | Sessão LISTEN aberta; segurança a cada 300 s com metadados/reconciliação limitada, além de probes solicitados. Prazos duráveis podem despertar antes. | Antigo loop de claim a cada 1–5 s ou heartbeat persistido de disponibilidade. |

O modo local-demand possui SSE e fallback de progresso a 15 s; **não é o modo proposto para a VPS**. Não anunciar ausência dessa duplicidade para todos os modos. Em external, verificar resposta `progressTransport=poll`.

Observar uma hora ociosa real e janela de 24 horas controladas após o fluxo. A evidência anterior conta 12 varreduras em uma hora **virtual**, 26 claims vazios e 6,5 s de editor ocioso em browser simulado; não substitui essas janelas reais. Auth pode renovar token em produção; healthchecks e tráfego necessário de sessão não devem ser suprimidos para fabricar “zero consultas”.

## 7. Critério de junção e retomada

Pronto para preparar artefatos e schema reconciliado; **ainda não pronto para ativar geração no destino**. Bloqueios prioritários: baseline/acesso ManyLabs, dados e ownership, bytes Storage, perfis/saldo novo, publicação/grants do catálogo, runtime/renderer/rede, credenciais e ensaio real. Defeitos visuais e avaliação editorial/custo impedem aceite final amplo mesmo que a integração técnica passe.

Responsabilidade PostSpark: baseline/contratos finais, manifesto de aplicação, endpoints e prova da jornada. Responsabilidade infraestrutura: disponibilizar rede/processos/credenciais/serviços e migração física sob coordenação. A junção deve registrar ambiente único, resultados e autorização antes da execução. Para reversão: pausar admissão, drenar/reconciliar e manter compatibilidade dos dados; seleção de novos pedidos pode voltar a legacy. Não apontar automaticamente para cópia antiga nem reativar worker antigo.

Referências de plataforma consultadas nesta conferência: [self-hosting Docker](https://supabase.com/docs/guides/self-hosting/docker), [schemas personalizados](https://supabase.com/docs/guides/api/using-custom-schemas) e [changelog](https://supabase.com/changelog). Não houve atualização de versão nem adoção automática de comandos da CLI.


## Revisão local do schema exportado — 11/11/2026, 23h30

Esta revisão complementa o adendo de acesso próprio 0068 e **não restaura nem executa o dump**. Foram lidos somente código, schema SQL e artefatos públicos do catálogo, sem arquivos de credenciais. O arquivo analisado é `../infraestrutura-vps/private/application-schema.sql`, 717.238 bytes, SHA-256 `2755297feb6a24506073569f2f10d7dac753c7fb01989d87c397500d3895351e`, igual ao manifesto da exportação. Não alterado por esta frente.

### Mudança concorrente incorporada

A nova `0068_app_access.sql`, `server/_core/appAccess.ts`, bridge, SDK e manifesto estão presentes no workspace compartilhado. Confirmei que o runtime agora chama `has_app_access`, sem autoinscrição ManyLabs. Os oito testes e TypeScript são evidência reportada pela frente que fez essa alteração; não foram repetidos nesta revisão. O acesso próprio está implementado **localmente**, mas aplicação SQL e grants individuais continuam dependendo da integração. Sequência incremental atual: **0064 → 0065 → 0066 → 0067 → 0068**, depois do baseline reconciliado e antes da nova API. O contrato histórico de ManyLabs abaixo dos adendos não é requisito do novo runtime.

### Achados verificáveis no dump

| Achado | Evidência local | Consequência para preparar o baseline |
| --- | --- | --- |
| Muitas definições, nenhum dado/configuração nem ACL | 138 tabelas, 142 funções e 101 triggers nos dois schemas exportados; zero `INSERT`/`COPY` e zero `GRANT`/`REVOKE`/`ALTER DEFAULT PRIVILEGES`. | Restaurar schema não restaura seeds, permissões ou estado publicado. Reconstituir grants seletivos antes de expor REST; não confiar nos defaults, sobretudo EXECUTE de SECURITY DEFINER. Dono das funções deve ser papel de migração confiável. |
| ManyLabs residual apesar de 0068 | Wrappers `ensure_manylabs_app_access` (linha 2757) e `has_manylabs_app_access` (4327); nove policies (15846–15902) em `posts`, `background_assets` e `users`. Referem `manylabs.profiles/app_access/app_roles/audit_events/has_app_access`, schema ausente do dump. | Omitir/reconciliar esses objetos na cópia derivada do baseline, com política de acesso fechada. 0068 não os remove. Não trocar mecanicamente a função na policy e conceder a nova RPC ao browser: o contrato novo restringe-a ao backend. Não modificar nem apagar objetos da origem. |
| Limite de posts bloqueia importação sem configuração | `enforce_saved_posts_limit` (2711), tabela `plan_save_limits` (7889), trigger `trg_enforce_saved_posts_limit BEFORE INSERT`. Plano ausente/configuração ausente vira limite **zero**. | Definir seeds de limites e perfis antes de importar posts. Reconciliar como preservar os 81 posts autorizados quando ultrapassarem o limite do plano novo; não desabilitar trigger nem inventar um plano ilimitado silenciosamente. |
| Billing existente é a família `next` | `next_spark_reservations`, `next_reserve_sparks_v2`, `next_commit_reservation_v2`, `next_refund_reservation_v2`, `debit_sparks` e `spark_transactions` existem. `generation_admit` escolhe `next` quando sua RPC existe. `spark_reservations` e as três RPCs canônicas de fallback não são definidas no dump. | Conservar a família `next` necessária à geração; tabelas com prefixo `next` não são todas descartáveis por parecerem legado. Não reexecutar toda cadeia histórica para fabricar o segundo ledger. Conferir reserva, débito e refund nesta família com saldo real de teste. Nenhum histórico financeiro é importado por inferência. |
| Defaults podem contradizer reinício financeiro deliberado | `profiles` (7996) tem defaults FREE/150; `handle_new_user` (4312) insere FREE/150; `sync_user_role` (4758), chamado por `on_role_change AFTER INSERT OR UPDATE OF role`, altera `auth.users.raw_app_meta_data`. | Perfis importados devem receber plano/saldo/role explicitamente definidos. Grant 0068 não significa saldo nem admin. Revisar efeitos do trigger sobre metadados Auth preservados. O dump não inclui triggers instalados sobre `auth.users`; não comprova se `handle_new_user` será acionado no destino. |
| Estado de publicação não é criado pelo DDL | `catalog_state` (7064) existe, mas o `INSERT ... id=true` de 0040 não está no dump; `editorial_catalog_heads` também está vazio sem importação/publicação. | Preparar singleton do catálogo e publicação editorial/versionada, validando manifesto/head depois. Não reaplicar a migration 0040 inteira sobre tabelas restauradas. |
| Dependências externas legítimas | Referências a `auth.users`, `auth.uid/jwt/role`, `extensions.uuid_generate_v4`, `extensions.vector/vector_dims`. Não há objetos de Storage no dump. | Supabase Auth e extensões uuid-ossp/vector precisam existir antes das definições e FKs; usuários antes dos dados dependentes. Storage, buckets, objetos e policies seguem pacote separado. |
| Estrutura dos posts diverge da migração inicial | Dump `posts` (7900): `userId` é **text nullable**, `user_uuid` nullable; já há `canvas_model`, layout/imagem e gallery_preview; não há `revision`. | Preservar mapeamento UUID confirmado e aplicar 0067. Não reaplicar `0000`/conversões locais assumindo userId integer; não tornar todos os UUIDs NOT NULL antes de reconciliar ownership. |

As RPCs de progresso/lease de 0064 e as novas funções de 0065/0066 não estão nesse dump. A detecção é por objetos e assinaturas, não certificação de que o schema exportado corresponde byte a byte a todas as migrações até 0063. Reconciliar definições existentes com as requeridas; validar restore derivado em ambiente descartável, separado de consumidores.

### Hashes dos incrementos conferidos

| Arquivo | SHA-256 |
| --- | --- |
| 0064_generation_progress_reads.sql | `6627da64f07b9bed409172d5974fd743f4bad900d7d1ff2b47c2f21b992aa0b5` |
| 0065_demand_executor.sql | `880fe8ca2388617630d132411645c06ff7a6982072d6c5b61729ea23afd7363a` |
| 0066_generation_telemetry.sql | `51ec5d4d5a57bb37ad6b637957f8750af3ad198a1728864b29be11d27b805095` |
| 0067_post_revision.sql | `6bcdab6449e587918cd761578834b23ef7ab1423ff2707d7209c260fcfc95a0a` |
| 0068_app_access.sql | `fa9ce5d67ba1fe7c17c7e9d959f433a29447c7f70e184a559489de2ff97743ce` |

### Empacotamento e catálogo para uso controlado

O tar local `../infraestrutura-vps/artifacts/catalog-5617a3b9c2d2.tar.gz` foi novamente conferido por SHA-256: `5ee5daf99a4a15966c66fd33203a7a6a4eed11c9f63408b541d36ed810e35cea`, igual ao recebido pela infraestrutura. Snapshot local: `5617a3b9c2d21c46c7808d36cf7a9a129808da2c6be09c100fe199406ed37c98`; 170 definições/82 famílias/53 assets. Esta revisão não consultou publicação remota.

O material é suficiente para preparar importação/publicação e um ensaio controlado identificado, **não para declarar todo acervo aprovado**. Conservar status/grants e regras de admissão; acesso experimental de usuário de ensaio não equivale a aprovação global. As amostras CON-05/CON-06/R9-11 têm achados visuais registrados e os 82 não cobrem todas as proporções do corpus. `legacy` permanece default; ensaio `capability_v1` deve ser identificado. Confirmar catálogo editorial, revisão/head, renderer/fontes e hashes antes da geração.

A aplicação ainda está em checkout com alterações e arquivos não versionados. O HEAD informado continua insuficiente como artefato. A mudança de Auth posterior invalida tratar o `api/index.js`/build anterior como pacote pronto sem rebuild. Entregar fontes, lockfile, novos SQLs, novo módulo appAccess, build e renderer concordantes; worker depende de tsx e fontes. Nenhum build/deploy novo foi produzido por esta revisão.

Pendências impeditivas preservadas: baseline derivado sem ManyLabs residual e com ACL/seeds; plano/saldo/limites e grants de acesso confirmados; restauração do subconjunto de proprietários; bytes Storage; catálogo publicado; runtime/rede/renderer; credenciais e modelos autorizados; ensaio real com duas contas, reserva/liquidação, recuperação e fim do acompanhamento. O empacotamento do catálogo resolve a transferência desses 53 assets, não a migração das imagens dos posts. Os 46 posts sem proprietário continuam fora da atribuição automática.


## Atualização de coordenação — 11/11/2026, 23h33

Informações recebidas do chat responsável pela VPS; decisões de conta/orçamento abaixo são registradas conforme essa comunicação, sem execução por esta frente.

- `0069_app_access_policies.sql` foi conferida localmente: adiciona `has_current_app_access()` sem argumento, baseada em `auth.uid()`, e substitui as nove policies por checks de acesso próprio + proprietário. EXECUTE do helper é restrito a authenticated; `has_app_access(uuid)` da 0068 continua exclusivo do backend. Policies não substituem grants de tabela/schema nem dispensam validar RLS no destino. SHA-256: `1c4d2fdef76fca8a2a7a30326b48f5fc3b10f625919f299c20a83be81bfa0abd`. Dois testes aprovados foram reportados pela frente autora, não repetidos aqui.
- Ordem incremental atual: **0064 → 0065 → 0066 → 0067 → 0068 → 0069**, após baseline reconciliado. O chat da VPS informou que seu baseline derivado omite os onze objetos ManyLabs identificados (dois wrappers e nove policies); esta frente não editou nem executou esse baseline.
- Conta titular confirmada no chat da VPS: plano **DEV persistido**, role **admin**, somente para o UUID correspondente à identidade efetivamente verificada. Não reproduzir e-mail pessoal no contrato versionável nem inferir grants a outras contas. Não atribuir saldo alto para simular DEV. Demais perfis: saldo zero/plano default deliberado, sem transferência de histórico de cobrança, conforme comunicação da infraestrutura. Limites de posts e preservação dos documentos continuam precisando ser coerentes com o plano escolhido.
- Teto de testes pagos informado: **US$ 1 no total**, incluindo todas as chamadas, propostas, etapas e tentativas. DEV evita débito de Sparks, mas não custo de provedor. Este contrato não comprova enforcement automático desse teto: a frente executora deve controlar orçamento agregado, estimar o conjunto antes de iniciar e impedir novas chamadas que ultrapassem a margem. Um teste exclusivamente DEV não prova reserva/liquidação de plano com cobrança; essa diferença deve permanecer explícita na evidência de aceite.
- Domínios informados: `postspark.com.br`, `api.postspark.com.br` e `www.bizuminer.com.br`. Confirmação dos nomes não comprova DNS/TLS, roteamento, CORS/cookies, redirects OAuth ou URLs públicas do Supabase. Validar esses contratos na integração, sem presumir sessão compartilhada entre domínios distintos.

Nenhum baseline, serviço remoto, credencial, grant de usuário, saldo ou chamada paga foi alterado por este registro. A revisão estática de 23h30 permanece válida, com a remoção de ManyLabs e a nova ordem atualizadas acima.


## Correção da compatibilidade do schema — 11/11/2026, 23h43

A infraestrutura informou rollback da tentativa de 0064 no banco descartável de revisão: `column r.createdAt does not exist`. Reproduzido localmente antes do patch. A causa foi o SQL do histórico referenciar o nome de 0006, apesar de 0009 já normalizar a coluna para `created_at`. As fixtures de release omitiam 0009 e escondiam a divergência.

- 0064 agora lê/ordena `generation_runs.created_at`; mantém JSON `created_at`, filtros de proprietário, ordenação data/ID, paginação e resumo sem documentos grandes. Não renomeia colunas nem reescreve datas/dados. O baseline precisa incluir o efeito de 0009, já presente no dump real.
- As duas fixtures PostgreSQL passam a aplicar a migração real 0009. O tipo `GenerationRunRecord` representa `created_at`; mantém `createdAt` opcional somente para registros serializados históricos. History já prefere `created_at` e conserva fallback antigo. Os campos camelCase de outras tabelas, como posts, não foram alterados.
- Teste SQL novo verifica paginação com timestamps iguais, desempate por ID, isolamento e contagem de snapshots antigos em objeto; teste existente verifica timestamp exato preservado. Antes: instalação de 0064 falhava. Depois: 14 testes focais aprovados; regressão ampliada **247 aprovados / 1 ignorado em 20 arquivos**, TypeScript e `git diff --check` aprovados. Caso ignorado exige `POSTSPARK_REAL_RENDER_TEST=1` (jornada real de sete slides); não foi ativado neste reparo. Rede bloqueada e `.env` desabilitado nos testes locais; nenhum provedor pago ou banco remoto acessado.
- Revisão de 0065/0066 contra o dump não encontrou outra divergência de timestamps/colunas. 0065 foi endurecida nas três funções substituídas: `generation_reconcile()`, `generation_v5_claim(text)` e `brand_capture_claim(uuid,text)` reafirmam REVOKE PUBLIC/anon/authenticated e EXECUTE service_role. Teste restaura deliberadamente PUBLIC EXECUTE antes da migração e comprova negação posterior e funcionamento service_role. Isso não substitui recompor as ACLs dos demais objetos do baseline.

Hashes vigentes de 0064/0065 foram atualizados na tabela acima; substituem os arquivos da tentativa revertida. A ordem permanece 0064 → 0065 → 0066 → 0067 → 0068 → 0069. Como a falha ocorreu dentro da transação e houve rollback informado, o responsável pelo ambiente pode repetir o ensaio com o pacote corrigido após conferir estado/journal/hashes. Nenhum retry remoto foi executado por esta frente. Se outro ambiente já registrou uma versão anterior como aplicada, não reaplicar o lote nem alterar seu histórico silenciosamente: preparar correção incremental específica.


## Login por e-mail e senha — 12/11/2026

Este adendo complementa a autorização própria 0068/0069 e substitui a dependência de Google para entrar na UI. A revisão do código confirma `/` → `InspiracaoShowcasePage` → `StudioAuthModal`; `/criar` encaminha seus CTAs para `/`. Visitantes de `/thevoid`, `/studio` e `/studio-v2b` retornam à landing. `PreviewAuthModal`, `LoginModal` e `AuthGate` não estão montados; `handleGoogleOAuthOnly` só é usado pelas landings legadas sem rota ativa. O helper também passa a respeitar a configuração de Google, para não ativá-lo por acidente em uma futura reutilização.

### Contrato de build e serviços

| Variável pública de build | Valor para este ensaio | Comportamento |
| --- | --- | --- |
| `VITE_POSTSPARK_AUTH_MODE` | `email` | E-mail/senha sempre disponível; somente `email-google` adiciona Google. Ausência/valor desconhecido conserva apenas e-mail/senha. |
| `VITE_POSTSPARK_SIGNUP_ENABLED` | `false` | Oculta cadastro; habilitação futura exige também envio de e-mails configurado. |
| `VITE_POSTSPARK_EMAIL_DELIVERY_ENABLED` | `false` | Mantém cadastro oculto sem SMTP/envio verificado, mesmo se signup for solicitado. Não instala nem configura SMTP. |
| `VITE_SUPABASE_URL` | URL pública do Supabase próprio | Precisa ser alcançável pelo navegador; não usar hostname interno Docker. |
| `VITE_SUPABASE_ANON_KEY` | Chave pública do mesmo ambiente | Nunca service_role; nenhum valor de credencial é registrado neste documento. |

Essas flags são incorporadas pelo Vite: alterar somente o ambiente do processo depois do build não altera a UI entregue. O padrão funciona em produção, sem depender de `VITE_POSTSPARK_LOCAL_AUTH=email` ou loopback. O perfil local antigo conserva suas restrições. Não há recuperação de senha anunciada pela jornada ativa; esta mudança não cria recuperação nem envio de e-mail. Os demais requisitos de runtime/rede do contrato continuam vigentes.

Para habilitar Google futuramente, além da flag, configurar provider/credenciais e redirect `<origem-da-aplicação>/auth/google-callback` no Auth. Para cadastro futuro, ambas flags `true` só devem ser definidas depois de configurar cadastro/confirmação e entrega real no Supabase; flags de UI não concedem acesso nem fazem essa configuração. Acesso próprio permanece um grant explícito de operador, independente da existência da identidade Auth.

A conta de ensaio precisa de identidade no Auth próprio com login por senha permitido, senha provisionada por canal privado e confirmação coerente com o estado do Auth, grant ativo em `postspark.app_access`, perfil e permissões definidos. Nenhuma senha privada foi lida por esta frente; esta alteração não cria/atualiza usuários, grants, planos ou saldos.

### Fluxo, domínio e compatibilidade

`signInWithPassword` recebe e-mail/senha; ao retornar sessão, o modal chama `resyncSupabaseSession` e aguarda `POST /api/auth/supabase-session`. O backend continua validando Supabase Auth + acesso próprio antes de emitir cookie. O cliente só entra em `/thevoid` após confirmação. Um marcador antigo de bridge no navegador não dispensa sincronizar o cookie em um login explícito. Senha inválida e acesso negado permanecem no formulário, com erro legível. O aviso legado de Conta ManyLabs foi removido da landing.

Canonical, OG URL/imagem e Twitter image de `client/index.html` agora apontam a `https://postspark.com.br`. Isto não configura DNS, TLS nem redirect HTTP do `www`; esses itens continuam com a infraestrutura. O texto técnico da página de termos descreve senha e Google opcional.

Não há migração SQL adicional neste ajuste, transformação de dados, alteração de `canvas_model`, Storage, catálogo, reservas, cobrança, plano ou saldo. A incompatibilidade deliberada é de apresentação: builds sem configuração explícita deixam de oferecer Google/cadastro. Identidades OAuth antigas não são convertidas automaticamente para senha; entrar por senha exige provisionamento/reset privado no Auth. O callback Google permanece compatível quando o provider for habilitado.

Arquivos de runtime para incluir na entrega: `client/src/lib/authUiConfig.ts`, `client/src/pages/StudioHome/components/StudioAuthModal.tsx`, `client/src/components/auth/authHelpers.tsx`, `client/src/App.tsx`, `client/src/pages/Terms.tsx`, `client/index.html`. O bridge existente já fornece `resyncSupabaseSession`. Entregar junto aos fontes completos e módulos de acesso próprio 0068/0069, pois o HEAD/build anterior não representa este checkout. O build local de verificação foi produzido somente em `/tmp/postspark-email-auth-build`; `api/index.js` não foi regenerado por este ajuste.

### Evidência local e aceite no destino

21 testes de Auth/configuração passaram (7 arquivos): senha, opção Google explícita, cadastro condicionado, bridge recusado/pendente, marcador antigo, callback e provider de sessão. `tsc --noEmit`, `git diff --check` e build Vite isolado passaram. Logs locais: `/tmp/postspark-email-auth-tests.log`, `/tmp/postspark-email-auth-tsc.log`, `/tmp/postspark-email-auth-build.log`. O build conserva aviso de chunks grandes; não impede a compilação. Testes não carregam `.env` nem usam credenciais/provedor reais.

No destino, ainda verificar: landing mostra senha sem Google/cadastro; senha inválida é rejeitada; conta sem grant não obtém acesso; conta autorizada recebe cookie HttpOnly e entra no Studio; reload mantém sessão; logout e revogação impedem acesso; origem/HTTPS/cookies funcionam no domínio final. O ensaio local com serviços simulados não substitui esses checks do Supabase próprio. Nenhum deploy, instalação ou reativação de rotina foi executado por esta frente.

**Limite do ensaio de navegador deste ajuste:** o Chromium do Playwright usado anteriormente não estava disponível no ambiente atual. A tentativa com Vivaldi e perfil temporário encerrou o processo antes de abrir a aplicação (SIGSEGV/timeout). Nenhum cenário de login chegou a executar; não contar este ensaio como aprovado nem como falha do produto. O harness `scripts/testing/auth-login.browser.ts` e `harness/authLogin/browser.tsx` fica preparado para Chromium compatível, cobrindo `/criar` → landing → senha inválida, bridge negado, bridge pendente e marcador antigo. Não houve instalação de navegador. Essa limitação não altera os 21 testes de Auth/configuração nem o build aprovados.

A infraestrutura informou em 12/11/2026 que o scratch restaurou 4 identidades Auth, 81 posts, 2 marcas e 0064–0069, com DEV restrito à conta titular autorizada. É evidência reportada pelo chat responsável, não execução ou validação remota desta frente. ACLs e ensaio com credenciais reais seguem sob responsabilidade daquele chat. O manifesto dos seis arquivos runtime deste ajuste foi fixado em `/tmp/postspark-email-runtime.sha256` para conferência antes do build.


## Importação do catálogo congelado e ensaio restrito — 12/11/2026, 00h32

A integração agora dispõe de `scripts/importFrozenCatalog.ts` e do gate de catálogo restrito. **Não foram executados apply, migração, publicação editorial, preflight online, deploy ou reativação nesta frente.** Os comandos abaixo destinam-se à revisão/execução explícita pelo responsável da VPS.

### Pacote, editorial e identidades

- Tar já entregue: `catalog-5617a3b9c2d2.tar.gz`, SHA-256 `5ee5daf99a4a15966c66fd33203a7a6a4eed11c9f63408b541d36ed810e35cea`; 82 famílias, 170 definições, 53 assets. Hash do snapshot de origem: `5617a3b9c2d21c46c7808d36cf7a9a129808da2c6be09c100fe199406ed37c98`.
- `snapshot.json` é um snapshot de replay, com cards/IDs/hashes; não é payload direto de publicação SQL. Seu rótulo de revisão não é bigint. O importador conserva IDs e hashes de definições/assets, mas cria uma **nova revisão numérica** e um hash de publicação DB, que inclui status/source. Hash DB previsto no ensaio offline para esses drafts: `c523b9fc1124bc1fc7a3c1108d261cd6b28f253ffcf59bde7f43300e6515464b`. Nunca substituir o hash de origem pelo de destino ou assumir revisão `3` no destino.
- O tar não contém grants de origem, aprovação visual nem editorial. Não declarar esses dados como migrados. Novos grants de assets são concedidos somente ao ator administrativo indicado; grants existentes não são apagados. `activationApproved:false` é preservado; todos os novos componentes permanecem `draft`. Não há chamada a `catalog_activate`, aprovação de componente, renderização/revisão visual, embeddings ou provedor de IA no importador.
- Documento editorial original encontrado em `/home/emanuel/.codex/worktrees/acervo-82/PostSpark 3/artifacts/acervo82/full/verification-09/editorial.json`, com recibo `full/staged.json` daquela worktree. Cópia idêntica preparada no projeto: **`artifacts/selection-motor/editorial-5617a3b9c2d2.json`** (36.454 bytes; arquivo de artefatos ignorado pelo Git, incluir explicitamente na transferência). SHA-256 `da37e899b24f9e23248f464eb0c5d59c05ba656c7355cb41a026fb390566d5a7`; hash canônico editorial `20f0c8fe8f709bc7dce5f2a2486b14f1b081aa0b031c493be21e0776591f50a7`. 14 intenções, 82 designs, 82/82 pares sourceId/sourceHash conferidos; as 88 variantes apontam para essas raízes. Nenhum metadado foi recriado. A revisão/UUID da worktree original não deve ser reutilizada como identidade no destino.

### Pré-condições, migração e permissões

1. Baseline efetivo e 0064–0069 já compatíveis; singleton `catalog_state(id=true)` presente. O importador exige **active_revision nula** e nenhum componente canônico divergente, aprovado ou alheio ao pacote. É um importador do ensaio vazio/repetição do mesmo pacote, não um merge genérico de um catálogo em produção.
2. Aplicar **`0070_trial_catalog_admission.sql` após 0069** antes de ativar o gate de ensaio. SHA-256: `54dae7a3c8c867c35008b801f2186530ad33c6d1f3fcd20f0542107100e4955e`. Executor de migração confiável, com permissão para criar função em postspark e ler Auth/dependências, normalmente o proprietário administrativo PostgreSQL. Não criar essa função com dono não confiável.
3. 0070 adiciona somente `generation_admit_trial_external(uuid,uuid,text,text,jsonb,boolean,timestamptz,bigint,jsonb)`, SECURITY DEFINER com search_path fixo, EXECUTE exclusivo de service_role, revogado de PUBLIC/anon/authenticated. Verifica admin em raw_app_meta_data + acesso próprio, experimental=true, configuração válida e revisão inativa íntegra. Reutiliza a reserva/concorrência/deadline transacional existente; não altera preços, saldo, plano, funções de billing, head, status de componentes ou grants. Replay não cria nova reserva. Não há serviço, cron ou rotina automática nova.
4. Importador usa `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no processo operador, nunca navegador/argumento/log. Necessita Auth Admin GET da identidade, `has_app_access`, leitura REST das tabelas de catálogo/relacionamentos, funções de staging (`catalog_stage`/`catalog_stage_delta` e leitura), escrita em `design_catalog_assets`/`design_component_asset_grants` e acesso Storage ao bucket **privado** `design-arsenal`. Bucket público é rejeitado; pode criar o bucket privado ausente. Conservar ACLs por função/tabela necessárias; não liberar schema inteiro a anon/authenticated.
5. CLI exige host exato (inclusive porta), URL explícita, UUID admin confirmado e hash esperado antes de apply. O processo desabilita leitura automática de `.env` e construção do índice semântico; credenciais devem ser fornecidas pelo ambiente privado do operador. Dry-run não requer credenciais nem rede. Node/tsx, dependências nativas de decodificação de fonte/imagem e lockfile precisam estar presentes.

### Comandos concretos para o responsável do destino

Executar na raiz dos fontes entregues; conferir SHA do tar antes de extraí-lo em diretório dedicado. Os caminhos abaixo assumem o layout já informado pela infraestrutura. `SUPABASE_URL`, `SUPABASE_EXPECTED_HOST` e `GENERATION_TRIAL_CATALOG_ADMIN_UUID` devem ser configurados explicitamente no ambiente operador; o host é `api-gw:8000` dentro da rede Docker ou `127.0.0.1:18000` no host, conforme o local da execução. A URL/key devem pertencer ao mesmo Supabase próprio.

```sh
# Offline: sem credenciais, efeitos remotos ou IA.
node --import tsx scripts/importFrozenCatalog.ts \
  --directory /opt/platform-staging/imports/catalog-5617a3b9c2d2 \
  --expected-hash 5617a3b9c2d21c46c7808d36cf7a9a129808da2c6be09c100fe199406ed37c98 \
  --dry-run

# Somente após revisão do responsável: importação draft e inativa.
# SUPABASE_SERVICE_ROLE_KEY já fornecida no ambiente privado.
node --import tsx scripts/importFrozenCatalog.ts \
  --directory /opt/platform-staging/imports/catalog-5617a3b9c2d2 \
  --expected-hash 5617a3b9c2d21c46c7808d36cf7a9a129808da2c6be09c100fe199406ed37c98 \
  --supabase-url "${SUPABASE_URL:?}" \
  --expected-host "${SUPABASE_EXPECTED_HOST:?}" \
  --actor "${GENERATION_TRIAL_CATALOG_ADMIN_UUID:?}" \
  --apply

# Usar a revision do recibo acima; não presumir 3 ou a revision de origem.
# Transferir antes o editorial original com SHA conferido para este caminho.
DOTENV_CONFIG_PATH=/dev/null node --import tsx harness/completeDesigns/importEditorialCatalog.ts \
  --catalog-revision "${GENERATION_TRIAL_CATALOG_REVISION:?}" \
  --file /opt/platform-staging/imports/editorial-5617a3b9c2d2.json \
  --publish

# Verifica configuração local; não conecta sem --online.
DOTENV_CONFIG_PATH=/dev/null pnpm exec tsx scripts/motorPreflight.ts --trial
# Futuro ensaio somente leitura autorizado; não inicia worker nem admite pedido.
DOTENV_CONFIG_PATH=/dev/null pnpm exec tsx scripts/motorPreflight.ts --trial --online
```

A publicação editorial usa o documento original e valida os pares de identidade contra a revisão imutável recém-importada; publica somente o head editorial **dessa revisão**, sem ativar o catálogo global. O recibo do importador permanece conservador (`editorialMissing:true`, `generatable:false`): ele não é atualizado nem convertido em certificado de geração pela etapa editorial posterior. Conferir separadamente o recibo editorial, o preflight e a jornada.

O preflight online usa `BEGIN READ ONLY` e compara instalação REST/SQL; no modo trial exige RPC0070, revisão inativa, admin/acesso próprio e editorial da revisão. Suas consultas de auditoria precisam ler auth.users, catalog_state/revisions e pedidos; executar com conexão administrativa de auditoria somente para esse comando, sem ampliar permissões do papel dedicado do worker. Credencial pode ser injetada na variável `GENERATION_DATABASE_SESSION_URL` **somente no processo preflight**. O listener de produção continua com seu contrato próprio de sessão/rede. Sem `--trial`, o preflight continua exigindo catálogo global publicado e limpo.

### Gate de ensaio e jornada

Configurar na API `GENERATION_TRIAL_CATALOG_REVISION=<revision do recibo>` e `GENERATION_TRIAL_CATALOG_ADMIN_UUID=<UUID confirmado>`, com modo external. Ausência de ambas mantém comportamento normal; par parcial/inválido falha fechado. Somente esse UUID **e** role admin recebe a revisão restrita em capabilities, readiness, manifest/snapshot e admissão. O navegador não escolhe uma revisão arbitrária. Outros usuários/admins não recebem esse pin. O worker usa a revisão gravada no pedido; não precisa alterar o head global. O gate não concede app_access nem role admin.

A seleção experimental (`includeDraftDesigns=true`) permanece explícita no pedido e restrita a admin. Sem editorial da revisão, capabilities fica indisponível e start recusa antes da reserva. Manter `GENERATION_ADMISSION_PAUSED=true` até o responsável liberar o ensaio; preflight não a desativa. O importador não gera embeddings: para ensaio com seleção automática, o caminho lexical existente precisa estar configurado e seu fallback registrado. Seleção não automática sobre muitas famílias ainda exige índice semântico local compatível; importação não satisfaz essa dependência automaticamente.

Os critérios de geração → escolha → edição → persistência/reabertura/exportação e cessação de consultas já descritos neste contrato continuam obrigatórios. `/readyz` não prova renderização real, acesso às fontes/imagens, editorial ou a jornada. A migração/localização do catálogo não resolve os bytes Storage dos posts antigos.

### Evidências e limites deste incremento

- **128 testes aprovados em 16 arquivos**, TypeScript, build Vite e bundles API/worker em `/tmp`, `git diff --check` aprovados. Logs finais: `/tmp/postspark-vps-integration-final-tests.log`, `/tmp/postspark-vps-integration-final-tsc.log`; bundles não substituíram `api/index.js` nem iniciaram processos.
- Dry-run da CLI real aprovado com bloqueio de rede: 82/170/53, hash de origem correto. Todos os 53 assets passaram decodificação/hash/manifests offline, sem revisão visual/IA. Documento editorial original conferido centralmente contra as 170 definições.
- PGlite testou **importação repetida → staging real → admissão 0070 → claim externo 0065**, preservando definição/hash/draft, head e índices/grants/evidências; repetição não duplica revisão/pedido/grants. SQL verifica negação a usuários/roles sem direito, revogação, conflitos, configuração, limites e rollback após reserva. Storage/HTTP Auth foram simulados; billing desse teste integrado usa DEV explícito, não prova cobrança real de plano pago.
- Storage e SQL não compõem uma transação única: após falha podem restar objetos íntegros enviados. Retomada confere novamente; manifesto existente com bytes ausentes/divergentes aborta, sem sobrescrever/reparar silenciosamente. A importação não oferece rollback destrutivo automático.
- O ensaio de login em navegador continua **bloqueado antes de abrir o App** pela indisponibilidade/falha do browser local, conforme adendo anterior. Não usar os testes locais como comprovação de Auth, Storage, renderer, billing ou geração reais na VPS. Teto pago agregado previamente informado continua US$1.


### Conferência posterior de provedor e ambiente

A infraestrutura reportou login real aprovado, DNS/TLS/API Auth online e dados principais importados. São evidências do chat responsável; não convertem o browser local bloqueado em teste aprovado nem comprovam a geração. Ainda não houve inferência paga por esta frente.

O seletor `server/designCatalog/designShortlist.ts` fixa `POST https://openrouter.ai/api/v1/systemone`, modelo default `typesafe/jev-1.13` (`OPENROUTER_DESIGN_SELECTION_MODEL`), com `state/questions` e resposta `answers`. O caminho `auto` usa Jev inclusive em catálogos pequenos; tanto `legacy` quanto `capability_v1` o preservam. Não há fallback de modelo nesse transporte. Falha pode interromper a preparação após intent já pago; recibos persistidos mantêm o modelo fixado.

A ausência no GET `/api/v1/models` reportada pela infraestrutura não demonstra, isoladamente, indisponibilidade da API de decisões. Em consulta pública de 12/11/2026, a [documentação oficial de Jev](https://openrouter.ai/blog/tutorials/how-to-use-jev/) descreve o endpoint **`/api/alpha/decisions`** e chave OpenRouter comum; a [explicação oficial](https://openrouter.ai/blog/insights/what-is-jev/) mantém Jev1.13 como disponível. A compatibilidade do caminho antigo `/api/v1/systemone` não foi confirmada nesta frente. Trata-se de **pendência de transporte/contrato antes do ensaio pago**, sem troca silenciosa por modelo de chat. Nenhum endpoint/modelo foi alterado após o congelamento; o manifesto `/tmp/postspark-vps-integration-final.sha256` permanece válido. A confirmação pública de oferta não prova autorização da chave nem sucesso de inferência no ambiente.


## Dependências corrigidas e congelamento complementar — 12/11/2026

O [relatório de segurança para a VPS](dependencias-seguranca-vps.md) registra o par package/lock atualizado, a adaptação de projeção do catálogo para Zod, os testes e as exceções. **Auditoria de produção: 0 críticas/0 altas/4 moderadas/2 baixas. Auditoria completa: 3 críticas/29 altas/40 moderadas/5 baixas.** As ferramentas de desenvolvimento/build continuam pendentes; não declarar o lockfile globalmente limpo.

Validação local consolidada: 1102 testes em 91 arquivos, TypeScript, builds frontend/API/worker/renderer, smoke HTTP real de loopback e inferência ONNX CPU real com modelo local, todos aprovados. Auth remoto, geração paga, renderer no navegador final e cessação de consultas na VPS não foram validados por esta correção. Não há nova migração nem alteração de dados/Auth/Storage/identidades do catálogo.

O manifesto `docs/postspark-vps-security-freeze.sha256` complementa os 17 arquivos do congelamento anterior com as novas dependências, projeção Zod e evidências. Conferir da raiz do projeto com `sha256sum -c docs/postspark-vps-security-freeze.sha256`. Continua necessário transportar o snapshot completo de fontes: o HEAD e o manifesto complementar não o substituem. Nenhum deploy, reativação ou instalação na VPS ocorreu nesta frente.


### Empacotamento revisado após o congelamento complementar

O manifesto complementar foi substituído por uma revisão de 26 arquivos: `tsx 4.23.15` e `cross-env 10.1.0` agora são dependências de execução, permitindo podar ferramentas após o build sem quebrar worker/CLIs nem `pnpm start`. Cópia física isolada somente produção passou imports da API/worker/CLIs, dry-run real do catálogo, gates negativos de configuração, smoke HTTP e inferência ONNX local; recebeu também dependências completas e passou novamente após `pnpm prune --prod --ignore-scripts`. Os 17 arquivos originais continuam intactos. Ver detalhes, limites e logs no relatório de dependências. As contagens de auditoria permaneceram iguais; o Dockerfile remoto ainda precisa ser reconstruído/verificado pelo responsável. Nenhum serviço foi iniciado nesta frente.


## Roteiro de geração real e transporte Jev confirmado — 12/11/2026

A infraestrutura reportou HTTP 200 em uma requisição real mínima a `/api/v1/systemone`, modelo `typesafe/jev-1.13`, com score/confidence válidos, sem retry: 355 tokens de entrada, 18 de saída, custo declarado US$ 0.00001491. O ledger deve considerar esse custo mesmo enquanto a metadata da chave estiver atrasada. O endpoint atual foi confirmado nesse smoke e permanece intacto; a pendência de transporte relatada acima fica encerrada nesse escopo. O smoke não comprova o catálogo completo nem as demais etapas/modelos da geração. Esta frente não fez a chamada.

O [roteiro de ensaio integrado](roteiro-ensaio-vps-geracao.md) contém o payload admin/trial text-only para três propostas estáticas, transporte tRPC, acompanhamento, recuperação idempotente de admissão e checkpoints Gallery → Canvas → persistência/reabertura/PNG/repouso. Payload e envelope pending_start passaram validação offline contra o schema/parser reais, sem rede. Start pela API isolado não restaura a Gallery apenas gravando requestId; preferir iniciar pelo Studio na mesma visita. Três propostas estáticas não habilitam ZIP de galeria; exportação ZIP requer vários slides no mesmo documento.

Somente documentação foi acrescentada nesta etapa; os 26 hashes do congelamento complementar continuam aprovados. O roteiro não certifica execução na VPS, inferência dos demais modelos, aprovação visual ou cessação real de consultas. Esses resultados precisam vir do executor remoto e do navegador final.

## Ajuste físico de texto — 12/11/2026

O runtime compartilha agora os limites autorados de `textFit`, a classificação de fundo fixo e as métricas de tinta de texto entre redação, encaixe e auditoria. A adaptação opt-in pode usar a altura nativa disponível; continua limitada por vizinhos, ancestrais e outputs da relação. Contato real entre letras continua bloqueante; efeitos ou métricas desconhecidos preservam a auditoria conservadora. Frontend e backend devem transportar juntos os módulos compartilhados e usar os mesmos bytes de fontes. Não requer SQL, variável de ambiente, grant ou alteração do catálogo, Auth e Storage. Documentos já materializados conservam seus overrides e não sofrem reflow automático.

Verificação nesta frente: 44 testes focais, TypeScript e replay offline do pedido `8408b679-fc56-4fe5-b962-5a37bf17ae97` com copy/definições/fontes/assets idênticos. A terceira reserva passou sem achados físicos bloqueantes; apoio em duas linhas mediu 36,9783 dentro do máximo autorado 51,3587, na fonte preferida. Contraprovas de colisão e overflow reais continuaram bloqueantes; salvar/reabrir o Canvas preservou a geometria. A coordenação VPS renderizou a cena no mesmo contêiner, sem rede/inferência, e a imagem foi conferida visualmente. Diagnósticos consultivos de contraste raster/sobreposição autorada continuam presentes. Os JSONs e PNGs do ensaio são privados, mantidos fora deste contrato. Esta evidência não substitui uma nova jornada de geração, revisão final por IA, persistência no banco e repouso medido no ambiente de destino.
