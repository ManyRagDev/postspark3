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

Antes de liberar geração: concluir assets e composições nativas do novo rol e fixar sua revisão no executor local. Schema, Auth, políticas/grants, buckets e persistência `canvas_model` estão preparados para os testes descritos abaixo. Billing externo, SMTP real, captura de site e provedores pagos permanecem sem configuração. A rodada paga autorizada usa o launcher separado descrito abaixo, com orçamento próprio.

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
- Conferência de navegador realizada: título editado no CanvasLab, registro atualizado, biblioteca mostrando a alteração e documento reaberto com o texto preservado. O aplicativo confirmou a produção do PNG 4K, mas a captura automática do arquivo de download expirou no navegador integrado. Essa pendência da preparação foi encerrada no piloto abaixo: PNG avulso e cinco PNGs do ZIP foram baixados e verificados após corrigir o download avulso para Blob.

Os 82 designs ainda exigem autoria nativa e revisão. O perfil base permanece com a geração por IA pausada e sem credenciais pagas; o piloto autorizado usa um processo separado. O ambiente preparado permite conduzir testes de edição, uploads e persistência e iniciar a autoria controlada; não certifica geração com os 82 nem substituição produtiva do catálogo.

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

## Piloto com geração real — 04/11/2026

Após autorização expressa para APIs e recursos pagos, foram reconstruídas seis fontes em camadas nativas, com cinco fontes tipográficas verificadas. O piloto contém seis composições estáticas/capas e 24 variantes de desenvolvimento/fechamento, nos modos composto e literal. Não são 30 fontes diferentes. Duas construções independentes produziram as mesmas 30 identidades/hashes; todas passaram pela verificação técnica com texto original e alternativo. As variantes de carrossel foram renderizadas no CanvasPostStage real. As miniaturas diagnósticas das capas não são, isoladamente, prova da jornada de usuário.

| Fonte do novo rol | Dificuldade exercitada | Resultado da comparação visual assistida |
| --- | --- | --- |
| reference-03 — Creative People | Fonte raster, lettering, fotografia substituível | Legível; identidade incompleta: falta volume/contorno do lettering, selo ABOUT e acabamento de botões |
| r9-03 — Versus | Duas colunas e campos independentes | Identidade preservada, ajustes finos de tipografia/borda |
| r9-11 — Minimal Air | Espaço negativo e hierarquia | Identidade preservada, conferir entrelinha |
| r9-20 — Data Punch | Destaque de número e metadados | Identidade preservada, conferir tracking |
| concept-06 — Industrial Tech-Spec | Padrão, selo e metadados | Identidade preservada, conferir código de barras e espessuras |
| concept-10 — Neo-Bauhaus | Rotação e geometria | Identidade preservada, curva aproximada por polígono |

Essa comparação é uma opinião de provedor sobre imagens identificadas, sem aprovação automática de publicação. A foto da referência original não foi incorporada como asset do catálogo; o slot recebe mídia privada da geração. Textura de papel, sombras CSS e contornos irregulares continuam adaptações declaradas. Números e certificações da referência são exemplos editáveis, nunca evidência factual para a copy.

O staging local fixado está no recibo `artifacts/acervo82/pilot/staged.json` (revisão 2 nesta execução). A revisão ativa continua ausente. Definições locais de ensaios anteriores foram arquivadas, mantendo suas revisões e documentos. O catálogo experimental elegível contém somente as 30 definições destas seis fontes. A taxonomia editorial descreve possibilidades; não limita temas nem recupera famílias antigas para preencher lacunas.

Foram concluídos três casos reais iniciados pelo navegador: post tipográfico, carrossel de cinco slides e post com fotografia gerada. Os casos finais entregaram nove propostas e 21 slides, cobrindo as seis fontes. Cada proposta passou pela revisão de provedor, e o verificador re-renderizou as composições com assets reais; no caso fotográfico, também exige fotografia em todas as propostas. Não houve mocks nessas jornadas. Dois ensaios anteriores foram preservados: o primeiro carrossel falhou no normalizador e o primeiro pedido fotográfico terminou parcial; seus custos estão incluídos.

No navegador, o post tipográfico foi editado/salvo/reaberto (registro 5), assim como o segundo slide do carrossel (registro 6). A fotografia gerada foi salva e reaberta separadamente. O ZIP oficial foi baixado e inspecionado: cinco PNGs de 3072 × 3840, CRC e hashes válidos. O PNG avulso também foi baixado e decodificado nessa resolução. Evidências de navegador, modelos persistidos, renders e recibos estão em `artifacts/acervo82/pilot/`; o resumo versionado está em `designs/acervo82/pilot/results.json`.

Falhas corrigidas durante o piloto: reconhecimento do número de slides em uma citação longa do briefing; reconhecimento de “use obrigatoriamente uma fotografia” antes da escolha do layout; quebra de vários metadados em linhas legíveis nas variantes; download avulso PNG com Blob, preservando os bytes do renderizador. Há regressões para esses casos e para a identidade congelada da autoria.

A aprovação automática ainda exige conferência editorial: no carrossel Versus, um exemplo introduziu desconto de 20% e prazo de cinco dias sem deixar inequívoco que são números hipotéticos; no Industrial, “elimina retrabalho” é uma promessa absoluta sem suporte. Esses resultados não estão aprovados para publicação. Os slides de desenvolvimento também usam uma composição mais simples que a capa; o ritmo e a identidade ao longo da sequência precisam de avaliação humana. A amostra prova viabilidade do mecanismo, sem estimar uma taxa de sucesso das 82 entradas.

## Reexecutar o piloto

```bash
# Com banco, Auth e schema locais já preparados:
pnpm acervo82:pilot:prepare
pnpm acervo82:pilot:author
pnpm build:review-renderer
# Usar um diretório de saída novo; o build preserva saídas imutáveis.
pnpm designs:build --input artifacts/acervo82/pilot/intake --output artifacts/acervo82/pilot/build-06 --carousel-variants
pnpm acervo82:pilot:stage artifacts/acervo82/pilot/build-06
pnpm acervo82:pilot:configure
pnpm acervo82:pilot:dev '/caminho/privado/arquivo-com-OPENROUTER_API_KEY'
# Iniciar a geração na interface local. O verificador só observa o UUID existente:
pnpm acervo82:pilot:verify UUID static
pnpm acervo82:pilot:verify UUID carousel
pnpm acervo82:pilot:verify UUID photo
```

`prepare` consulta metadados públicos do OpenRouter e, se faltar, baixa Montserrat do repositório oficial Google Fonts verificando o SHA-256 fixado. Não faz inferência paga. `author` é offline. `stage` usa somente Supabase local, exige as mesmas identidades se houver recibo anterior e não ativa catálogo. Uma nova versão visual exige novo build e revisão/recibo próprios; não remover recibos para aproveitar aprovação antiga.

`configure` fixa fingerprints do pipeline e do renderizador e conserva o orçamento existente. O launcher remove variáveis herdadas, lê somente `OPENROUTER_API_KEY` do arquivo indicado e mantém a chave em memória, sem copiar outros dados da `.env` original. O perfil base não muda. O preload do servidor e dos executores recusa outros destinos, modelos não cotados e admissão fora da conta/revisão experimentais. Servidor e workers compartilham um ledger com lock: US$10, 120 chamadas e cinco admissões. O teto inicial de quatro admissões foi estendido uma vez para a repetição corretiva da foto, sem alterar os limites monetário e de chamadas. Todos os cinco pedidos já foram usados; não apagar o ledger para continuar gerando. A aplicação pode consultar/editar os resultados existentes. Novas rodadas devem ter orçamento e recibos próprios.

Consumo desta rodada: 42 chamadas com custo retornado pelo provedor de US$0,870384144, incluindo JEV, geração de texto/fotografia, revisões, falhas e repetições. Nenhuma chamada ficou com custo incerto. Não foram criados recursos hospedados nem habilitado billing externo. O teste local usa perfil DEV; não comprova cobrança de Sparks de planos pagos.

Verificação: inventário 82/158 íntegro; 108 regressões de planejamento, seleção, compilação, persistência, exportação e orçamento passaram, além do teste de autoria reproduzível e TypeScript. A preparação mantém seus testes offline. Isso não conclui a autoria das outras 76 fontes, não aprova a fidelidade da referência 03 e não ativa a substituição integral do acervo.

## Seleção escalável de famílias — 04/11/2026

Novos pedidos editoriais fixam `familyRetrievalVersion=1` em `prepare:selection_input`. O catálogo completo permanece disponível para busca local; o JEV recebe inicialmente até 24 famílias. Se o planejador não conseguir produzir três slots viáveis, há uma única expansão de até 12 famílias diferentes. O limite conjunto é 36 avaliações, quatro lotes, 48.000 bytes por requisição e 128.000 bytes somados. O orçamento inclui o contexto repetido e é conferido antes de despachar cada onda; não se corta o briefing para fazê-lo caber. Um contexto que exceda o orçamento retorna erro explícito.

O filtro obrigatório continua técnico: formato, número de páginas, modo de conteúdo, mídia e capacidades existentes. Depois, a recuperação combina BM25, similaridade semântica, afinidade editorial e estrutura por fusão de rankings, com espaço para diversidade. Tema e tags são sinais de preferência. Uma composição sem anotação ou criada originalmente para outro tema pode ser recuperada. Empates de afinidade não geram diferenças artificiais por ID. O JEV avalia adequação editorial; o planejador local escolhe fonte, sequência e campos, e redação/revisão seguem o fluxo existente. Até 12 famílias bem pontuadas seguem normalmente, com a reposição limitada de mídia já existente, restrita a famílias efetivamente avaliadas com nota mínima 2.

O índice usa `multilingual-e5-small` quantizado, executado localmente pela biblioteca Transformers.js já presente. O artefato é fixado por revisão e SHA-256; não há download nem embedding de todo o acervo durante uma geração. A publicação de catálogo ou anotações prepara o índice correspondente; ativação de catálogo configurado exige sucesso dessa preparação. Documentos/vetores são vinculados à revisão, hash de fonte, texto e modelo. Publicação editorial já confirmada no banco pode permanecer sem índice se o disco/modelo falhar: novas seleções grandes param até a reconstrução, sem usar um índice antigo. Regras completas e proibições permanecem nos perfis do JEV; a busca representa capacidades positivas para evitar interpretar “sem fotografia” como afinidade por foto.

Com até 24 famílias elegíveis, todas cabem na primeira onda e o índice é dispensável. Acima disso, índice ausente, inválido ou desatualizado bloqueia antes da interpretação paga do briefing. Não existe fallback que envie todo o catálogo ao JEV. Recibos congelam consulta, índice, modelo, candidatos, métricas, expansão e transporte; famílias não avaliadas conservam score ausente. A auditoria identifica `not_evaluated` separadamente de uma nota baixa. Pedidos históricos conservam o método registrado e chamadas concluídas não são refeitas na retomada. A migração local `0056_family_retrieval_replay.sql` permite repetir apenas o cálculo local interrompido, preservando recibos concluídos e permissões de execução.

```bash
pnpm acervo82:retrieval:model   # baixa o modelo público uma vez; sem inferência paga
pnpm acervo82:retrieval:index   # prepara/repara o índice da revisão de staging
pnpm acervo82:retrieval:verify  # busca real local + transporte sintético limitado
```

Configurar `DESIGN_RETRIEVAL_DIRECTORY` em todos os processos de preparação/publicação. O diretório precisa conter o modelo e os índices imutáveis publicados; em infraestrutura sem disco persistente, disponibilizá-los no artefato antes de iniciar o leitor. A integração não cria workers, recursos hospedados ou dependências novas. Esta worktree usa `.postspark-local/design-retrieval`; os dados e o modelo não entram no Git.

Verificação sem inferência paga: 36 consultas com modelo real, metade sem anotações editoriais, obtiveram uma família esperada entre as três primeiras em 35 casos (97,2%). O caso geométrico Bauhaus com anotações ficou fora das três primeiras e está preservado no relatório. Os rótulos são provisórios de implementação, sobre apenas seis fontes; não medem a qualidade de 200 designs distintos nem substituem avaliação humana. Transporte com 200, 1.000 e 2.000 famílias sintéticas derivadas dessas fontes manteve 36 avaliações, três lotes e menos de 120.000 bytes por execução; respostas JEV nessa medição são simuladas. O modelo semântico e seus vetores são reais. Evidências: `artifacts/acervo82/scalability/{retrieval-report,retrieval-quality}.json` e casos versionados em `designs/acervo82/retrieval-cases.json`.

Novas gerações permanecem pausadas, sem ativação do catálogo ou ampliação do orçamento do piloto. A autoria das outras 76 fontes e uma avaliação humana com briefings reservados continuam necessárias para homologar o novo acervo completo.

Regressões finais: 220 testes em 16 arquivos, TypeScript, inventário 82/158 e os quatro testes offline de preparação aprovados. A jornada real local confirmou 16 verificações de Auth/API/DB/Storage, incluindo salvar/editar/reabrir pelo adapter oficial, isolamento por proprietário e RLS. O harness passou a comparar a contagem de pedidos antes/depois, preservando os cinco pedidos históricos do piloto. Esta rodada não executou nova geração paga nem nova inspeção visual no navegador. Resumo preservado em `designs/acervo82/retrieval-results.json`.

## Serviço real em uma rodada independente

O launcher aceita `POSTSPARK_ACERVO82_PILOT_SESSION` com um nome simples, por exemplo `retrieval-live-01`. Cada nome conserva configuração privada e ledger próprios; omitir a variável mantém o piloto original. Os cinco pedidos e US$0,870384144 anteriores não foram apagados ou reutilizados. A sessão nomeada conserva os mesmos tetos de US$10, 120 chamadas e cinco admissões, com escopo restrito à conta local e revisão experimental. Gemini, Claude e DeepSeek da interface possuem cotações de transporte, além dos modelos de mídia/revisão. Modelos ainda não cotados são bloqueados.

```bash
pnpm acervo82:pilot:prepare
POSTSPARK_ACERVO82_PILOT_SESSION=retrieval-live-01 pnpm acervo82:pilot:configure
POSTSPARK_ACERVO82_PILOT_SESSION=retrieval-live-01 pnpm acervo82:pilot:dev '/caminho/privado/arquivo-com-OPENROUTER_API_KEY'
# Em outro terminal; inicia um pedido real e usa uma admissão da sessão:
POSTSPARK_ACERVO82_PILOT_SESSION=retrieval-live-01 pnpm acervo82:pilot:smoke static
# Consultam somente um UUID existente:
POSTSPARK_ACERVO82_PILOT_SESSION=retrieval-live-01 pnpm acervo82:pilot:verify UUID static
POSTSPARK_ACERVO82_PILOT_SESSION=retrieval-live-01 pnpm acervo82:pilot:audit --id UUID --output artifacts/acervo82/pilot/sessions/retrieval-live-01/evidence.json
```

Repetir `smoke` para o mesmo caso e sessão usa a chave de idempotência persistida e não compra outro pedido. `configure` atualiza as cotações de uma sessão nomeada apenas enquanto ela não tiver admissões ou chamadas; sessões usadas preservam cotações e recibos. Para retomar após alterações de código, `configure` atualiza o fingerprint sem reiniciar o orçamento. Não abrir outro nome para contornar os limites de uma rodada em andamento.

Por solicitação do proprietário, o serviço real da sessão `retrieval-live-01` foi habilitado na porta 3182. O perfil base permanece pausado; iniciar `acervo82:dev` volta à condição base. A revisão de catálogo continua sem ativação global, utilizando apenas as seis fontes do staging. O pedido real `9da1b108-c81d-41c5-91ca-faadc132355f` terminou com três propostas, revisões aprovadas pelo provedor e renderização CanvasPostStage conferida. Foram oito chamadas reais, US$0,082706862 e nenhuma pendência de custo. A auditoria passou 71 verificações e confirmou o protocolo novo: cinco famílias tecnicamente elegíveis, cinco avaliadas em um lote de 23.402 bytes, sem expansão. Com esse catálogo pequeno, o caminho não exige embeddings; essa rodada não prova recall com centenas de designs distintos. Restaram quatro admissões na sessão após a conferência. Evidências em `artifacts/acervo82/pilot/sessions/retrieval-live-01` e renders em `artifacts/acervo82/pilot/runs/9da1b108-c81d-41c5-91ca-faadc132355f`.

## Recuperação editorial limitada — 05/11/2026

O pedido fotográfico `c5a8a8af-9af0-4f8c-aac0-fc34514ffc21` expôs uma regressão: a única família com slot de foto recebeu nota 1,5 e confiança 0,12, e o corte global de 2 encerrou as três opções antes de tentar compô-las. No piloto anterior, o mesmo prompt havia concluído com a mesma família e nota 1,72. A reprodução local conservou interpretação, fonte e nota reais e produziu três planos estruturalmente válidos ao permitir a tentativa. O erro consumiu duas chamadas e US$0,006305148; seu pedido e recibos foram preservados.

Novos pedidos editoriais registram `familyRecoveryVersion=1` e `planning.familyElection.version=3`. Após o conjunto inicial e a eventual expansão, a recuperação examina no máximo três famílias já avaliadas. A faixa inicial é conservadora: nota de 1 inclusive a 2 exclusive e confiança informada de até 0,35. São parâmetros de engenharia versionados, não probabilidades calibradas nem aprovação estética. Notas abaixo dessa faixa e rejeições com confiança maior permanecem excluídas. O caminho normal conserva seu corte e seus 12 finalistas.

Cada tentativa usa o mesmo planejador local e valida fonte, campos, cobertura do conteúdo, cardinalidade explícita e mídia. Só é retida se aumentar o número de slots viáveis sem perder um slot anteriormente viável; para ao alcançar três. Uma família pode ser reutilizada. Regras técnicas e proibições continuam obrigatórias. A verificação estrutural não garante encaixe físico: redação, renderização, ajuste de texto e revisão final continuam sendo executados antes de entregar a proposta como pronta.

O recibo de recuperação contém política/hash, candidatas tentadas, notas/confianças originais, hashes dos planos locais, slots viáveis antes/depois e motivo de retenção ou rejeição. A auditoria reconstrói as tentativas a partir de catálogo, interpretação, avaliações e histórico congelados. Famílias recuperadas são identificadas separadamente, sem reescrever a nota. O seletor local pode reter até três famílias adicionais; os tetos de 36 avaliações, quatro lotes e 128.000 bytes no JEV permanecem. A recuperação não consulta o provedor, não procura fora do conjunto avaliado e não afrouxa a revisão. Recibos sem o marcador mantêm o comportamento anterior, inclusive o resultado do pedido que falhou; nenhuma migração adicional é necessária.

O caso foi repetido pelo navegador com o mesmo prompt e modo de execução, no novo pedido `0bf1f8e0-064a-4f9f-9867-1e33ec6ed4f4`. A nota real do JEV foi 1,81, confiança 0; a família fotográfica foi recuperada em uma tentativa local e as três propostas terminaram prontas, cada uma com fotografia gerada. Redação, fotografias, renders e revisões foram reais. Uma resposta de revisão precisou da correção de evidência já prevista no fluxo. Foram 12 chamadas, US$0,31952548 e nenhuma pendência de custo. A auditoria da geração passou com os vínculos de provedor completos. A justificativa exibida ao usuário é uma projeção canônica da recuperação; a auditoria compara essa transformação e mantém a comparação exata dos demais campos com a seleção congelada.

Uma proposta foi aberta no CanvasLab, teve o título nativo editado para `CRIAR EM\nGRUPO.`, foi salva e reaberta pela biblioteca. O registro 10 conserva composição nativa, fotografia, legenda e proveniência; o hash da composição foi idêntico após o adapter oficial. A normalização acrescenta alguns defaults legados, portanto não se afirma igualdade byte a byte do objeto inteiro. A conferência de igualdade com a entrega original acusa corretamente a edição intencional do título; essa comparação não substitui a conferência de reabertura. Screenshots em `recovery-gallery.png` e `recovery-editor-reopened.png` dentro da sessão. O ledger do piloto original permanece com o mesmo SHA-256. Após o teste, a sessão `retrieval-live-01` ficou com três admissões usadas e duas restantes, sem ampliar seus limites. Resumo versionado em `designs/acervo82/recovery-results.json`.

Verificação: 206 regressões em 12 arquivos, TypeScript e inventário 82/158. Inclui recuperação com até 2.000 famílias sintéticas sem novas avaliações, rejeição com confiança alta, tentativa sem ganho, preservação dos slots já viáveis, mídia obrigatória/proibida, conteúdo obrigatório incompleto, retomada histórica e adulteração de recibos/atribuições. A viabilidade estrutural não promete qualidade visual em qualquer briefing; a amostra real continua restrita às seis fontes do piloto.
