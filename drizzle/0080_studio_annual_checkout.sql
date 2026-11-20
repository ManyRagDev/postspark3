begin;

create or replace function postspark.prepare_studio_checkout(p_user_id uuid, p_cycle text, p_offer text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_customer text;
  v_attempt postspark.pro_checkout_attempts%rowtype;
begin
  if p_cycle is null or p_cycle not in ('monthly','annual') or p_offer is null
     or p_offer not in ('SOLO','PRO','PRO_PLUS','AGENCY') then
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

notify pgrst, 'reload schema';
commit;
