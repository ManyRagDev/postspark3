import { beforeEach, it, expect, vi } from "vitest";
import { registerBrandCaptureRoutes } from "./brandCaptureRoutes";
import { ENV } from "./env";
const paths = new Map<string, any>();
let deps: any;
function response() {
  const r: any = { statusCode: 200 };
  r.sendStatus = vi.fn((s: number) => (r.statusCode = s));
  r.status = vi.fn((s: number) => {
    r.statusCode = s;
    return r;
  });
  r.json = vi.fn(() => r);
  return r;
}
beforeEach(() => {
  paths.clear();
  ENV.aiSiteIntelligenceEnabled = true;
  deps = {
    authenticate: vi.fn(async () => ({ id: "owner", role: "user" })),
    capture: vi.fn(async () => ({
      brandDNA: { brandName: "General brand" },
      themes: [],
      siteIntelligence: { id: "persisted-capture" },
      cached: true,
    })),
    screenshot: vi.fn(async () => null),
  };
  registerBrandCaptureRoutes(
    { post: (path: string, handler: any) => paths.set(path, handler) } as any,
    deps
  );
});
it("the legacy brand route delegates the authenticated owner to the durable free capture service", async () => {
  const res = response();
  await paths.get("/api/brand-dna")(
    { body: { url: "https://example.com/" } },
    res
  );
  expect(deps.capture).toHaveBeenCalledWith("owner", "https://example.com/");
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    brandDNA: { brandName: "General brand" },
    themes: [],
    siteIntelligence: { id: "persisted-capture" },
    cached: true,
  });
});
it("rejects anonymous capture before starting any external work", async () => {
  deps.authenticate.mockRejectedValue(new Error("unauthenticated"));
  const res = response();
  await paths.get("/api/brand-dna")(
    { body: { url: "https://example.com/" } },
    res
  );
  expect(res.statusCode).toBe(401);
  expect(deps.capture).not.toHaveBeenCalled();
});
it("shares admission limits rather than bypassing them from REST", async () => {
  deps.capture.mockRejectedValue({
    code: "PT429",
    message: "Limite de cinco capturas por hora",
  });
  const res = response();
  await paths.get("/api/brand-dna")(
    { body: { url: "https://example.com/" } },
    res
  );
  expect(res.statusCode).toBe(429);
  expect(res.json).toHaveBeenCalledWith({
    error: "Limite de cinco capturas por hora",
  });
});
it("the diagnostic screenshot route is admin-only", async () => {
  const res = response();
  await paths.get("/api/extract")(
    { body: { url: "https://example.com/" } },
    res
  );
  expect(res.statusCode).toBe(403);
  expect(deps.screenshot).not.toHaveBeenCalled();
});
