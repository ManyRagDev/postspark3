import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import bundled from "../../shared/arsenalBundledAssets.json";
import { verifyArsenalAsset } from "./arsenalAssets";

describe("catalog asset verification with real font bytes", () => {
  const assets = Object.values(bundled);
  it("derives identity and family from decoded bytes, not the upload name", async () => {
    for (const asset of assets) {
      const result = await verifyArsenalAsset(
        readFileSync(`client/public${asset.path}`),
        { weight: asset.weight, license: "open-source" }
      );
      expect(result.manifest).toMatchObject({
        kind: "catalog",
        sha256: asset.sha256,
        family: asset.family,
        bytes: asset.bytes,
        weight: asset.weight,
      });
      expect(result.manifest.sourceFamily).toBeTruthy();
      expect(result.metadata.signatureVerified).toBe(true);
    }
  });
  it("rejects a declared weight that does not match the font file", async () => {
    const asset = assets.find(a => a.weight === 700)!;
    await expect(
      verifyArsenalAsset(readFileSync(`client/public${asset.path}`), {
        weight: 400,
        license: "open-source",
      })
    ).rejects.toThrow("Peso solicitado");
  });
  it("rejects unknown license, forged signature and truncated font", async () => {
    const bytes = readFileSync(`client/public${assets[0].path}`);
    await expect(verifyArsenalAsset(bytes, {})).rejects.toThrow("licença");
    await expect(
      verifyArsenalAsset(Buffer.from("not a font"), {})
    ).rejects.toThrow("Assinatura");
    await expect(
      verifyArsenalAsset(bytes.subarray(0, 16), { license: "open-source" })
    ).rejects.toThrow();
  });
});
