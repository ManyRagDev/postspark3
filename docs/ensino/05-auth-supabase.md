# 05 - Autenticacao com Supabase

Autenticacao responde a pergunta: "quem e este usuario?"

No PostSpark 3, a autenticacao tem uma camada no frontend e outra no backend.

## Ideia geral

O usuario faz login pelo Supabase no navegador. Depois, o frontend sincroniza essa sessao com o backend, que grava um cookie httpOnly.

Esse cookie permite que o backend reconheca o usuario nas chamadas seguintes.

## Por que nao usar so o frontend

O frontend roda no navegador do usuario. Ele nao deve ser a unica fonte de confianca para regras importantes.

Operacoes como salvar dados, consumir Sparks ou chamar IA precisam passar pelo backend.

## Pecas envolvidas

Frontend:

- `client/src/lib/supabaseClient.ts`
- `client/src/lib/authBridge.ts`
- `client/src/_core/hooks/useAuth.ts`
- `client/src/components/LoginModal.tsx`

Backend:

- `server/_core/supabaseAuth.ts`
- `server/_core/sdk.ts`
- `server/_core/context.ts`
- `server/_core/cookies.ts`
- `server/_core/index.ts`

## Cookie httpOnly

Um cookie httpOnly nao pode ser lido diretamente pelo JavaScript do frontend.

Isso ajuda a proteger a sessao contra certos tipos de ataque, porque o backend consegue receber o cookie nas requisicoes, mas scripts da pagina nao conseguem simplesmente copiar seu conteudo.

## Fluxo simplificado

1. Usuario faz login com Supabase.
2. Frontend recebe a sessao Supabase.
3. Frontend chama `/api/auth/supabase-session`.
4. Backend valida os dados da sessao.
5. Backend cria ou atualiza cookie httpOnly.
6. Chamadas tRPC seguintes carregam esse cookie.
7. Backend monta `ctx.user`.
8. Procedimentos protegidos usam `ctx.user`.

## Logout

No logout, o frontend encerra a sessao Supabase e o backend limpa o cookie por `/api/auth/supabase-logout`.

## Regra mental

Login no frontend melhora a experiencia. Sessao validada no backend protege a regra de negocio.
