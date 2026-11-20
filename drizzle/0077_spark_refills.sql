begin;
create table postspark.spark_refill_receipts (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sparks integer not null check(sparks=600),
  credited_at timestamptz not null default now()
);
alter table postspark.spark_refill_receipts enable row level security;
revoke all on postspark.spark_refill_receipts from public,anon,authenticated,service_role;

create function postspark.apply_spark_refill(p_user_id uuid,p_customer_id text,p_payment_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from postspark.profiles where id=p_user_id and stripe_customer_id=p_customer_id) then
    raise exception 'Spark refill customer mismatch' using errcode='PT409';
  end if;
  insert into postspark.spark_refill_receipts values(p_payment_id,p_user_id,600,now()) on conflict(payment_id) do nothing;
  if not found then
    return exists (select 1 from postspark.spark_refill_receipts where payment_id=p_payment_id and user_id=p_user_id);
  end if;
  update postspark.profiles set sparks=coalesce(sparks,0)+600 where id=p_user_id;
  if not found then raise exception 'Billing profile missing'; end if;
  return true;
end $$;

revoke all on function postspark.apply_spark_refill(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function postspark.apply_spark_refill(uuid,text,text) to service_role;
-- A reservation can be returned again on retry. Only one caller may dispatch it.
create table postspark.studio_image_dispatches (
  reservation_id uuid primary key,
  claimed_at timestamptz not null default now()
);
alter table postspark.studio_image_dispatches enable row level security;
revoke all on postspark.studio_image_dispatches from public,anon,authenticated,service_role;

create function postspark.claim_studio_image_dispatch(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  insert into postspark.studio_image_dispatches(reservation_id) values(p_reservation_id)
    on conflict(reservation_id) do nothing;
  return found;
end $$;

revoke all on function postspark.claim_studio_image_dispatch(uuid) from public,anon,authenticated,service_role;
grant execute on function postspark.claim_studio_image_dispatch(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
