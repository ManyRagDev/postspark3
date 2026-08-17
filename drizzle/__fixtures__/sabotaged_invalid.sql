-- Fixture sabotada deliberadamente (SPEC-004): deve ser DETECTADA como SQL
-- inválido pelo gate do verificar (libpg_query). Nunca aplicar.
BEGIN;

CREATE TABLE postspark.sabotaged_fixture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
);

SELECT 1 FROM WHERE nonsense;

COMMIT;
