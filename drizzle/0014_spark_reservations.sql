BEGIN;

-- Fase C — Billing transacional: reserve-on-start / commit-on-approval /
-- refund-on-fail. Substitui o débito imediato não-idempotente de
-- post.generate (debit_sparks) por um modelo de reserva que:
--   * bloqueia saldo no início da geração (reserve_sparks);
--   * debita de fato só na aprovação final (commit_spark_reservation);
--   * libera sem custo em qualquer falha terminal (refund_spark_reservation).
-- A reserva apenas BLOQUEIA — o débito real em profiles.sparks acontece no
-- commit. Assim o refund é trivial (muda status) e nunca "devolve" saldo.
-- Referência: PLANO_CONCLUSAO_BLUEPIRNT.md §5 e DOCUMENTO_MESTRE §72.

-- ─── Tabela spark_reservations ─────────────────────────────────────────────

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

-- Unicidade: um usuário não pode ter duas reservas com a mesma chave de
-- idempotência. Previne double-charge no duplo-click do botão Gerar.
CREATE UNIQUE INDEX IF NOT EXISTS spark_reservations_user_idem_idx
  ON postspark.spark_reservations (user_uuid, idempotency_key);

CREATE INDEX IF NOT EXISTS spark_reservations_user_status_idx
  ON postspark.spark_reservations (user_uuid, status);

CREATE INDEX IF NOT EXISTS spark_reservations_run_idx
  ON postspark.spark_reservations (generation_run_id);

COMMENT ON TABLE postspark.spark_reservations IS
'Transactional spark ledger: reserve-on-start, commit-on-approval, refund-on-fail.';

-- ─── RPC reserve_sparks ────────────────────────────────────────────────────
-- Valida saldo disponível (descontando reservas 'reserved' ativas), cria ou
-- reutiliza uma reserva idempotente. Retorna o uuid da reserva, ou NULL em
-- saldo insuficiente / perfil inexistente.

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
  -- Idempotência: reutiliza reserva 'reserved' existente com a mesma chave.
  SELECT id INTO existing_id FROM postspark.spark_reservations
    WHERE user_uuid = p_user_id AND idempotency_key = p_idempotency_key
      AND status = 'reserved';
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  -- Saldo disponível = sparks do perfil − soma das reservas 'reserved'.
  SELECT p.sparks - COALESCE((
    SELECT SUM(amount) FROM postspark.spark_reservations
    WHERE user_uuid = p_user_id AND status = 'reserved'
  ), 0)
  INTO available
  FROM postspark.profiles p
  WHERE p.id = p_user_id;

  IF available IS NULL THEN
    RETURN NULL; -- perfil não encontrado
  END IF;
  IF available < p_amount THEN
    RETURN NULL; -- saldo insuficiente (considerando reservas ativas)
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

-- ─── RPC commit_spark_reservation ──────────────────────────────────────────
-- Debita de profiles.sparks de forma definitiva, uma única vez. Idempotente:
-- commit repetido retorna true sem debitar duas vezes. Víncula o run ao
-- confirmar. Falha (false) se a reserva foi reembolsada ou não existe.

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
    RETURN true; -- idempotente: já commitada
  END IF;
  IF res.status = 'refunded' THEN
    RETURN false; -- não pode commitar reserva reembolsada
  END IF;

  -- Débito real no perfil.
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

-- ─── RPC refund_spark_reservation ──────────────────────────────────────────
-- Libera reserva em falha. Idempotente: refund repetido retorna true. Não
-- decrementa sparks (a reserva só bloqueava). Falha (false) se já commitada.

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
    RETURN true; -- idempotente
  END IF;
  IF res_status = 'committed' THEN
    RETURN false; -- já commitada, não reembolsa
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

COMMIT;
