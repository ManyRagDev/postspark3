import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("preserves the winning document across two editors and isolates owners", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA postspark;
      CREATE TABLE postspark.posts(id integer PRIMARY KEY, user_uuid text NOT NULL,
        canvas_model jsonb NOT NULL, "updatedAt" timestamptz DEFAULT now());
      INSERT INTO postspark.posts VALUES (1,'owner-a','{"headline":"initial"}');`);
    await db.exec(readFileSync(new URL("../drizzle/0067_post_revision.sql", import.meta.url), "utf8"));
    const save = (owner: string, revision: number, headline: string) => db.query<{revision:number}>(
      `UPDATE postspark.posts SET canvas_model=$1::jsonb
       WHERE id=1 AND user_uuid=$2 AND revision=$3 RETURNING revision`,
      [JSON.stringify({headline}), owner, revision],
    );
    expect((await save("owner-b", 1, "intruder")).rows).toEqual([]);
    expect((await save("owner-a", 1, "editor one")).rows).toEqual([{revision:2}]);
    expect((await save("owner-a", 1, "stale editor two")).rows).toEqual([]);
    expect((await db.query("SELECT canvas_model,revision FROM postspark.posts WHERE id=1")).rows)
      .toEqual([{canvas_model:{headline:"editor one"},revision:2}]);
    // An older writer still invalidates all outstanding revisions.
    await db.exec(`UPDATE postspark.posts SET canvas_model='{"headline":"legacy"}' WHERE id=1`);
    expect((await save("owner-a", 2, "stale official")).rows).toEqual([]);
    expect((await save("owner-a", 3, "reopened")).rows).toEqual([{revision:4}]);
  } finally { await db.close(); }
});
