-- Progress and lease renewal never transport accumulated generation documents.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION postspark.generation_progress(p_id uuid, p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object(
   'requestId', r.id, 'status', r.status,
   'deadlineAt', extract(epoch FROM r.deadline_at) * 1000,
   'billingPending', r.billing_mode = 'reserved' AND r.billing_settled_at IS NULL,
   'error', r.dispatch_error,
   'proposals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
     'proposalId', p->>'proposalId', 'revision', p->'revision', 'status', p->>'status'
   )), '[]'::jsonb) FROM jsonb_array_elements(r.proposals) p)
 ) FROM postspark.generation_v5_requests r WHERE r.id = p_id AND r.owner_id = p_owner
$$;
REVOKE ALL ON FUNCTION postspark.generation_progress(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_progress(uuid,uuid) TO service_role;

-- Fetch the delivery on demand, excluding worker-only context and inline media
-- before it crosses the database connection (not just before the HTTP response).
CREATE FUNCTION postspark.generation_client_request(p_id uuid,p_owner uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object(
   'id',r.id,'owner_id',r.owner_id,'status',r.status,'deadline_at',r.deadline_at,
   'proposals',r.proposals,'generation_config',r.generation_config,
   'execution_mode',r.execution_mode,'dispatch_error',r.dispatch_error,
   'error_reason',r.error_reason,'billing_mode',r.billing_mode,'billing_settled_at',r.billing_settled_at,
   'prepared',jsonb_build_object('imageSourceReading',jsonb_build_object('reading',jsonb_build_object(
     'uncertainties',coalesce(r.prepared#>'{imageSourceReading,reading,uncertainties}','[]'::jsonb)))),
   'input', (r.input - 'pinnedDesign' - 'ownerId' - 'idempotencyKey')
     #- CASE WHEN r.input->>'imageUrl' LIKE 'data:%' THEN ARRAY['imageUrl'] ELSE ARRAY[]::text[] END
     #- CASE WHEN r.input#>>'{executionBrief,brandInput,referenceImageUrl}' LIKE 'data:%'
          THEN ARRAY['executionBrief','brandInput','referenceImageUrl'] ELSE ARRAY[]::text[] END
     #- CASE WHEN r.input#>>'{executionBrief,brandInput,logoUrl}' LIKE 'data:%'
          THEN ARRAY['executionBrief','brandInput','logoUrl'] ELSE ARRAY[]::text[] END
 ) FROM postspark.generation_v5_requests r WHERE r.id=p_id AND r.owner_id=p_owner
$$;
REVOKE ALL ON FUNCTION postspark.generation_client_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_client_request(uuid,uuid) TO service_role;

CREATE FUNCTION postspark.generation_renew_lease(p_id uuid,p_lease_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_status text;
BEGIN
 UPDATE postspark.generation_v5_requests
 SET lease_until = now() + interval '90 seconds', updated_at = now()
 WHERE id = p_id AND status = 'running' AND lease_token = p_lease_token
   AND lease_until > now() AND deadline_at > now()
 RETURNING status INTO current_status;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generation lease lost' USING ERRCODE = 'PT409'; END IF;
 RETURN jsonb_build_object('status', current_status);
END $$;
REVOKE ALL ON FUNCTION postspark.generation_renew_lease(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_renew_lease(uuid,uuid) TO service_role;
-- 0009 normalized generation_runs.created_at; keep the JSON contract unchanged.
CREATE FUNCTION postspark.generation_history_summaries(p_owner uuid,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(summary ORDER BY created_at DESC,id DESC),'[]'::jsonb) FROM (
   SELECT r.id,r.created_at as created_at,jsonb_build_object(
     'id',r.id,'status',r.status,'input_type',r.input_type,'input_content',r.input_content,
     'platform',r.platform,'post_mode',r.post_mode,'created_at',r.created_at,
     'latency_ms',r.latency_ms,'total_tokens',r.total_tokens,'estimated_cost_usd',r.estimated_cost_usd,
     'error_message',r.error_message,
     'variation_count',(SELECT count(*) FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(r.output_snapshot)='array' THEN r.output_snapshot
         WHEN jsonb_typeof(r.output_snapshot->'variations')='array' THEN r.output_snapshot->'variations'
         ELSE '[]'::jsonb END
     ) item WHERE item <> 'null'::jsonb)
   ) as summary
   FROM postspark.generation_runs r WHERE r.user_uuid=p_owner
   ORDER BY r.created_at DESC,r.id DESC LIMIT least(greatest(p_limit,1),100) OFFSET greatest(p_offset,0)
 ) page
$$;
REVOKE ALL ON FUNCTION postspark.generation_history_summaries(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION postspark.generation_history_summaries(uuid,integer,integer) TO service_role;
COMMIT;
