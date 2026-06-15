# 02 - Glossario

Este glossario explica termos comuns usando o PostSpark 3 como exemplo.

## Aplicacao

Um sistema que resolve um problema para alguem.

O PostSpark 3 e uma aplicacao para gerar e editar posts com IA.

## Linguagem

E o idioma usado para escrever codigo.

Neste projeto, a linguagem principal e TypeScript.

## Runtime

E o ambiente que executa o codigo.

Exemplo:

- o navegador executa JavaScript do frontend;
- Node.js executa JavaScript/TypeScript compilado no backend.

## Biblioteca

E um conjunto de codigo pronto que voce chama quando precisa.

Exemplos no PostSpark:

- `stripe`, para conversar com a API da Stripe;
- `@supabase/supabase-js`, para conversar com Supabase;
- `zod`, para validar dados;
- `lucide-react`, para icones.

## Framework

E uma estrutura maior que define como voce organiza parte do projeto.

Exemplos:

- React organiza a construcao de interfaces;
- Express organiza rotas e middlewares HTTP;
- tRPC organiza chamadas tipadas entre frontend e backend.

Na pratica, a fronteira entre biblioteca e framework nem sempre e perfeita. Uma boa regra: biblioteca voce chama; framework costuma definir onde seu codigo entra.

## Stack

E o conjunto de tecnologias usadas pelo projeto.

A stack atual do PostSpark 3 inclui:

- TypeScript;
- React;
- Vite;
- Express;
- tRPC;
- Supabase;
- Stripe;
- Vercel.

## Frontend

Parte que roda no navegador e interage diretamente com o usuario.

No PostSpark: telas, botoes, editor, formulario inicial, paginas de billing e posts salvos.

## Backend

Parte que roda no servidor e protege regras importantes.

No PostSpark: geracao de posts, billing, acesso ao banco, cookies, chamadas para IA.

## API

E uma porta de comunicacao entre sistemas.

No PostSpark, o frontend fala com o backend principalmente por tRPC em `/api/trpc`.

## Banco de dados

E onde informacoes duraveis ficam salvas.

No PostSpark, o banco e Postgres via Supabase.

## Autenticacao

Processo de descobrir quem e o usuario.

No PostSpark, o login acontece com Supabase Auth.

## Autorizacao

Processo de decidir o que o usuario pode fazer.

Exemplo: apenas um usuario autenticado pode salvar posts ou consumir Sparks.

## Build

Transforma o codigo de desenvolvimento em arquivos prontos para producao.

No PostSpark:

- Vite gera o frontend estatico;
- esbuild empacota o backend em `api/index.js`.

## Deploy

Coloca o resultado do build em um ambiente acessivel por usuarios.

No PostSpark, isso esta configurado para Vercel.

## Git

Ferramenta para versionar historico de alteracoes.

Serve para saber o que mudou, quando mudou, por que mudou e para permitir trabalho em equipe.

## Docker

Ferramenta para empacotar ambiente de execucao.

Ajuda a reduzir problemas de versao de Node, dependencias e configuracao local.
