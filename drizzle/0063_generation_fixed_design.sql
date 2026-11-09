-- A pinned composition uses one proposal. Free generation retains its three slots.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE postspark.generation_v5_requests DROP CONSTRAINT generation_v5_requests_proposals_check;
ALTER TABLE postspark.generation_v5_requests ADD CONSTRAINT generation_v5_requests_proposals_check
 CHECK (jsonb_typeof(proposals) = 'array' AND jsonb_array_length(proposals) IN (1, 3));

CREATE OR REPLACE FUNCTION postspark.generation_admit(p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,p_experimental boolean,p_deadline_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admitted jsonb;
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE profile_plan text;
DECLARE reserved_id uuid;
DECLARE result jsonb;
DECLARE total integer;
DECLARE ledger text;
DECLARE affected integer;
BEGIN
 -- Admission and the hold commit or roll back TOGETHER. A response loss is an
 -- idempotent retry, never a reason to refund a possibly admitted request.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE owner_id=p_owner AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF req.input_hash<>p_input_hash THEN RAISE EXCEPTION 'Idempotency key reused with different input' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(req)||jsonb_build_object('created',false);
 END IF;
 SELECT plan INTO profile_plan FROM postspark.profiles WHERE id=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'Billing profile unavailable' USING ERRCODE='PT412'; END IF;
 PERFORM 1 FROM postspark.generation_v5_requests WHERE owner_id=p_owner ORDER BY id FOR UPDATE;
 admitted := postspark.generation_v5_admit(p_id,p_owner,p_idempotency_key,p_input_hash,p_input,p_experimental,p_deadline_at);
 IF p_input ? 'fixedDesign' THEN
  IF jsonb_typeof(p_input->'pinnedDesign') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing pinned design' USING ERRCODE='22023'; END IF;
  UPDATE postspark.generation_v5_requests SET proposals=jsonb_build_array(proposals->0) WHERE id=p_id;
 END IF;
 IF profile_plan IN ('DEV','FOUNDER') THEN
  UPDATE postspark.generation_v5_requests SET billing_mode='unlimited',billing_reserved=0 WHERE id=p_id RETURNING * INTO req;
 ELSE
  -- Preserve commercial totals of the retired Studio path: 10 static / 40 carousel.
  total := CASE WHEN p_input ? 'fixedDesign'
    THEN CASE WHEN p_input->>'postMode'='carousel' THEN 16 ELSE 4 END
    ELSE CASE WHEN p_input->>'postMode'='carousel' THEN 40 ELSE 10 END END;
  IF to_regprocedure('postspark.next_reserve_sparks_v2(uuid,text,integer)') IS NOT NULL THEN
   ledger := 'next';
   EXECUTE 'SELECT to_jsonb(r) FROM postspark.next_reserve_sparks_v2($1,$2,$3) r' INTO result USING p_owner,'generation:'||p_idempotency_key,total;
   IF result->>'status' IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Insufficient sparks or reservation unavailable' USING ERRCODE='PT402'; END IF;
   reserved_id := (result->>'reservation_id')::uuid;
  ELSE
   ledger := 'canonical';
   EXECUTE 'SELECT postspark.reserve_sparks($1,$2,$3,$4)' INTO reserved_id USING p_owner,total,'generation:'||p_idempotency_key,'PostSpark generation';
  END IF;
  IF reserved_id IS NULL THEN RAISE EXCEPTION 'Insufficient sparks' USING ERRCODE='PT402'; END IF;
  UPDATE postspark.generation_v5_requests SET billing_mode='reserved',billing_ledger=ledger,billing_reservation_id=reserved_id,billing_reserved=total,billing_preparation=CASE WHEN p_input->>'postMode'='carousel' THEN 4 ELSE 1 END,billing_per_proposal=CASE WHEN p_input->>'postMode'='carousel' THEN 12 ELSE 3 END WHERE id=p_id RETURNING * INTO req;
  IF ledger='next' THEN
   EXECUTE 'UPDATE postspark.next_spark_reservations SET run_id=$2,expires_at=greatest(expires_at,$3+interval ''5 minutes'') WHERE id=$1 AND user_uuid=$4 AND status=''reserved''' USING reserved_id,p_id,req.deadline_at,p_owner;
   GET DIAGNOSTICS affected = ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'Generation reservation link failed'; END IF;
  END IF;
 END IF;
 RETURN to_jsonb(req)||jsonb_build_object('created',true);
END $$;

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
  final_status:=CASE WHEN ready_count=jsonb_array_length(req.proposals) THEN 'completed' WHEN ready_count>0 THEN 'partial' ELSE 'failed' END;
  final_error:=CASE WHEN final_status='completed' THEN NULL WHEN req.deadline_at<=now() THEN 'deadline_expired' WHEN final_status='failed' THEN coalesce(p_error_reason,'generation_failed') ELSE p_error_reason END;
  UPDATE postspark.generation_v5_requests SET status=final_status,error_reason=final_error,
    proposals=(SELECT coalesce(jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending','awaiting_reconciliation')
      THEN p||jsonb_build_object('status',CASE WHEN req.deadline_at<=now() THEN 'expired' ELSE 'failed' END,'errorReason',coalesce(final_error,'generation_finished')) ELSE p END ORDER BY ord),'[]'::jsonb)
      FROM jsonb_array_elements(req.proposals) WITH ORDINALITY e(p,ord)),lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id RETURNING * INTO req;
  UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=p_id AND state='started';
  UPDATE postspark.generation_runs SET status=final_status,error_message=final_error,completed_at=now() WHERE id=p_id AND user_uuid=req.owner_id;
  RETURN to_jsonb(req);
END $$;

CREATE FUNCTION postspark.generation_fixed_design_available() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT pg_catalog.to_regprocedure('postspark.generation_commit_fixed_design(uuid,uuid,jsonb,jsonb)') IS NOT NULL
$$;

-- The normal catalog delivery RPC validates registered component provenance.
-- Fixed documents come from the server-pinned, owner-authorized CanvasPostModel.
CREATE FUNCTION postspark.generation_commit_fixed_design(
 p_id uuid,p_lease_token uuid,p_delivery jsonb,p_projection jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
BEGIN
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR req.status<>'running' OR req.lease_token IS DISTINCT FROM p_lease_token OR req.lease_until<=now()
   THEN RAISE EXCEPTION 'Generation lease lost' USING ERRCODE='PT409'; END IF;
 IF NOT (req.input ? 'fixedDesign' AND req.input ? 'pinnedDesign')
    OR jsonb_array_length(req.proposals)<>1
    OR p_delivery->>'status' IS DISTINCT FROM 'ready'
    OR p_delivery->>'proposalId' IS DISTINCT FROM req.proposals->0->>'proposalId'
    OR p_delivery->>'runId' IS DISTINCT FROM p_id::text
    OR p_delivery->>'slot' IS DISTINCT FROM '0'
    OR p_delivery->>'revision' IS DISTINCT FROM req.proposals->0->>'revision'
    OR p_delivery->'fixedCanvas'->>'id' IS DISTINCT FROM 'design-'||p_id::text||'-0'
    OR jsonb_typeof(p_delivery->'fixedCanvas'->'slides') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_delivery->'fixedCanvas'->'slides') <>
       jsonb_array_length(req.input->'pinnedDesign'->'canvas'->'slides')
   THEN RAISE EXCEPTION 'Invalid fixed design delivery' USING ERRCODE='22023'; END IF;
 IF req.proposals->0->>'status'='ready' THEN
   IF req.proposals->0=p_delivery THEN RETURN to_jsonb(req); END IF;
   RAISE EXCEPTION 'Fixed design already delivered' USING ERRCODE='23505';
 END IF;
 IF req.proposals->0->>'status' IN ('failed','expired','cancelled')
   THEN RAISE EXCEPTION 'Fixed design proposal already closed' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM postspark.generation_v5_operations
   WHERE request_id=p_id AND state='completed'
     AND operation_key=CASE WHEN EXISTS (
       SELECT 1 FROM postspark.generation_v5_operations
       WHERE request_id=p_id AND operation_key=(p_delivery->>'proposalId')||':repair'
     ) THEN (p_delivery->>'proposalId')||':review_repair' ELSE (p_delivery->>'proposalId')||':review' END
     AND result->'issues'='[]'::jsonb
 ) THEN RAISE EXCEPTION 'Approved fixed design review required' USING ERRCODE='23514'; END IF;
 UPDATE postspark.generation_v5_requests SET proposals=jsonb_build_array(p_delivery),updated_at=now()
  WHERE id=p_id RETURNING * INTO req;
 UPDATE postspark.generation_runs SET output_snapshot=jsonb_build_array(p_projection)
  WHERE id=p_id AND user_uuid=req.owner_id;
 RETURN postspark.generation_v5_finish(p_id,p_lease_token,'completed',NULL);
END $$;

REVOKE ALL ON FUNCTION postspark.generation_fixed_design_available(),
 postspark.generation_commit_fixed_design(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_fixed_design_available(),
 postspark.generation_commit_fixed_design(uuid,uuid,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
