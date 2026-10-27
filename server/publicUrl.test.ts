import { describe, it, expect, vi } from "vitest";
import { isPublicAddress, publicUrl } from "./publicUrl";
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => [
    {
      address: host === "rebind.example" ? "127.0.0.1" : "93.184.216.34",
      family: 4,
    },
  ]),
}));
describe("public URL boundaries", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])
    it(`refuses ${ip}`, () => expect(isPublicAddress(ip)).toBe(false));
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:password@example.com",
    "http://127.1",
    "http://[::1]",
    "http://rebind.example",
  ])
    it("refuses " + url, async () => {
      await expect(publicUrl(url)).rejects.toThrow();
    });
  it("pins an observed public address", async () =>
    expect((await publicUrl("https://example.com/path")).address.address).toBe(
      "93.184.216.34"
    ));
});
