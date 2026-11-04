# Preparação do acervo definitivo de 82 entradas

A coleção em `designs/acervo82/manifest.json` define o novo universo de autoria do PostSpark: 24 referências, 29 representações R9 e 29 conceitos. O objetivo é substituir completamente o catálogo oferecido em novas gerações. As famílias antigas não restringem essa coleção. As definições anteriores permanecem apenas para recuperação e compatibilidade com documentos salvos.

## Ambiente preparado

- Branch `codex/acervo-82`, em worktree própria. O commit `379c695d676d5fdd7615f6eca3470604af71354c` preserva o código local necessário e as fontes, sem alterar a main, o índice ou os arquivos originais.
- Dependências da aplicação instaladas do cache local, em `node_modules` próprio.
- HTML original preservado em `designs/acervo82/sources/showcase-original.html`, acompanhado dos 37 assets usados e de `integrity.json`. A galeria e seus PNGs estão em `designs/showcase_consolidado`.
- Evidência anterior R9 copiada para `artifacts/acervo82/baseline/catalog-r9`, fora do Git. Não participa do novo rol. O checkpoint em `artifacts/acervo82/preparation/source-checkpoint.json` registra hashes e arquivos copiados.
- Perfil dedicado `.acervo82-local/.env`, ignorado pelo Git; nunca copiar a `.env` principal. O launcher remove credenciais herdadas, exige endpoints locais coincidentes no frontend/backend e mantém geração pausada durante a preparação.

## Comandos

```bash
pnpm acervo82:verify
pnpm acervo82:test
pnpm acervo82:init
pnpm acervo82:db:start
pnpm acervo82:db:env
pnpm acervo82:auth:setup
pnpm acervo82:bootstrap
pnpm acervo82:doctor
pnpm acervo82:dev
# Com a aplicação e o Supabase locais em execução:
pnpm acervo82:fixtures
pnpm acervo82:auth:verify
pnpm acervo82:journey
# Ao encerrar os serviços de banco locais:
pnpm acervo82:db:stop
```

`verify` recalcula hashes e a cobertura exata de 82 identidades. `inventory --write` só cria o manifesto inicialmente ou confirma conteúdo idêntico; não sobrescreve um rol congelado divergente. Nenhum desses comandos publica, chama modelos ou modifica o banco.

`doctor` aponta dependências e configuração ausentes. `dev` inicia a aplicação com o perfil isolado e recusa URLs remotas, configuração de frontend/backend divergente, credenciais de integrações externas e habilitação prematura da geração. O perfil não contém credenciais de produção. A configuração de Vite usa exclusivamente o diretório local nesse modo.

## Banco e uploads locais

A CLI Supabase 3.0.0 está fixada como dependência de desenvolvimento da worktree. Inicializar com `supabase init` cria apenas arquivos locais. A execução padrão usa Docker/Podman; a versão atual também documenta runtime nativo experimental para Linux. Consultar o `--help` da versão instalada antes de usá-lo. Nenhum projeto hospedado, conexão de produção ou recurso pago faz parte desta preparação.

O runtime nativo foi iniciado com sucesso nesta preparação. A API local usa a porta 55481; PostgreSQL, 55482; Studio, 55483; Mailpit, 55484. O servidor PostSpark usa 127.0.0.1:3182 e recusa trocar silenciosamente de porta nesse perfil. `acervo82:db:env` obtém apenas credenciais da instância local e grava o perfil privado sem imprimi-las. O cache e os dados nativos ficam em `../.supabase-local`, fora do diretório com espaços, sob o contêiner desta worktree. A primeira tentativa incompleta em `.acervo82-local/supabase-home` foi encerrada; não participa da instância atual.

O bootstrap está em `scripts/acervo82/bootstrap.mjs`. Ele exige o perfil e a conta locais, recusa assumir tabelas sem seu journal e aplica o schema em uma transação, com lock e hashes em `acervo82_private.schema_steps`. `--dry-run` executa e reverte a preparação; repetir o comando preserva o banco e recusa etapas aplicadas cujo SQL mudou. A execução inicial reúne 56 etapas: pré-requisitos locais, 54 migrações e compatibilidade de runtime/grants. Os arquivos 0000/0001 atuais contêm PostgreSQL; a migração 0012 é inválida e 0013 depende dela, ambas substituídas pela 0015 corretiva. Os SQLs históricos não foram modificados: o launcher tolera o schema já criado por Auth e reúne os limites transacionais sob a transação externa.

Os pré-requisitos locais incluem `profiles`, mídia, privacidade e tabelas vazias de leitura de billing; a compatibilidade torna a propriedade UUID obrigatória e adiciona os campos JSON usados pela persistência. O perfil da conta principal é DEV real, com zero Sparks, evitando o fallback FREE por ausência de tabela. Isso não provisiona Stripe, trial ou compra de créditos. Todas as tabelas expostas têm RLS e acesso direto do navegador revogado; o backend conserva a checagem de proprietário. Os grants seletivos das revisões imutáveis são preservados. Os buckets `postspark-media` e `design-arsenal` são privados, com limite de 8 MiB e tipos permitidos.

`acervo82:fixtures` cria pela API autenticada três documentos técnicos (post simples, carrossel e mídia), uma imagem sintética e uma marca fictícia. Reexecutar preserva as edições existentes. IDs e imagem de upload ficam em `.acervo82-local/fixtures.json` e `.acervo82-local/sample-upload.png`. O verificador usa um quarto post dedicado e uma segunda conta local para contraprovas de propriedade; esses são dados de teste. Nenhum deles é uma composição do novo catálogo: não importa referências antigas nem concede aprovação aos 82 designs.

Antes de liberar geração: concluir assets e composições nativas do novo rol e fixar sua revisão no executor local. Schema, Auth, políticas/grants, buckets e persistência `canvas_model` estão preparados para os testes descritos abaixo. Billing externo, SMTP real, captura de site e provedores pagos permanecem sem configuração. A rodada paga de geração é uma etapa futura com orçamento explícito.

## Autenticação durante a preparação local

O Supabase local em `127.0.0.1:55481` tem configuração de Auth independente do projeto hospedado. Cadastrar a URL da aplicação no painel hospedado não habilita um provedor nessa instância local. O `doctor` consulta os provedores efetivamente habilitados no Auth local, sem imprimir suas chaves.

Decisão do proprietário: usar **e-mail e senha locais** nos testes, mantendo Google desabilitado. `acervo82:auth:setup` cria a conta administrativa `acervo82@postspark.test`, com senha aleatória em `.acervo82-local/test-account.json` (modo 0600, ignorado pelo Git). A execução repetida preserva a identidade e a senha existentes; se o arquivo for perdido, o comando não redefine a senha de uma conta encontrada. O perfil recebe `VITE_POSTSPARK_LOCAL_AUTH=email`; o formulário da landing oferece somente login por senha quando desenvolvimento, aplicação e Supabase são locais. Outros ambientes preservam Google e cadastro.

O fixture `ops/acervo82/auth-fixture.sql` implementa apenas os dois RPCs de acesso consumidos pelo backend. A conta preparada recebe um grant por UUID na tabela privada `acervo82_private.access_grants`, protegida por RLS e sem acesso para `anon`/`authenticated`. Os RPCs são `SECURITY INVOKER`, com execução apenas pelo `service_role`. Não cadastram automaticamente usuários nem usam e-mail ou `user_metadata` para conceder acesso. O setup recusa sobrescrever funções preexistentes que não pertençam a esse fixture. `BYPASS_AUTH=true` é recusado pelo perfil local: token Supabase, cookie bridge e autorização continuam reais. O schema `postspark` está habilitado na API local; alterações no `config.toml` exigem reiniciar essa instância.

`acervo82:auth:verify` verifica senha incorreta, token inválido, login válido, cookie HttpOnly, identidade no `auth.me`, ausência de sessão sem cookie, logout e restrições de acesso no banco. A sessão criada pelo verificador é encerrada sem revogar as sessões do navegador. O login pela interface e a permanência após recarregar foram conferidos em `127.0.0.1:3182/thevoid`. Esse fixture de Auth não reproduz ManyLabs hospedado; banco e buckets são preparados separadamente por `acervo82:bootstrap`.

Referências: [senha no Supabase](https://supabase.com/docs/guides/auth/passwords) e [Google no desenvolvimento local](https://supabase.com/docs/guides/auth/social-sign-in/auth-google#local-development).

## Condução dos testes locais

- Biblioteca: `http://127.0.0.1:3182/saved-posts`. Abrir um dos documentos, editar texto pelo painel Camadas, salvar atualizando o registro e reabrir pela biblioteca. O carrossel permite testar conteúdo por slide; o post de mídia permite testar carregamento e enquadramento. A imagem sintética está disponível para uploads manuais.
- Referências das 82 entradas: `designs/showcase_consolidado/index.html` e `designs/acervo82/manifest.json`, preservados na worktree. O inventário verifica os 158 arquivos sem rede. O HTML original usa CDN Tailwind; sua visualização não é uma promessa de funcionamento inteiramente offline.
- Checagem automática: `acervo82:doctor` deve ficar sem pendências. `acervo82:journey` faz 16 verificações reais de API/DB/Storage: persistência JSON canônica, adaptador oficial de reabertura, biblioteca, marca, imagem exata, privacidade de buckets, isolamento entre proprietários, RLS, preservação dos grants imutáveis. Não chama modelos nem ativa catálogo. O relatório identifica que não verifica navegador ou geração por provedor.
- Conferência de navegador realizada: título editado no CanvasLab, registro atualizado, biblioteca mostrando a alteração e documento reaberto com o texto preservado. O aplicativo confirmou a produção do PNG 4K, mas a captura automática do arquivo de download expirou no navegador integrado. Inspeção dos bytes/dimensões do PNG baixado e ZIP do carrossel permanecem testes manuais; não são declarados homologados.

Os 82 designs ainda exigem autoria nativa e revisão. A geração por IA permanece pausada e sem credenciais pagas. O ambiente preparado permite conduzir testes de edição, uploads e persistência e iniciar a autoria controlada; não certifica geração com os 82 nem substituição produtiva do catálogo.

## Execução da autoria

O contrato operacional está em `designs/acervo82/workflow.json`. Cada entrada progride por preservação de fonte, autoria, verificação técnica, revisão visual e jornada completa. A aprovação se associa à versão/hash da composição. Problemas registram causa e próxima ação; não reduzem silenciosamente o conjunto.

1. Fixar aparência de referência por entrada. As representações HTML R9 diferem dos renders anteriores e devem ser trabalhadas como a direção visual do novo acervo, conforme o objetivo do proprietário.
2. Normalizar prancheta 1080 × 1350, fontes e animações. Recuperar estrutura de DOM/SVG quando disponível; reconstruir as 24 fontes raster conforme necessário.
3. Autorizar campos e limites de conteúdo efetivamente testados. Usar camadas nativas para textos e geometria suportada; tratar curvas, padrões, blend e blur explicitamente, com assets decorativos ou evolução versionada do contrato.
4. Conferir referência/render e textos alternativos. Medir legibilidade, distribuição dos campos, cardinalidade e identidade visual sem transformar temas de exemplo em proibições.
5. Conferir no ambiente local: seleção → galeria → editar → salvar → reabrir → exportar. Simulações não contam como comprovação dessa jornada.
6. Fechar as 82 entradas antes de preparar a substituição integral. O validador de recibo inicial verifica somente cobertura/formato; revisão, autenticidade de evidências e gates existentes ainda são obrigatórios.

## Recuperação e ativação

O pacote de ativação deve identificar commit da aplicação, manifesto/hashes do novo catálogo, revisão de banco/catálogo e todos os assets necessários. A evidência de recuperação deve identificar os mesmos elementos da versão anterior. Rollback de código isolado não restaura banco, arquivos ou serviços. A ativação futura usa o caminho de catálogo versionado existente, após homologação; não mistura entradas antigas para preencher lacunas do novo rol.

## Limite desta entrega

Esta preparação preserva as fontes, cria o inventário, isola configuração e fornece verificações offline. Login, edição, salvamento e reabertura foram verificados com serviços locais reais e navegador. A preparação não reconstrói automaticamente os 82 modelos, não aprova sua estética nem homologa geração ou os arquivos exportados. O estado das dependências locais e da execução fica no relatório de preparação.

## Verificação desta preparação

Inventário íntegro: 82 entradas e 158 arquivos. Na preparação do schema, quatro testes offline, TypeScript e 33 regressões de catálogo/save adapter/mídia passaram; 16 verificações reais de API/DB/Storage também. O bootstrap completo passou em transação revertida antes da aplicação e a repetição confirmou zero etapas novas. Advisors locais sem achados de segurança. O doctor aponta schema, perfil, Auth e buckets prontos. Evidências em `artifacts/acervo82/preparation/{bootstrap,journey,browser,report}.json` e screenshot `editor-save-reopen.png`. Nenhuma chamada paga ou ativação do catálogo foi executada.
