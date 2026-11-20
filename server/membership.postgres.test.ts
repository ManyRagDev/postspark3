import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PRO_MEMBERSHIP, type MembershipCycle } from "@shared/membership";

const monthlyUser = "00000000-0000-4000-8000-000000000001";
const annualUser = "00000000-0000-4000-8000-000000000002";
const manualUser = "00000000-0000-4000-8000-000000000003";
const unverifiedUser = "00000000-0000-4000-8000-000000000004";
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema postspark;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$
      select current_setting('request.jwt.claim.sub',true)::uuid
    $$;
    create table postspark.profiles (
      id uuid primary key references auth.users(id), email text not null,
      plan text not null default 'FREE', sparks integer not null default 150, stripe_customer_id text
    );
    create table postspark.brand_projects (user_uuid uuid);
    alter table postspark.brand_projects enable row level security;
    grant usage on schema postspark, auth to authenticated;
    grant select on postspark.brand_projects to authenticated;
    create policy own_project on postspark.brand_projects to authenticated
      using (user_uuid=auth.uid());
  `);
  await pg.exec(readFileSync("drizzle/0068_app_access.sql", "utf8"));
  await pg.exec(readFileSync("drizzle/0074_paid_memberships.sql", "utf8"));
  for (const [index, id] of [monthlyUser, annualUser, manualUser, unverifiedUser].entries()) {
    await pg.query(
      `insert into auth.users values ($1,$2,case when $3::boolean then now() end)`,
      [id, `member-${index}@example.invalid`, id !== unverifiedUser]
    );
  }
});

afterAll(async () => {
  await pg?.close();
});

async function value<T>(sql: string, values: unknown[] = []) {
  return (await pg.query<{ value: T }>(sql, values)).rows[0]?.value;
}

const access = (id: string) =>
  value<boolean>("select postspark.has_app_access($1) as value", [id]);
const balance = (id: string) =>
  value<number>("select sparks as value from postspark.profiles where id=$1", [id]);

async function prepare(id: string, cycle: MembershipCycle) {
  return (await value<{ id: string; cycle: MembershipCycle }>(
    "select postspark.prepare_pro_checkout($1,$2) as value", [id, cycle]
  ))!;
}

async function pay(id: string, attempt: Awaited<ReturnType<typeof prepare>>, invoice: string, start: string, end: string) {
  await pg.query(
    "select postspark.apply_pro_paid_period($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, attempt.id, `cus_${id}`, `sub_${id}`, invoice, attempt.cycle, start, end]
  );
}

const monthlyQuota = PRO_MEMBERSHIP.sparksPerMonth;

it("holds the new member at zero until a matching paid invoice and credits replayed events once", async () => {
  await expect(prepare(unverifiedUser, "monthly")).rejects.toThrow("Membership unavailable");
  const attempt = await prepare(monthlyUser, "monthly");
  expect((await prepare(monthlyUser, "annual"))).toEqual(attempt);
  expect(await access(monthlyUser)).toBe(false);
  expect(await balance(monthlyUser)).toBe(0);
  await pg.query("insert into postspark.brand_projects values ($1)", [monthlyUser]);
  await pg.exec(`set role authenticated; set request.jwt.claim.sub='${monthlyUser}';`);
  expect(await value<number>("select count(*)::int as value from postspark.brand_projects")).toBe(0);
  await expect(prepare(monthlyUser, "monthly")).rejects.toThrow("permission denied");
  await pg.exec("reset role;");

  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 28 * 86400_000).toISOString();
  await expect(pay(annualUser, attempt, "in_wrong", start, end)).rejects.toThrow("does not match");
  await pg.query("update postspark.profiles set stripe_customer_id=$1 where id=$2", [`cus_${monthlyUser}`, monthlyUser]);
  await Promise.all([
    pay(monthlyUser, attempt, "in_monthly", start, end),
    pay(monthlyUser, attempt, "in_monthly", start, end),
  ]);
  expect(await access(monthlyUser)).toBe(true);
  expect(await balance(monthlyUser)).toBe(monthlyQuota);
  await expect(prepare(monthlyUser, "monthly")).rejects.toThrow("Subscription already active");
  await pg.exec("set role authenticated;");
  expect(await value<number>("select count(*)::int as value from postspark.brand_projects")).toBe(1);
  await pg.exec("reset role;");
});

it("issues annual credits by elapsed month and revokes cancelled access even after a payment replay", async () => {
  const attempt = await prepare(annualUser, "annual");
  await pg.query("update postspark.profiles set stripe_customer_id=$1 where id=$2", [`cus_${annualUser}`, annualUser]);
  const { start, end } = (await pg.query<{ start: string; end: string }>(`
    select (now()-interval '2 months 1 day')::text as start,
           (now()-interval '2 months 1 day'+interval '1 year')::text as "end"
  `)).rows[0];
  await pay(annualUser, attempt, "in_annual", start, end);
  expect(await balance(annualUser)).toBe(3 * monthlyQuota);
  expect(await value("select postspark.refill_pro_sparks($1) as value", [annualUser])).toBe(0);

  await pg.query("select postspark.end_pro_subscription($1,$2,$3,now())", [annualUser, attempt.id, `sub_${annualUser}`]);
  await pay(annualUser, attempt, "in_annual", start, end);
  expect(await access(annualUser)).toBe(false);
  expect(await balance(annualUser)).toBe(3 * monthlyQuota);
  expect(await value("select plan as value from postspark.profiles where id=$1", [annualUser])).toBe("FREE");
});

it("keeps an existing manual grant and balance without a Stripe subscription", async () => {
  await pg.query("insert into postspark.app_access(user_id,reason) values ($1,'legacy')", [manualUser]);
  await pg.query("insert into postspark.profiles(id,email,plan,sparks) values ($1,'manual@example.invalid','FOUNDER',700)", [manualUser]);
  expect(await access(manualUser)).toBe(true);
  expect(await value("select postspark.refill_pro_sparks($1) as value", [manualUser])).toBe(0);
  expect(await balance(manualUser)).toBe(700);
});
