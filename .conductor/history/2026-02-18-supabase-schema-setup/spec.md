# Especificação Técnica: Setup do Schema PostSpark

## Contexto
O projeto `PostSpark 3` deve utilizar o Supabase (projeto "Brincar / PostSpark") como backend de banco de dados.
É mandatório que todos os dados residam no schema dedicado `postspark`, isolado do schema legado `brincareducando` presente no mesmo projeto.

## Estado Atual do Banco
*   Projeto Supabase: `Brincar / PostSpark` (ref: `spbuwcwmxlycchuwhfir`)
*   Schemas existentes: `public`, `brincareducando`, `postspark`.

## Requisitos
1.  **Verificação**: Confirmar existência do schema `postspark` (Já realizado).
2.  **Configuração**: Garantir que o Drizzle ORM esteja configurado para usar `postspark` como schema padrão ou prefixo.
3.  **Integridade**: Não alterar nada em `brincareducando`.

## Mudanças Necessárias
*   Nenhuma mudança de infra é necessária pois o schema já existe.
*   Documentar em `docs/tech-stack.md` ou `docs/project-status.md` que o schema oficial é `postspark`.
