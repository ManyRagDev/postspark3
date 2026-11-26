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
6. `generation.start` valida a admissão e registra o pedido durável e a reserva de Sparks.
7. A API devolve o identificador do pedido. O executor processa o pedido e registra seu progresso.
8. O Studio acompanha o progresso e busca as propostas entregues.

## O que entra

Pode entrar:

- texto;
- URL;
- imagem;
- modo de criacao;
- tipo de post;
- identificador e permissões do usuário, conferidos pelo servidor na sessão.

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
- `server/routers.ts` agrega os routers tRPC. `server/routers/generation.ts` define a entrada da geração.
- `server/db.ts` conversa com Supabase/Postgres.

## Regra mental

Debug bom e seguir o dado: quem produziu, quem transformou, quem consumiu e onde ele foi salvo.
