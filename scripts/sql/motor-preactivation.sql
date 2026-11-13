-- Operator read-only inventory. Run on the confirmed application destination.
-- Do not use this script to migrate, refund or resume a request.
BEGIN READ ONLY;
SELECT current_setting('server_version') AS postgres_version;
SELECT postspark.demand_work_schedule() AS executor_contract;
SELECT execution_mode,status,count(*) AS requests,
       count(*) FILTER(WHERE billing_mode='reserved' AND billing_settled_at IS NULL) AS pending_settlements
FROM postspark.generation_v5_requests
WHERE status IN ('queued','running','awaiting_reconciliation')
   OR billing_mode='reserved' AND billing_settled_at IS NULL
GROUP BY execution_mode,status ORDER BY execution_mode,status;
SELECT state,count(*) AS operations FROM postspark.generation_v5_operations
WHERE state IN ('started','uncertain') GROUP BY state;
SELECT execution_mode,status,count(*) AS captures FROM postspark.brand_captures
WHERE status IN ('queued','running','awaiting_reconciliation') GROUP BY execution_mode,status;
SELECT state,count(*) AS operations FROM postspark.brand_capture_operations
WHERE state IN ('started','uncertain') GROUP BY state;
SELECT to_regprocedure('postspark.generation_record_telemetry(uuid,jsonb)') IS NOT NULL AS telemetry_ready,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='postspark' AND table_name='posts' AND column_name='revision') AS revision_ready;
ROLLBACK;
