begin;
create table postspark.annual_lab_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check(feature='image_iris'),
  opted_in boolean not null,
  primary key(user_id,feature)
);
alter table postspark.annual_lab_preferences enable row level security;
revoke all on postspark.annual_lab_preferences from public,anon,authenticated;
grant select,insert,update on postspark.annual_lab_preferences to service_role;
create policy annual_lab_service on postspark.annual_lab_preferences for all to service_role using (true) with check (true);
notify pgrst, 'reload schema';
commit;
