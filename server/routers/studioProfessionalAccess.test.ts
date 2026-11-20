import { afterEach, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), capture: vi.fn(), decode: vi.fn() }));
vi.mock("../billing", async importOriginal => ({
  ...await importOriginal<typeof import("../billing")>(),
  getBillingProfile: mocks.profile,
}));
vi.mock("../brandCapture", () => ({ startCapture: mocks.capture, readCapture: vi.fn(), saveCapture: vi.fn(), publicCapture: (data: unknown) => data }));
vi.mock("../designRecreation", () => ({ decodeRecreation: mocks.decode }));

import { brandProjectsRouter } from "./brandProjects";
import { templateIngestionRouter } from "./templateIngestion";

const id = "10000000-0000-4000-8000-000000000009";
const context: TrpcContext = {
  user: { id, email: "plans@example.invalid", name: "Teste", role: "user" },
  req: {} as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};
const capture = () => brandProjectsRouter.createCaller(context).captureStart({
  url: "https://example.invalid", idempotencyKey: "test-capture",
});
const replicate = () => templateIngestionRouter.createCaller(context).ingestFromImage({ imageDataUrl: "data:image/png;base64,AAAA" });

afterEach(() => vi.clearAllMocks());

it("denies Solo before expensive capture or replication work", async () => {
  mocks.profile.mockResolvedValue({ id, plan: "SOLO" });
  await expect(capture()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(replicate()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.decode).not.toHaveBeenCalled();
});

it.each(["PRO", "PRO_PLUS", "AGENCY", "DEV"])("allows capture and replication for %s", async plan => {
  mocks.profile.mockResolvedValue({ id, plan });
  mocks.capture.mockResolvedValue({ status: "ready" });
  mocks.decode.mockResolvedValue({ artboard: {} });
  await expect(capture()).resolves.toEqual({ status: "ready" });
  await expect(replicate()).resolves.toHaveProperty("recipe");
});
