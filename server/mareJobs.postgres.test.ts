import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("reserva uma vez, confirma ou devolve os Sparks e deduplica o render incluído", async () => {
  const db = new PGlite();
  const actor = randomUUID();
  try {
    await db.exec(`create schema postspark; create role anon; create role authenticated; create role service_role;
      create table postspark.posts(canvas_model jsonb);
      create table postspark.mare_anchors(id uuid primary key);
      create table postspark.mare_assets(size_bytes bigint,playback_bytes bigint);
      create table postspark.mare_delivery_daily(day date,proxied_bytes bigint,signed_reads bigint);
      create table postspark.profiles(id uuid primary key,sparks integer not null);
      create function postspark.agency_billing_owner(uuid,uuid) returns uuid language sql as $$select $1$$;`);
    await db.query("insert into postspark.profiles values($1,6)", [actor]);
    for (const migration of [
      "0014_spark_reservations",
      "0085_mare_job_billing",
      "0086_mare_editorial",
      "0088_mare_operations",
    ])
      await db.exec(
        await readFile(
          new URL("../drizzle/" + migration + ".sql", import.meta.url),
          "utf8"
        )
      );
    for (const success of [true, false]) {
      const id = randomUUID();
      await db.query(
        "insert into postspark.mare_jobs(id,actor,payer,operation,payload,sparks,tariff) values($1,$2,$2,'edit','{}',3,'test')",
        [id, actor]
      );
      for (let i = 0; i < 2; i++)
        await db.query("select postspark.mare_start_job($1,$2)", [actor, id]);
      expect(
        (await db.query("select id from postspark.mare_claim_job()")).rows
      ).toEqual([{ id }]);
      for (let i = 0; i < 2; i++)
        await db.query(
          "select postspark.mare_finish_job($1,$2,'application/json','{}',$3)",
          [id, success ? "result" : null, success ? null : "falhou"]
        );
    }
    expect(
      (
        await db.query(
          "select status,amount as sparks from postspark.spark_reservations order by status"
        )
      ).rows
    ).toEqual([
      { status: "committed", sparks: 3 },
      { status: "refunded", sparks: 3 },
    ]);
    expect(
      (
        await db.query("select sparks from postspark.profiles where id=$1", [
          actor,
        ])
      ).rows
    ).toEqual([{ sparks: 3 }]);
    const expensive = randomUUID();
    await db.query(
      "insert into postspark.mare_jobs(id,actor,payer,operation,payload,sparks,tariff) values($1,$2,$2,'edit','{}',4,'test')",
      [expensive, actor]
    );
    await expect(
      db.query("select postspark.mare_start_job($1,$2)", [actor, expensive])
    ).rejects.toThrow("Sparks insuficientes");
    const summary = await db.query(
      "select operation,delivered::int,failed::int,charged_sparks::int from postspark.mare_operational_summary(7)"
    );
    expect(summary.rows).toEqual([
      { operation: "edit", delivered: 1, failed: 1, charged_sparks: 3 },
    ]);
    const admit = (fingerprint: string) =>
      db.query(
        "select postspark.mare_admit_render($1,$1,null,'{}',$2,1) as id",
        [actor, fingerprint]
      );
    expect((await admit("first")).rows).toEqual((await admit("first")).rows);
    await expect(admit("second")).rejects.toThrow("Franquia");
    const first = (await admit("first")).rows[0] as { id: string };
    expect(
      (
        await db.query(
          "select postspark.mare_cancel_render($1,$2) as cancelled",
          [randomUUID(), first.id]
        )
      ).rows
    ).toEqual([{ cancelled: null }]);
    expect(
      (
        await db.query(
          "select postspark.mare_cancel_render($1,$2) as cancelled",
          [actor, first.id]
        )
      ).rows
    ).toEqual([{ cancelled: true }]);
    expect((await admit("second")).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 20000);
