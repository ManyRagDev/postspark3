-- New automatic review V4 stores inspection and material exceptions.
-- Historical V10 records retain the complete original 0054 validation below.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF to_regprocedure('postspark.generation_v10_ready_review_guard()') IS NULL
 THEN RAISE EXCEPTION 'Apply generation review migration 0046 before 0061'; END IF;
 IF to_regprocedure('postspark.editorial_canonical_json(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'Apply editorial canonical JSON migration 0055 before 0061'; END IF;
END $$;

CREATE OR REPLACE FUNCTION postspark.generation_v10_ready_review_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE raw_review jsonb; proposal jsonb; review jsonb; context jsonb; receipt jsonb; canonical text; prefix text; key text; db_key text; item jsonb;
DECLARE op postspark.generation_v5_operations%ROWTYPE; slide_count integer; operation_count integer; ordinal integer;
BEGIN
 IF NEW.prepared->>'reviewPolicyVersion' IS DISTINCT FROM '10' THEN RETURN NEW; END IF;
 FOR proposal IN SELECT value FROM jsonb_array_elements(NEW.proposals) LOOP
  IF proposal->>'status'<>'ready' OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.proposals) p WHERE p=proposal) THEN CONTINUE; END IF;
  canonical:=proposal->>'proposalId'; prefix:=coalesce(proposal->'attempt'->>'id',canonical);
  IF prefix IS DISTINCT FROM canonical AND prefix IS DISTINCT FROM canonical||'-fb1' AND prefix IS DISTINCT FROM canonical||'-fb2' AND prefix IS DISTINCT FROM canonical||'-fb3' THEN RAISE EXCEPTION 'Invalid V10 review attempt' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(proposal->'reviews') IS DISTINCT FROM 'array' OR jsonb_typeof(proposal->'bundle'->'slides') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Valid V10 review required' USING ERRCODE='23514'; END IF;
  review:=proposal->'reviews'->-1; slide_count:=jsonb_array_length(proposal->'bundle'->'slides');
  -- exceptions-v4: raw provider evidence remains independent of the local verdict.
  IF NEW.prepared->'reviewExecutionConfig'->>'automaticReviewVersion'='4' OR review->>'automaticReviewVersion'='4' THEN
   IF NEW.prepared->'reviewExecutionConfig'->>'automaticReviewVersion' IS DISTINCT FROM '4'
     OR review->>'automaticReviewVersion' IS DISTINCT FROM '4'
     OR review->>'policyVersion' IS DISTINCT FROM '10' OR review->>'status' IS DISTINCT FROM 'passed'
     OR review->>'inspectionStatus' IS DISTINCT FROM 'reviewed' OR review->>'limitation' IS DISTINCT FROM ''
     OR review->>'expectedSlideCount' IS DISTINCT FROM slide_count::text
     OR coalesce(review->>'inputHash','') !~ '^[a-f0-9]{64}$'
     OR coalesce(review->>'rawResponseHash','') !~ '^[a-f0-9]{64}$'
     OR jsonb_typeof(review->'operationKeys') IS DISTINCT FROM 'array'
     OR jsonb_typeof(review->'reviewedSlides') IS DISTINCT FROM 'array'
     OR jsonb_typeof(review->'findings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(review->'evidenceInventory') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'Valid V4 exception review required' USING ERRCODE='23514'; END IF;
   operation_count:=jsonb_array_length(review->'operationKeys');
   IF operation_count NOT BETWEEN 1 AND 2 OR slide_count NOT BETWEEN 1 AND 10
     OR jsonb_array_length(review->'reviewedSlides')<>slide_count
     OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(review->'reviewedSlides'))<>slide_count
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'reviewedSlides') e(value)
       WHERE jsonb_typeof(value)<>'number' OR value::text !~ '^[0-9]+$' OR (value#>>'{}')::int>=slide_count)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(review->'findings') f
       WHERE f->>'effect' IS DISTINCT FROM 'advisory' OR f->>'consequence' IS DISTINCT FROM 'none')
   THEN RAISE EXCEPTION 'Incomplete V4 exception review evidence' USING ERRCODE='23514'; END IF;
   context:=NULL; ordinal:=0;
   FOR key IN SELECT jsonb_array_elements_text(review->'operationKeys') LOOP
    ordinal:=ordinal+1;
    IF ordinal=1 AND key IS DISTINCT FROM canonical||':review:'||(review->>'round')||':'||(review->>'inputHash')
      OR ordinal=2 AND key !~ ('^'||canonical||':review_evidence_repair:'||(review->>'round')||':[a-f0-9]{64}$')
    THEN RAISE EXCEPTION 'Invalid V4 review operation' USING ERRCODE='23514'; END IF;
    db_key:=prefix||substring(key FROM length(canonical)+1);
    SELECT * INTO op FROM postspark.generation_v5_operations WHERE request_id=NEW.id AND operation_key=db_key;
    IF NOT FOUND OR op.state<>'completed'
      OR NOT postspark.generation_v10_expectation_valid(NEW.id,NEW.prepared,NEW.proposals,db_key,op.expectation)
      OR op.expectation->>'inputHash' IS DISTINCT FROM review->>'inputHash'
      OR op.expectation->>'round' IS DISTINCT FROM review->>'round'
      OR op.expectation->>'proposalId' IS DISTINCT FROM canonical
      OR op.expectation->>'revision' IS DISTINCT FROM proposal->>'revision'
      OR op.result->'__proposalReview' IS DISTINCT FROM op.expectation-'transport'
    THEN RAISE EXCEPTION 'V4 review receipt mismatch' USING ERRCODE='23514'; END IF;
    receipt:=op.expectation-'transport';
    IF context IS NOT NULL AND context IS DISTINCT FROM receipt
    THEN RAISE EXCEPTION 'V4 review receipt mismatch' USING ERRCODE='23514'; END IF;
    context:=receipt;
   END LOOP;
   BEGIN
    raw_review:=(op.result->'choices'->0->'message'->>'content')::jsonb;
   EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid V4 raw review response' USING ERRCODE='23514';
   END;
   IF jsonb_typeof(raw_review) IS DISTINCT FROM 'object'
     OR raw_review->>'status' IS DISTINCT FROM 'reviewed'
     OR raw_review->'limitation' IS DISTINCT FROM 'null'::jsonb
     OR raw_review->'reviewedSlides' IS DISTINCT FROM review->'reviewedSlides'
     OR jsonb_typeof(raw_review->'findings') IS DISTINCT FROM 'array'
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(raw_review->'findings') f WHERE f->>'category' IS DISTINCT FROM 'contrast' AND f->>'consequence' IS DISTINCT FROM 'none')
     OR encode(sha256(convert_to(postspark.editorial_canonical_json(raw_review),'UTF8')),'hex') IS DISTINCT FROM review->>'rawResponseHash'
     OR jsonb_array_length(context->'renderHashes')<>slide_count
     OR review->'evidenceInventory' IS DISTINCT FROM context->'evidenceInventory'
   THEN RAISE EXCEPTION 'V4 raw review evidence mismatch' USING ERRCODE='23514'; END IF;
   CONTINUE;
  END IF;

  IF review->>'policyVersion' IS DISTINCT FROM '10' OR review->>'status' IS DISTINCT FROM 'passed' OR review->>'outcome' IS DISTINCT FROM 'reviewed'
    OR review->>'limitation' IS DISTINCT FROM '' OR coalesce(review->>'inputHash','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(review->'operationKeys') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'reviewedSlides') IS DISTINCT FROM 'array'
    OR jsonb_typeof(review->'checkedTextUnits') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'unitChecks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(review->'intentChecks') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'findings') IS DISTINCT FROM 'array'
    OR jsonb_typeof(review->'requirementChecks') IS DISTINCT FROM 'array' OR jsonb_typeof(review->'factualAudit'->'claims') IS DISTINCT FROM 'array'
    OR review->'intentRequirements' IS DISTINCT FROM coalesce((
      SELECT jsonb_agg(requirements.item-'kind' ORDER BY requirements.ordinal)
      FROM jsonb_array_elements(coalesce(NEW.prepared->'planning'->'intent'->'requirements','[]'::jsonb)) WITH ORDINALITY requirements(item,ordinal)
      WHERE requirements.item->>'kind' IS DISTINCT FROM 'execution'
    ),'[]'::jsonb)
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

CREATE FUNCTION postspark.generation_review_exceptions_available() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
   WHERE t.tgrelid='postspark.generation_v5_requests'::regclass
   AND t.tgname='generation_v10_ready_review' AND t.tgenabled IN ('O','A')
   AND t.tgfoid='postspark.generation_v10_ready_review_guard()'::regprocedure)
   AND position('exceptions-v4' IN pg_get_functiondef('postspark.generation_v10_ready_review_guard()'::regprocedure))>0
   AND position('rawResponseHash' IN pg_get_functiondef('postspark.generation_v10_ready_review_guard()'::regprocedure))>0;
$$;
REVOKE ALL ON FUNCTION postspark.generation_review_exceptions_available() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_review_exceptions_available() TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
