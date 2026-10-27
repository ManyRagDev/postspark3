import { describe, it, expect } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "../components/types";
import { preflightSavePayload, MAX_SAVE_PAYLOAD_BYTES } from "./savePreflight";
import { canvasModelToSavePayload } from "./saveAdapter";
import { fitSavePayload } from "./fitSavePayload";

describe("savePreflight (OS-003-008-C05 / BUG-CL-032)", () => {
  it("approves document when save payload is well within limit", async () => {
    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      caption: "Short caption",
    };
    const result = await preflightSavePayload(post);
    expect(result.ok).toBe(true);
    expect(result.byteLength).toBeLessThan(MAX_SAVE_PAYLOAD_BYTES);
    expect(result.payload).toBeDefined();
  });

  it("rejects when raw model is under 3.5MB but save payload envelope exceeds 3.5MB (C04-R3v)", async () => {
    function bytes(size = 28) {
      const b = new Uint8Array(size);
      b.set([0, 1, 0, 0, 0, 1]);
      return b;
    }
    const url = "data:font/truetype;base64," + Buffer.alloc(950000).toString("base64");
    const post: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      caption: "x".repeat(650000),
      userFonts: [
        { family: "ExistingA", url },
        { family: "ExistingB", url },
      ],
    };
    const candidate: CanvasPostModel = {
      ...post,
      fontFamily: "AuditEnvelope",
      userFonts: [
        ...post.userFonts,
        {
          family: "AuditEnvelope",
          format: "truetype",
          url: "data:font/truetype;base64," + Buffer.from(bytes()).toString("base64"),
        },
      ],
    };

    // Demonstrates the bug: candidate raw model is < 3.5MB, but payload is > 3.5MB
    const rawModelBytes = new TextEncoder().encode(JSON.stringify(candidate)).length;
    expect(rawModelBytes).toBeLessThan(3500000);

    const payload = canvasModelToSavePayload(candidate, { inputType: "text", inputContent: "audit" });
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    expect(payloadBytes).toBeGreaterThan(3500000);

    // preflightSavePayload catches this and refuses before commit:
    const result = await preflightSavePayload(candidate);
    expect(result.ok).toBe(false);
    expect(result.byteLength).toBeGreaterThan(MAX_SAVE_PAYLOAD_BYTES);
  });
});
