# Trilha didatica do PostSpark 3

Esta pasta explica conceitos de programacao e projetos usando o PostSpark 3 como exemplo real.

O objetivo nao e substituir o `DOCUMENTO_MESTRE.md`. Ele continua sendo a fonte principal sobre o estado tecnico do repositorio. Estes documentos sao uma camada didatica para quem esta aprendendo o que significam frontend, backend, stack, banco, deploy, Git, Docker e integracoes.

## Como estudar

Leia nesta ordem:

1. [`01-visao-geral.md`](./01-visao-geral.md)
2. [`02-glossario.md`](./02-glossario.md)
3. [`03-frontend-backend-api.md`](./03-frontend-backend-api.md)
4. [`04-fluxo-de-uma-requisicao.md`](./04-fluxo-de-uma-requisicao.md)
5. [`05-auth-supabase.md`](./05-auth-supabase.md)
6. [`06-dados-persistencia-e-billing.md`](./06-dados-persistencia-e-billing.md)
7. [`07-build-deploy-e-git.md`](./07-build-deploy-e-git.md)
8. [`08-docker.md`](./08-docker.md)
9. [`09-explicacao-didatica-dos-recursos.md`](./09-explicacao-didatica-dos-recursos.md)
10. [`diagramas.md`](./diagramas.md)

## O que o PostSpark 3 e hoje

No estado atual observado no codigo:

- O frontend usa React + Vite, dentro de `client/`.
- O backend usa Node.js, Express e tRPC, dentro de `server/`.
- A autenticacao e feita com Supabase Auth.
- A persistencia usa Supabase/Postgres, acessado pelo backend.
- Billing usa Stripe.
- O [Compose da VPS](../../ops/hostinger/compose.yml) declara a web e o executor externo.
- O build gera assets estaticos do frontend e empacota o backend em `api/index.js`.

O Studio registra a geração no PostgreSQL e acompanha a execução. Em produção há um worker externo. O [guia de operação local](../local-demand-operations.md) descreve o modo de desenvolvimento.

## Ideia central

Um projeto real nao e so "um site". Ele normalmente junta:

- interface visual;
- codigo que roda no servidor;
- banco de dados;
- login;
- pagamentos;
- servicos externos;
- ambiente local;
- processo de build;
- deploy;
- versionamento.

O PostSpark 3 e um bom exemplo porque possui varias dessas camadas no mesmo repositorio.
