import { expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  scope: vi.fn(async (_revision, work) => work()),
}));
vi.mock("../../designCatalog/versionedCatalog", () => ({
  withCatalogRevision: h.scope,
}));
import { withLocalRequestCatalog } from "./localRequestCatalog";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
const input = orchestratedGenerationInputSchema.parse({
  ownerId: "11111111-1111-4111-8111-111111111111",
  inputType: "text",
  content: "Texto pronto",
  platform: "instagram",
  idempotencyKey: "local",
});
it("executes identity work without consulting a catalogue, while requiring pinned revisions for other modes", async () => {
  const work = vi.fn(async () => "delivered");
  const identityInput = {
    ...input,
    fixedDesign: { kind: "identity" as const, id: input.ownerId },
  };
  expect(await withLocalRequestCatalog({ input: identityInput }, work)).toBe(
    "delivered"
  );
  expect(h.scope).not.toHaveBeenCalled();
  work.mockClear();
  await expect(withLocalRequestCatalog({ input }, work)).rejects.toThrow(
    "catalog_revision_missing"
  );
  expect(work).not.toHaveBeenCalled();
  expect(
    await withLocalRequestCatalog({ input, catalogRevision: "123" }, work)
  ).toBe("delivered");
  expect(h.scope).toHaveBeenCalledWith("123", work);
});
