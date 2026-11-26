import { afterEach, expect, it, vi } from "vitest";
import { getMareCapabilities } from "./mareCapabilities";

vi.mock("./billing", () => ({getBillingProfile: vi.fn(async () => ({plan: "PRO"}))}));
const member = {id: "pilot", email: null, name: null};
afterEach(() => vi.unstubAllEnvs());

it("limita o piloto à lista e permite reverter apenas a apresentação móvel", async () => {
  vi.stubEnv("POSTSPARK_MARE_ENABLED", "true");
  vi.stubEnv("POSTSPARK_CANVAS_VIDEO_ENABLED", "true");
  vi.stubEnv("POSTSPARK_MARE_PILOT_USERS", " other, pilot ");
  vi.stubEnv("POSTSPARK_MARE_MOBILE_CONTEXTUAL", "true");
  vi.stubEnv("POSTSPARK_MARE_PUBLIC_ENTRY", "false");
  vi.stubEnv("POSTSPARK_MARE_SPEECH", "false");
  vi.stubEnv("POSTSPARK_MARE_PAID_ENABLED", "false");

  const allowed = await getMareCapabilities(member);
  expect(allowed).toMatchObject({video: true, editor: true, mobileContextual: true, paid: false, publicEntry: false});
  expect(await getMareCapabilities({...member, id: "outside"})).toMatchObject({editor: false, video: false, mobileContextual: false});
  vi.stubEnv("POSTSPARK_MARE_MOBILE_CONTEXTUAL", "false");
  expect(await getMareCapabilities(member)).toEqual({...allowed, mobileContextual: false});
});
