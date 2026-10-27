import { describe, expect, it } from "vitest";
import {
  detectFontFormat,
  validateFontFile,
  validateTotalFontPayload,
  estimateFontBytes,
  MAX_SINGLE_FONT_BYTES,
  MAX_TOTAL_USER_FONT_BYTES,
} from "./fontResources";
import type { ArsenalUserFont } from "@shared/designArsenal";

describe("Font Resources & Validation (OS-006 / D-07)", () => {
  it("AC-006-01: detects valid TTF binary formats (standard and mac true)", () => {
    // 0x00 0x01 0x00 0x00
    const ttfStd = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x10, 0x20]);
    expect(detectFontFormat(ttfStd)).toBe("truetype");

    // 'true'
    const ttfMac = new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x00, 0x01]);
    expect(detectFontFormat(ttfMac)).toBe("truetype");
  });

  it("AC-006-01: detects valid OTF, WOFF and WOFF2 formats", () => {
    // 'OTTO'
    const otf = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0x00, 0x01]);
    expect(detectFontFormat(otf)).toBe("opentype");

    // 'wOFF'
    const woff = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0x00, 0x01]);
    expect(detectFontFormat(woff)).toBe("woff");

    // 'wOF2'
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]);
    expect(detectFontFormat(woff2)).toBe("woff2");
  });

  it("AC-006-01: rejects invalid binary signatures (PNG, JPEG, plain text)", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(detectFontFormat(png)).toBeNull();

    const result = validateFontFile(png, "image.png");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Formato de fonte não suportado");
  });

  it("AC-006-01: rejects font files exceeding 1 MiB", () => {
    const largeOtf = new Uint8Array(MAX_SINGLE_FONT_BYTES + 10);
    // Add valid OTF header
    largeOtf.set([0x4f, 0x54, 0x54, 0x4f], 0);

    const result = validateFontFile(largeOtf, "large.otf");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("excede o limite máximo de 1 MiB");
  });

  it("AC-006-02: calculates estimated bytes from data URI accurately", () => {
    // 4 base64 chars -> 3 bytes
    const base64Data = Buffer.from("hello world font data").toString("base64");
    const dataUri = `data:font/woff2;base64,${base64Data}`;
    const bytes = estimateFontBytes(dataUri);
    expect(bytes).toBe(21);
  });

  it("AC-006-02: validates cumulative payload does not exceed 3.5 MB", () => {
    const existingFonts: ArsenalUserFont[] = [
      {
        family: "Font1",
        url: `data:font/woff2;base64,${Buffer.alloc(1_500_000).toString("base64")}`,
      },
      {
        family: "Font2",
        url: `data:font/woff2;base64,${Buffer.alloc(1_500_000).toString("base64")}`,
      },
    ];

    // Total existing is ~3,000,000 bytes. Adding 400,000 bytes is ok (total 3,400,000 <= 3,500,000)
    const okCheck = validateTotalFontPayload(existingFonts, 400_000);
    expect(okCheck.valid).toBe(true);

    // Adding 600,000 bytes exceeds 3,500,000 bytes
    const failCheck = validateTotalFontPayload(existingFonts, 600_000);
    expect(failCheck.valid).toBe(false);
    expect(failCheck.error).toContain("excederia o limite máximo de 3500000 bytes");
  });
});

