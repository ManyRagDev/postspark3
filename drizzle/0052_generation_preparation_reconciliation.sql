-- New admissions only: pinned planning budgets and recoverable preparation receipts.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE postspark.generation_runs ADD COLUMN IF NOT EXISTS diagnostic_summary jsonb;

CREATE OR REPLACE FUNCTION postspark.generation_admit_configured(
  p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,
  p_experimental boolean,p_deadline_at timestamptz,p_generation_config jsonb,
  p_scope text DEFAULT NULL,p_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admitted jsonb; req postspark.generation_v5_requests%ROWTYPE;
BEGIN
  IF p_generation_config IS NULL OR jsonb_typeof(p_generation_config) IS DISTINCT FROM 'object'
    OR p_generation_config->>'version' IS DISTINCT FROM '1'
    OR coalesce(p_generation_config->>'choice','') NOT IN ('gemini','gpt')
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
    OR p_expectation->>'model' IS DISTINCT FROM r.generation_config->>'model'
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
    OR p_expectation->>'model' IS DISTINCT FROM r.generation_config->>'model'
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

CREATE OR REPLACE FUNCTION postspark.generation_preparation_available() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT pg_catalog.to_regprocedure('postspark.generation_preparation_expectation(uuid,uuid,text,jsonb)') IS NOT NULL
    AND pg_catalog.to_regprocedure('postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb)') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('postspark.generation_runs') AND attname='diagnostic_summary' AND NOT attisdropped)
$$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_finish(
  p_id uuid,p_lease_token uuid,p_status text,p_error_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE; ready_count integer; final_status text; final_error text;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR req.status<>'running' OR req.lease_token IS DISTINCT FROM p_lease_token OR req.lease_until<=now()
    THEN RAISE EXCEPTION 'Generation lease lost' USING ERRCODE='PT409'; END IF;
  IF p_status='awaiting_reconciliation' AND req.deadline_at>now() THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(req.proposals) p WHERE p->>'status'='awaiting_reconciliation') THEN RAISE EXCEPTION 'No pending proposal'; END IF;
    UPDATE postspark.generation_v5_requests SET status='awaiting_reconciliation',error_reason=p_error_reason,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO req;
    UPDATE postspark.generation_runs SET status='awaiting_reconciliation',error_message=p_error_reason,completed_at=NULL WHERE id=p_id AND user_uuid=req.owner_id;
    RETURN to_jsonb(req);
  END IF;
  IF p_status NOT IN ('completed','partial','failed') THEN RAISE EXCEPTION 'Invalid terminal status' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO ready_count FROM jsonb_array_elements(req.proposals) p WHERE p->>'status'='ready';
  final_status:=CASE WHEN ready_count=3 THEN 'completed' WHEN ready_count>0 THEN 'partial' ELSE 'failed' END;
  final_error:=CASE WHEN final_status='completed' THEN NULL WHEN req.deadline_at<=now() THEN 'deadline_expired' WHEN final_status='failed' THEN coalesce(p_error_reason,'generation_failed') ELSE p_error_reason END;
  UPDATE postspark.generation_v5_requests SET status=final_status,error_reason=final_error,
    proposals=(SELECT coalesce(jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation')
      THEN p||jsonb_build_object('status',CASE WHEN req.deadline_at<=now() THEN 'expired' ELSE 'failed' END,'errorReason',coalesce(final_error,'generation_finished')) ELSE p END ORDER BY ord),'[]'::jsonb)
      FROM jsonb_array_elements(req.proposals) WITH ORDINALITY e(p,ord)),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO req;
  UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=p_id AND state='started';
  UPDATE postspark.generation_runs SET status=final_status,error_message=final_error,completed_at=now() WHERE id=p_id AND user_uuid=req.owner_id;
  RETURN to_jsonb(req);
END $$;

REVOKE ALL ON FUNCTION postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint),
  postspark.generation_preparation_expectation(uuid,uuid,text,jsonb),postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb),
  postspark.generation_preparation_available() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint),
  postspark.generation_preparation_expectation(uuid,uuid,text,jsonb),postspark.generation_recover_preparation(uuid,uuid,text,jsonb,jsonb),
  postspark.generation_preparation_available() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
