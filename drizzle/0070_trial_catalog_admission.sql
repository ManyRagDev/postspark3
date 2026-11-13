-- Explicit admin trial against an immutable staged release. Never activates it.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION postspark.generation_admit_trial_external(
 p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,
 p_experimental boolean,p_deadline_at timestamptz,p_revision bigint,p_generation_config jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE; replay boolean; admitted jsonb;
BEGIN
 -- app_metadata is operator-owned; user_metadata must never grant this access.
 IF p_experimental IS DISTINCT FROM true OR NOT EXISTS (
   SELECT 1 FROM auth.users WHERE id=p_owner AND raw_app_meta_data->>'role'='admin'
 ) OR NOT postspark.has_app_access(p_owner)
 THEN RAISE EXCEPTION 'trial_catalog_forbidden' USING ERRCODE='42501'; END IF;
 IF p_generation_config IS NULL OR jsonb_typeof(p_generation_config) IS DISTINCT FROM 'object'
   OR p_generation_config->>'version' IS DISTINCT FROM '1'
   OR coalesce(p_generation_config->>'choice','') NOT IN ('auto','gemini','claude','deepseek','gpt')
   OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
   OR coalesce(p_generation_config->>'model','')=''
   OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$'
   OR NOT postspark.generation_task_routing_valid(p_generation_config)
 THEN RAISE EXCEPTION 'Invalid generation configuration' USING ERRCODE='22023'; END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,0));
 SELECT * INTO req FROM postspark.generation_v5_requests
   WHERE owner_id=p_owner AND idempotency_key=p_idempotency_key FOR UPDATE;
 replay:=FOUND;
 IF replay AND (req.execution_mode IS DISTINCT FROM 'external' OR req.executor_scope IS NOT NULL
   OR req.input_hash IS DISTINCT FROM p_input_hash OR req.input IS DISTINCT FROM p_input
   OR req.experimental IS DISTINCT FROM true OR req.catalog_revision IS DISTINCT FROM p_revision
   OR req.generation_config IS DISTINCT FROM p_generation_config)
 THEN RAISE EXCEPTION 'trial_catalog_idempotency_conflict' USING ERRCODE='23505'; END IF;

 -- Fence concurrent activation; do not update active_revision or publication counters.
 PERFORM 1 FROM postspark.catalog_state WHERE id=true AND active_revision IS DISTINCT FROM p_revision FOR SHARE;
 IF NOT FOUND OR p_revision IS NULL THEN RAISE EXCEPTION 'trial_catalog_revision_invalid' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM postspark.catalog_revisions WHERE revision=p_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trial_catalog_revision_invalid' USING ERRCODE='22023'; END IF;

 -- Historical archived rows remain in the immutable release, but cannot make it
 -- eligible. Lock eligible canonical definitions until admission has committed.
 PERFORM c.id FROM postspark.design_components c
 JOIN postspark.catalog_revision_definitions d ON d.component_id=c.id
 WHERE d.revision=p_revision AND d.payload->'design_components'->>'status' IN ('draft','approved')
 ORDER BY c.id FOR SHARE OF c;
 IF NOT EXISTS (SELECT 1 FROM postspark.catalog_revision_definitions d WHERE d.revision=p_revision
   AND d.payload->'design_components'->>'status' IN ('draft','approved'))
 OR EXISTS (
   SELECT 1 FROM postspark.catalog_revision_definitions d
   LEFT JOIN postspark.design_components c ON c.id=d.component_id
   WHERE d.revision=p_revision AND d.payload->'design_components'->>'status' IN ('draft','approved')
   AND (c.id IS NULL OR c.status NOT IN ('draft','approved')
     OR c.definition_hash IS DISTINCT FROM d.definition_hash
     OR c.definition IS DISTINCT FROM d.payload->'definition')
 ) THEN RAISE EXCEPTION 'trial_catalog_definition_unavailable' USING ERRCODE='22023'; END IF;

 IF replay THEN RETURN to_jsonb(req)||jsonb_build_object('created',false); END IF;
 -- Existing billing, concurrency and deadline rules stay authoritative. The
 -- reservation, run, request and pinned trial configuration commit atomically.
 admitted:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
 UPDATE postspark.generation_v5_requests SET execution_mode='external',executor_scope=NULL,
   catalog_revision=p_revision,generation_config=p_generation_config
   WHERE id=p_id AND owner_id=p_owner RETURNING * INTO req;
 UPDATE postspark.generation_runs SET requested_model=p_generation_config->>'model'
   WHERE id=p_id AND user_uuid=p_owner;
 RETURN to_jsonb(req)||jsonb_build_object('created',true);
END $$;

REVOKE ALL ON FUNCTION postspark.generation_admit_trial_external(uuid,uuid,text,text,jsonb,boolean,timestamptz,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit_trial_external(uuid,uuid,text,text,jsonb,boolean,timestamptz,bigint,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
