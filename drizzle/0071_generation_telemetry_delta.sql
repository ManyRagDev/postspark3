-- Incremental telemetry metadata: visual bias position and edit delta details.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE postspark.generation_telemetry
  ADD COLUMN IF NOT EXISTS original_position integer CHECK (original_position BETWEEN 0 AND 99),
  ADD COLUMN IF NOT EXISTS delta jsonb CHECK (delta IS NULL OR jsonb_typeof(delta) = 'object');

CREATE OR REPLACE FUNCTION postspark.generation_record_telemetry(p_owner uuid, p_events jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE written integer; remaining integer;
BEGIN
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20
     OR octet_length(p_events::text) > 8192 THEN RETURN 0; END IF;
  -- Serialize the per-owner rate bound without taking any billing/request locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text, 6211));
  SELECT greatest(0, 120 - count(*))::integer INTO remaining
    FROM postspark.generation_telemetry
    WHERE owner_id = p_owner AND created_at > now() - interval '1 minute';
  IF remaining = 0 THEN RETURN 0; END IF;

  INSERT INTO postspark.generation_telemetry(
    owner_id, event_id, request_id, exposure_id, proposal_id, revision, kind, position, original_position, changes, delta
  )
  SELECT
    p_owner,
    (e->>'eventId')::uuid,
    r.id,
    (e->>'exposureId')::uuid,
    e->>'proposalId',
    (e->>'revision')::integer,
    e->>'kind',
    (e->>'position')::integer,
    (e->>'originalPosition')::integer,
    (e->>'changes')::integer,
    CASE WHEN jsonb_typeof(e->'delta') = 'object' THEN e->'delta' ELSE NULL END
  FROM jsonb_array_elements(p_events) e
  JOIN postspark.generation_v5_requests r ON r.id = (e->>'requestId')::uuid AND r.owner_id = p_owner
  WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(r.proposals) p
    WHERE p->>'proposalId' = e->>'proposalId'
      AND (p->>'revision')::integer = (e->>'revision')::integer
      AND p->>'status' = 'ready'
  )
  LIMIT remaining
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS written = ROW_COUNT;
  -- Opportunistic bounded cleanup; worker safety sweep also calls this during idle periods.
  PERFORM postspark.generation_prune_telemetry();
  RETURN written;
END $$;

REVOKE ALL ON FUNCTION postspark.generation_record_telemetry(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_record_telemetry(uuid, jsonb) TO service_role;
COMMIT;
