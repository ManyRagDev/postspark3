-- Read-only catalog verification. Always returns the two exact RPC signatures,
-- including a missing function. Whitespace in the stored body is immaterial.
WITH expected(signature) AS (VALUES
 ('postspark.generation_admit_configured(uuid,uuid,text,text,jsonb,boolean,timestamptz,jsonb,text,bigint)'),
 ('postspark.generation_admit_staged_local(uuid,uuid,text,text,jsonb,boolean,timestamptz,text,bigint,jsonb)')
)
SELECT e.signature,
 p.oid IS NOT NULL AS present,
 coalesce(position($choices$notin('gemini','claude','deepseek','gpt')$choices$
   IN regexp_replace(lower(p.prosrc), '\s+', '', 'g')) > 0, false) AS active_choices_allowed,
 coalesce(p.prosecdef AND 'search_path=""'=ANY(p.proconfig), false) AS secured_search_path,
 coalesce(has_function_privilege('service_role',p.oid,'EXECUTE'),false) AS service_role_can_execute,
 coalesce(NOT has_function_privilege('anon',p.oid,'EXECUTE')
   AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE'),false) AS client_roles_denied
FROM expected e
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
ORDER BY e.signature;
