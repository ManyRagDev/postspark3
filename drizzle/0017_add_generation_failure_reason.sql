-- Etapa 1 §6.3 — taxonomia estruturada de falhas persistida por geração.
-- Idempotente: pode ser aplicada em qualquer ambiente, independentemente de
-- 0013/0015 (events) e 0014 (spark_reservations) terem sido ou não aplicadas.
BEGIN;

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS failure_reason text;

COMMENT ON COLUMN postspark.generation_runs.failure_reason IS
  'Normalized generation failure reason (shared GenerationFailureReason taxonomy).';

COMMIT;