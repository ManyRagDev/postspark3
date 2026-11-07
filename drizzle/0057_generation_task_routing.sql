-- Immutable automatic task routing. Requires 0044/0045 admission and 0052/0053.
-- New automatic receipts pin provider capabilities; historical receipts stay intact.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF to_regprocedure('postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint)') IS NULL
    OR to_regprocedure('postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb)') IS NULL
    OR to_regprocedure('postspark.generation_preparation_expectation(uuid,uuid,text,jsonb)') IS NULL
    OR to_regprocedure('postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'Apply generation migrations 0044, 0045, 0052 and 0053 before 0057'; END IF;
END $$;

-- Pure validation runs before any reservation or mutation. Its v1 price values
-- are ceilings in USD/million tokens, not a replacement for provider usage cost.
CREATE OR REPLACE FUNCTION postspark.generation_task_routing_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE routing jsonb; stage text; route jsonb; expected jsonb; timeout_ms numeric;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF p_config->>'choice' IS DISTINCT FROM 'auto' THEN RETURN NOT (p_config ? 'taskRouting'); END IF;
  routing:=p_config->'taskRouting';
  IF p_config->'version' IS DISTINCT FROM '1'::jsonb
    OR p_config->'generationStrategyVersion' IS DISTINCT FROM '2'::jsonb
    OR p_config->>'model' IS DISTINCT FROM 'anthropic/claude-haiku-5.5'
    OR p_config->>'reasoningEffort' IS DISTINCT FROM 'none'
    OR p_config->>'structuredOutputMode' IS DISTINCT FROM 'native_schema'
    OR p_config ? 'temperature' OR p_config ? 'topP'
    OR jsonb_typeof(routing) IS DISTINCT FROM 'object'
    OR routing->'version' IS DISTINCT FROM '1'::jsonb
    OR routing->>'policy' IS DISTINCT FROM 'deepseek_haiku_v1'
    OR routing - ARRAY['version','policy','intent','copy','repair'] IS DISTINCT FROM '{}'::jsonb
  THEN RETURN false; END IF;
  FOREACH stage IN ARRAY ARRAY['intent','copy','repair'] LOOP
    route:=routing->stage;
    IF jsonb_typeof(route) IS DISTINCT FROM 'object'
      OR jsonb_typeof(route->'transportTimeoutMs') IS DISTINCT FROM 'number'
    THEN RETURN false; END IF;
    timeout_ms:=(route->>'transportTimeoutMs')::numeric;
    IF timeout_ms<1 OR timeout_ms>180000 OR timeout_ms<>trunc(timeout_ms) THEN RETURN false; END IF;
    expected:=CASE WHEN stage='copy' THEN
      '{"model":"anthropic/claude-haiku-5.5","providerEndpoint":"anthropic","maxPrice":{"prompt":0.101,"completion":0.505},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema"}'::jsonb
    ELSE
      '{"model":"deepseek/deepseek-v4.1-flash","providerEndpoint":"deepinfra/fp8","maxPrice":{"prompt":0.1414,"completion":0.4242},"reasoningEffort":"none","reasoningEnabled":false,"structuredOutputMode":"native_schema"}'::jsonb
    END;
    IF route - 'transportTimeoutMs' IS DISTINCT FROM expected THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
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
    OR coalesce(p_generation_config->>'choice','') NOT IN ('auto','gemini','claude','deepseek','gpt')
    OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
    OR coalesce(p_generation_config->>'model','')=''
    OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$'
    OR NOT postspark.generation_task_routing_valid(p_generation_config)
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
  OR coalesce(p_generation_config->>'choice','') NOT IN ('auto','gemini','claude','deepseek','gpt')
  OR coalesce(p_generation_config->>'generationStrategyVersion','') NOT IN ('1','2')
  OR coalesce(p_generation_config->>'model','')='' OR coalesce(p_generation_config->>'configurationHash','') !~ '^[a-f0-9]{64}$'
  OR NOT postspark.generation_task_routing_valid(p_generation_config))
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

CREATE OR REPLACE FUNCTION postspark.generation_preparation_expectation(p_id uuid,p_lease uuid,p_key text,p_expectation jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.generation_v5_requests%ROWTYPE; op postspark.generation_v5_operations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM postspark.generation_v5_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'running' OR r.lease_token IS DISTINCT FROM p_lease OR r.lease_until<=now() OR r.deadline_at<=now()
    THEN RAISE EXCEPTION 'Generation lease lost' USING ERRCODE='PT409'; END IF;
  IF p_key NOT IN ('prepare:intent','prepare:selection') OR r.prepared IS NOT NULL
    OR r.generation_config->>'generationStrategyVersion' IS DISTINCT FROM '2'
    OR p_expectation->>'kind' IS DISTINCT FROM 'generation_preparation_v1'
    OR p_expectation->>'configurationHash' IS DISTINCT FROM r.generation_config->>'configurationHash'
    OR p_expectation->>'model' IS DISTINCT FROM (CASE
      WHEN r.generation_config->>'choice'='auto' THEN r.generation_config->'taskRouting'->
        (CASE WHEN p_key='prepare:intent' THEN 'intent' ELSE 'copy' END)->>'model'
      ELSE r.generation_config->>'model' END)
    OR coalesce(p_expectation->>'messagesHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(p_expectation->>'responseFormatHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(p_expectation->>'requestHash','') !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'Preparation expectation mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key FOR UPDATE;
  IF NOT FOUND OR op.state<>'started' OR (op.expectation IS NOT NULL AND op.expectation IS DISTINCT FROM p_expectation)
    THEN RAISE EXCEPTION 'Immutable preparation expectation' USING ERRCODE='PT409'; END IF;
  UPDATE postspark.generation_v5_operations SET expectation=p_expectation WHERE request_id=p_id AND operation_key=p_key;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_recover_preparation(p_id uuid,p_owner uuid,p_key text,p_expectation jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.generation_v5_requests%ROWTYPE; op postspark.generation_v5_operations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM postspark.generation_v5_requests WHERE id=p_id AND owner_id=p_owner FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('awaiting_reconciliation','queued') OR r.deadline_at<=now() OR r.prepared IS NOT NULL
    OR r.generation_config->>'generationStrategyVersion' IS DISTINCT FROM '2'
    THEN RAISE EXCEPTION 'Request not awaiting preparation reconciliation' USING ERRCODE='PT409'; END IF;
  IF p_key NOT IN ('prepare:intent','prepare:selection')
    OR p_expectation->>'kind' IS DISTINCT FROM 'generation_preparation_v1'
    OR p_expectation->>'configurationHash' IS DISTINCT FROM r.generation_config->>'configurationHash'
    OR p_expectation->>'model' IS DISTINCT FROM (CASE
      WHEN r.generation_config->>'choice'='auto' THEN r.generation_config->'taskRouting'->
        (CASE WHEN p_key='prepare:intent' THEN 'intent' ELSE 'copy' END)->>'model'
      ELSE r.generation_config->>'model' END)
    OR p_result->'__preparationReceipt'->>'version' IS DISTINCT FROM '1'
    OR p_result->'__preparationReceipt'->'expectation' IS DISTINCT FROM p_expectation
    OR p_result->>'model' IS DISTINCT FROM p_expectation->>'model'
    OR coalesce(p_result->>'id','')='' OR jsonb_typeof(p_result->'choices') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Recovered preparation identity mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key FOR UPDATE;
  IF NOT FOUND OR op.expectation IS DISTINCT FROM p_expectation OR op.state NOT IN ('started','uncertain','completed')
    THEN RAISE EXCEPTION 'Recovered preparation operation mismatch' USING ERRCODE='PT409'; END IF;
  IF op.state='completed' THEN
    IF op.result IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'Immutable result' USING ERRCODE='PT409'; END IF;
    RETURN to_jsonb(r);
  END IF;
  UPDATE postspark.generation_v5_operations SET state='completed',result=p_result,updated_at=now() WHERE request_id=p_id AND operation_key=p_key;
  IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_operations WHERE request_id=p_id AND state<>'completed' AND operation_key IN ('prepare:intent','prepare:selection')) THEN
    UPDATE postspark.generation_v5_requests SET status='queued',error_reason=NULL,
      proposals=(SELECT jsonb_agg(CASE WHEN p->>'status'='awaiting_reconciliation' AND p->'failure'->>'code'='preparation_reconciliation_required'
        THEN (p-'failure'-'errorReason'-'completedAt')||jsonb_build_object('status','planned','diagnostics','[]'::jsonb) ELSE p END ORDER BY ord)
        FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),updated_at=now() WHERE id=p_id RETURNING * INTO r;
    UPDATE postspark.generation_runs SET status='queued',error_message=NULL,completed_at=NULL WHERE id=p_id AND user_uuid=p_owner;
  END IF;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_task_routing_available() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT pg_catalog.to_regprocedure('postspark.generation_task_routing_valid(jsonb)') IS NOT NULL
    AND position('generation_task_routing_valid' IN pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint)'))) > 0
    AND position('generation_task_routing_valid' IN pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb)'))) > 0
    AND position('taskRouting' IN pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'postspark.generation_preparation_expectation(uuid,uuid,text,jsonb)'))) > 0
    AND position('taskRouting' IN pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb)'))) > 0
$$;

REVOKE ALL ON FUNCTION
  postspark.generation_task_routing_valid(jsonb), postspark.generation_task_routing_available(),
  postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint),
  postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb),
  postspark.generation_preparation_expectation(uuid,uuid,text,jsonb),
  postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  postspark.generation_task_routing_valid(jsonb), postspark.generation_task_routing_available(),
  postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint),
  postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb),
  postspark.generation_preparation_expectation(uuid,uuid,text,jsonb),
  postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
