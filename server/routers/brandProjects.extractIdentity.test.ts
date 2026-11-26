import { expect, it, vi } from "vitest";
import { brandProjectsRouter } from "./brandProjects";
import { identityFixture } from "@shared/visualIdentity.fixture";
import { arsenalHash } from "@shared/arsenalContent";
const db = vi.hoisted(() => ({ getBrandProjectById: vi.fn(), saveExtractedProjectIdentity: vi.fn() }));
vi.mock("../db", () => db);
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const caller = brandProjectsRouter.createCaller({ user: { id: owner } as any, req: {} as any, res: {} as any });
const postIds = [11,12,13,14,15];
const preferences = { composition: JSON.stringify({source:"design-extraction",postIds}),
  colors:["#123456","#234567","#FFFFFF","#56AB34","#FFDC10","#B6DE78"], fonts:["Inter"],personality:["Editorial"] };
it("promotes a historical kit once, preserving the registered identity and its owner", async () => {
  const previous = { ...identityFixture({ headingSize: 55 }), logoUrl: "/api/post-media/private/logo" };
  const record = { id, visual_preferences:preferences, visual_identity:previous, updated_at:"v1" };
  db.getBrandProjectById.mockResolvedValue(record);
  db.saveExtractedProjectIdentity.mockImplementation(async (_owner, _record, identity) => ({ id, visual_identity:identity }));
  const result = await caller.extractIdentity({id,postIds});
  expect(db.getBrandProjectById).toHaveBeenCalledWith(id,owner);
  const {revision,...body} = result.visualIdentity;
  expect(revision).toBe(arsenalHash(body));
  expect(body).toMatchObject({logoUrl:previous.logoUrl, description:previous.description, extractedFrom:{postIds},
    rules:{background:"#123456",text:"#FFFFFF",accent:"#56AB34",headingSize:55}});
  db.getBrandProjectById.mockResolvedValue({...record,visual_identity:result.visualIdentity});
  expect(await caller.extractIdentity({id,postIds})).toEqual(result);
  expect(db.saveExtractedProjectIdentity).toHaveBeenCalledTimes(1);
  await expect(caller.extractIdentity({id,postIds:[10]})).rejects.toMatchObject({code:"CONFLICT"});
  db.getBrandProjectById.mockResolvedValue(undefined);
  await expect(caller.extractIdentity({id,postIds})).rejects.toMatchObject({code:"NOT_FOUND"});
  expect(db.saveExtractedProjectIdentity).toHaveBeenCalledTimes(1);
});
