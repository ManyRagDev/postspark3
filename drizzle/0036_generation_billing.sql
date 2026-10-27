-- Consolidated admission and proportional settlement use the EXISTING billing
-- ledger. No second Spark balance/reservation table is created. Historical V5
-- names remain persistence compatibility details, not a second generation path.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE postspark.generation_v5_requests DROP CONSTRAINT generation_v5_requests_billing_mode_check;
ALTER TABLE postspark.generation_v5_requests ADD CONSTRAINT generation_billing_mode_check CHECK (billing_mode IN ('dev_pilot','unlimited','reserved'));
ALTER TABLE postspark.generation_v5_requests
 ADD COLUMN billing_reservation_id uuid,
 ADD COLUMN billing_ledger text CHECK (billing_ledger IN ('next','canonical')),
 ADD COLUMN billing_reserved integer CHECK (billing_reserved >= 0),
 ADD COLUMN billing_preparation integer CHECK (billing_preparation >= 0),
 ADD COLUMN billing_per_proposal integer CHECK (billing_per_proposal >= 0),
 ADD COLUMN billing_settled_at timestamptz,
 ADD COLUMN billing_debited integer CHECK (billing_debited >= 0),
 ADD COLUMN billing_error text,
 ADD COLUMN billing_retry_at timestamptz;
CREATE UNIQUE INDEX generation_billing_reservation_unique ON postspark.generation_v5_requests(billing_ledger,billing_reservation_id) WHERE billing_reservation_id IS NOT NULL;
CREATE INDEX generation_billing_pending ON postspark.generation_v5_requests(updated_at,id) WHERE status NOT IN ('queued','running') AND billing_settled_at IS NULL AND billing_mode='reserved';

CREATE FUNCTION postspark.generation_settle(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reservation jsonb;
DECLARE ready_count integer;
DECLARE debt integer;
DECLARE ok boolean;
DECLARE balance integer;
DECLARE current_plan text;
DECLARE other_holds integer;
BEGIN
 SELECT * INTO req FROM postspark.generation_v5_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation not found'; END IF;
 IF req.status IN ('queued','running') THEN RAISE EXCEPTION 'Generation still active'; END IF;
 IF req.billing_settled_at IS NOT NULL THEN
  RETURN jsonb_build_object('settled',true,'debitedSparks',coalesce(req.billing_debited,0),'refundedSparks',coalesce(req.billing_reserved,0)-coalesce(req.billing_debited,0));
 END IF;
 IF req.billing_mode <> 'reserved' THEN
  UPDATE postspark.generation_v5_requests SET billing_settled_at=now(),billing_debited=0,billing_error=NULL,billing_retry_at=NULL WHERE id=p_id;
  RETURN jsonb_build_object('settled',true,'debitedSparks',0,'refundedSparks',0);
 END IF;
 IF req.billing_reservation_id IS NULL OR req.billing_reserved IS NULL THEN RAISE EXCEPTION 'Generation reservation missing'; END IF;
 -- Serialize all financial decisions for this owner before locking the ledger,
 -- matching admission lock order. The request lock fences cancellation/delivery.
 SELECT sparks,plan INTO balance,current_plan FROM postspark.profiles WHERE id=req.owner_id FOR UPDATE;
 SELECT count(*) INTO ready_count FROM jsonb_array_elements(req.proposals) p WHERE p->>'status'='ready';
 debt := CASE WHEN ready_count=0 THEN 0 ELSE req.billing_preparation + ready_count * req.billing_per_proposal END;
 IF debt IS NULL THEN RAISE EXCEPTION 'Generation pricing missing'; END IF;
 -- Existing debit_sparks also bypasses an account upgraded to unlimited before commit.
 -- Release its hold explicitly so recorded debt matches the actual balance change.
 IF current_plan IN ('DEV','FOUNDER') THEN debt:=0; END IF;
 IF debt>req.billing_reserved THEN RAISE EXCEPTION 'Generation settlement exceeds reservation'; END IF;
 IF req.billing_ledger='next' THEN
  EXECUTE 'SELECT to_jsonb(r) FROM postspark.next_spark_reservations r WHERE id=$1 FOR UPDATE' INTO reservation USING req.billing_reservation_id;
 ELSE
  EXECUTE 'SELECT to_jsonb(r) FROM postspark.spark_reservations r WHERE id=$1 FOR UPDATE' INTO reservation USING req.billing_reservation_id;
 END IF;
 IF reservation IS NULL OR reservation->>'user_uuid' IS DISTINCT FROM req.owner_id::text THEN RAISE EXCEPTION 'Generation reservation owner mismatch'; END IF;
 IF reservation->>'status'='committed' THEN
  IF (reservation->>'amount')::integer<>debt THEN RAISE EXCEPTION 'Generation reservation already committed with different amount'; END IF;
 ELSIF debt=0 AND reservation->>'status' IN ('refunded','expired') THEN
  NULL; -- A preceding expiry/refund released the entire hold; no delivery exists.
 ELSIF reservation->>'status'='reserved' OR (req.billing_ledger='next' AND reservation->>'status'='expired' AND debt>0) THEN
  -- Deadline expiry may have released a hold before the worker recovered. Only
  -- this request's linked reservation may be restored to settle existing ready
  -- deliveries; no provider calls are repeated and debt is charged exactly once.
  IF req.billing_ledger='next' THEN
   IF (reservation->>'status'='expired' OR (reservation->>'expires_at')::timestamptz<=now()) AND debt>0 THEN
    EXECUTE 'SELECT coalesce(sum(amount),0)::integer FROM postspark.next_spark_reservations WHERE user_uuid=$1 AND id<>$2 AND status=''reserved'' AND expires_at>now()' INTO other_holds USING req.owner_id,req.billing_reservation_id;
    IF balance-coalesce(other_holds,0)<debt THEN RAISE EXCEPTION 'Expired generation reservation requires financial reconciliation'; END IF;
   END IF;
   EXECUTE 'UPDATE postspark.next_spark_reservations SET amount=$2,status=''reserved'',expires_at=greatest(expires_at,now()+interval ''5 minutes''),run_id=$3,updated_at=now() WHERE id=$1' USING req.billing_reservation_id,CASE WHEN debt>0 THEN debt ELSE req.billing_reserved END,p_id;
   IF debt=0 THEN
    EXECUTE 'SELECT postspark.next_refund_reservation_v2($1,$2)' INTO ok USING req.billing_reservation_id,'Generation completed without usable proposals';
   ELSE
    EXECUTE 'SELECT postspark.next_commit_reservation_v2($1,$2,$3)' INTO ok USING req.billing_reservation_id,'PostSpark generation '||p_id::text,jsonb_build_object('generationRunId',p_id,'readyProposals',ready_count,'reservedSparks',req.billing_reserved);
   END IF;
  ELSE
   EXECUTE 'UPDATE postspark.spark_reservations SET amount=$2,updated_at=now() WHERE id=$1' USING req.billing_reservation_id,CASE WHEN debt>0 THEN debt ELSE req.billing_reserved END;
   IF debt=0 THEN
    EXECUTE 'SELECT postspark.refund_spark_reservation($1,$2)' INTO ok USING req.billing_reservation_id,'Generation completed without usable proposals';
   ELSE
    EXECUTE 'SELECT postspark.commit_spark_reservation($1,$2)' INTO ok USING req.billing_reservation_id,p_id::text;
   END IF;
  END IF;
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Generation financial settlement rejected'; END IF;
 ELSE
  RAISE EXCEPTION 'Generation reservation cannot be settled: %',reservation->>'status';
 END IF;
 UPDATE postspark.generation_v5_requests SET billing_debited=debt,billing_settled_at=now(),billing_error=NULL,billing_retry_at=NULL WHERE id=p_id;
 RETURN jsonb_build_object('settled',true,'debitedSparks',debt,'refundedSparks',req.billing_reserved-debt);
END $$;

CREATE FUNCTION postspark.generation_settle_terminal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Financial outages must not hide completed work. The subtransaction rolls
 -- back every financial write on failure; reconciler retries the same linked ID.
 BEGIN
  PERFORM postspark.generation_settle(NEW.id);
 EXCEPTION WHEN OTHERS THEN
  UPDATE postspark.generation_v5_requests SET billing_error=SQLERRM,billing_retry_at=now()+interval '30 seconds' WHERE id=NEW.id;
 END;
 RETURN NEW;
END $$;
CREATE TRIGGER generation_terminal_billing AFTER UPDATE OF status ON postspark.generation_v5_requests
 FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status NOT IN ('queued','running'))
 EXECUTE FUNCTION postspark.generation_settle_terminal();

CREATE FUNCTION postspark.generation_admit(p_id uuid,p_owner uuid,p_idempotency_key text,p_input_hash text,p_input jsonb,p_experimental boolean,p_deadline_at timestamptz) RETURNS jsonb
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
 IF profile_plan IN ('DEV','FOUNDER') THEN
  UPDATE postspark.generation_v5_requests SET billing_mode='unlimited',billing_reserved=0 WHERE id=p_id RETURNING * INTO req;
 ELSE
  -- Preserve commercial totals of the retired Studio path: 10 static / 40 carousel.
  total := CASE WHEN p_input->>'postMode'='carousel' THEN 40 ELSE 10 END;
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

CREATE FUNCTION postspark.generation_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE reconciled integer:=0;
BEGIN
 FOR req IN SELECT * FROM postspark.generation_v5_requests
  WHERE (status IN ('queued','running') AND deadline_at<=now()) OR (status NOT IN ('queued','running') AND billing_mode='reserved' AND billing_settled_at IS NULL AND (billing_retry_at IS NULL OR billing_retry_at<=now()))
  ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED LOOP
  IF req.status IN ('queued','running') THEN
   UPDATE postspark.generation_v5_requests SET status=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(proposals) p WHERE p->>'status'='ready') THEN 'partial' ELSE 'failed' END,
    error_reason='deadline_expired',lease_token=NULL,lease_until=NULL,updated_at=now(),
    proposals=(SELECT jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending') THEN p||jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord))
    WHERE id=req.id;
   UPDATE postspark.generation_runs r SET status=q.status,error_message='deadline_expired',completed_at=now() FROM postspark.generation_v5_requests q WHERE r.id=req.id AND q.id=r.id;
   UPDATE postspark.generation_v5_operations SET state='uncertain',updated_at=now() WHERE request_id=req.id AND state='started';
  END IF;
  BEGIN
   PERFORM postspark.generation_settle(req.id);
   reconciled:=reconciled+1;
  EXCEPTION WHEN OTHERS THEN
   UPDATE postspark.generation_v5_requests SET billing_error=SQLERRM,billing_retry_at=now()+interval '30 seconds' WHERE id=req.id;
  END;
 END LOOP;
 RETURN reconciled;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_cancel(p_id uuid,p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE req postspark.generation_v5_requests%ROWTYPE;
DECLARE new_proposals jsonb;
BEGIN
  SELECT * INTO req FROM postspark.generation_v5_requests WHERE id = p_id AND owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF req.status IN ('queued','running') THEN
    SELECT coalesce(pg_catalog.jsonb_agg(CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending')
      THEN p || pg_catalog.jsonb_build_object('status','cancelled') ELSE p END ORDER BY ord), '[]'::jsonb)
      INTO new_proposals FROM pg_catalog.jsonb_array_elements(req.proposals) WITH ORDINALITY e(p,ord);
    UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
      WHERE request_id = p_id AND state = 'started';
    UPDATE postspark.generation_v5_requests SET status = 'cancelled', proposals = new_proposals,
      lease_token = NULL, lease_until = NULL, updated_at = now() WHERE id = p_id RETURNING * INTO req;
    UPDATE postspark.generation_runs SET status = 'cancelled', error_message = 'cancelled', completed_at = now()
      WHERE id = p_id AND user_uuid = p_owner;
  END IF;
  RETURN pg_catalog.to_jsonb(req);
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v5_claim(p_worker_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE picked postspark.generation_v5_requests%ROWTYPE;
DECLARE next_token uuid;
DECLARE active_count integer;
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid worker id' USING ERRCODE = '22023';
  END IF;
  -- Lock expired requests in a stable order before terminal settlement takes profile locks.
  PERFORM 1 FROM postspark.generation_v5_requests
   WHERE status IN ('queued','running') AND deadline_at <= now() ORDER BY id FOR UPDATE;
  UPDATE postspark.generation_v5_requests
     SET status = CASE WHEN (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(proposals) p WHERE p->>'status'='ready') > 0 THEN 'partial' ELSE 'failed' END,
         error_reason = 'deadline_expired', lease_token = NULL,
         lease_until = NULL,
         proposals = (SELECT pg_catalog.jsonb_agg(
           CASE WHEN p->>'status' IN ('planned','running','waiting_input','checking','recovering','delivery_pending')
             THEN p || pg_catalog.jsonb_build_object('status','expired','errorReason','deadline_expired') ELSE p END
           ORDER BY ord) FROM pg_catalog.jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),
         updated_at = now()
   WHERE status IN ('queued','running') AND deadline_at <= now();
  UPDATE postspark.generation_runs r SET status = q.status, error_message = 'deadline_expired', completed_at = now()
   FROM postspark.generation_v5_requests q
   WHERE q.id = r.id AND q.status IN ('partial','failed') AND q.error_reason = 'deadline_expired'
     AND (r.status IS DISTINCT FROM q.status OR r.error_message IS DISTINCT FROM 'deadline_expired');
  UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
   WHERE state = 'started' AND request_id IN (SELECT id FROM postspark.generation_v5_requests
     WHERE status IN ('partial','failed') AND error_reason = 'deadline_expired');

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('generation_v5_global_leases', 0));
  SELECT pg_catalog.count(*) INTO active_count FROM postspark.generation_v5_requests
   WHERE status = 'running' AND lease_until > now();
  IF active_count >= 3 THEN RETURN NULL; END IF;
  SELECT * INTO picked FROM postspark.generation_v5_requests
   WHERE deadline_at > now() AND (status = 'queued' OR (status = 'running' AND lease_until <= now()))
   ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF picked.status = 'running' THEN
    UPDATE postspark.generation_v5_operations SET state = 'uncertain', updated_at = now()
     WHERE request_id = picked.id AND state = 'started';
  END IF;
  next_token := pg_catalog.gen_random_uuid();
  UPDATE postspark.generation_v5_requests
     SET status = 'running', lease_token = next_token, lease_until = now() + interval '90 seconds',
         updated_at = now()
   WHERE id = picked.id RETURNING * INTO picked;
  RETURN pg_catalog.to_jsonb(picked) || pg_catalog.jsonb_build_object('leaseToken', next_token);
END $$;

CREATE FUNCTION postspark.generation_catalog_availability() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'approved',count(*) FILTER (WHERE c.status='approved'),
  'draft',count(*) FILTER (WHERE c.status='draft'))
 FROM postspark.design_components c
 JOIN postspark.design_component_search_documents d ON d.component_id=c.id AND d.definition_hash=c.definition_hash
 WHERE c.kind='content' AND d.card->'completeDesign'->>'baselineVerified'='true'
$$;
REVOKE ALL ON FUNCTION postspark.generation_catalog_availability() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_catalog_availability() TO service_role;

-- The historical admission routine is now internal to atomic billed admission.
REVOKE ALL ON FUNCTION postspark.generation_v5_admit(uuid,uuid,text,text,jsonb,boolean,timestamptz) FROM service_role;
REVOKE ALL ON FUNCTION postspark.generation_admit(uuid,uuid,text,text,jsonb,boolean,timestamptz),postspark.generation_settle(uuid),postspark.generation_reconcile(),postspark.generation_settle_terminal() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_admit(uuid,uuid,text,text,jsonb,boolean,timestamptz),postspark.generation_settle(uuid),postspark.generation_reconcile() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
