import { describe, expect, it } from "vitest";
import { recipeFromSpec, type CompactSpec } from "../designBatch/builder";
import { arsenalHash } from "../../shared/arsenalContent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FONT_DIR } from "../../shared/typography/fonts/registry";
import { sha256 } from "../designBatch/builder";
import type { ReferenceFontAsset } from "../../shared/referenceReconstruction";

describe("frozen offline authoring", () => {
  it("rebuilds the same source without random recipe identity or timestamps", () => {
    const spec: CompactSpec = {
      stem: "pilot",
      title: "Pilot",
      width: 1080,
      height: 1350,
      background: "#FFFFFF",
      groups: [
        {
          id: "title",
          label: "Title",
          transform: { x: 0, y: 0, rotationDeg: 0 },
        },
      ],
      layers: [
        {
          kind: "rect",
          id: "accent",
          x: 20,
          y: 20,
          width: 100,
          height: 100,
          fill: "#111111",
        },
        {
          kind: "text",
          id: "title",
          groupId: "title",
          fieldId: "title",
          text: "Pilot",
          fontFamily: "Inter",
          fontWeight: 400,
          fontSize: 40,
          x: 100,
          y: 100,
          width: 500,
          height: 100,
          fill: "#111111",
        },
      ],
      authorship: {
        recipeId: "pilot-v1",
        createdAt: "2026-11-04T12:00:00.000Z",
      },
    };
    const bytes = readFileSync(join(FONT_DIR, "inter.ttf"));
    const fonts = new Map<string, ReferenceFontAsset>([
      [
        "Inter:400",
        {
          family: "Inter",
          weight: 400,
          sourceUrl: null,
          mimeType: "font/ttf",
          dataUrl: `data:font/ttf;base64,${bytes.toString("base64")}`,
          sha256: sha256(bytes),
          license: "open-source",
        },
      ],
    ]);
    const first = recipeFromSpec(spec, fonts);
    expect(recipeFromSpec(spec, fonts)).toEqual(first);
    expect(first).toMatchObject({
      id: "pilot-v1",
      createdAt: spec.authorship!.createdAt,
    });
    expect(
      arsenalHash(
        recipeFromSpec(
          {
            ...spec,
            layers: spec.layers.map((l, i) =>
              i === 0 ? { ...l, width: 101 } : l
            ),
          },
          fonts
        )
      )
    ).not.toBe(arsenalHash(first));
  });
});
