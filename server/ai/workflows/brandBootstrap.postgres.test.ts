import { expect, it } from "vitest";
import { generationReleasePostgresFixture, releaseOwner } from "./generationReleasePostgres.fixture";

it("installs the release when the optional legacy brand feature was never installed", async () => {
  const pg = await generationReleasePostgresFixture({ withoutLegacyBrandProjects: true });
  try {
    await pg.exec("set role service_role");
    const project = (await pg.query<{ project: { id: string; name: string } }>(
      "select postspark.brand_project_upsert($1, $2::jsonb) as project",
      [releaseOwner, JSON.stringify({ name: "Independent brand", niche: "Services", structuredData: {}, compiledDocument: "Verified facts" })]
    )).rows[0].project;
    expect(project.name).toBe("Independent brand");
    await pg.exec("reset role; set role authenticated");
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [releaseOwner]);
    expect((await pg.query("select id from postspark.brand_projects")).rows).toEqual([{ id: project.id }]);
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", ["22222222-2222-4222-8222-222222222222"]);
    expect((await pg.query("select id from postspark.brand_projects")).rows).toEqual([]);
    await expect(pg.query("select postspark.brand_project_upsert($1, '{}'::jsonb)", [releaseOwner])).rejects.toThrow(/permission denied/);
  } finally {
    await pg.close();
  }
}, 30000);
