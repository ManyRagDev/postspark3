# 01 - Visao geral

O PostSpark 3 e uma aplicacao full stack para criar, editar e salvar posts para redes sociais com apoio de IA.

Em vez de olhar para ele como "um monte de arquivos", pense no projeto como uma cadeia de responsabilidades.

## A jornada do usuario

De forma simplificada:

1. O usuario abre a aplicacao no navegador.
2. Ele faz login.
3. Ele informa um texto, uma URL ou uma imagem.
4. O frontend envia essa informacao para o backend.
5. O backend valida quem e o usuario.
6. O backend pode cobrar Sparks, consultar IA, extrair identidade visual e salvar dados.
7. O frontend recebe as variacoes geradas.
8. O usuario escolhe ou edita o resultado no Workbench.
9. O resultado pode ser salvo no banco.

## As camadas principais

### Frontend

E a parte que aparece no navegador.

No PostSpark 3, fica principalmente em:

- `client/src/main.tsx`
- `client/src/App.tsx`
- `client/src/pages/`
- `client/src/components/`

Tecnologias principais:

- React;
- Vite;
- Tailwind;
- React Query;
- Zustand;
- Wouter.

### Backend

E a parte que roda no servidor.

No PostSpark 3, fica principalmente em:

- `server/_core/index.ts`
- `server/routers.ts`
- `server/db.ts`
- `server/billing.ts`

Tecnologias principais:

- Node.js;
- Express;
- tRPC;
- Supabase client;
- Stripe SDK.

### Banco e autenticacao

O PostSpark usa Supabase para:

- autenticar usuarios;
- guardar dados em Postgres;
- permitir que o backend consulte e salve informacoes.

### Integracoes externas

O backend conversa com servicos que nao fazem parte do codigo do PostSpark:

- provedores de IA;
- geracao de imagem;
- servico de screenshot;
- Stripe;
- Supabase.

### Deploy

Deploy e o processo de colocar a aplicacao no ar.

Neste repo, o deploy esta configurado para Vercel por `vercel.json`.

## Uma frase para memorizar

Frontend mostra e coleta. Backend valida, processa e integra. Banco guarda. Deploy coloca no ar.
