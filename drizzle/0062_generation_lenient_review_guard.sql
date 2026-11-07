-- Allow lenient review delivery when REVIEW_LENIENT_DELIVERY normalizes advisory findings
-- while preserving exceptions-v4 and rawResponseHash markers for generation_review_exceptions_available().
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION postspark.generation_v10_ready_review_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal jsonb; review jsonb; canonical text; prefix text; slide_count integer;
BEGIN
 IF NEW.prepared->>'reviewPolicyVersion' IS DISTINCT FROM '10' THEN RETURN NEW; END IF;
 FOR proposal IN SELECT value FROM jsonb_array_elements(NEW.proposals) LOOP
  IF proposal->>'status'<>'ready' OR EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.proposals) p WHERE p=proposal) THEN CONTINUE; END IF;
  canonical:=proposal->>'proposalId'; prefix:=coalesce(proposal->'attempt'->>'id',canonical);
  IF prefix IS DISTINCT FROM canonical AND prefix IS DISTINCT FROM canonical||'-fb1' AND prefix IS DISTINCT FROM canonical||'-fb2' AND prefix IS DISTINCT FROM canonical||'-fb3' THEN RAISE EXCEPTION 'Invalid V10 review attempt' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(proposal->'bundle'->'slides') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Valid V10 review required' USING ERRCODE='23514'; END IF;
  slide_count:=jsonb_array_length(proposal->'bundle'->'slides');
  IF slide_count NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Valid V10 review required' USING ERRCODE='23514'; END IF;
  -- exceptions-v4 and rawResponseHash preserved for generation_review_exceptions_available()
  IF jsonb_typeof(proposal->'reviews') = 'array' AND jsonb_array_length(proposal->'reviews') > 0 THEN
   review:=proposal->'reviews'->-1;
   IF review->>'status' IS DISTINCT FROM 'passed' THEN RAISE EXCEPTION 'Valid V10 review required' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
