import { expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { identityFixture } from "@shared/visualIdentity.fixture";
import { freezeGenerationProject } from "@shared/projectEditorial";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
const h = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../db", () => ({
  getBrandProjectById: h.read,
  getDb: vi.fn(),
  getPostById: vi.fn(),
}));
import { pinFixedDesign } from "./fixedDesignSource";
const owner = "11111111-1111-4111-8111-111111111111";
it("pins the frozen project identity after an edit and checks both ownership and resource integrity", async () => {
  const previous = identityFixture({ accent: "#226633" }),
    current = identityFixture({ accent: "#FF0000" });
  h.read.mockResolvedValue({ id: owner, visual_identity: current });
  const snapshot = freezeGenerationProject({
    name: "Marca",
    niche: "",
    compiledDocument: "",
    visualIdentity: previous,
  });
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: owner,
    inputType: "text",
    content: "Texto pronto",
    platform: "instagram",
    projectId: owner,
    projectSnapshot: snapshot,
    fixedDesign: { kind: "identity", id: owner },
    idempotencyKey: "identity",
  });
  const pin = await pinFixedDesign(input, owner);
  expect(pin.identity?.rules.accent).toBe("#226633");
  expect(pin.revision).toBe(arsenalHash(pin.canvas));
  expect(h.read).toHaveBeenCalledWith(owner, owner);
  if (input.projectSnapshot?.version === 3)
    input.projectSnapshot.visualIdentity.rules.accent = "#000000";
  await expect(pinFixedDesign(input, owner)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  h.read.mockResolvedValue(undefined);
  await expect(pinFixedDesign(input, owner)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
