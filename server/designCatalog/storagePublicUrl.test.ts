import { describe, expect, it } from "vitest";
import { publicStorageSignedUrl } from "./storagePublicUrl";

describe("public Storage signed URLs", () => {
  const path = "/storage/v1/object/sign/design-arsenal/font%20file?token=private%2Bsignature";
  it("preserves the signed path/token while exposing the public origin", () => {
    expect(publicStorageSignedUrl(`http://api-gw:8000${path}`, "http://api-gw:8000", "https://api.postspark.com.br"))
      .toBe(`https://api.postspark.com.br${path}`);
  });
  it("preserves existing hosted deployments without an override", () => {
    expect(publicStorageSignedUrl(`https://project.supabase.co${path}`, "https://project.supabase.co"))
      .toBe(`https://project.supabase.co${path}`);
  });
  it("rejects a foreign origin or an unexpected Storage path", () => {
    for (const url of [`https://unexpected.example${path}`, "http://api-gw:8000/auth/v1/token"])
      expect(() => publicStorageSignedUrl(url, "http://api-gw:8000", "https://api.postspark.com.br"))
        .toThrow("Unexpected signed Storage URL");
  });
  it("rejects public configurations with credentials, query, path or non-HTTP scheme", () => {
    for (const base of ["https://secret@example.com", "https://example.com?token=x", "https://example.com/path", "file:///tmp/"])
      expect(() => publicStorageSignedUrl(`http://api-gw:8000${path}`, "http://api-gw:8000", base))
        .toThrow("Invalid public Storage origin configuration");
  });
});
