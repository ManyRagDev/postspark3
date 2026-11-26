import { afterEach, expect, it, vi } from "vitest";
import { acceptMareReturn, retargetMareReturn } from "./mareIntegration";

const id = "4db0ca20-3e02-4bd2-9bda-0b3e6812c809";
const anchor = {
  id,
  documentId: "d",
  postId: 7,
  slideId: "s",
  slotId: "__background__",
  expectedRevision: 4,
  revisionId: id,
  pending: true,
};
afterEach(() => vi.unstubAllGlobals());
it("mantém a intenção em consulta e dispensa aplicar novamente uma revisão já recebida", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ...anchor, canApply: false }))
    .mockResolvedValueOnce(
      Response.json({ ...anchor, pending: false, appliedRevision: 5 })
    );
  vi.stubGlobal("fetch", fetch);
  await acceptMareReturn(id, "personal");
  await acceptMareReturn(id, "personal");
  expect(fetch.mock.calls.map(c => c[0])).toEqual(
    Array(2).fill("/api/mare/anchors/" + id)
  );
});
it("preserva a edição em conflito até o usuário escolher outro elemento", async () => {
  vi.stubGlobal("window", {});
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(anchor))
    .mockResolvedValueOnce(
      Response.json({ error: "Elemento substituído." }, { status: 409 })
    )
    .mockResolvedValueOnce(Response.json(anchor))
    .mockResolvedValueOnce(Response.json({ appliedRevision: 9 }));
  vi.stubGlobal("fetch", fetch);
  const pending = await acceptMareReturn(id, "personal");
  expect(pending.conflict).toBe("Elemento substituído.");
  await retargetMareReturn(pending, "novo-slide", "foto", 8);
  expect(
    fetch.mock.calls
      .slice(2)
      .map(([url, options]) => [url, JSON.parse(options.body)])
  ).toEqual([
    [
      "/api/mare/anchors/" + id + "/retarget",
      {
        slideId: "novo-slide",
        slotId: "foto",
        revisionId: id,
        expectedRevision: 8,
      },
    ],
    [
      "/api/mare/anchors/" + id + "/apply",
      { revisionId: id, expectedRevision: 8 },
    ],
  ]);
});
