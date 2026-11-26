-- Report usage without returning content, media identifiers or provider prompts.
create function postspark.mare_operational_summary(p_days integer default 7)
returns table(operation text, jobs bigint, delivered bigint, pending bigint, failed bigint,
  charged_sparks bigint, provider_cost_usd numeric, measured_jobs bigint, p95_seconds numeric)
language sql stable security invoker set search_path='' as $$
  with costs as (
    select s.job_id,sum((s.response->'usage'->>'cost')::numeric) cost
    from postspark.mare_editorial_steps s
    where jsonb_typeof(s.response->'usage'->'cost')='number' group by s.job_id
  ), scoped as (
    select j.*,coalesce(c.cost,case when jsonb_typeof(j.receipt->'usage'->'cost')='number'
      then (j.receipt->'usage'->>'cost')::numeric end) cost
    from postspark.mare_jobs j left join costs c on c.job_id=j.id
    where j.created_at>=now()-make_interval(days=>greatest(1,least(p_days,90))) and j.status<>'quoted'
  )
  select j.operation,count(*),count(*) filter(where status='ready'),
    count(*) filter(where status in ('running','queued','reconciling')),count(*) filter(where status='failed'),
    coalesce(sum(sparks) filter(where status='ready'),0),sum(cost),count(cost),
    round((percentile_cont(0.95) within group(order by extract(epoch from finished_at-started_at))
      filter(where finished_at is not null))::numeric,1)
  from scoped j group by j.operation order by j.operation
$$;
revoke all on function postspark.mare_operational_summary(integer) from public,anon,authenticated;
grant execute on function postspark.mare_operational_summary(integer) to service_role;

create function postspark.mare_media_summary()
returns table(asset_bytes numeric,proxied_bytes numeric,signed_reads numeric)
language sql stable security invoker set search_path='' as $$
  select (select coalesce(sum(size_bytes+playback_bytes),0) from postspark.mare_assets),
    coalesce(sum(d.proxied_bytes),0),coalesce(sum(d.signed_reads),0)
  from postspark.mare_delivery_daily d
  where d.day between (now() at time zone 'UTC')::date-6 and (now() at time zone 'UTC')::date
$$;
revoke all on function postspark.mare_media_summary() from public,anon,authenticated;
grant execute on function postspark.mare_media_summary() to service_role;
