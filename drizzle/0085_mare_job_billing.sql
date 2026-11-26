-- Durable quote, execution and settlement for authenticated Maré operations.
create table postspark.mare_jobs (
 id uuid primary key default gen_random_uuid(), actor uuid not null, payer uuid not null,
 anchor_id uuid references postspark.mare_anchors(id) on delete set null, workspace_id uuid,
 operation text not null check(operation in ('edit','narration','render')), payload jsonb not null,
 sparks integer not null check(sparks>=0), tariff text not null, status text not null default 'quoted'
 check(status in ('quoted','queued','running','ready','failed','reconciling','cancelled')),
 reservation uuid, ledger text, expires_at timestamptz not null default now()+interval '10 minutes',
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 progress integer not null default 0 check(progress between 0 and 100), attempts integer not null default 0, last_checked_at timestamptz, request_hash text, fingerprint text, result_key text, mime text, receipt jsonb, error text
);
create unique index mare_paid_active_request on postspark.mare_jobs(actor, request_hash)
 where request_hash is not null and status in ('quoted','queued','running','reconciling');
create index mare_jobs_queue on postspark.mare_jobs(created_at) where status='queued';
create unique index mare_render_reuse on postspark.mare_jobs(actor,fingerprint) where fingerprint is not null and status not in ('failed','cancelled');
alter table postspark.mare_jobs enable row level security;
revoke all on postspark.mare_jobs from public,anon,authenticated;
grant select,insert,update,delete on postspark.mare_jobs to service_role;

create function postspark.mare_start_job(p_actor uuid,p_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare j postspark.mare_jobs%rowtype; held uuid; entry jsonb; family text;
begin
 select * into strict j from postspark.mare_jobs where id=p_id and actor=p_actor for update;
 if j.workspace_id is not null and postspark.agency_billing_owner(p_actor,j.workspace_id) is distinct from j.payer then
   raise exception 'Acesso à equipe revogado' using errcode='PT403';
 end if;
 if j.status<>'quoted' then return j.status; end if;
 if now()>j.expires_at then raise exception 'A cotação expirou' using errcode='PT409'; end if;
 if j.sparks>0 then
   if to_regprocedure('postspark.next_reserve_sparks_v2(uuid,text,integer)') is not null then
     family:='next';
     execute 'select to_jsonb(r) from postspark.next_reserve_sparks_v2($1,$2,$3) r' into entry using j.payer,'mare:'||j.id,j.sparks;
     if entry->>'status'='reserved' then
       held:=(entry->>'reservation_id')::uuid;
       execute 'update postspark.next_spark_reservations set expires_at=greatest(expires_at,now()+interval ''1 hour'') where id=$1 and user_uuid=$2 and status=''reserved''' using held,j.payer;
     end if;
   else
     family:='canonical';
     perform id from postspark.profiles where id=j.payer for update;
     execute 'select postspark.reserve_sparks($1,$2,$3,$4)' into held using j.payer,j.sparks,'mare:'||j.id,'Maré Studio';
   end if;
   if held is null then raise exception 'Sparks insuficientes' using errcode='PT402'; end if;
 end if;
 update postspark.mare_jobs set status='queued',reservation=held,ledger=family where id=j.id;
 return 'queued';
end $$;

create function postspark.mare_claim_job() returns setof postspark.mare_jobs
language plpgsql security invoker set search_path='' as $$
begin
 delete from postspark.mare_jobs where status='quoted' and expires_at<now()-interval '1 day';
 update postspark.mare_jobs set status='reconciling',error='Verificando a entrega com o provedor'
   where status='running' and started_at<now()-interval '10 minutes';
 return query update postspark.mare_jobs set status='running',attempts=attempts+1,started_at=now()
 where id=(select id from postspark.mare_jobs where status='queued' order by created_at for update skip locked limit 1)
 returning *;
end $$;

create function postspark.mare_finish_job(p_id uuid,p_key text,p_mime text,p_receipt jsonb,p_error text) returns void
language plpgsql security invoker set search_path='' as $$
declare j postspark.mare_jobs%rowtype; ok boolean; note text;
begin
 select * into strict j from postspark.mare_jobs where id=p_id for update;
 if j.status in ('ready','failed','cancelled') then return; end if;
 if j.status not in ('running','reconciling') then raise exception 'Operação não iniciada'; end if;
 note:=case when j.operation='firstCut' then 'Primeiro corte Maré' when j.operation='review' then 'Revisão editorial Maré' when j.operation='narration' then 'Narração de '||length(j.payload->>'text')||' caracteres' else 'Edição Maré por comando' end;
 if j.reservation is not null then
   if j.ledger='next' then
     if p_key is null then
       execute 'select postspark.next_refund_reservation_v2($1,$2)' into ok using j.reservation,p_error;
       if ok is distinct from true then
         execute 'select status in (''refunded'',''expired'') from postspark.next_spark_reservations where id=$1 and user_uuid=$2' into ok using j.reservation,j.payer;
       end if;
     else execute 'select postspark.next_commit_reservation_v2($1,$2,$3)' into ok using j.reservation,note,jsonb_build_object('mareJobId',j.id,'tariff',j.tariff); end if;
   else
     if p_key is null then execute 'select postspark.refund_spark_reservation($1,$2)' into ok using j.reservation,p_error;
     else execute 'select postspark.commit_spark_reservation($1,$2)' into ok using j.reservation,note||' '||j.id; end if;
   end if;
   if ok is distinct from true then raise exception 'Liquidação pendente'; end if;
 end if;
 update postspark.mare_jobs set status=case when p_key is null then 'failed' else 'ready' end,
 progress=case when p_key is not null then 100 else progress end,result_key=p_key,mime=p_mime,receipt=p_receipt,error=p_error,finished_at=now(),payload=case when j.operation in ('firstCut','review') then payload else '{}'::jsonb end where id=j.id;
end $$;
revoke all on function postspark.mare_start_job(uuid,uuid),postspark.mare_claim_job(),postspark.mare_finish_job(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function postspark.mare_start_job(uuid,uuid),postspark.mare_claim_job(),postspark.mare_finish_job(uuid,text,text,jsonb,text) to service_role;

create function postspark.mare_admit_render(p_actor uuid,p_payer uuid,p_workspace uuid,p_payload jsonb,p_fingerprint text,p_limit int)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('mare-render:'||p_payer,0));
 select id into job_id from postspark.mare_jobs where actor=p_actor and fingerprint=p_fingerprint and status not in ('failed','cancelled');
 if found then return job_id; end if;
 if p_limit is null or p_limit<1 or (select count(*) from postspark.mare_jobs where payer=p_payer and operation='render' and status not in ('failed','cancelled')
   and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')>=p_limit then
   raise exception 'Franquia de render esgotada' using errcode='PT429';
 end if;
 insert into postspark.mare_jobs(actor,payer,workspace_id,operation,payload,sparks,tariff,status,fingerprint)
 values(p_actor,p_payer,p_workspace,'render',p_payload,0,'HD incluído','queued',p_fingerprint) returning id into job_id;
 return job_id;
end $$;
revoke all on function postspark.mare_admit_render(uuid,uuid,uuid,jsonb,text,int) from public,anon,authenticated;
grant execute on function postspark.mare_admit_render(uuid,uuid,uuid,jsonb,text,int) to service_role;

alter table postspark.posts add column has_temporal_media boolean generated always as
 (coalesce(jsonb_path_exists(canvas_model,'$.slides[*].temporalMedia.*'),false)) stored;

create function postspark.mare_cancel_render(p_actor uuid,p_id uuid) returns boolean
language sql security invoker set search_path='' as $$
  update postspark.mare_jobs set status='cancelled',finished_at=now(),payload='{}'
    where id=p_id and actor=p_actor and operation='render' and sparks=0 and status in ('queued','running','reconciling')
    returning true
$$;
revoke all on function postspark.mare_cancel_render(uuid,uuid) from public,anon,authenticated;
grant execute on function postspark.mare_cancel_render(uuid,uuid) to service_role;
