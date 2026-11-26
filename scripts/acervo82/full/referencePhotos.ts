import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { arsenalHash } from "../../../shared/arsenalContent";
import { arsenalPieceSchema } from "../../../shared/designArsenal";
import type { ComponentDefinitionV1 } from "../../../shared/componentAssembly";
import type { AssetFile } from "../../../harness/componentArsenal/extract";
import { verifyArsenalAsset } from "../../../server/designCatalog/arsenalAssets";

// Source coordinates in a 220 × 275 contact proof, independent of original resolution.
type Crop = {
  id: string;
  rect: [number, number, number, number];
  contour?: number[];
};
const crops: Record<string, Crop[]> = {
  "REF-01": [
    {
      id: "camera-foto",
      rect: [50, 127, 108, 148],
      contour: [
        21, 14, 97, 1, 104, 20, 106, 54, 97, 91, 90, 108, 89, 105, 96, 66, 80,
        78, 62, 95, 45, 148, 1, 148, 22, 95, 28, 83, 27, 64, 20, 51, 18, 27,
      ],
    },
  ],
  "REF-03": [{ id: "foto-ambiente", rect: [0, 147, 220, 128] }],
  "REF-04": [
    {
      id: "predio-topo",
      rect: [39, 0, 181, 58],
      contour: [14, 0, 181, 0, 181, 44, 75, 58, 34, 57, 12, 46, 16, 38, 2, 38],
    },
    {
      id: "predio-base",
      rect: [72, 136, 140, 139],
      contour: [102, 2, 138, 57, 95, 139, 0, 139],
    },
  ],
  "REF-06": [{ id: "area-foto", rect: [102, 112, 94, 81] }],
  "REF-09": [{ id: "produto-foto", rect: [113, 126, 41, 49] }],
  "REF-12": [{ id: "reaction-slot", rect: [0, 196, 220, 79] }],
  "REF-17": [{ id: "office-chaos-slot", rect: [0, 0, 220, 254] }],
  "REF-20": [{ id: "photo", rect: [0, 78, 220, 197] }],
  "REF-22": [{ id: "photo", rect: [0, 80, 220, 195] }],
};
const plates: Record<string, string> = {
  "REF-10": "portrait-slot",
  "REF-11": "tram-slot",
  "REF-21": "photo",
  "REF-23": "photo",
};

export async function restoreReferencePhotos(
  code: string,
  d: ComponentDefinitionV1,
  original: Buffer
): Promise<AssetFile[]> {
  if (code === "REF-19") return restorePaperRoll(d, original);
  if (!crops[code] && !plates[code]) return [];
  const assets: AssetFile[] = [];
  const sourceHash = createHash("sha256").update(original).digest("hex");
  const install = async (
    id: string,
    bytes: Buffer,
    generated: boolean,
    outline?: number[]
  ) => {
    const slot = d.fragment.mediaSlots?.find(s => s.id === id);
    const layer = d.fragment.instances.find(i => i.id === id);
    if (!slot || !layer)
      throw new Error("Missing source media slot: " + code + "/" + id);
    const { manifest } = await verifyArsenalAsset(bytes, {
      license: generated ? "ai-generated" : "curator-provided",
    });
    const piece = arsenalPieceSchema.parse({
      ...d.pieces[layer.pieceHash],
      imageAssetId: manifest.id,
      ...(["REF-10", "REF-21", "REF-23"].includes(code)
        ? { fill: "#292523" }
        : {}),
      points: outline ?? [
        0,
        0,
        layer.width,
        0,
        layer.width,
        layer.height,
        0,
        layer.height,
      ],
      imageReplacement: { label: slot.label, scrimOpacity: 0 },
    });
    layer.pieceHash = arsenalHash(piece);
    d.pieces[layer.pieceHash] = piece;
    slot.deferred = false;
    d.assets.push(manifest);
    d.fragment.assetIds.push(manifest.id);
    assets.push({
      bytes,
      manifest,
      relativePath: "assets/" + manifest.sha256,
      sourceHash,
      sourceFamily: "",
      sourceWeight: 400,
      resolvedWeight: 400,
      sourceUrl: null,
      adjustment: generated
        ? "Reconstrução fotográfica por IA baseada na referência arquivada, com tipografia independente."
        : "Recorte fotográfico da referência arquivada em camada substituível.",
    });
  };
  if (plates[code]) {
    await install(
      plates[code],
      await readFile("designs/acervo82/authored/photo-plates/" + code + ".jpg"),
      true
    );
  } else {
    const image = await loadImage(original);
    const sx = image.width / 220,
      sy = image.height / 275;
    if (code === "REF-22") {
      const ctx = createCanvas(1, 1).getContext("2d");
      ctx.drawImage(image, 0, 0, 16, 16, 0, 0, 1, 1);
      const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
      d.fragment.artboard.background =
        "#" + rgb.map(c => c.toString(16).padStart(2, "0")).join("");
    }
    for (const {
      id,
      rect: [x, y, w, h],
      contour,
    } of crops[code]) {
      const canvas = createCanvas(Math.round(w * sx), Math.round(h * sy));
      const ctx = canvas.getContext("2d");
      const layer = d.fragment.instances.find(i => i.id === id)!;
      if (code === "REF-04") {
        // The facade is traced in board coordinates. Keep the outline on
        // the replaceable image instead of rotating a rectangular crop twice.
        const group = d.fragment.groups.find(g => g.id === layer.parentId)!;
        Object.assign(group, { x: 0, y: 0, rotation: 0 });
        Object.assign(layer, {
          x: (x / 220) * 1080,
          y: (y / 275) * 1350,
          width: (w / 220) * 1080,
          height: (h / 275) * 1350,
        });
      }
      if (contour) {
        ctx.beginPath();
        ctx.moveTo(contour[0] * sx, contour[1] * sy);
        for (let i = 2; i < contour.length; i += 2)
          ctx.lineTo(contour[i] * sx, contour[i + 1] * sy);
        ctx.closePath();
        ctx.clip();
      }
      ctx.drawImage(image, -x * sx, -y * sy);
      await install(
        id,
        canvas.toBuffer("image/png"),
        false,
        contour?.map((v, i) => v * (i % 2 ? layer.height / h : layer.width / w))
      );
    }
  }
  return assets;
}

// The reference retains the curl, torn edge and cast shadow in a text-free
// strip immediately to the left of the editable reveal.
async function restorePaperRoll(
  d: ComponentDefinitionV1,
  original: Buffer
): Promise<AssetFile[]> {
  const image = await loadImage(original);
  const canvas = createCanvas(128, 232),
    ctx = canvas.getContext("2d");
  const outline = [
    42, 6, 81, 1, 101, 9, 127, 18, 117, 167, 109, 181, 96, 191, 94, 210, 84,
    225, 62, 231, 39, 229, 22, 216, 15, 194, 5, 168, 4, 144, 9, 58, 17, 18,
  ];
  ctx.beginPath();
  ctx.moveTo(outline[0], outline[1]);
  for (let i = 2; i < outline.length; i += 2)
    ctx.lineTo(outline[i], outline[i + 1]);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, -43, -442);
  const bytes = canvas.toBuffer("image/png");
  const { manifest } = await verifyArsenalAsset(bytes, {
    license: "curator-provided",
  });
  const layer = d.fragment.instances.find(i => i.id === "roll")!;
  const piece = arsenalPieceSchema.parse({
    ...d.pieces[layer.pieceHash],
    kind: "media",
    imageAssetId: manifest.id,
    points: [],
  });
  layer.pieceHash = arsenalHash(piece);
  d.pieces[layer.pieceHash] = piece;
  Object.assign(layer, { x: 63, y: 615, width: 188, height: 323 });
  d.assets.push(manifest);
  d.fragment.assetIds.push(manifest.id);
  return [
    {
      bytes,
      manifest,
      sourceHash: createHash("sha256").update(original).digest("hex"),
      relativePath: "assets/" + manifest.sha256,
      sourceFamily: "",
      sourceWeight: 400,
      resolvedWeight: 400,
      sourceUrl: null,
      adjustment:
        "Enrolamento e sombra do papel recuperados da margem da referência.",
    },
  ];
}
