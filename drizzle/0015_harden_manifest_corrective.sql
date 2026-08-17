-- SPEC-004 — Migration corretiva idempotente (2026-08-12).
--
-- Decisão com base no estado remoto verificado (projeto
-- spbuwcwmxlycchuwhfir, histórico de migrations via Supabase):
--   * 0012_add_generation_events.sql NUNCA foi aplicada (erro de sintaxe:
--     parêntese final em `WHERE (jsonb_array_length(events) > 0));`) e não
--     consta no histórico remoto — permanece como artefato histórico.
--   * 0013/0014 também não constam no histórico remoto: generation_runs
--     não tem `events`/`events_version`, `spark_reservations` não existe e
--     as RPCs reserve/commit/refund_spark_reservation estão ausentes.
--   * 0005 (site_intelligence) e 0007 (content_fingerprints) não constam
--     do histórico remoto; as tabelas não existem no banco.
--
-- Esta migration consolidada é 100% idempotente (IF NOT EXISTS / OR
-- REPLACE / DROP ... IF EXISTS) e pode ser aplicada em qualquer ambiente
-- com ou sem as anteriores. Aplicação em produção requer autorização
-- explícita do dono (regra da SPEC-004).
BEGIN;

-- ─── generation_runs: contrato de eventos (v2) ──────────────────────────────
ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS events jsonb;

ALTER TABLE postspark.generation_runs
  ADD COLUMN IF NOT EXISTS events_version integer NOT NULL DEFAULT 2;

UPDATE postspark.generation_runs
SET events = '[]'::jsonb
WHERE events IS NULL OR jsonb_typeof(events) <> 'array';

ALTER TABLE postspark.generation_runs
  ALTER COLUMN events SET DEFAULT '[]'::jsonb,
  ALTER COLUMN events SET NOT NULL;

DROP INDEX IF EXISTS postspark.idx_generation_runs_shadow_events;
CREATE INDEX idx_generation_runs_shadow_events
  ON postspark.generation_runs
  USING GIN (events jsonb_path_ops)
  WHERE jsonb_array_length(events) > 0;

COMMENT ON COLUMN postspark.generation_runs.events IS
  'Versioned generation debug events (orquestrador canônico SPEC-003).';
COMMENT ON COLUMN postspark.generation_runs.events_version IS
  'Version of the generation debug event array contract (2 = orchestrator).';

-- ─── site_intelligence (corretiva de 0005, nunca aplicada) ──────────────────
CREATE TABLE IF NOT EXISTS postspark.site_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL,
  source_url text NOT NULL,
  normalized_url text NOT NULL,
  fingerprint varchar(64) NOT NULL,
  snapshot jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_intelligence_user_url_fingerprint_key
    UNIQUE (user_uuid, normalized_url, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_site_intelligence_user_url
  ON postspark.site_intelligence (user_uuid, normalized_url, "updatedAt" DESC);

ALTER TABLE postspark.site_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_intelligence_select_own ON postspark.site_intelligence;
CREATE POLICY site_intelligence_select_own
  ON postspark.site_intelligence FOR SELECT
  USING (user_uuid = auth.uid());

DROP POLICY IF EXISTS site_intelligence_insert_own ON postspark.site_intelligence;
CREATE POLICY site_intelligence_insert_own
  ON postspark.site_intelligence FOR INSERT
  WITH CHECK (user_uuid = auth.uid());

DROP POLICY IF EXISTS site_intelligence_update_own ON postspark.site_intelligence;
CREATE POLICY site_intelligence_update_own
  ON postspark.site_intelligence FOR UPDATE
  USING (user_uuid = auth.uid())
  WITH CHECK (user_uuid = auth.uid());

-- ─── content_fingerprints (corretiva de 0007, nunca aplicada) ────────────────
CREATE TABLE IF NOT EXISTS postspark.content_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid uuid NOT NULL,
  generation_run_id uuid,
  source_type varchar(32) NOT NULL,
  source_id text NOT NULL,
  text_hash varchar(64) NOT NULL,
  embedding jsonb NOT NULL,
  metadata jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_fingerprints_user_created
  ON postspark.content_fingerprints (user_uuid, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_content_fingerprints_generation
  ON postspark.content_fingerprints (generation_run_id);

ALTER TABLE postspark.content_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_fingerprints_select_own ON postspark.content_fingerprints;
CREATE POLICY content_fingerprints_select_own
  ON postspark.content_fingerprints FOR SELECT
  USING (user_uuid = auth.uid());

DROP POLICY IF EXISTS content_fingerprints_insert_own ON postspark.content_fingerprints;
CREATE POLICY content_fingerprints_insert_own
  ON postspark.content_fingerprints FOR INSERT
  WITH CHECK (user_uuid = auth.uid());

-- ─── spark_reservations (corretiva de 0014, nunca aplicada) ──────────────────
CREATE TABLE IF NOT EXISTS postspark.spark_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  user_uuid uuid NOT NULL REFERENCES postspark.profiles(id) ON DELETE CASCADE,
  generation_run_id text,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'committed', 'refunded')),
  description text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  refunded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS spark_reservations_user_idem_idx
  ON postspark.spark_reservations (user_uuid, idempotency_key);

CREATE INDEX IF NOT EXISTS spark_reservations_user_status_idx
  ON postspark.spark_reservations (user_uuid, status);

CREATE INDEX IF NOT EXISTS spark_reservations_run_idx
  ON postspark.spark_reservations (generation_run_id);

COMMENT ON TABLE postspark.spark_reservations IS
  'Transactional spark ledger: reserve-on-start, commit-on-approval, refund-on-fail.';

CREATE OR REPLACE FUNCTION postspark.reserve_sparks(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_description text
) RETURNS uuid AS $$
DECLARE
  existing_id uuid;
  new_id uuid;
  available integer;
BEGIN
  SELECT id INTO existing_id FROM postspark.spark_reservations
    WHERE user_uuid = p_user_id AND idempotency_key = p_idempotency_key
      AND status = 'reserved';
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  SELECT p.sparks - COALESCE((
    SELECT SUM(amount) FROM postspark.spark_reservations
    WHERE user_uuid = p_user_id AND status = 'reserved'
  ), 0)
  INTO available
  FROM postspark.profiles p
  WHERE p.id = p_user_id;

  IF available IS NULL THEN
    RETURN NULL;
  END IF;
  IF available < p_amount THEN
    RETURN NULL;
  END IF;

  INSERT INTO postspark.spark_reservations
    (user_uuid, amount, idempotency_key, description, status)
  VALUES (p_user_id, p_amount, p_idempotency_key, p_description, 'reserved')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION postspark.reserve_sparks IS
  'Idempotent spark reservation. Blocks balance; commit_spark_reservation debits.';

CREATE OR REPLACE FUNCTION postspark.commit_spark_reservation(
  p_reservation_id uuid,
  p_generation_run_id text
) RETURNS boolean AS $$
DECLARE
  res record;
BEGIN
  SELECT amount, status, user_uuid
    INTO res
  FROM postspark.spark_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF res.status = 'committed' THEN
    RETURN true;
  END IF;
  IF res.status = 'refunded' THEN
    RETURN false;
  END IF;

  UPDATE postspark.profiles
    SET sparks = sparks - res.amount
  WHERE id = res.user_uuid;

  UPDATE postspark.spark_reservations
    SET status = 'committed',
        generation_run_id = p_generation_run_id,
        committed_at = now(),
        updated_at = now()
  WHERE id = p_reservation_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION postspark.commit_spark_reservation IS
  'Finalizes a reservation: debits profiles.sparks once. Idempotent.';

CREATE OR REPLACE FUNCTION postspark.refund_spark_reservation(
  p_reservation_id uuid,
  p_error_detail text
) RETURNS boolean AS $$
DECLARE
  res_status text;
BEGIN
  SELECT status
    INTO res_status
  FROM postspark.spark_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF res_status = 'refunded' THEN
    RETURN true;
  END IF;
  IF res_status = 'committed' THEN
    RETURN false;
  END IF;

  UPDATE postspark.spark_reservations
    SET status = 'refunded',
        error_detail = p_error_detail,
        refunded_at = now(),
        updated_at = now()
  WHERE id = p_reservation_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION postspark.refund_spark_reservation IS
  'Releases a reserved spark block on failure. No profile debit reversal needed.';

-- ─── get_billing_profile (usada por _core/gdpr.ts) ───────────────────────────
CREATE OR REPLACE FUNCTION postspark.get_billing_profile(p_user_id uuid)
RETURNS record AS $$
  SELECT id, email, plan, sparks, sparks_refill_date, stripe_customer_id
  FROM postspark.profiles
  WHERE id = p_user_id;
$$ LANGUAGE sql STABLE;

-- ─── analytics (opcionais; degradação graciosa registrada) ───────────────────
CREATE TABLE IF NOT EXISTS postspark.analytics_pageviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path text NOT NULL,
  path_category text,
  referrer_domain text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS postspark.analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
