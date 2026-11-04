-- Allow newly supported models ('gemini', 'claude', 'deepseek', 'gpt') in generation admission.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- This is an incremental change to the existing server-only admission RPCs.
DO $$ BEGIN
  IF to_regprocedure('postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint)') IS NULL
    OR to_regprocedure('postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'Apply generation admission migrations 0044 and 0045 before 0053'; END IF;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_admit_configured(
  p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,
  p_experimental boolean,p_deadline_at timestamptz,p_generation_config jsonb,
  p_scope text DEFAULT NULL,p_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admitted jsonb; req postspark.generation_v5_requests%ROWTYPE;
BEGIN
  IF p_generation_config IS NULL OR jsonb_typeof(p_generation_config) IS DISTINCT FROM 'object'
    OR p_generation_config->>'version' IS DISTINCT FROM '1'
    OR coalesce(p_generation_config->>'choice','') NOT IN ('gemini','claude','deepseek','gpt')
    OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
    OR coalesce(p_generation_config->>'model','')=''
    OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'Invalid generation configuration' USING ERRCODE='22023'; END IF;
  IF p_scope IS NOT NULL THEN
    admitted:=postspark.generation_admit_local(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at,p_scope,p_revision);
  ELSIF p_revision IS NOT NULL THEN
    admitted:=postspark.generation_admit_external(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at,p_revision);
  ELSE
    admitted:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
  END IF;
  IF (admitted->>'created')::boolean THEN
    UPDATE postspark.generation_v5_requests SET generation_config=p_generation_config
      WHERE id=p_id AND owner_id=p_owner RETURNING * INTO req;
    UPDATE postspark.generation_runs SET requested_model=p_generation_config->>'model'
      WHERE id=p_id AND user_uuid=p_owner;
    RETURN to_jsonb(req)||jsonb_build_object('created',true);
  END IF;
  RETURN admitted;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_admit_staged_local(
 p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,
 p_experimental boolean,p_deadline_at timestamptz,p_scope text,p_revision bigint,
 p_generation_config jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE; admitted jsonb;
BEGIN
 IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid executor scope'; END IF;
 IF p_generation_config IS NOT NULL AND (jsonb_typeof(p_generation_config) IS DISTINCT FROM 'object'
  OR p_generation_config->>'version' IS DISTINCT FROM '1'
  OR coalesce(p_generation_config->>'choice','') NOT IN ('gemini','claude','deepseek','gpt')
  OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
  OR coalesce(p_generation_config->>'model','')='' OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Invalid generation configuration' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE owner_id=p_owner AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF req.execution_mode<>'local-demand' OR req.executor_scope IS DISTINCT FROM p_scope THEN RAISE EXCEPTION 'generation_executor_scope_mismatch'; END IF;
  IF req.input_hash<>p_input_hash THEN RAISE EXCEPTION 'Idempotency key reused with different input' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(req)||jsonb_build_object('created',false);
 END IF;
 PERFORM 1 FROM postspark.catalog_revisions WHERE revision=p_revision FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'catalog_revision_invalid'; END IF;
 admitted:=postspark.generation_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
 UPDATE postspark.generation_v5_requests SET execution_mode='local-demand',executor_scope=p_scope,catalog_revision=p_revision,generation_config=p_generation_config
  WHERE id=p_id AND owner_id=p_owner RETURNING * INTO req;
 IF p_generation_config IS NOT NULL THEN
  UPDATE postspark.generation_runs SET requested_model=p_generation_config->>'model'
   WHERE id=p_id AND user_uuid=p_owner;
 END IF;
 RETURN to_jsonb(req)||jsonb_build_object('created',true);
END $$;

REVOKE ALL ON FUNCTION
 postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint),
 postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint),
 postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb)
 TO service_role;

COMMIT;
