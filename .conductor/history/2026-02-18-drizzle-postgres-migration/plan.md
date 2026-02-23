# Plano de Migração: Drizzle MySQL -> PostgreSQL

## Objetivo
Migrar a camada de dados para PostgreSQL (Supabase) usando o driver `postgres`.

## Passos

1.  [Deps] Remover `mysql2`. Instalar `postgres`.
2.  [Config] Atualizar `drizzle.config.ts` para `dialect: "postgresql"`.
3.  [Schema] Refatorar `drizzle/schema.ts`:
    *   Importar de `drizzle-orm/pg-core`.
    *   Definir `const postspark = pgSchema("postspark")`.
    *   Recriar tabelas `users` e `posts` usando os tipos do PG.
4.  [DB] Refatorar `server/db.ts` para usar o driver `postgres`.
5.  [Verify] Rodar `pnpm db:push` (ou equivalente) para validar a conexão e criação das tabelas no Supabase.

## Detalhes Técnicos
*   **Driver**: `postgres` (Postgres.js).
*   **Schema**: `postspark` (definido explicitamente no arquivo de schema).
