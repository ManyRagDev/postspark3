import { describe, expect, it, vi } from "vitest";
import {
  generateProposalMediaForSlot,
  aspectRatioForProposalSlot,
} from "./proposalMedia";
import type { generateImage } from "../../_core/imageGeneration";

const slot = { id: "hero-photo", x: 20, y: 30, width: 400, height: 300 };
const privateAsset = {
  url: `/api/post-media/${"a".repeat(8)}-${"b".repeat(4)}-${"c".repeat(4)}-${"d".repeat(4)}-${"e".repeat(12)}/${"f".repeat(64)}`,
};

describe("proposal media adapter", () => {
  it("derives the nearest supported image proportion from native slot geometry", () => {
    expect(aspectRatioForProposalSlot(400, 300)).toBe("1:1");
    expect(aspectRatioForProposalSlot(160, 90)).toBe("1:1");
    expect(aspectRatioForProposalSlot(300, 700)).toBe("9:16");
    expect(() => aspectRatioForProposalSlot(0, 300)).toThrow("Geometria");
  });

  it("passes owner, context, references, slot ratio and operation identity to generation", async () => {
    const generate = vi.fn(
      async () => privateAsset
    ) as unknown as typeof generateImage;
    const runIdempotent = vi.fn(
      async (_key: string, work: () => Promise<unknown>) => work()
    );
    const result = await generateProposalMediaForSlot(
      {
        ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        slot,
        prompt: "A coffee shop scene",
        operationId: "proposal-1:1:image:hero-photo",
        postContext: { headline: "Café para começar" },
        references: [
          {
            b64Json:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            mimeType: "image/png",
          },
        ],
      },
      { generateImage: generate, runIdempotent }
    );

    expect(result).toEqual(privateAsset);
    expect(runIdempotent).toHaveBeenCalledWith(
      "proposal-1:1:image:hero-photo",
      expect.any(Function)
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        prompt: "A coffee shop scene",
        aspectRatio: "1:1",
        postContext: { headline: "Café para começar" },
        routePolicy: "strict",
        originalImages: [
          {
            b64Json:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
            mimeType: "image/png",
          },
        ],
      })
    );
  });

  it("resolves a same-owner private reference through the authorized resolver", async () => {
    const ownerId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const referenceUrl = `/api/post-media/${ownerId}/${"1".repeat(64)}`;
    const resolver = vi
      .fn()
      .mockResolvedValue({
        dataUri:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      });
    const generate = vi.fn(
      async () => privateAsset
    ) as unknown as typeof generateImage;
    const runIdempotent = vi.fn(
      async (_key: string, work: () => Promise<unknown>) => work()
    );
    await generateProposalMediaForSlot(
      {
        ownerId,
        slot,
        prompt: "A scene",
        operationId: "p1:r1:image:hero",
        references: [{ url: referenceUrl }],
      },
      {
        generateImage: generate,
        resolveOwnedReference: resolver,
        runIdempotent,
      }
    );

    expect(resolver).toHaveBeenCalledWith(
      referenceUrl,
      ownerId,
      "p1:r1:image:hero",
      undefined
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        originalImages: [
          {
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          },
        ],
      })
    );
  });

  it("aborts a private reference download before any paid image call", async () => {
    const ownerId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",controller=new AbortController();
    const generate=vi.fn() as unknown as typeof generateImage;
    const resolver=vi.fn(async(_url:string,_actor:string,_operation?:string,signal?:AbortSignal)=>new Promise<{dataUri:string}>((_resolve,reject)=>signal?.addEventListener("abort",()=>reject(signal.reason),{once:true})));
    const pending=generateProposalMediaForSlot({ownerId,slot,prompt:"Photo",operationId:"cancel-reference",references:[{url:`/api/post-media/${ownerId}/${"1".repeat(64)}`}],signal:controller.signal},{generateImage:generate,resolveOwnedReference:resolver,runIdempotent:async(_key,work)=>work()});
    const rejected=expect(pending).rejects.toThrow("generation_cancelled");
    controller.abort(new Error("generation_cancelled"));
    await rejected;
    expect(resolver.mock.calls[0][3]).toBe(controller.signal);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects arbitrary and cross-owner URLs without fetching them", async () => {
    const generate = vi.fn() as unknown as typeof generateImage;
    const runIdempotent = vi.fn(
      async (_key: string, work: () => Promise<unknown>) => work()
    );
    await expect(
      generateProposalMediaForSlot(
        {
          ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          slot,
          prompt: "A scene",
          operationId: "p1:r1:image:1:hero",
          references: [{ url: "https://example.com/image.png" }],
        },
        { generateImage: generate, runIdempotent }
      )
    ).rejects.toThrow("Referência externa");
    await expect(
      generateProposalMediaForSlot(
        {
          ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          slot,
          prompt: "A scene",
          operationId: "p1:r1:image:1:hero",
          references: [
            {
              url: `/api/post-media/${"1".repeat(8)}-${"2".repeat(4)}-${"3".repeat(4)}-${"4".repeat(4)}-${"5".repeat(12)}/${"1".repeat(64)}`,
            },
          ],
        },
        { generateImage: generate, runIdempotent }
      )
    ).rejects.toThrow("Referência externa");
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects corrupt or mismatched inline image bytes before a paid operation", async () => {
    const generate = vi.fn() as unknown as typeof generateImage;
    const runIdempotent = vi.fn();
    for (const dataUri of [
      "data:image/png;base64,aGVsbG8=",
      "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    ]) {
      await expect(
        generateProposalMediaForSlot(
          {
            ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            slot,
            prompt: "A scene",
            operationId: "ref-test",
            references: [{ dataUri }],
          },
          { generateImage: generate, runIdempotent }
        )
      ).rejects.toThrow();
    }
    expect(runIdempotent).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails if generation did not return a persistent private asset for the owner", async () => {
    const generate = vi.fn(async () => ({
      url: "https://temporary.example/image.png",
    })) as unknown as typeof generateImage;
    const runIdempotent = vi.fn(
      async (_key: string, work: () => Promise<unknown>) => work()
    );
    await expect(
      generateProposalMediaForSlot(
        {
          ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          slot,
          prompt: "A scene",
          operationId: "p1:r1:image:1:hero",
        },
        { generateImage: generate, runIdempotent }
      )
    ).rejects.toThrow("não foi persistida");
  });
});
