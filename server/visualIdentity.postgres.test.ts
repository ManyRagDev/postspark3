import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    "CREATE SCHEMA postspark; CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role; GRANT USAGE ON SCHEMA postspark TO authenticated,service_role;"
  );
  await pg.exec(readFileSync("drizzle/0039_brand_projects.sql", "utf8"));
  await pg.exec(
    "ALTER TABLE postspark.brand_projects ADD COLUMN capture jsonb, ADD COLUMN visual_preferences jsonb; ALTER TABLE postspark.brand_projects ENABLE ROW LEVEL SECURITY; CREATE POLICY own_projects ON postspark.brand_projects TO authenticated USING (user_uuid = current_setting('request.owner',true)::uuid) WITH CHECK (user_uuid = current_setting('request.owner',true)::uuid);"
  );
  await pg.exec(
    readFileSync("drizzle/0072_project_visual_identity.sql", "utf8")
  );
});
afterAll(async () => {
  await pg.close();
});
async function upsert(user: string, input: Record<string, unknown>) {
  const result = await pg.query<{ value: any }>(
    "SELECT postspark.brand_project_upsert($1::uuid,$2::jsonb) AS value",
    [user, JSON.stringify(input)]
  );
  return result.rows[0].value;
}
it("persists identity-only projects, preserves all three project resources and refuses ownership changes", async () => {
  const created = await upsert(owner, {
    name: "Só identidade",
    visualIdentity: { version: 1, description: "Azul" },
  });
  expect(created.niche).toBe("");
  expect(created.visual_identity.description).toBe("Azul");
  const edited = await upsert(owner, {
    id: created.id,
    name: "Com contexto",
    niche: "Educação",
    compiledDocument: "Texto da marca",
    visualPreferences: { composition: "template" },
  });
  expect(edited.visual_identity).toEqual(created.visual_identity);
  const identityEdited = await upsert(owner, {
    id: created.id,
    name: edited.name,
    niche: edited.niche,
    compiledDocument: edited.compiled_document,
    visualIdentity: { version: 1, description: "Verde" },
  });
  expect(identityEdited.visual_preferences).toEqual({
    composition: "template",
  });
  expect(identityEdited.compiled_document).toBe("Texto da marca");
  const identityOnlyEdit = (
    await pg.query<{ value: any }>(
      "SELECT postspark.brand_project_save_identity($1::uuid,$2::jsonb) AS value",
      [
        owner,
        JSON.stringify({
          id: created.id,
          name: "Nova identidade",
          visualIdentity: { description: "Laranja" },
        }),
      ]
    )
  ).rows[0].value;
  expect(identityOnlyEdit.compiled_document).toBe("Texto da marca");
  expect(identityOnlyEdit.visual_preferences).toEqual({
    composition: "template",
  });
  await expect(
    upsert(other, { id: created.id, name: "Roubo", visualIdentity: {} })
  ).rejects.toThrow("Project not owned");
  await pg.exec(`SET ROLE authenticated; SET request.owner='${other}';`);
  expect(
    (await pg.query("SELECT visual_identity FROM postspark.brand_projects"))
      .rows
  ).toHaveLength(0);
  await expect(upsert(other, { name: "Via RPC proibida" })).rejects.toThrow(
    /permission denied/i
  );
  await pg.exec("RESET ROLE;");
});
