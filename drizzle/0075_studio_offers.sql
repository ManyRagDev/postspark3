begin;

alter table postspark.profiles
  drop constraint if exists profiles_plan_check,
  add constraint profiles_plan_check
    check (plan in ('FREE','LITE','START','SOLO','PRO','PRO_PLUS','AGENCY','DEV','FOUNDER'));

alter table postspark.pro_checkout_attempts
  add column offer text not null default 'PRO'
  check (offer in ('SOLO','PRO','PRO_PLUS','AGENCY'));

create function postspark.prepare_studio_checkout(p_user_id uuid, p_cycle text, p_offer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_customer text;
  v_attempt postspark.pro_checkout_attempts%rowtype;
begin
  if p_cycle is null or p_cycle not in ('monthly','annual') or p_offer is null
     or p_offer not in ('SOLO','PRO','PRO_PLUS','AGENCY') or (p_cycle='annual' and p_offer<>'PRO') then
    raise exception 'Invalid billing cycle' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 74));
  select email into v_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if v_email is null or exists (select 1 from postspark.app_access where user_id=p_user_id and revoked_at is not null) then
    raise exception 'Membership unavailable' using errcode='PT403';
  end if;
  if exists (select 1 from postspark.pro_paid_periods where user_id=p_user_id and usable_until>now()) then
    raise exception 'Subscription already active' using errcode='PT409';
  end if;

  insert into postspark.profiles (id, email, plan, sparks)
    values (p_user_id, v_email, 'FREE', 0)
    on conflict (id) do nothing;
  select stripe_customer_id into v_customer from postspark.profiles where id=p_user_id;

  select * into v_attempt from postspark.pro_checkout_attempts
    where user_id=p_user_id and expires_at>now() order by expires_at desc limit 1;
  if not found then
    insert into postspark.pro_checkout_attempts (user_id, cycle, offer, expires_at)
      values (p_user_id, p_cycle, p_offer, date_trunc('second',now())+interval '40 minutes')
      returning * into v_attempt;
  end if;
  return jsonb_build_object('id',v_attempt.id,'cycle',v_attempt.cycle,'offer',v_attempt.offer,'expiresAt',v_attempt.expires_at,'customerId',v_customer);
end $$;

create or replace function postspark.prepare_pro_checkout(p_user_id uuid,p_cycle text)
returns jsonb language sql security definer set search_path = '' as $$
  select postspark.prepare_studio_checkout(p_user_id,p_cycle,'PRO');
$$;

create or replace function postspark.refill_pro_sparks(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_period record;
  v_granted integer := 0;
begin
  if not exists (
    select 1 from postspark.pro_paid_periods p
    join postspark.pro_checkout_attempts c on c.id=p.checkout_id
    where p.user_id=p_user_id and p.months_granted < case c.cycle when 'annual' then 12 else 1 end
      and ((p.period_start at time zone 'UTC') + make_interval(months=>p.months_granted)) at time zone 'UTC'
          <= now()
      and ((p.period_start at time zone 'UTC') + make_interval(months=>p.months_granted)) at time zone 'UTC'
          < p.usable_until
  ) then return 0; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 74));
  for v_period in
    select p.invoice_id, p.months_granted, c.offer, due.count as due_months
    from postspark.pro_paid_periods p
    join postspark.pro_checkout_attempts c on c.id=p.checkout_id
    cross join lateral (
      select count(*)::integer
      from generate_series(0,case c.cycle when 'annual' then 11 else 0 end) as months(i)
      where ((p.period_start at time zone 'UTC') + make_interval(months=>i)) at time zone 'UTC' <= now()
        and ((p.period_start at time zone 'UTC') + make_interval(months=>i)) at time zone 'UTC' < p.usable_until
    ) due
    where p.user_id=p_user_id and due.count>p.months_granted
  loop
    update postspark.pro_paid_periods set months_granted=v_period.due_months where invoice_id=v_period.invoice_id;
    v_granted := v_granted + (case v_period.offer when 'SOLO' then 600 when 'PRO_PLUS' then 4500 when 'AGENCY' then 4500 else 2000 end)*(v_period.due_months-v_period.months_granted);
  end loop;

  if v_granted>0 then
    update postspark.profiles set sparks=coalesce(sparks,0)+v_granted where id=p_user_id;
    if not found then raise exception 'Billing profile missing'; end if;
  end if;
  return v_granted;
end $$;

create or replace function postspark.apply_pro_paid_period(
  p_user_id uuid, p_checkout_id uuid, p_customer_id text, p_subscription_id text,
  p_invoice_id text, p_cycle text, p_period_start timestamptz, p_period_end timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_first_membership boolean;
  v_attempt postspark.pro_checkout_attempts%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 74));
  select * into v_attempt from postspark.pro_checkout_attempts
    where id=p_checkout_id and user_id=p_user_id and cycle=p_cycle;
  if not found or (v_attempt.subscription_id is not null and v_attempt.subscription_id<>p_subscription_id)
     or not exists (select 1 from postspark.profiles
                    where id=p_user_id and stripe_customer_id=p_customer_id) then
    raise exception 'Payment does not match PostSpark checkout' using errcode='PT409';
  end if;
  if exists (select 1 from postspark.pro_paid_periods p
       where (p.invoice_id=p_invoice_id or (p.subscription_id=p_subscription_id and p.period_start=p_period_start))
       and p.user_id=p_user_id and p.checkout_id=p_checkout_id and p.period_end=p_period_end) then
    return;
  end if;
  if exists (select 1 from postspark.pro_paid_periods p
    where p.user_id=p_user_id and p.subscription_id<>p_subscription_id
      and p.period_start<p_period_end and p.usable_until>p_period_start) then
    raise exception 'Overlapping paid subscription periods' using errcode='PT409';
  end if;

  select not exists (select 1 from postspark.pro_paid_periods where user_id=p_user_id) into v_first_membership;
  if v_attempt.subscription_id is null then
    update postspark.pro_checkout_attempts set subscription_id=p_subscription_id where id=p_checkout_id;
  end if;
  insert into postspark.pro_paid_periods (invoice_id,checkout_id,subscription_id,customer_id,user_id,period_start,period_end,usable_until)
    values(p_invoice_id,p_checkout_id,p_subscription_id,p_customer_id,p_user_id,p_period_start,p_period_end,
      least(p_period_end, v_attempt.ended_at));

  -- Retain the balance of pre-existing granted members. A first-time member
  -- starts with the paid allowance, even if shared Auth initialized a free profile.
  if v_first_membership and not exists (select 1 from postspark.app_access where user_id=p_user_id) then
    update postspark.profiles set sparks=0 where id=p_user_id and plan in ('FREE','START');
  end if;
  if p_period_start<=now() and least(p_period_end, v_attempt.ended_at)>now() then
    update postspark.profiles set plan=v_attempt.offer where id=p_user_id and coalesce(plan,'FREE') not in ('DEV','FOUNDER');
  end if;
  perform postspark.refill_pro_sparks(p_user_id);
end $$;

create or replace function postspark.end_pro_subscription(p_user_id uuid,p_checkout_id uuid,p_subscription_id text,p_ended_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 74));
  update postspark.pro_checkout_attempts set subscription_id=p_subscription_id, ended_at=least(ended_at,p_ended_at)
    where id=p_checkout_id and user_id=p_user_id and (subscription_id is null or subscription_id=p_subscription_id);
  if not found then return; end if;
  update postspark.pro_paid_periods set usable_until=least(usable_until,p_ended_at)
    where user_id=p_user_id and subscription_id=p_subscription_id;
  if found and not exists (
    select 1 from postspark.pro_paid_periods where user_id=p_user_id and period_start<=now() and usable_until>now()
  ) then
    update postspark.profiles set plan='FREE' where id=p_user_id and plan in ('SOLO','PRO','PRO_PLUS','AGENCY');
  end if;
end $$;

create or replace function postspark.get_pro_membership(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object(
    'cycle',c.cycle,'plan',c.offer,'paidUntil',p.usable_until,'customerId',p.customer_id,
    'active',p.period_start<=now() and p.usable_until>now()
  )
  from postspark.pro_paid_periods p join postspark.pro_checkout_attempts c on c.id=p.checkout_id
  where p.user_id=p_user_id
  order by (p.period_start<=now() and p.usable_until>now()) desc, p.usable_until desc limit 1),'{}'::jsonb);
$$;

create function postspark.studio_usage_summary(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with paid as (
    select p.period_start,p.usable_until,p.months_granted,c.cycle
    from postspark.pro_paid_periods p join postspark.pro_checkout_attempts c on c.id=p.checkout_id
    where p.user_id=p_user_id and p.period_start<=now() and p.usable_until>now()
    order by p.usable_until desc limit 1
  ), current_quota as (
    select ((period_start at time zone 'UTC')+make_interval(months=>greatest(months_granted-1,0))) at time zone 'UTC' as cycle_start,
      case when cycle='annual' and months_granted<12
        then least(usable_until,((period_start at time zone 'UTC')+make_interval(months=>months_granted)) at time zone 'UTC')
        else usable_until end as next_refill
    from paid
  )
  select jsonb_build_object('nextRefill',q.next_refill,'completedRounds',(
    select count(*) from postspark.generation_v5_requests r
    where r.owner_id=p_user_id and r.created_at>=q.cycle_start and r.status in ('partial','completed')
  )) from current_quota q;
$$;

revoke all on function postspark.studio_usage_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function postspark.studio_usage_summary(uuid) to service_role;
revoke all on function postspark.prepare_studio_checkout(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function postspark.prepare_studio_checkout(uuid,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
