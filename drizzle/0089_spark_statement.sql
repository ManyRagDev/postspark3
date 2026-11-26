begin;
-- Balance changes cover subscription grants, top-ups, adjustments and paid jobs,
-- including the alternate reservation ledger. A reservation alone changes no balance.
create table postspark.spark_balance_entries (
  id bigint generated always as identity primary key,
  payer uuid not null references postspark.profiles(id) on delete cascade,
  recorded_at timestamptz not null default clock_timestamp(),
  delta bigint not null check(delta <> 0),
  balance bigint not null
);
create index spark_balance_entries_payer_page on postspark.spark_balance_entries(payer, id desc);
alter table postspark.spark_balance_entries enable row level security;
revoke all on postspark.spark_balance_entries from public,anon,authenticated,service_role;

create function postspark.record_spark_balance_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous bigint := 0;
begin
  if tg_op = 'UPDATE' then previous := coalesce(old.sparks,0); end if;
  if previous <> coalesce(new.sparks,0) then
    insert into postspark.spark_balance_entries(payer,delta,balance)
    values (new.id,coalesce(new.sparks,0)::bigint-previous,coalesce(new.sparks,0));
  end if;
  return null;
end $$;
revoke all on function postspark.record_spark_balance_change() from public,anon,authenticated,service_role;
create trigger record_spark_balance_change after insert or update of sparks on postspark.profiles
for each row execute function postspark.record_spark_balance_change();

create function postspark.read_spark_statement(p_payer uuid,p_before bigint default null)
returns table(cursor text, occurred_at timestamptz, delta bigint, balance bigint)
language sql stable security definer set search_path='' as $$
  select e.id::text,e.recorded_at,e.delta,e.balance from postspark.spark_balance_entries e
  where e.payer=p_payer and (p_before is null or e.id<p_before)
  order by e.id desc limit 21;
$$;
revoke all on function postspark.read_spark_statement(uuid,bigint) from public,anon,authenticated;
grant execute on function postspark.read_spark_statement(uuid,bigint) to service_role;
commit;
