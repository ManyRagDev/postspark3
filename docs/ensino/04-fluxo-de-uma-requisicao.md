# 04 - Fluxo de uma requisicao

Uma requisicao e uma mensagem enviada de um lugar para outro.

No PostSpark, uma requisicao comum sai do navegador, passa pelo backend e pode chegar em banco ou servicos externos.

## Fluxo simplificado

Exemplo: gerar uma variacao de post.

1. O usuario digita um insumo no frontend.
2. O componente React dispara uma acao.
3. O cliente tRPC envia uma requisicao HTTP para o backend.
4. O Express recebe a requisicao.
5. O contexto tRPC tenta identificar o usuario.
6. O router executa a regra de negocio.
7. O backend pode consultar Supabase, Stripe ou IA.
8. O backend monta uma resposta.
9. O frontend recebe a resposta.
10. A UI atualiza a tela.

## O que entra

Pode entrar:

- texto;
- URL;
- imagem;
- modo de criacao;
- tipo de post;
- identificador do usuario;
- dados do plano e saldo.

## O que sai

Pode sair:

- variacoes de post;
- brief de execucao;
- mensagens de erro;
- dados salvos;
- status de billing;
- assets de background.

## Por que isso importa

Quando algo quebra, voce precisa saber onde investigar.

Se o botao nao responde, pode ser frontend.

Se a tela chama a API mas recebe erro 401, pode ser autenticacao.

Se a API responde erro ao salvar, pode ser banco, contrato de dados ou permissao.

Se a geracao demora ou falha, pode ser integracao externa.

## Caminho tecnico no PostSpark

Pontos importantes:

- `client/src/lib/` contem clientes e utilitarios para conversar com backend e Supabase.
- `server/_core/index.ts` registra rotas e middlewares.
- `server/_core/context.ts` monta contexto de requisicao.
- `server/routers.ts` concentra grande parte das regras tRPC.
- `server/db.ts` conversa com Supabase/Postgres.

## Regra mental

Debug bom e seguir o dado: quem produziu, quem transformou, quem consumiu e onde ele foi salvo.
