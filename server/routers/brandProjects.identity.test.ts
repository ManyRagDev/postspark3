import { beforeEach, expect, it, vi } from "vitest";
import { identityFixture } from "@shared/visualIdentity.fixture";
const h = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  interpret: vi.fn(),
  media: vi.fn(),
}));
vi.mock("../db", () => ({
  getBrandProjectById: h.read,
  saveBrandProjectIdentity: h.save,
  getBrandProjectsByUser: vi.fn(),
  upsertBrandProject: vi.fn(),
  deleteBrandProject: vi.fn(),
}));
vi.mock("../visualIdentity", () => ({ cachedVisualIdentity: h.interpret }));
vi.mock("../mediaAssets", () => ({ loadOwnedMediaReference: h.media }));
vi.mock("../brandCapture", () => ({
  startCapture: vi.fn(),
  readCapture: vi.fn(),
  saveCapture: vi.fn(),
  publicCapture: vi.fn(),
}));
import { brandProjectsRouter } from "./brandProjects";
const owner = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const caller = (user: any = { id: owner, role: "user" }) =>
  brandProjectsRouter.createCaller({ user, req: {} as any, res: {} as any });
beforeEach(() => {
  vi.clearAllMocks();
  h.read.mockResolvedValue(undefined);
  h.interpret.mockResolvedValue(identityFixture());
  h.save.mockImplementation(async (_owner, body) => ({
    id: body.id,
    visual_identity: body.visualIdentity,
  }));
});
it("creates an identity-only project with a stable retry identity and updates only identity fields", async () => {
  const result = await caller().saveIdentity({
    creationId: id,
    name: "Marca",
    description: "Azul",
  });
  expect(result.id).toBe(id);
  expect(h.save).toHaveBeenCalledWith(owner, {
    id,
    name: "Marca",
    visualIdentity: identityFixture(),
  });
  expect(h.interpret).toHaveBeenCalledWith(owner, "Azul", undefined, undefined);
});
it("rejects anonymous requests and other owners' project IDs before inference", async () => {
  await expect(
    caller(null).saveIdentity({ id, name: "Marca", description: "Azul" })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    caller().saveIdentity({ id, name: "Marca", description: "Azul" })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(h.interpret).not.toHaveBeenCalled();
  expect(h.save).not.toHaveBeenCalled();
});
it("validates the logo owner and does not report failed remote persistence as success", async () => {
  h.read.mockResolvedValue({
    visual_identity: identityFixture(),
    compiled_document: "Contexto que deve permanecer no banco",
  });
  h.media.mockRejectedValueOnce(
    new Error("Referência privada não pertence ao proprietário")
  );
  await expect(
    caller().saveIdentity({
      id,
      name: "Marca",
      description: "Azul",
      logoUrl: "/api/post-media/another/logo",
    })
  ).rejects.toThrow("não pertence");
  expect(h.interpret).not.toHaveBeenCalled();
  h.save.mockRejectedValueOnce(new Error("Falha no banco"));
  await expect(
    caller().saveIdentity({ id, name: "Marca", description: "Azul" })
  ).rejects.toThrow("Falha no banco");
});
