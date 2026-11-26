-- One reservation covers the complete editorial delivery (source, movie and report).
alter table postspark.mare_jobs drop constraint mare_jobs_operation_check;
alter table postspark.mare_jobs add check(operation in ('edit','narration','render','firstCut','review'));
alter table postspark.mare_jobs add column editorial_restarts smallint not null default 0;
create table postspark.mare_editorial_steps (
  job_id uuid not null references postspark.mare_jobs(id) on delete cascade,
  stage text not null check(stage in ('script','direction','review')),
  response jsonb, created_at timestamptz not null default now(), primary key(job_id,stage)
);
alter table postspark.mare_editorial_steps enable row level security;
revoke all on postspark.mare_editorial_steps from public,anon,authenticated;
grant select,insert,update,delete on postspark.mare_editorial_steps to service_role;
create function postspark.mare_resume_editorial(p_job uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update postspark.mare_jobs j set status='queued',error=null,editorial_restarts=editorial_restarts+1
  where j.id=p_job and j.status='reconciling' and j.operation in ('firstCut','review')
    and j.editorial_restarts=0 and j.started_at<now()-interval '10 minutes'
    and not exists(select 1 from postspark.mare_editorial_steps s where s.job_id=j.id and s.response is null);
  return found;
end $$;
revoke all on function postspark.mare_resume_editorial(uuid) from public,anon,authenticated;
grant execute on function postspark.mare_resume_editorial(uuid) to service_role;
