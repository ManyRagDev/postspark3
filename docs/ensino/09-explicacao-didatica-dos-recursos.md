# 09 - Explicacao didatica dos recursos

Este documento explica os principais recursos do PostSpark 3 em linguagem natural, com foco em entendimento. A intencao e mostrar como as partes se conectam e por que cada uma existe.

Ele deve ser lido depois dos documentos anteriores da trilha. Os outros arquivos apresentam os conceitos de forma mais separada; este texto junta as pecas em uma explicacao continua.

## O que o PostSpark faz

O PostSpark 3 e uma aplicacao que ajuda uma pessoa a criar posts para redes sociais com apoio de inteligencia artificial.

Para o usuario, a experiencia parece relativamente direta: ele entra na aplicacao, informa uma ideia, uma URL ou uma imagem, recebe sugestoes de posts, escolhe uma delas, edita visualmente e pode salvar o resultado.

Por tras dessa experiencia existem varias camadas. A tela que o usuario ve e apenas uma parte do sistema. Para que o produto funcione, a aplicacao tambem precisa autenticar usuarios, controlar saldo, chamar servicos de IA, salvar dados, lidar com pagamentos e ser publicada em um ambiente acessivel pela internet.

Essa separacao entre o que o usuario ve e o que o sistema precisa fazer e uma das ideias mais importantes em projetos reais.

## A interface nao e o sistema inteiro

Quando alguem esta comecando em programacao, e comum imaginar que o projeto e basicamente aquilo que aparece na tela. No PostSpark, a tela e muito importante, mas ela nao carrega sozinha toda a responsabilidade.

O frontend e responsavel pela experiencia do usuario. Ele mostra campos, botoes, etapas, editor visual, mensagens e resultados. Tambem captura as acoes do usuario e envia pedidos para o backend.

Mas o frontend nao deve tomar decisoes criticas sozinho. Ele roda no navegador, em um ambiente controlado pelo usuario. Por isso, regras como "este usuario esta autenticado?", "ele tem saldo?", "pode salvar este post?", "a cobranca foi confirmada?" e "qual chave de API deve ser usada?" pertencem ao backend.

No PostSpark, essa divisao aparece claramente:

- o frontend vive em `client/`;
- o backend vive em `server/`;
- os contratos compartilhados vivem em `shared/`.

Essa organizacao ajuda a separar responsabilidades.

## O papel do frontend

O frontend e a camada de apresentacao e interacao.

No PostSpark, ele e construido com React e Vite. React ajuda a organizar a interface em componentes. Vite cuida do ambiente de desenvolvimento e do build do frontend.

Quando o usuario navega pela aplicacao, preenche um formulario, abre o Workbench ou seleciona uma variacao gerada, ele esta interagindo principalmente com o frontend.

O frontend tambem guarda alguns estados temporarios. Por exemplo, durante a edicao de um post, a aplicacao precisa lembrar qual slide esta sendo editado, quais ajustes visuais foram feitos, quais imagens estao em uso e quais variacoes foram recebidas. Parte disso fica em estado de UI e parte pode ser persistida depois.

Uma boa forma de entender o frontend e pensar nele como o painel de controle do produto. Ele nao e apenas decoracao: ele organiza a jornada do usuario. Mas ele tambem nao e a autoridade final sobre dados sensiveis.

## O papel do backend

O backend e a camada que recebe pedidos, valida regras e conversa com servicos internos e externos.

No PostSpark, o backend usa Node.js, Express e tRPC. O Express cria o servidor HTTP. O tRPC organiza chamadas entre frontend e backend com tipagem compartilhada. Isso reduz o risco de o frontend chamar uma funcao com dados em formato errado.

Quando o frontend pede para gerar um post, ele nao chama diretamente todos os servicos externos. Ele chama o backend. O backend entao avalia o contexto da requisicao: quem e o usuario, qual acao ele quer executar, quais dados foram enviados e quais recursos externos precisam ser acionados.

O backend tambem protege segredos. Chaves de API, service role do Supabase, segredos da Stripe e configuracoes sensiveis nao devem ficar expostos no navegador. Eles pertencem ao servidor.

Em termos didaticos, o backend e o lugar onde a aplicacao deixa de ser apenas uma interface e passa a ser um produto com regras.

## Como frontend e backend conversam

A conversa entre frontend e backend acontece por API.

No PostSpark, a principal API e tRPC, exposta em `/api/trpc`. Tambem existem endpoints REST especificos para alguns casos, como autenticacao, extracao e webhook da Stripe.

Quando o usuario executa uma acao, o fluxo costuma seguir este caminho:

1. O usuario interage com a tela.
2. O frontend transforma essa acao em uma chamada para o backend.
3. O backend recebe a chamada e valida o contexto.
4. O backend executa regras, consulta banco ou chama integracoes.
5. O backend devolve uma resposta.
6. O frontend atualiza a interface.

Esse fluxo e central para entender sistemas web. A tela nao "sabe tudo"; ela pede coisas ao servidor. O servidor nao "mostra a tela"; ele responde com dados e resultados.

## Autenticacao: saber quem esta usando

Antes de permitir acoes importantes, o sistema precisa saber quem e o usuario.

No PostSpark, essa responsabilidade e apoiada pelo Supabase Auth. O usuario faz login no frontend, e a sessao do Supabase e sincronizada com o backend por uma ponte de autenticacao. O backend cria um cookie httpOnly para reconhecer o usuario nas proximas requisicoes.

Esse desenho tem um motivo. O frontend precisa saber se o usuario esta logado para mostrar a experiencia correta. Mas o backend tambem precisa validar o usuario, porque e ele que protege operacoes importantes.

O cookie httpOnly ajuda nessa protecao porque nao fica disponivel diretamente para scripts do frontend. Ele viaja nas requisicoes para o servidor, permitindo que o backend monte o contexto do usuario.

Assim, autenticacao nao e apenas uma tela de login. E um fluxo que conecta navegador, Supabase, backend, cookies e procedimentos protegidos.

## Banco de dados: guardar o que precisa permanecer

Nem toda informacao pode viver apenas na memoria da tela.

Se o usuario salva um post, esse post precisa continuar existindo depois que ele fecha o navegador. Se ele compra um plano, essa informacao precisa ser consultada depois. Se existe saldo de Sparks, esse saldo precisa estar registrado de forma confiavel.

No PostSpark, a persistencia usa Supabase/Postgres. O backend acessa esses dados principalmente por `@supabase/supabase-js`, especialmente em `server/db.ts`.

Existe tambem uma pasta `drizzle/`, com schema e migracoes. Isso e didaticamente importante: em projetos reais, pode haver mais de uma ferramenta relacionada ao banco. A pergunta correta nao e apenas "qual ferramenta existe no repositorio?", mas "qual ferramenta participa do fluxo atual em runtime?".

O banco de dados representa a memoria duravel do produto.

## Billing e Sparks: controlar custo e permissao

Gerar conteudo com IA, imagens ou analises externas pode ter custo. Por isso, o PostSpark possui billing e saldo de Sparks.

Billing e a parte do sistema que lida com planos, pagamentos e eventos da Stripe. Sparks representam uma unidade interna de consumo. Antes de uma operacao cara, o backend pode verificar se o usuario tem saldo suficiente e registrar o consumo.

Essa responsabilidade precisa ficar no backend. Se o frontend pudesse decidir sozinho que um usuario tem saldo, qualquer pessoa poderia manipular a aplicacao pelo navegador. O backend precisa ser a autoridade sobre saldo, plano e autorizacao.

O webhook da Stripe tambem entra nesse fluxo. Quando algo acontece no pagamento, a Stripe avisa o backend. O backend interpreta esse evento e atualiza o estado interno do usuario.

Billing e um bom exemplo de regra que parece invisivel para o usuario, mas sustenta o produto.

## IA e integracoes externas

O PostSpark usa servicos externos para gerar conteudo, analisar insumos, gerar imagens ou extrair informacoes visuais.

Esses servicos nao estao dentro do codigo do projeto. O backend conversa com eles por APIs. Isso significa que o PostSpark depende nao apenas do seu proprio codigo, mas tambem da disponibilidade, custo, formato de resposta e limites desses provedores.

Essa e uma caracteristica comum de produtos modernos. Um sistema raramente faz tudo sozinho. Ele combina codigo proprio com plataformas externas.

Por isso, integracoes precisam ser tratadas com cuidado:

- a resposta externa pode falhar;
- a API pode mudar;
- a chamada pode demorar;
- pode haver custo por uso;
- chaves de acesso precisam ficar protegidas.

O backend e o lugar natural para coordenar essas integracoes.

## O Workbench: edicao visual como estado estruturado

O Workbench e a area onde o usuario edita visualmente o post.

Para quem esta aprendendo, e util perceber que um editor visual nao e apenas uma imagem na tela. Ele precisa representar informacoes estruturadas: texto, secoes, layout, background, slides, ajustes de imagem, overlays e variacoes.

Quando o usuario move ou altera elementos, a interface muda. Mas, para salvar e reabrir depois, essas mudancas precisam virar dados.

Esse ponto ensina uma ideia importante: uma interface visual precisa ter um modelo de dados por tras. Sem esse modelo, o sistema ate poderia mostrar algo bonito na hora, mas nao conseguiria persistir e reconstruir o resultado com fidelidade.

## Build: transformar codigo em artefato executavel

O codigo escrito durante o desenvolvimento nao e necessariamente o mesmo formato entregue em producao.

No PostSpark, o build prepara duas partes:

- o frontend, gerado pelo Vite;
- o backend, empacotado com esbuild em `api/index.js`.

Isso significa que alterar o codigo fonte do backend nao basta, por si so, para alterar o artefato de producao. O build precisa ser executado para gerar a versao empacotada correta.

Build e a etapa que transforma o projeto de "codigo de desenvolvimento" em "codigo pronto para rodar".

## Deploy: colocar a aplicacao no ar

Deploy e o processo de publicar a aplicacao em um ambiente acessivel.

No PostSpark, a configuracao observada aponta para Vercel. O arquivo `vercel.json` informa como a plataforma deve lidar com a funcao Node, os arquivos estaticos e os redirecionamentos da aplicacao.

Uma aplicacao local pode funcionar no computador do desenvolvedor, mas isso nao significa que ela esteja disponivel para usuarios. O deploy cria essa ponte entre o desenvolvimento e o uso real.

Deploy tambem envolve variaveis de ambiente, segredos, dominio, build correto e compatibilidade com a plataforma.

## Git: controlar a evolucao do projeto

Git e o sistema que registra a historia do projeto.

Em um projeto como o PostSpark, muitos arquivos podem mudar: componentes, backend, contratos, documentacao, configuracoes e scripts. Sem versionamento, seria dificil saber o que mudou, quando mudou e por que mudou.

Git permite trabalhar com branches, commits e revisoes. Isso e essencial para colaborar, investigar bugs e manter uma linha de evolucao compreensivel.

Para quem esta aprendendo, Git nao deve ser visto apenas como uma ferramenta para "subir codigo". Ele e uma forma de organizar o raciocinio historico do projeto.

## Docker: padronizar ambiente

Docker entra como uma ferramenta para reduzir diferencas entre ambientes.

Um projeto pode depender de uma versao especifica de Node, de um gerenciador de pacotes, de variaveis de ambiente e de comandos de inicializacao. Se cada pessoa configura isso manualmente, surgem diferencas. Uma maquina pode funcionar e outra nao.

Docker permite descrever um ambiente mais previsivel. Ele nao substitui Vercel, Supabase, Stripe ou Git. Ele tambem nao elimina a necessidade de entender a aplicacao. Mas ajuda a tornar o processo de execucao mais padronizado.

No caso do PostSpark, Docker seria especialmente util para onboarding e reproducibilidade local. Ele ajudaria uma nova pessoa a rodar o projeto com menos dependencias instaladas diretamente na propria maquina.

## Como tudo se conecta

O PostSpark funciona porque suas partes cooperam:

- o frontend conduz a experiencia;
- o backend protege regras e integra servicos;
- o Supabase autentica e guarda dados;
- a Stripe informa eventos de pagamento;
- os provedores de IA geram ou analisam conteudo;
- o build prepara o projeto;
- a Vercel publica a aplicacao;
- o Git registra a evolucao;
- Docker pode padronizar o ambiente de execucao.

Nenhuma dessas partes, isoladamente, representa o produto inteiro. O produto nasce da composicao entre elas.

Essa e uma das principais licoes para quem esta comecando: programar projetos reais nao e apenas escrever funcoes. E entender responsabilidades, fronteiras, dados, fluxos e dependencias.

## Perguntas para fixar

1. O que acontece no navegador e o que acontece no servidor?
2. Por que pagamentos e saldo precisam ser controlados pelo backend?
3. Qual informacao precisa ser salva no banco e qual pode ficar apenas na memoria da tela?
4. Por que o frontend nao deve guardar segredos de API?
5. O que muda entre rodar localmente, fazer build e publicar em producao?
6. Como Docker ajuda sem substituir deploy?
7. Quando algo quebra, qual caminho os dados percorrem?

Responder essas perguntas com base no PostSpark e uma boa forma de transformar conceitos soltos em entendimento de arquitetura.
