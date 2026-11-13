-- Disposable, bounded journey analysis. Independent of billing transactions.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE postspark.generation_telemetry (
  owner_id uuid NOT NULL,
  event_id uuid NOT NULL,
  request_id uuid NOT NULL REFERENCES postspark.generation_v5_requests(id) ON DELETE CASCADE,
  exposure_id uuid NOT NULL,
  proposal_id text NOT NULL CHECK (length(proposal_id) BETWEEN 1 AND 160),
  revision integer NOT NULL CHECK (revision >= 0),
  kind text NOT NULL CHECK (kind IN ('exposure','choice','edit','save','reopen','export_png','export_zip')),
  position integer CHECK (position BETWEEN 0 AND 99),
  changes integer CHECK (changes BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,event_id)
);
ALTER TABLE postspark.generation_telemetry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON postspark.generation_telemetry FROM PUBLIC,anon,authenticated;
CREATE INDEX generation_telemetry_retention ON postspark.generation_telemetry(created_at);
CREATE INDEX generation_telemetry_rate ON postspark.generation_telemetry(owner_id,created_at);
CREATE INDEX generation_telemetry_journey ON postspark.generation_telemetry(request_id,exposure_id);
CREATE UNIQUE INDEX generation_telemetry_exposure ON postspark.generation_telemetry(owner_id,exposure_id,request_id,proposal_id,revision) WHERE kind='exposure';

CREATE FUNCTION postspark.generation_prune_telemetry() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM postspark.generation_telemetry WHERE (owner_id,event_id) IN
    (SELECT owner_id,event_id FROM postspark.generation_telemetry WHERE created_at < now()-interval '30 days' ORDER BY created_at LIMIT 1000);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION postspark.generation_prune_telemetry() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_prune_telemetry() TO service_role;

CREATE FUNCTION postspark.generation_record_telemetry(p_owner uuid,p_events jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE written integer; remaining integer;
BEGIN
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 20
     OR octet_length(p_events::text) > 8192 THEN RETURN 0; END IF;
  -- Serialize the per-owner rate bound without taking any billing/request locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text, 6211));
  SELECT greatest(0,120-count(*))::integer INTO remaining FROM postspark.generation_telemetry WHERE owner_id=p_owner AND created_at > now()-interval '1 minute';
  IF remaining = 0 THEN RETURN 0; END IF;
  INSERT INTO postspark.generation_telemetry(owner_id,event_id,request_id,exposure_id,proposal_id,revision,kind,position,changes)
  SELECT p_owner,(e->>'eventId')::uuid,r.id,(e->>'exposureId')::uuid,e->>'proposalId',(e->>'revision')::integer,
    e->>'kind',(e->>'position')::integer,(e->>'changes')::integer
  FROM jsonb_array_elements(p_events) e
  JOIN postspark.generation_v5_requests r ON r.id=(e->>'requestId')::uuid AND r.owner_id=p_owner
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(r.proposals) p
    WHERE p->>'proposalId'=e->>'proposalId' AND (p->>'revision')::integer=(e->>'revision')::integer AND p->>'status'='ready')
  LIMIT remaining
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS written = ROW_COUNT;
  -- Opportunistic bounded cleanup; worker safety sweep also calls this during idle periods.
  PERFORM postspark.generation_prune_telemetry();
  RETURN written;
END $$;
REVOKE ALL ON FUNCTION postspark.generation_record_telemetry(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_record_telemetry(uuid,jsonb) TO service_role;
COMMIT;
