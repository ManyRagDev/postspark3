import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { arsenalBundledManifest } from "@shared/arsenalBundledManifest";
import { arsenalHash } from "@shared/arsenalContent";
import { authorizeArsenalSaveModel } from "../../../../../../server/designCatalog/arsenalSave";
import { executeEditorCommand } from "@/pages/CanvasLab/lib/editorController";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "@/pages/CanvasLab/lib/saveAdapter";
import { openShowcaseDocument, SHOWCASE_ITEMS, showcasePreviewUrl } from "./showcaseData";

describe("Studio showcase documents", () => {
  it.each(SHOWCASE_ITEMS)("opens, edits and round-trips $title", async item => {
    const post = await openShowcaseDocument(item);
    const secondCopy = await openShowcaseDocument(item);
    expect(post.id).not.toBe(secondCopy.id);
    expect(post.slides).toHaveLength(item.slideCount);
    expect(post.aspectRatio).toBe("4:5");

    for (const [index, slide] of post.slides.entries()) {
      const composition = slide.composition!;
      expect(composition.origin.componentAssembly?.completeDesign?.family).toBe(
        `acervo82-concept-${item.code.slice(4)}`
      );
      const preview = await loadImage(await readFile(`client/public${showcasePreviewUrl(item, index)}`));
      expect(preview.width * 5).toBe(preview.height * 4);

      for (const asset of composition.assets) {
        expect(asset.kind).toBe("bundled");
        const bytes = await readFile(`client/public${arsenalBundledManifest[asset.id].path}`);
        expect(bytes.length).toBe(asset.bytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      }
    }

    const slide = post.slides[0];
    const element = slide.composition!.elements.find(node => node.kind === "text" && node.bindingId)!;
    const updated = executeEditorCommand(post, { slideId: slide.id, elementId: element.id }, {
      type: "text",
      text: "Nova ideia",
    });
    expect(updated.ok, updated.reason).toBe(true);
    expect(updated.post.slides[0].composition!.userContentHash).not.toBe(slide.composition!.userContentHash);
    expect(secondCopy.slides[0].composition!.userContentHash).toBe(slide.composition!.userContentHash);

    const payload = canvasModelToSavePayload(updated.post, { inputType: "text", inputContent: post.headline });
    await authorizeArsenalSaveModel(payload.canvasModel, "showcase-test-user");
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    });
    expect(reopened.slides.map(page => arsenalHash(page.composition))).toEqual(
      updated.post.slides.map(page => arsenalHash(page.composition))
    );
  });
});
