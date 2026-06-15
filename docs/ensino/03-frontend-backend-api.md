# 03 - Frontend, backend e API

Uma das confusoes mais comuns no inicio e entender onde cada coisa acontece.

## Frontend

Frontend e o codigo que roda perto do usuario, normalmente no navegador.

Ele cuida de:

- telas;
- botoes;
- formularios;
- navegacao;
- animacoes;
- estado visual;
- mensagens de erro;
- chamadas ao backend.

No PostSpark, exemplos de frontend:

- `client/src/App.tsx`: define rotas da aplicacao;
- `client/src/pages/Home.tsx`: coordena parte do fluxo principal;
- `client/src/components/views/TheVoid.tsx`: entrada criativa do usuario;
- `client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`: editor visual.

## Backend

Backend e o codigo que roda no servidor.

Ele cuida de:

- receber requisicoes;
- validar usuario;
- aplicar regra de negocio;
- acessar banco;
- chamar servicos externos;
- proteger segredos como chaves de API;
- devolver respostas para o frontend.

No PostSpark, exemplos de backend:

- `server/_core/index.ts`: cria o servidor Express;
- `server/routers.ts`: concentra procedimentos tRPC;
- `server/db.ts`: acessa Supabase/Postgres;
- `server/billing.ts`: integra com Stripe.

## API

API e o contrato de comunicacao.

O frontend nao deve acessar qualquer coisa diretamente. Ele precisa falar com uma entrada controlada.

No PostSpark, essa entrada e principalmente:

- `/api/trpc`

Tambem existem endpoints REST complementares, como:

- `/api/extract`
- `/api/brand-dna`
- `/api/auth/supabase-session`
- `/api/auth/supabase-logout`
- `/api/stripe/webhook`

## Exemplo simples

Quando o usuario pede para gerar um post:

1. O frontend coleta o texto, URL ou imagem.
2. O frontend chama uma mutacao tRPC.
3. O backend valida a sessao.
4. O backend calcula custo em Sparks.
5. O backend chama IA ou servicos auxiliares.
6. O backend devolve variacoes.
7. O frontend mostra as opcoes.

## Regra mental

Se envolve tela, clique e experiencia visual, provavelmente e frontend.

Se envolve segredo, banco, pagamento, permissao ou chamada cara para servico externo, provavelmente e backend.
