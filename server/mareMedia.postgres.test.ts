import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

it("keeps revisions atomic, rejects foreign references and protects existing video from older editors", async () => {
  const db = new PGlite(),
    uid = randomUUID(),
    other = randomUUID(),
    packageId = randomUUID(),
    video = randomUUID(),
    anchor = randomUUID();
  try {
    await db.exec(`create schema postspark; create schema storage; create role anon;create role authenticated;create role service_role;
   create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint);
   create table postspark.posts(id serial primary key,user_uuid uuid,canvas_model jsonb,gallery_preview text,"updatedAt" timestamptz);
   create table postspark.agency_workspaces(id uuid primary key);
   create table postspark.agency_projects(id uuid primary key,workspace_id uuid,status text,revision int,canvas_model jsonb,updated_at timestamptz);
   create table postspark.agency_fixture_roles(actor uuid,workspace uuid,role text,primary key(actor,workspace));
   create function postspark.agency_workspace_role(uuid,uuid) returns text language sql as $$ select role from postspark.agency_fixture_roles where actor=$1 and workspace=$2 $$;`);
    for (const file of [
      "0067_post_revision",
      "0084_mare_media",
      "0087_mare_speech",
    ])
      await db.exec(
        readFileSync(
          new URL("../drizzle/" + file + ".sql", import.meta.url),
          "utf8"
        )
      );
    for (const [id, kind] of [
      [packageId, "project"],
      [video, "video"],
    ])
      await db.query(
        "insert into postspark.mare_assets(id,actor,kind,object_key,mime,size_bytes,sha256) values($1::uuid,$2,$3,$1::uuid::text,'test',1,'hash')",
        [id, uid, kind]
      );
    const admit = (actor: string, seconds: number) =>
      db.query("select postspark.mare_admit_speech($1,$2,$3,$4,30,'{}')", [
        randomUUID(),
        actor,
        video,
        seconds,
      ]);
    await expect(admit(other, 5)).rejects.toThrow("Video unavailable");
    await admit(uid, 22);
    await expect(admit(uid, 1)).rejects.toThrow("quota");
    await db.query(
      "update postspark.mare_speech_jobs set state='cancelled' where actor=$1",
      [uid]
    );
    await expect(admit(uid, 9)).rejects.toThrow("quota");
    await admit(uid, 8);
    const begin = (hash: string) =>
      db.query<{ session: { id: string } }>(
        "select postspark.mare_begin_upload($1,null,'video',$2,16,24) as session",
        [uid, hash]
      );
    const ticket = (await begin("a".repeat(64))).rows[0].session.id;
    expect((await begin("a".repeat(64))).rows[0].session.id).toBe(ticket);
    await expect(begin("b".repeat(64))).rejects.toThrow("Cota");
    await expect(
      db.query("select postspark.mare_resize_upload($1,$2,12,24)", [
        ticket,
        uid,
      ])
    ).rejects.toThrow("Cota");
    await db.query(
      "update postspark.mare_uploads set phase='queued' where id=$1",
      [ticket]
    );
    const claim = () =>
      db.query<{ id: string; lease: string }>(
        "select * from postspark.mare_claim_upload()"
      );
    const claimed = (await claim()).rows[0];
    expect(claimed.id).toBe(ticket);
    expect((await claim()).rows).toHaveLength(0);
    await db.query(
      "update postspark.mare_uploads set lease_until=now()-interval '1 second' where id=$1",
      [ticket]
    );
    expect((await claim()).rows[0].lease).not.toBe(claimed.lease);
    const ref = {
      kind: "mare",
      assetId: video,
      revisionId: packageId,
      projectId: randomUUID(),
      scope: "montage",
    };
    const before = { id: "d", slides: [{ id: "s" }] },
      after = {
        ...before,
        temporalMediaVersion: 1,
        slides: [{ id: "s", temporalMedia: { __background__: ref } }],
      };
    await db.query(
      "insert into postspark.posts(id,user_uuid,canvas_model) values(1,$1,$2)",
      [uid, JSON.stringify(before)]
    );
    await db.query(
      `insert into postspark.mare_anchors(id,actor,post_id,document_id,slide_id,slot_id,expected_revision,original_source,revision_id,video_asset_id,pending)
   values($1,$2,1,'d','s','__background__',1,'{"temporal":null,"image":null}',$3,$4,true)`,
      [anchor, uid, packageId, video]
    );
    const apply = (actor: string, rev: number) =>
      db.query(
        "select postspark.mare_apply_return($1,$2,$3,$4,$5,'s','__background__','{\"temporal\":null,\"image\":null}') as revision",
        [actor, anchor, packageId, rev, JSON.stringify(after)]
      );
    await expect(apply(other, 1)).rejects.toThrow();
    await expect(apply(uid, 9)).rejects.toThrow();
    expect((await apply(uid, 1)).rows).toEqual([{ revision: 2 }]);
    expect((await apply(uid, 1)).rows).toEqual([{ revision: 2 }]);
    await expect(
      db.query("update postspark.posts set canvas_model=$1 where id=1", [
        JSON.stringify(before),
      ])
    ).rejects.toThrow("Atualize");
    await expect(
      db.query(
        "insert into postspark.posts(id,user_uuid,canvas_model) values(2,$1,$2)",
        [other, JSON.stringify(after)]
      )
    ).rejects.toThrow("Invalid media");
    expect(
      (
        await db.query(
          "select revision,canvas_model from postspark.posts where id=1"
        )
      ).rows
    ).toEqual([{ revision: 2, canvas_model: after }]);

    const team = randomUUID(),
      teamPackage = randomUUID(),
      teamProject = randomUUID(),
      reviewer = randomUUID(),
      stranger = randomUUID();
    await db.query("insert into postspark.agency_workspaces values($1)", [
      team,
    ]);
    await db.query(
      "insert into postspark.agency_fixture_roles values($1,$4,'owner'),($2,$4,'editor'),($3,$4,'reviewer')",
      [uid, other, reviewer, team]
    );
    await db.query(
      "insert into postspark.mare_assets(id,actor,workspace_id,kind,object_key,mime,size_bytes,sha256) values($1,$2,$3,'project','teamfile','octet',12,'hash')",
      [teamPackage, uid, team]
    );
    const saveTeam = (actor: string, name: string, expected: string | null) =>
      db.query("select postspark.mare_save_project($1,$2,$3,$4,$5,$6)", [
        actor,
        teamProject,
        name,
        teamPackage,
        expected,
        team,
      ]);
    await saveTeam(uid, "Primeiro corte", null);
    await saveTeam(other, "Segunda edição", teamPackage);
    await expect(
      saveTeam(reviewer, "Sem permissão", teamPackage)
    ).rejects.toThrow("Editor required");
    const projects = (actor: string) =>
      db.query<{ id: string; name: string; workspaceId: string }>(
        "select * from postspark.mare_list_projects($1)",
        [actor]
      );
    expect((await projects(reviewer)).rows).toEqual([
      expect.objectContaining({
        id: teamProject,
        name: "Segunda edição",
        workspaceId: team,
      }),
    ]);
    expect((await projects(stranger)).rows).toHaveLength(0);
    await db.query(
      "delete from postspark.agency_fixture_roles where actor=$1 and workspace=$2",
      [reviewer, team]
    );
    expect((await projects(reviewer)).rows).toHaveLength(0);
    const secondPackage = randomUUID();
    await db.query(
      "insert into postspark.mare_assets(id,actor,kind,object_key,mime,size_bytes,sha256) values($1,$2,'project','new','octet',1,'new')",
      [secondPackage, uid]
    );
    await db.query(
      "update postspark.mare_anchors set revision_id=$1 where id=$2",
      [secondPackage, anchor]
    );
    await db.query("delete from postspark.posts where id=1");
    expect((await projects(uid)).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ anchorId: null, revisionId: secondPackage }),
      ])
    );
  } finally {
    await db.close();
  }
}, 30000);
