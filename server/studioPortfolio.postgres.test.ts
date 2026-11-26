import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PAID_PLAN_OFFERS } from "@shared/membership";

const starter = "10000000-0000-4000-8000-000000000001";
const solo = "10000000-0000-4000-8000-000000000002";
const second = "10000000-0000-4000-8000-000000000003";
const agency = "10000000-0000-4000-8000-000000000004";
const collaborator = "10000000-0000-4000-8000-000000000005";
const reviewer = "10000000-0000-4000-8000-000000000006";
const pro = "10000000-0000-4000-8000-000000000007";
const firstRun = "10000000-0000-4000-8000-000000000010";
const secondRun = "10000000-0000-4000-8000-000000000011";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema postspark;
    create table auth.users (id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table postspark.profiles(id uuid primary key,email text,plan text,sparks integer,stripe_customer_id text,
      constraint profiles_plan_check check(plan in ('FREE','LITE','PRO','AGENCY','DEV','FOUNDER')));
    create table postspark.brand_projects(id uuid primary key default gen_random_uuid(),user_uuid uuid not null);
    create table postspark.generation_v5_requests(id uuid primary key,owner_id uuid not null,input jsonb, proposals jsonb default '[]',
      status text default 'queued', created_at timestamptz default now());
  `);
  for(const migration of ["0014_spark_reservations","0068_app_access","0074_paid_memberships","0075_studio_offers","0076_start_pilot","0077_spark_refills","0078_annual_labs","0079_agency_collaboration","0080_studio_annual_checkout"]){
    await pg.exec(readFileSync(`drizzle/${migration}.sql`,"utf8"));
  }
  for(const [offset,id] of [starter,solo,second,agency,collaborator,reviewer,pro].entries())
    await pg.query("insert into auth.users values($1,$2,now())",[id,`pilot-${offset}@example.invalid`]);
});
afterAll(async () => { await pg?.close(); });
async function value<T>(sql: string, params: unknown[] = []) {
  const result = await pg.query<{ value: T }>(sql, params);
  return result.rows[0]?.value;
}
const balance=(id:string)=>value<number>("select sparks as value from postspark.profiles where id=$1",[id]);

it("limits START to enrolled identities, one round and a durable final export", async () => {
  expect(await value("select postspark.start_pilot_enroll($1,1) as value",[starter])).toBe(true);
  expect(await value("select postspark.start_pilot_enroll($1,1) as value",[second])).toBe(false);
  expect(await value("select postspark.has_app_access($1) as value",[starter])).toBe(false);
  expect(await value("select postspark.has_start_pilot($1) as value",[starter])).toBe(true);
  await expect(pg.query("insert into postspark.generation_v5_requests(id,owner_id,input) values($1,$2,$3)",
    [firstRun,starter,{inputType:"text",allowAiImages:true}])).rejects.toThrow("Generation unavailable");
  await pg.query("insert into postspark.generation_v5_requests(id,owner_id,input) values($1,$2,$3)",[firstRun,starter,{inputType:"text",allowAiImages:false}]);
  await expect(pg.query("insert into postspark.generation_v5_requests(id,owner_id,input) values($1,$2,$3)",
    [secondRun,starter,{inputType:"text",allowAiImages:false}])).rejects.toThrow("start_round_already_used");
  const freeze=(headline:string)=>value<{headline:string}>("select postspark.start_pilot_save_piece($1,$2,$3,true) as value",
    [starter,firstRun,{headline,provenance:{journey:{requestId:firstRun,proposalId:"proposal-1",revision:1}}}]);
  await expect(freeze("Before delivery")).rejects.toThrow("delivered START proposal");
  await pg.query("update postspark.generation_v5_requests set proposals=$2 where id=$1",[
    firstRun,JSON.stringify([{status:"ready",proposalId:"proposal-1",revision:1}]),
  ]);
  expect((await freeze("Original"))?.headline).toBe("Original");
  expect((await freeze("Trocado"))?.headline).toBe("Original");
});

it("credits the selected paid offer and applies a repeated refill payment only once", async () => {
  const attempt=await value<{id:string;offer:string}>("select postspark.prepare_studio_checkout($1,'monthly','SOLO') as value",[solo]);
  expect(attempt?.offer).toBe("SOLO");
  await pg.query("update postspark.profiles set stripe_customer_id='cus_solo' where id=$1",[solo]);
  await pg.query("select postspark.apply_pro_paid_period($1,$2,'cus_solo','sub_solo','in_solo','monthly',now()-interval '1 minute',now()+interval '1 month')",[solo,attempt?.id]);
  expect(await balance(solo)).toBe(600);
  expect(await value("select plan as value from postspark.profiles where id=$1",[solo])).toBe("SOLO");
  await pg.query("insert into postspark.brand_projects(user_uuid) values($1)",[solo]);
  await expect(pg.query("insert into postspark.brand_projects(user_uuid) values($1)",[solo])).rejects.toThrow("uma marca");
  const apply=()=>value("select postspark.apply_spark_refill($1,'cus_solo','pi_solo') as value",[solo]);
  expect(await apply()).toBe(true);
  expect(await apply()).toBe(true);
  expect(await balance(solo)).toBe(1200);
});

it("keeps annual PRO monthly grants and reports completed rounds in the current quota", async () => {
  const attempt = await value<{id:string}>("select postspark.prepare_pro_checkout($1,'annual') as value",[pro]);
  await pg.query("update postspark.profiles set stripe_customer_id='cus_pro' where id=$1",[pro]);
  await pg.query("select postspark.apply_pro_paid_period($1,$2,'cus_pro','sub_pro','in_pro','annual',now()-interval '40 days',now()+interval '325 days')",[pro,attempt?.id]);
  expect(await balance(pro)).toBe(4000);
  await pg.query("insert into postspark.generation_v5_requests(id,owner_id,status) values($1,$2,'completed')",[secondRun,pro]);
  const usage = await value<{completedRounds:number;nextRefill:string}>("select postspark.studio_usage_summary($1) as value",[pro]);
  expect(usage?.completedRounds).toBe(1);
  expect(Date.parse(usage!.nextRefill)).toBeGreaterThan(Date.now());
});

it("keeps annual checkout preparation restricted to the backend", async () => {
  for (const [role, allowed] of [["anon", false], ["authenticated", false], ["service_role", true]] as const) {
    expect(await value(
      "select has_function_privilege($1,'postspark.prepare_studio_checkout(uuid,text,text)','execute') as value", [role],
    )).toBe(allowed);
  }
});

it.each(["SOLO", "PRO_PLUS", "AGENCY"] as const)("credits the %s annual allowance once per due month", async plan => {
  const { rows: [{ id }] } = await pg.query<{ id: string }>(
    "insert into auth.users values(gen_random_uuid(),$1,now()) returning id", [`annual-${plan}@example.invalid`],
  );
  const attempt = await value<{ id: string; cycle: string; offer: string }>(
    "select postspark.prepare_studio_checkout($1,'annual',$2) as value", [id, plan],
  );
  expect(attempt).toMatchObject({ cycle: "annual", offer: plan });
  expect(await balance(id)).toBe(0);

  const customer = `cus_annual_${plan}`;
  const invoice = `in_annual_${plan}`;
  const paidAt = new Date(Date.now() - 60_000);
  const paidUntil = new Date(paidAt);
  paidUntil.setUTCFullYear(paidUntil.getUTCFullYear() + 1);
  await pg.query("update postspark.profiles set stripe_customer_id=$2 where id=$1", [id, customer]);
  const applyInvoice = () => pg.query("select postspark.apply_pro_paid_period($1,$2,$3,$4,$5,'annual',$6,$7)",
    [id, attempt?.id, customer, `sub_annual_${plan}`, invoice, paidAt.toISOString(), paidUntil.toISOString()]);
  await applyInvoice();
  await applyInvoice();
  const allowance = PAID_PLAN_OFFERS[plan].sparksPerMonth;
  expect(await balance(id)).toBe(allowance);
  expect(await value("select postspark.get_pro_membership($1) as value", [id]))
    .toMatchObject({ plan, cycle: "annual", active: true });

  // Move the stored period back to exercise the next monthly anniversary.
  await pg.query(`update postspark.pro_paid_periods set period_start=period_start-interval '40 days',
    period_end=period_end-interval '40 days', usable_until=usable_until-interval '40 days' where invoice_id=$1`, [invoice]);
  expect(await value("select postspark.refill_pro_sparks($1) as value", [id])).toBe(allowance);
  expect(await value("select postspark.refill_pro_sparks($1) as value", [id])).toBe(0);
  expect(await balance(id)).toBe(2 * allowance);
});

it("isolates a workspace, funds editors with the owner wallet and protects review revisions", async () => {
  const attempt = await value<{id:string}>("select postspark.prepare_studio_checkout($1,'monthly','AGENCY') as value",[agency]);
  await pg.query("update postspark.profiles set stripe_customer_id='cus_agency' where id=$1",[agency]);
  await pg.query("select postspark.apply_pro_paid_period($1,$2,'cus_agency','sub_agency','in_agency','monthly',now()-interval '1 minute',now()+interval '1 month')",[agency,attempt?.id]);
  expect(await balance(agency)).toBe(4500);
  const workspace = await value<string>("select postspark.agency_create_workspace($1,'Design') as value",[agency]);
  const invite = (email:string,role:string) =>
    value<string>("select postspark.agency_invite($1,$2,$3,$4) as value",[agency,workspace,email,role]);
  const accept = (person:string,token:string) =>
    value<string>("select postspark.agency_accept_invite($1,$2) as value",[person,token]);
  const editorInvite = await invite("pilot-4@example.invalid","editor");
  await expect(accept(second,editorInvite)).rejects.toThrow();
  expect(await accept(collaborator,editorInvite)).toBe(workspace);
  expect(await accept(reviewer,await invite("pilot-5@example.invalid","reviewer"))).toBe(workspace);
  await expect(invite("pilot-2@example.invalid","editor")).rejects.toThrow("seats exhausted");

  const wallet = (user:string) => value("select postspark.agency_billing_owner($1,$2) as value",[user,workspace]);
  expect(await wallet(collaborator)).toBe(agency);
  expect(await wallet(reviewer)).toBeNull();
  expect(await wallet(second)).toBeNull();

  const ownedMedia = `/api/post-media/${collaborator}/${"a".repeat(64)}`;
  const foreignMedia = `/api/post-media/${second}/${"b".repeat(64)}`;
  const save = (user:string,media:string) => value<{id:string}>(
    "select postspark.agency_save_project($1,$2,null,null,'Arte',$3) as value",[user,workspace,{media}],
  );
  await expect(save(collaborator,foreignMedia)).rejects.toThrow("Unshared media reference");
  await expect(save(reviewer,ownedMedia)).rejects.toThrow("Workspace editor required");
  const project = await save(collaborator,ownedMedia);
  const canRead = (user:string) => value("select postspark.agency_can_read_media($1,$2) as value",[user,ownedMedia]);
  expect(await canRead(reviewer)).toBe(true);
  expect(await canRead(second)).toBe(false);
  const review = (user:string,revision:number,status:string) => value<{status:string}>(
    "select postspark.agency_review_project($1,$2,$3,$4) as value",[user,project?.id,revision,status],
  );
  expect((await review(collaborator,1,"review"))?.status).toBe("review");
  await expect(review(collaborator,2,"approved")).rejects.toThrow("Approval not allowed");
  await expect(review(reviewer,1,"approved")).rejects.toThrow("changed");
  expect((await review(reviewer,2,"approved"))?.status).toBe("approved");
});


it("dispatches each image reservation once and charges only the delivered image", async () => {
  const actor="10000000-0000-4000-8000-000000000022";
  await pg.query("insert into postspark.profiles (id,email,plan,sparks) values($1,'image@example.invalid','PRO',100)",[actor]);
  expect(await value("select postspark.refill_pro_sparks($1) as value",[actor])).toBe(0);
  const reserve=(key:string)=>value<string>("select postspark.reserve_sparks($1,25,$2,'Geração de imagem IA') as value",[actor,key]);
  const delivered=await reserve("image-ok");
  expect(await reserve("image-ok")).toBe(delivered);
  const claim=(id:string)=>value("select postspark.claim_studio_image_dispatch($1) as value",[id]);
  expect(await claim(delivered!)).toBe(true);
  expect(await claim(delivered!)).toBe(false);
  expect(await balance(actor)).toBe(100);
  expect(await value("select postspark.commit_spark_reservation($1,'image:image-ok') as value",[delivered])).toBe(true);
  expect(await balance(actor)).toBe(75);
  const failed=await reserve("image-failed");
  expect(await claim(failed!)).toBe(true);
  expect(await value("select postspark.refund_spark_reservation($1,'provider unavailable') as value",[failed])).toBe(true);
  expect(await balance(actor)).toBe(75);
  expect((await pg.query("select status from postspark.spark_reservations where user_uuid=$1 order by status",[actor])).rows).toEqual([{status:"committed"},{status:"refunded"}]);
});
