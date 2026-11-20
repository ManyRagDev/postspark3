begin;

-- Observation runs on demand after terminal delivery. Only expose the small
-- projections required by the administrator, including families with zero uses.
create function postspark.design_frequency_receipts(p_limit integer, p_before timestamptz)
returns table (receipt jsonb)
language sql stable security invoker set search_path = '' as $$
  with sample as materialized (
    select r.id, r.catalog_revision, r.input, r.prepared, r.proposals, r.created_at
    from postspark.generation_v5_requests r
    where r.status in ('completed','partial','failed','cancelled')
      and r.created_at < coalesce(p_before, statement_timestamp())
    order by r.created_at desc, r.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  select jsonb_build_object(
    'catalog', r.catalog_revision, 'format', r.input->>'postMode',
    'slides', case when r.input->>'postMode' = 'static' then '1' else coalesce(r.input->>'slideCount','5') end,
    'media', r.input->>'allowAiImages', 'policy', r.input->>'selectionPolicy',
    'imageObligation', r.prepared#>>'{imageObligation,policy}',
    'contentPhoto', case
      when r.prepared#>>'{preservedPhoto,url}' is not null or
        jsonb_path_exists(r.input, '$.sources[*] ? (@.kind == "image" && @.purpose == "content")') then 'yes'
      when r.input->>'inputType' = 'image' and not (r.input ? 'sources') then 'unknown'
      else 'no' end,
    'selector', plan->>'proposalSelectionVersion', 'electionVersion', election->>'version',
    'mediaVersion', c.result->>'existingMediaPolicyVersion',
    'registered', jsonb_path_query_array(c.result, '$.coverage.entries[*].family ? (@.type() == "string")'),
    'eligible', election->'candidates', 'evaluated', jsonb_path_query_array(election->'ranking', '$[*].id'),
    'hasSlots', jsonb_typeof(plan->'slots') = 'array',
    'selected', (select jsonb_agg(jsonb_build_object('slot',s->'slot','candidate',s->'candidateId'))
                 from jsonb_array_elements(plan->'slots') s where s->>'status' = 'viable'),
    'delivered', (select jsonb_agg(jsonb_build_object('slot',p->'slot','family',p#>'{bundle,family}'))
                  from jsonb_array_elements(r.proposals) p where p->>'status' = 'ready')
  )
  from sample r
  left join postspark.generation_v5_operations c
    on c.request_id = r.id and c.operation_key = 'prepare:catalog' and c.state = 'completed'
  cross join lateral (select r.prepared->'planning' as plan) planning
  cross join lateral (select plan->'familyElection' as election) family
  order by r.created_at desc, r.id desc
$$;

revoke all on function postspark.design_frequency_receipts(integer,timestamptz) from public, anon, authenticated;
grant execute on function postspark.design_frequency_receipts(integer,timestamptz) to service_role;
commit;
