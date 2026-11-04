-- V10 durable review protocol. Historical V9 commit behavior remains in
-- generation_v5_lease_update; the additive trigger below only guards V10.
BEGIN;
CREATE FUNCTION postspark.generation_v10_expectation_valid(p_id uuid,p_prepared jsonb,p_proposals jsonb,p_key text,p_expectation jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE config jsonb:=p_prepared->'reviewExecutionConfig'; proposal_id text:=p_expectation->>'proposalId';
DECLARE prefix text:=split_part(p_key,':',1); suffix text:=substring(p_key FROM position(':' IN p_key)+1);
BEGIN
 IF p_prepared->>'reviewPolicyVersion' IS DISTINCT FROM '10' OR config->>'version' IS DISTINCT FROM '5' OR config->>'policyVersion' IS DISTINCT FROM '10'
   OR p_expectation->>'version' IS DISTINCT FROM '5' OR p_expectation->>'policyVersion' IS DISTINCT FROM '10'
   OR p_expectation->>'requestId' IS DISTINCT FROM p_id::text
   OR p_expectation->>'configurationHash' IS DISTINCT FROM config->>'configurationHash'
   OR p_expectation->>'sourceContextHash' IS DISTINCT FROM p_prepared->>'editorialContextHash'
   OR p_expectation->'transport'->>'configurationHash' IS DISTINCT FROM config->>'configurationHash'
   OR p_expectation->'transport'->>'model' IS DISTINCT FROM config->>'resolvedModel'
   OR coalesce(p_expectation->>'inputHash','') !~ '^[a-f0-9]{64}$'
   OR coalesce(p_expectation->>'configurationHash','') !~ '^[a-f0-9]{64}$'
   OR coalesce(p_expectation->>'sourceContextHash','') !~ '^[a-f0-9]{64}$'
   OR coalesce(p_expectation->'transport'->>'messagesHash','') !~ '^[a-f0-9]{64}$'
   OR coalesce(p_expectation->>'round','') NOT IN ('initial','recheck')
   OR jsonb_typeof(p_expectation->'renderHashes') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_expectation->'textUnitInventory') IS DISTINCT FROM 'array'
   OR jsonb_typeof(p_expectation->'evidenceInventory') IS DISTINCT FROM 'array'
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_proposals) p WHERE p->>'proposalId'=proposal_id AND p->>'revision'=p_expectation->>'revision')
 THEN RETURN false; END IF;
 IF prefix IS DISTINCT FROM proposal_id AND prefix IS DISTINCT FROM proposal_id||'-fb1' AND prefix IS DISTINCT FROM proposal_id||'-fb2' AND prefix IS DISTINCT FROM proposal_id||'-fb3' THEN RETURN false; END IF;
 IF suffix IS DISTINCT FROM 'review:'||(p_expectation->>'round')||':'||(p_expectation->>'inputHash')
   AND suffix !~ ('^review_evidence_repair:'||(p_expectation->>'round')||':[a-f0-9]{64}$') THEN RETURN false; END IF;
 IF jsonb_array_length(p_expectation->'renderHashes') NOT BETWEEN 1 AND 10 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_expectation->'renderHashes') WITH ORDINALITY e(value,ord)
   WHERE value->>'slideIndex' IS DISTINCT FROM (ord-1)::text OR coalesce(value->>'hash','') !~ '^[a-f0-9]{64}$')
   OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_expectation->'textUnitInventory'))<>jsonb_array_length(p_expectation->'textUnitInventory')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_expectation->'textUnitInventory') u WHERE coalesce(u->>'id','')='' OR coalesce(u->>'textHash','') !~ '^[a-f0-9]{64}$')
 THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION postspark.generation_v10_expectation_valid(uuid,jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION postspark.generation_v10_ready_review_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal jsonb; review jsonb; context jsonb; receipt jsonb; canonical text; prefix text; key text; db_key text; item jsonb;
DECLARE op postspark.generation_v5_operations%ROWTYPE; slide_count integer; operation_count integer; ordinal integer;
BEGIN
 IF NEW.prepared->>'reviewPolicyVersion' IS DISTINCT FROM '10' THEN RETURN NEW; END IF;
 FOR proposal IN SELECT value FROM jsonb_array_elements(NEW.proposals) LOOP
  IF proposal->>'status'<>'ready' OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.proposals) p WHERE p=proposal) THEN CONTINUE; END IF;
  canonical:=proposal->>'proposalId'; prefix:=coalesce(proposal->'attempt'->>'id',canonical);
  IF prefix IS DISTINCT FROM canonical AND prefix IS DISTINCT FROM canonical||'-fb1' AND prefix IS DISTINCT FROM canonical||'-fb2' AND prefix IS DISTINCT FROM canonical||'-fb3' THEN RAISE EXCEPTION 'Invalid V10 review attempt' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(proposal->'reviews') IS DISTINCT FROM 'array' OR jsonb_typeof(proposal->'bundle'->'slides') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Valid V10 review required' USING ERRCODE='23514'; END IF;
  review:=proposal->'reviews'->-1; slide_count:=jsonb_array_length(proposal->'bundle'->'slides');
  IF review->>'policyVersion' IS DISTINCT FROM '10' OR review->>'status' IS DISTINCT FROM 'passed' OR review->>'outcome' IS DISTINCT FROM 'reviewed'
    OR review->>'limitation' IS DISTINCT FROM '' OR coalesce(review->>'inputHash','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(review->'operationKeys') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'reviewedSlides') IS DISTINCT FROM 'array'
    OR jsonb_typeof(review->'checkedTextUnits') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'unitChecks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(review->'intentChecks') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'findings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(review->'requirementChecks') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'factualAudit'->'claims') IS DISTINCT FROM 'array'
    OR review->'intentRequirements' IS DISTINCT FROM coalesce(NEW.prepared->'planning'->'intent'->'requirements','[]'::jsonb)
    OR review->'sequenceAssessment'->>'status' IS DISTINCT FROM 'coherent'
  THEN RAISE EXCEPTION 'Valid V10 review required' USING ERRCODE='23514'; END IF;
  operation_count:=jsonb_array_length(review->'operationKeys');
  IF operation_count NOT BETWEEN 1 AND 2 OR slide_count NOT BETWEEN 1 AND 10 OR jsonb_array_length(review->'reviewedSlides')<>slide_count
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(review->'reviewedSlides'))<>slide_count
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'reviewedSlides') e(value) WHERE jsonb_typeof(value)<>'number' OR (value#>>'{}')::int<0 OR (value#>>'{}')::int>=slide_count)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'findings') f WHERE f->>'effect' IS DISTINCT FROM 'advisory' OR f->>'consequence' IS DISTINCT FROM 'none')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'unitChecks') u WHERE coalesce(u->>'verdict','') NOT IN ('supported','editorial'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'requirementChecks') c WHERE c->>'status' IS DISTINCT FROM 'met')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'factualAudit'->'claims') c WHERE c->>'status' IS DISTINCT FROM 'supported')
  THEN RAISE EXCEPTION 'Incomplete V10 review evidence' USING ERRCODE='23514'; END IF;
  context:=NULL; ordinal:=0;
  FOR key IN SELECT jsonb_array_elements_text(review->'operationKeys') LOOP
   ordinal:=ordinal+1;
   IF ordinal=1 AND key IS DISTINCT FROM canonical||':review:'||(review->>'round')||':'||(review->>'inputHash')
     OR ordinal=2 AND key !~ ('^'||canonical||':review_evidence_repair:'||(review->>'round')||':[a-f0-9]{64}$')
   THEN RAISE EXCEPTION 'Invalid V10 review operation' USING ERRCODE='23514'; END IF;
   db_key:=prefix||substring(key FROM length(canonical)+1);
   SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=NEW.id AND operation_key=db_key;
   IF NOT FOUND OR op.state<>'completed' OR NOT postspark.generation_v10_expectation_valid(NEW.id,NEW.prepared,NEW.proposals,db_key,op.expectation)
     OR op.expectation->>'inputHash' IS DISTINCT FROM review->>'inputHash' OR op.expectation->>'round' IS DISTINCT FROM review->>'round'
     OR op.expectation->>'proposalId' IS DISTINCT FROM canonical OR op.expectation->>'revision' IS DISTINCT FROM proposal->>'revision'
     OR op.result->'__proposalReview' IS DISTINCT FROM op.expectation-'transport'
   THEN RAISE EXCEPTION 'V10 review receipt mismatch' USING ERRCODE='23514'; END IF;
   receipt:=op.expectation-'transport';
   IF context IS NOT NULL AND context IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'V10 review receipt mismatch' USING ERRCODE='23514'; END IF;
   context:=receipt;
  END LOOP;
  IF jsonb_array_length(context->'renderHashes')<>slide_count OR review->'evidenceInventory' IS DISTINCT FROM context->'evidenceInventory'
    OR (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(review->'checkedTextUnits')) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(value->>'id') ORDER BY value->>'id') FROM jsonb_array_elements(context->'textUnitInventory'))
    OR (SELECT jsonb_agg(value->>'unitId' ORDER BY value->>'unitId') FROM jsonb_array_elements(review->'unitChecks')) IS DISTINCT FROM (SELECT jsonb_agg(value->>'id' ORDER BY value->>'id') FROM jsonb_array_elements(context->'textUnitInventory'))
    OR (SELECT jsonb_agg(value->>'requirementId' ORDER BY value->>'requirementId') FROM jsonb_array_elements(review->'intentChecks')) IS DISTINCT FROM (SELECT jsonb_agg(value->>'id' ORDER BY value->>'id') FROM jsonb_array_elements(review->'intentRequirements'))
    OR (SELECT jsonb_agg(value->>'requirementId' ORDER BY value->>'requirementId') FROM jsonb_array_elements(review->'requirementChecks')) IS DISTINCT FROM (SELECT jsonb_agg(value->>'id' ORDER BY value->>'id') FROM jsonb_array_elements(coalesce(NEW.prepared->'editorialContext'->'requirements','[]'::jsonb)))
  THEN RAISE EXCEPTION 'Incomplete V10 review evidence' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(review->'intentRequirements') WHERE value->>'origin'='explicit' LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'intentChecks') c WHERE c->>'requirementId'=item->>'id' AND c->>'status'='met'
    AND jsonb_array_length(c->'deliveries')>=coalesce((item->>'itemCount')::int,1)) THEN RAISE EXCEPTION 'Incomplete V10 review requirements' USING ERRCODE='23514'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION postspark.generation_v10_ready_review_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER generation_v10_ready_review BEFORE UPDATE OF proposals ON postspark.generation_v5_requests
FOR EACH ROW EXECUTE FUNCTION postspark.generation_v10_ready_review_guard();

CREATE OR REPLACE FUNCTION postspark.generation_review_expectation(p_id uuid,p_lease uuid,p_key text,p_expectation jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM postspark.generation_v5_requests WHERE id=p_id AND status='running' AND lease_token=p_lease AND lease_until>now() AND deadline_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation lease lost' USING ERRCODE='PT409';END IF;
 IF p_expectation->>'requestId' IS DISTINCT FROM p_id::text OR NOT EXISTS(
   SELECT 1 FROM postspark.generation_v5_requests r WHERE r.id=p_id AND r.prepared->>'reviewPolicyVersion' IN ('9','10')
   AND r.prepared->'reviewExecutionConfig'->>'configurationHash'=p_expectation->>'configurationHash'
   AND r.prepared->>'editorialContextHash'=p_expectation->>'sourceContextHash'
   AND r.prepared->'reviewExecutionConfig'->>'resolvedModel'=p_expectation->'transport'->>'model'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.proposals) p WHERE p->>'proposalId'=p_expectation->>'proposalId')
 ) THEN RAISE EXCEPTION 'Invalid review expectation';END IF;
 IF EXISTS(SELECT 1 FROM postspark.generation_v5_requests r WHERE r.id=p_id AND r.prepared->>'reviewPolicyVersion'='10' AND NOT postspark.generation_v10_expectation_valid(p_id,r.prepared,r.proposals,p_key,p_expectation)) THEN RAISE EXCEPTION 'Invalid V10 review expectation'; END IF;
 INSERT INTO postspark.generation_v5_operations(request_id,operation_key,state,expectation) VALUES(p_id,p_key,'started',p_expectation)
 ON CONFLICT(request_id,operation_key) DO UPDATE SET expectation=EXCLUDED.expectation WHERE postspark.generation_v5_operations.expectation IS NULL;
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key AND expectation=p_expectation) THEN RAISE EXCEPTION 'Immutable review expectation';END IF;
END $$;
CREATE OR REPLACE FUNCTION postspark.generation_recover_review(p_id uuid,p_owner uuid,p_key text,p_expectation jsonb,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r postspark.generation_v5_requests%ROWTYPE; op postspark.generation_v5_operations%ROWTYPE;
BEGIN
 SELECT * INTO r FROM postspark.generation_v5_requests WHERE id=p_id AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('awaiting_reconciliation','queued') OR r.deadline_at<=now() OR coalesce(r.prepared->>'reviewPolicyVersion','') NOT IN ('9','10') OR r.prepared->'reviewExecutionConfig'->>'configurationHash' IS DISTINCT FROM p_expectation->>'configurationHash' THEN RAISE EXCEPTION 'Request not awaiting reconciliation';END IF;
 IF r.prepared->>'reviewPolicyVersion'='10' AND NOT postspark.generation_v10_expectation_valid(p_id,r.prepared,r.proposals,p_key,p_expectation) THEN RAISE EXCEPTION 'Recovered V10 review mismatch'; END IF;
 SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=p_id AND operation_key=p_key FOR UPDATE;
 IF NOT FOUND OR op.expectation IS DISTINCT FROM p_expectation OR p_result->'__proposalReview' IS DISTINCT FROM (p_expectation-'transport') OR op.state NOT IN ('started','uncertain','completed') THEN RAISE EXCEPTION 'Recovered review mismatch';END IF;
 IF op.state='completed' THEN IF op.result IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'Immutable result';END IF;RETURN to_jsonb(r);END IF;
 UPDATE postspark.generation_v5_operations SET state='completed',result=p_result,updated_at=now() WHERE request_id=p_id AND operation_key=p_key;
 IF NOT EXISTS(SELECT 1 FROM postspark.generation_v5_operations WHERE request_id=p_id AND state<>'completed' AND operation_key LIKE (p_expectation->>'proposalId')||'%' AND operation_key ~ ':review(_evidence_repair)?:') THEN
 UPDATE postspark.generation_v5_requests SET status='queued',proposals=(SELECT jsonb_agg(CASE WHEN p->>'status'='awaiting_reconciliation' AND (p->>'proposalId')=(p_expectation->>'proposalId') THEN (p-'reviews'-'failure'-'errorReason')||jsonb_build_object('status','planned') ELSE p END ORDER BY ord) FROM jsonb_array_elements(proposals) WITH ORDINALITY e(p,ord)),updated_at=now() WHERE id=p_id RETURNING * INTO r;
 END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION postspark.generation_review_expectation(uuid,uuid,text,jsonb),postspark.generation_recover_review(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_review_expectation(uuid,uuid,text,jsonb),postspark.generation_recover_review(uuid,uuid,text,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
