# 08 - Docker

Docker ajuda a padronizar o ambiente onde o projeto roda.

Ele nao substitui frontend, backend, banco, Git ou deploy. Ele cria uma forma mais previsivel de executar essas partes.

## O problema que Docker resolve

Sem Docker, cada pessoa pode ter:

- versao diferente de Node;
- gerenciador de pacotes diferente;
- variaveis de ambiente faltando;
- dependencias instaladas de outro jeito;
- sistema operacional com detalhes diferentes.

Isso gera o classico problema: "funciona na minha maquina".

## A ideia de container

Um container e um ambiente isolado com tudo que a aplicacao precisa para rodar.

Em vez de depender da maquina inteira do desenvolvedor, voce descreve o ambiente em arquivos.

## Dockerfile

Um `Dockerfile` descreve como montar a imagem da aplicacao.

Ele normalmente define:

- imagem base;
- versao do runtime;
- instalacao de dependencias;
- comandos de build;
- comando para iniciar a aplicacao.

## Docker Compose

`docker-compose.yml` descreve varios servicos rodando juntos.

Exemplos possiveis:

- aplicacao Node;
- banco local;
- cache;
- servico auxiliar.

No PostSpark atual, Supabase e Stripe sao servicos externos. Docker poderia ajudar primeiro a padronizar o ambiente Node e o fluxo de desenvolvimento.

## Como Docker ajudaria o PostSpark

Docker pode ajudar a:

- fixar a versao de Node;
- padronizar `pnpm`;
- facilitar onboarding;
- documentar como subir o projeto;
- reduzir diferencas entre Windows, macOS e Linux;
- criar uma base mais clara para CI/CD.

## O que Docker nao resolve sozinho

Docker nao elimina a necessidade de:

- configurar variaveis de ambiente;
- ter chaves validas de Supabase, Stripe e IA;
- entender build e deploy;
- modelar corretamente banco e autenticacao;
- tratar erros de integracoes externas.

## Docker e Vercel

Vercel e plataforma de deploy.

Docker e ferramenta de empacotamento de ambiente.

Eles podem coexistir, mas nao sao a mesma coisa.

No PostSpark, Vercel continua sendo a configuracao de deploy observada. Docker entraria principalmente para melhorar desenvolvimento local, testes e reproducibilidade.

## Regra mental

Docker nao e a aplicacao. Docker e a caixa padronizada onde a aplicacao pode rodar.
