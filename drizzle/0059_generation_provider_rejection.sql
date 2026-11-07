-- Reconcile a historical, explicit provider rejection using already persisted
-- evidence. This does not resume work, settle billing, or certify a zero charge.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION postspark.generation_reconcile_provider_rejection(
  p_id uuid, p_owner uuid, p_key text, p_receipt jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE op postspark.generation_v5_operations%ROWTYPE;
DECLARE snapshot jsonb; matching jsonb; proof jsonb; envelope jsonb; raw_error jsonb;
DECLARE error_text text; delimiter integer; http_status integer; receipt_result jsonb;
BEGIN
  IF p_receipt IS NULL OR jsonb_typeof(p_receipt) IS DISTINCT FROM 'object'
    OR p_receipt - ARRAY['version','provider','model','httpStatus','reason','providerRequestId','requestHash','responseHash','costStatus'] IS DISTINCT FROM '{}'::jsonb
    OR p_receipt->'version' IS DISTINCT FROM '1'::jsonb
    OR p_receipt->>'provider' IS DISTINCT FROM 'openrouter'
    OR jsonb_typeof(p_receipt->'model') IS DISTINCT FROM 'string' OR coalesce(p_receipt->>'model','')=''
    OR p_receipt->'httpStatus' IS NULL OR p_receipt->'httpStatus' NOT IN ('400'::jsonb,'422'::jsonb)
    OR p_receipt->>'reason' IS DISTINCT FROM 'invalid_request_error'
    OR jsonb_typeof(p_receipt->'providerRequestId') IS DISTINCT FROM 'string'
    OR coalesce(length(p_receipt->>'providerRequestId'),0) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_receipt->'requestHash') IS DISTINCT FROM 'string' OR coalesce(p_receipt->>'requestHash','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_receipt->'responseHash') IS DISTINCT FROM 'string' OR coalesce(p_receipt->>'responseHash','') !~ '^[a-f0-9]{64}$'
    OR p_receipt->>'costStatus' IS DISTINCT FROM 'unreported'
    OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 240
  THEN RAISE EXCEPTION 'Invalid provider rejection receipt' USING ERRCODE='22023'; END IF;

  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id=p_id AND owner_id=p_owner FOR UPDATE;
  IF NOT FOUND OR req.status NOT IN ('completed','partial','failed','cancelled')
    OR req.lease_token IS NOT NULL OR req.lease_until IS NOT NULL
  THEN RAISE EXCEPTION 'Generation is not terminal without a lease' USING ERRCODE='PT409'; END IF;
  SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key FOR UPDATE;
  IF NOT FOUND OR op.state NOT IN ('started','uncertain','completed')
  THEN RAISE EXCEPTION 'Provider rejection operation mismatch' USING ERRCODE='PT409'; END IF;
  IF op.state='completed' THEN
    IF op.result->'__providerRejection' IS DISTINCT FROM p_receipt
    THEN RAISE EXCEPTION 'Immutable result' USING ERRCODE='PT409'; END IF;
    RETURN to_jsonb(op);
  END IF;

  SELECT prompt_snapshot INTO snapshot FROM postspark.generation_runs WHERE id=p_id AND user_uuid=p_owner FOR SHARE;
  IF NOT FOUND OR jsonb_typeof(snapshot->'calls') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Persisted rejection evidence missing' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(c) INTO matching FROM jsonb_array_elements(snapshot->'calls') c WHERE c->>'operationKey'=p_key;
  IF coalesce(jsonb_array_length(matching),0)<>1
  THEN RAISE EXCEPTION 'Expected exactly one persisted operation call' USING ERRCODE='22023'; END IF;
  proof:=matching->0;
  error_text:=proof->>'error';
  http_status:=(p_receipt->>'httpStatus')::integer;
  IF proof->>'provider' IS DISTINCT FROM 'openrouter'
    OR proof->>'effectiveModel' IS DISTINCT FROM p_receipt->>'model'
    OR coalesce(error_text,'') !~ ('^openrouter API failed: '||http_status::text||'( [^-]*)? - ')
  THEN RAISE EXCEPTION 'Persisted rejection identity mismatch' USING ERRCODE='22023'; END IF;
  delimiter:=strpos(error_text,' - ');
  BEGIN
    envelope:=substring(error_text from delimiter+3)::jsonb;
    raw_error:=(envelope#>>'{error,metadata,raw}')::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Persisted rejection envelope invalid' USING ERRCODE='22023';
  END;
  IF envelope#>'{error,code}' IS DISTINCT FROM to_jsonb(http_status)
    OR raw_error->>'type' IS DISTINCT FROM 'error'
    OR raw_error#>>'{error,type}' IS DISTINCT FROM 'invalid_request_error'
    OR raw_error->>'request_id' IS DISTINCT FROM p_receipt->>'providerRequestId'
  THEN RAISE EXCEPTION 'Persisted rejection envelope mismatch' USING ERRCODE='22023'; END IF;

  -- Hashes identify the offline wire artifact supplied by the service. The
  -- historical trace proves rejection identity, but lacks the full payload, so
  -- it cannot independently certify requestHash. Never manufacture usage/cost.
  receipt_result:=jsonb_build_object('__providerRejection',p_receipt,'__generationTrace',
    jsonb_build_object('version',1,'calls',jsonb_build_array(proof),'events','[]'::jsonb));
  UPDATE postspark.generation_v5_operations SET state='completed',result=receipt_result,updated_at=now()
    WHERE request_id=p_id AND operation_key=p_key RETURNING * INTO op;
  RETURN to_jsonb(op);
END $$;

REVOKE ALL ON FUNCTION postspark.generation_reconcile_provider_rejection(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_reconcile_provider_rejection(uuid,uuid,text,jsonb) TO service_role;
COMMENT ON FUNCTION postspark.generation_reconcile_provider_rejection(uuid,uuid,text,jsonb) IS
  'Service-only reconciliation of a single persisted HTTP400/422 invalid_request_error. Changes only its operation; cost remains unreported.';
NOTIFY pgrst, 'reload schema';
COMMIT;
