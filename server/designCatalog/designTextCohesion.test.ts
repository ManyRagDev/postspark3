import { expect, it, vi } from "vitest";
import { arsenalHash } from "../../shared/arsenalContent";
import { completeDesignTestDefinitions } from "../../shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "../../shared/componentAssembly";
import { auditDesignTextCohesion } from "../../shared/designTextCohesion";
import {
  checkNewDesignTextCohesion,
  prepareComponentDraft,
} from "./componentStore";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../db", () => ({ getDb: () => db }));

function splitTitle() {
  const d = completeDesignTestDefinitions()[0];
  const first = d.fragment.instances[0],
    original = d.pieces[first.pieceHash];
  const second = { ...first, id: "segunda-linha" };
  d.fragment.instances.push(second);
  d.fragment.bindings[0].targetIds.push(second.id);
  [first, second].forEach((row, index) => {
    const piece = {
      ...original,
      contentFragment: { unit: "words" as const, count: 2, index },
    };
    row.pieceHash = arsenalHash(piece);
    row.height = 65;
    row.y = 100 + 65 * index;
    d.pieces[row.pieceHash] = piece;
  });
  return createComponentDefinition(d);
}
it("flags all contiguous lines of a title, but keeps a separate support field independent", () => {
  const d = splitTitle();
  expect(auditDesignTextCohesion(d)).toEqual([
    {
      action: "consolidate",
      reason: "linhas_contiguas_do_mesmo_campo",
      source: d.fragment.bindings[0].source,
      targets: d.fragment.bindings[0].targetIds,
    },
  ]);
  expect(auditDesignTextCohesion(completeDesignTestDefinitions()[0])).toEqual(
    []
  );
});
it("routes staggered text to inspection and preserves a layer with an authored role", () => {
  const d = splitTitle();
  d.fragment.instances.at(-1)!.rotation = 15;
  expect(auditDesignTextCohesion(d)[0].action).toBe("inspect");
  d.removableElementIds = ["segunda-linha"];
  expect(auditDesignTextCohesion(d)[0].action).toBe("preserve");
});
it("rejects a new fragmented draft before writing, while allowing an exact existing version to replay", async () => {
  const d = splitTitle();
  const existing = vi
    .fn()
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({
      data: [{ id: d.id, definition_hash: d.hash }],
      error: null,
    });
  db.from.mockReturnValue({ select: () => ({ in: existing }) });
  // A fixture may declare bundled fonts. Use a validated catalog manifest so
  // admission exercises the cohesion gate itself.
  const catalogDraft = createComponentDefinition({
    ...d,
    assets: d.assets.map(a => ({ ...a, kind: "catalog" as const })),
  });
  await expect(prepareComponentDraft(catalogDraft, "test")).rejects.toThrow(
    /segunda-linha/
  );
  await expect(checkNewDesignTextCohesion([d])).resolves.toHaveLength(1);
  expect(existing).toHaveBeenCalledTimes(2);
});
