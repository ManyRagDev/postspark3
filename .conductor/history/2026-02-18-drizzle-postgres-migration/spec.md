# Especificação Técnica: Migração Drizzle MySQL -> PostgreSQL

## Contexto
O projeto foi iniciado com um template configurado para MySQL, mas o backend oficial é Supabase (PostgreSQL).
Precisamos migrar toda a camada de persistência para usar o driver `postgres` e o dialeto PostgreSQL do Drizzle ORM.

## Mudanças Necessárias

### 1. Dependências (`package.json`)
*   **Remover**: `mysql2`, `drizzle-orm/mysql-core` (uso interno).
*   **Adicionar**: `postgres`, `@types/pg` (se necessário), ou usar o driver nativo suportado pelo Drizzle. Drizzle recomenda `postgres.js` ou `pg`. Vamos usar `postgres` (postgres.js) pela performance e simplicidade, ou `pg` se houver requisitos específicos.
    *   *Decisão*: Usar `postgres` (biblioteca `postgres`) por ser padrão comum em stacks modernas com Drizzle.

### 2. Configuração (`drizzle.config.ts`)
*   Alterar `dialect` de `mysql` para `postgresql`.
*   Adicionar propriedade `schema: "postspark"` em `dbCredentials` (ou na raiz, dependendo da versão do drizzle-kit, mas para Postgres + Supabase com schemas customizados, usamos `schema` na definição da tabela ou `searchPath` na conexão).
    *   *Correção*: O Drizzle Kit usa `schemaFilter` ou a definição no próprio arquivo de schema. Para o runtime, definimos o schema na conexão ou prefixamos as tabelas.
    *   *Estratégia Suapbese*: Usar `pgSchema("postspark")` no arquivo de schema para prefixar todas as tabelas.

### 3. Schema (`drizzle/schema.ts`)
*   Migrar de `drizzle-orm/mysql-core` para `drizzle-orm/pg-core`.
*   Converter tipos:
    *   `mysqlTable` -> `pgTable` (dentro de `pgSchema("postspark")`) or apenas `pgTable` se configurarmos o `search_path`.
    *   **Decisão Segura**: Usar `export const mySchema = pgSchema("postspark");` e definir tabelas como `mySchema.table(...)`.
    *   `int().autoincrement()` -> `serial()` ou `integer().generatedAlwaysAsIdentity()`. Supabase suporta ambos.
    *   `json` -> `jsonb` (melhor performance no PG).
    *   `timestamp` -> `timestamp` (sem `onUpdateNow` nativo do MySQL, usar triggers ou default).
    *   `mysqlEnum` -> `pgEnum` (precisa ser criado no schema).

### 4. Conexão (`server/db.ts`)
*   Trocar `drizzle(...)` de mysql proxy para postgres proxy.

## Plano de Rollback
*   Manter backup dos arquivos atuais.
