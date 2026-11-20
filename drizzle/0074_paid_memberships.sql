begin;

create table postspark.pro_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle text not null check (cycle in ('monthly', 'annual')),
  expires_at timestamptz not null,
  subscription_id text unique,
  ended_at timestamptz
);
create index pro_checkout_attempts_owner on postspark.pro_checkout_attempts (user_id, expires_at desc);

create table postspark.pro_paid_periods (
  invoice_id text primary key,
  checkout_id uuid not null references postspark.pro_checkout_attempts(id) on delete cascade,
  subscription_id text not null,
  customer_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  usable_until timestamptz not null,
  months_granted integer not null default 0,
  unique (subscription_id, period_start),
  check (period_end > period_start and usable_until <= period_end),
  check (months_granted between 0 and 12)
);
create index pro_paid_periods_owner on postspark.pro_paid_periods (user_id, usable_until desc);

alter table postspark.pro_checkout_attempts enable row level security;
alter table postspark.pro_paid_periods enable row level security;
revoke all on postspark.pro_checkout_attempts, postspark.pro_paid_periods from public, anon, authenticated, service_role;

create function postspark.prepare_pro_checkout(p_user_id uuid, p_cycle text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_customer text;
  v_attempt postspark.pro_checkout_attempts%rowtype;
begin
  if p_cycle is null or p_cycle not in ('monthly','annual') then
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
    insert into postspark.pro_checkout_attempts (user_id, cycle, expires_at)
      values (p_user_id, p_cycle, date_trunc('second',now())+interval '40 minutes')
      returning * into v_attempt;
  end if;
  return jsonb_build_object('id',v_attempt.id,'cycle',v_attempt.cycle,'expiresAt',v_attempt.expires_at,'customerId',v_customer);
end $$;

-- Apply at most the due paid months. The invoice period and issued month
-- counter are the durable entitlement and credit receipt, respectively.
create function postspark.refill_pro_sparks(p_user_id uuid)
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
    select p.invoice_id, p.months_granted, due.count as due_months
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
    v_granted := v_granted + 2000*(v_period.due_months-v_period.months_granted);
  end loop;

  if v_granted>0 then
    update postspark.profiles set sparks=coalesce(sparks,0)+v_granted where id=p_user_id;
    if not found then raise exception 'Billing profile missing'; end if;
  end if;
  return v_granted;
end $$;

create function postspark.apply_pro_paid_period(
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
    update postspark.profiles set sparks=0 where id=p_user_id and plan='FREE';
  end if;
  if p_period_start<=now() and least(p_period_end, v_attempt.ended_at)>now() then
    update postspark.profiles set plan='PRO' where id=p_user_id and coalesce(plan,'FREE') not in ('DEV','FOUNDER');
  end if;
  perform postspark.refill_pro_sparks(p_user_id);
end $$;

create function postspark.end_pro_subscription(p_user_id uuid,p_checkout_id uuid,p_subscription_id text,p_ended_at timestamptz)
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
    update postspark.profiles set plan='FREE' where id=p_user_id and plan='PRO';
  end if;
end $$;

create function postspark.get_pro_membership(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object(
    'cycle',c.cycle,'paidUntil',p.usable_until,'customerId',p.customer_id,
    'active',p.period_start<=now() and p.usable_until>now()
  )
  from postspark.pro_paid_periods p join postspark.pro_checkout_attempts c on c.id=p.checkout_id
  where p.user_id=p_user_id
  order by (p.period_start<=now() and p.usable_until>now()) desc, p.usable_until desc limit 1),'{}'::jsonb);
$$;

create or replace function postspark.has_app_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from postspark.app_access where user_id=p_user_id and revoked_at is not null)
    and (
      exists (select 1 from postspark.app_access where user_id=p_user_id and revoked_at is null)
      or exists (select 1 from postspark.pro_paid_periods where user_id=p_user_id and period_start<=now() and usable_until>now())
    );
$$;

create or replace function postspark.has_current_app_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select postspark.has_app_access(auth.uid());
$$;

revoke all on function postspark.has_current_app_access() from public, anon, authenticated, service_role;
grant execute on function postspark.has_current_app_access() to authenticated;
comment on function postspark.has_app_access(uuid) is
  'Server-side access check. A manual grant or a paid period is required. A manual revocation takes precedence.';

-- Preserve ownership policies and apply the same gate to direct Auth reads.
do $$
declare v_table text;
begin
  foreach v_table in array array['brand_projects','brand_captures','generation_v5_requests'] loop
    if pg_catalog.to_regclass('postspark.' || v_table) is not null then
      execute pg_catalog.format('create policy paid_membership_gate on postspark.%I as restrictive for all to authenticated using ((select postspark.has_current_app_access())) with check ((select postspark.has_current_app_access()))', v_table);
    end if;
  end loop;
end $$;

revoke all on function postspark.prepare_pro_checkout(uuid,text),postspark.refill_pro_sparks(uuid),
  postspark.apply_pro_paid_period(uuid,uuid,text,text,text,text,timestamptz,timestamptz),
  postspark.end_pro_subscription(uuid,uuid,text,timestamptz),postspark.get_pro_membership(uuid)
  from public, anon, authenticated, service_role;
grant execute on function postspark.prepare_pro_checkout(uuid,text),postspark.refill_pro_sparks(uuid),
  postspark.apply_pro_paid_period(uuid,uuid,text,text,text,text,timestamptz,timestamptz),
  postspark.end_pro_subscription(uuid,uuid,text,timestamptz),postspark.get_pro_membership(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
