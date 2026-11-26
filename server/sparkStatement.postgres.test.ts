import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it("records a change exactly once, rolls back with its charge and isolates each payer", async () => {
  const db = new PGlite();
  const owner = randomUUID(),
    editor = randomUUID();
  try {
    await db.exec(`create schema postspark; create role anon; create role authenticated; create role service_role;
      grant usage on schema postspark to anon,authenticated,service_role;
      create table postspark.profiles(id uuid primary key,sparks integer)`);
    await db.query("insert into postspark.profiles values ($1,40),($2,12)", [
      owner,
      editor,
    ]);
    await db.exec(
      await readFile(
        new URL("../drizzle/0089_spark_statement.sql", import.meta.url),
        "utf8"
      )
    );
    await db.query(
      "update postspark.profiles set sparks=sparks-3 where id=$1",
      [owner]
    );
    await db.exec("update postspark.profiles set sparks=sparks");
    await db.query(
      "update postspark.profiles set sparks=sparks+600 where id=$1",
      [editor]
    );
    await db.exec("begin; update postspark.profiles set sparks=0; rollback");
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await expect(
        db.query("select * from postspark.read_spark_statement($1)", [owner])
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select * from postspark.spark_balance_entries")
      ).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const query =
      "select delta,balance,cursor from postspark.read_spark_statement($1,$2)";
    const ownerRows = (
      await db.query<{ delta: number; balance: number; cursor: string }>(
        query,
        [owner, null]
      )
    ).rows;
    expect(ownerRows).toEqual([
      { cursor: expect.any(String), delta: -3, balance: 37 },
    ]);
    expect((await db.query(query, [owner, ownerRows[0].cursor])).rows).toEqual(
      []
    );
    expect((await db.query(query, [editor, null])).rows).toEqual([
      { cursor: expect.any(String), delta: 600, balance: 612 },
    ]);
  } finally {
    await db.close();
  }
});
