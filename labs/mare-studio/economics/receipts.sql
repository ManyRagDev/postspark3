-- Read-only. Run against an authorized reporting copy of the PostSpark database.
-- Export the one JSON cell. Rows have sequential analysis IDs, no creative content or user IDs.
with jobs as (
  select j.*, row_number() over(order by created_at,id)::text as sample_id
  from postspark.mare_jobs j
  where j.created_at >= now() - interval '30 days' and j.status <> 'quoted'
), samples as (
  select j.sample_id, jsonb_build_object(
    'id', j.sample_id, 'operation', j.operation, 'status', j.status,
    'model', coalesce(j.receipt->>'model', j.payload->>'model', editorial.model),
    'receipts', case when j.operation in ('firstCut','review') then coalesce(editorial.receipts,'[]'::jsonb)
      when j.receipt ? 'usage' then jsonb_build_array(jsonb_build_object(
        'stage', j.operation, 'usage', jsonb_build_object('cost',j.receipt->'usage'->'cost')))
      else '[]'::jsonb end
  ) as sample
  from jobs j
  left join lateral (
    select string_agg(distinct s.response->>'model', '+') as model,
      jsonb_agg(jsonb_build_object('stage',s.stage,'usage',
        jsonb_build_object('cost',s.response->'usage'->'cost')) order by s.stage) as receipts
    from postspark.mare_editorial_steps s where s.job_id=j.id
  ) editorial on true
)
select jsonb_build_object('jobs',coalesce(jsonb_agg(sample order by sample_id),'[]'::jsonb))
from samples;
