-- Identity compositions use the existing one-piece billing and delivery contract,
-- without depending on an active catalogue revision in local-demand mode.
BEGIN;
ALTER TABLE postspark.generation_v5_requests DROP CONSTRAINT IF EXISTS generation_executor_scope;
ALTER TABLE postspark.generation_v5_requests ADD CONSTRAINT generation_executor_scope CHECK (
 (execution_mode='external' AND executor_scope IS NULL) OR
 (execution_mode='local-demand' AND executor_scope IS NOT NULL AND length(executor_scope) BETWEEN 1 AND 160 AND
  (catalog_revision IS NOT NULL OR coalesce(input->'fixedDesign'->>'kind'='identity' AND jsonb_typeof(input->'pinnedDesign'->'identity')='object',false)))
);
CREATE FUNCTION postspark.generation_admit_identity(
 p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,
 p_experimental boolean,p_deadline_at timestamptz,p_generation_config jsonb,p_scope text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admitted jsonb; req postspark.generation_v5_requests%ROWTYPE;
BEGIN
 IF p_input->'fixedDesign'->>'kind' IS DISTINCT FROM 'identity' OR jsonb_typeof(p_input->'pinnedDesign'->'identity') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'Missing visual identity' USING ERRCODE='22023'; END IF;
 IF p_scope IS NOT NULL AND length(p_scope) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Invalid executor scope'; END IF;
 -- Existing admission validates configuration, ownership, idempotency and reserves Sparks.
 admitted:=postspark.generation_admit_configured(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at,p_generation_config,NULL,NULL);
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE id=(admitted->>'id')::uuid AND owner_id=p_owner FOR UPDATE;
 IF NOT (admitted->>'created')::boolean THEN
  IF p_scope IS NOT NULL AND (req.execution_mode<>'local-demand' OR req.executor_scope IS DISTINCT FROM p_scope) THEN RAISE EXCEPTION 'generation_executor_scope_mismatch'; END IF;
  RETURN admitted;
 END IF;
 IF p_scope IS NOT NULL THEN
  UPDATE postspark.generation_v5_requests SET execution_mode='local-demand',executor_scope=p_scope WHERE id=req.id RETURNING * INTO req;
 END IF;
 RETURN to_jsonb(req)||jsonb_build_object('created',true);
END $$;
CREATE FUNCTION postspark.generation_identity_available() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT postspark.generation_fixed_design_available() AND pg_catalog.to_regprocedure('postspark.brand_project_save_identity(uuid,jsonb)') IS NOT NULL
$$;
REVOKE ALL ON FUNCTION postspark.generation_admit_identity(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text),postspark.generation_identity_available() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit_identity(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text),postspark.generation_identity_available() TO service_role;
COMMIT;
