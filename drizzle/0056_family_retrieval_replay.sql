-- The local search operation has no external effect. Interrupted computation
-- may replay; completed results remain immutable like other safe preparation.
DO $migration$
DECLARE definition text; signature regprocedure := 'postspark.generation_v5_operation(uuid,uuid,text,text,jsonb)'::regprocedure;
        old_guard text := '''prepare:recent_selections'') THEN';
BEGIN
  SELECT pg_get_functiondef(signature) INTO definition;
  IF position('''prepare:family_retrieval''' IN definition) > 0 THEN RETURN; END IF;
  IF position(old_guard IN definition) = 0 THEN RAISE EXCEPTION 'Unexpected generation_operation safe replay guard'; END IF;
  EXECUTE replace(definition, old_guard, '''prepare:recent_selections'',''prepare:family_retrieval'') THEN');
END;
$migration$;
