import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, writeFile, rm, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  imageEditInputSchema,
  imageEditOperationSchema,
} from "../../shared/imageEditor";
import { decodeImageData } from "./raster";
import { ImageProcessor } from "./processor";

const imageData = createCanvas(24, 24).toDataURL("image/png");
const input = () => ({
  requestId: randomUUID(),
  imageData,
  operation: {
    kind: "adjust" as const,
    brightness: 8,
    contrast: 2,
    saturation: 0,
  },
  format: "png" as const,
});
let root: string, work: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "image-editor-unit-"));
  work = join(root, "work");
  await mkdir(work);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function executable(body: string) {
  const path = join(root, `engine-${randomUUID()}`);
  await writeFile(
    path,
    `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);${body}\n`,
    { mode: 0o700 }
  );
  return path;
}
describe("bounded image processing", () => {
  it("only accepts the six approved operations and rejects invalid geometry/extra commands", () => {
    expect(
      imageEditInputSchema.safeParse({ ...input(), command: "select.subject" })
        .success
    ).toBe(false);
    expect(
      imageEditOperationSchema.safeParse({ kind: "select.subject" }).success
    ).toBe(false);
    expect(
      imageEditOperationSchema.safeParse({
        kind: "crop",
        x: 0.8,
        y: 0,
        width: 0.5,
        height: 1,
      }).success
    ).toBe(false);
    expect(
      imageEditOperationSchema.safeParse({
        kind: "mask",
        points: [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
        ],
        feather: 0,
      }).success
    ).toBe(false);
    const png = Buffer.from(imageData.split(",")[1], "base64");
    png.writeUInt32BE(100000, 16);
    expect(() =>
      decodeImageData(`data:image/png;base64,${png.toString("base64")}`)
    ).toThrow();
    expect(() =>
      decodeImageData(imageData.replace("image/png", "image/jpeg"))
    ).toThrow();
  });
  it("recognizes the bounded dimensions of actual PNG, JPEG and WebP files", () => {
    const canvas = createCanvas(37, 21);
    for (const format of ["png", "jpeg", "webp"] as const) {
      const uri = canvas.toDataURL(`image/${format}`);
      expect(decodeImageData(uri)).toMatchObject({
        width: 37,
        height: 21,
        mimeType: `image/${format}`,
      });
    }
  });
  it("passes JSON as arguments, strips application secrets and removes scratch after success", async () => {
    const old = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-reach-cli";
    try {
      const binary = await executable(
        `if(process.env.SUPABASE_SERVICE_ROLE_KEY)process.exit(9);if(args.includes('--shell'))process.exit(8);const p=JSON.parse(args[args.indexOf('--params')+1]);if(p.brightness!==8)process.exit(7);fs.copyFileSync(args[1],args[args.indexOf('--out')+1]);`
      );
      const result = await new ImageProcessor({
        binary,
        workRoot: work,
      }).process(input(), "actor");
      expect(result.sourceDimensions).toEqual({ width: 24, height: 24 });
      expect(result.resultSha256).toBe(result.sourceSha256);
      expect(await readdir(work)).toEqual([]);
    } finally {
      if (old === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = old;
    }
  });
  it("cleans failing jobs and rejects outputs with unexpected dimensions", async () => {
    const failing = await executable(`process.exit(2);`);
    await expect(
      new ImageProcessor({ binary: failing, workRoot: work }).process(
        input(),
        "actor"
      )
    ).rejects.toMatchObject({ code: "FAILED" });
    const wrongSize = await executable(
      `fs.copyFileSync(args[1],args[args.indexOf('--out')+1]);`
    );
    await expect(
      new ImageProcessor({ binary: wrongSize, workRoot: work }).process(
        { ...input(), operation: { kind: "resize", width: 12, height: 12 } },
        "actor"
      )
    ).rejects.toMatchObject({ code: "FAILED" });
    expect(await readdir(work)).toEqual([]);
  });
  it("kills timed-out/cancelled process groups, releases permits and removes temporary files", async () => {
    const binary = await executable(
      `setTimeout(()=>fs.copyFileSync(args[1],args[args.indexOf('--out')+1]),2000);`
    );
    await expect(
      new ImageProcessor({ binary, workRoot: work, timeoutMs: 40 }).process(
        input(),
        "actor"
      )
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    const controller = new AbortController();
    const processor = new ImageProcessor({ binary, workRoot: work });
    const job = processor.process(input(), "actor", controller.signal);
    const rejection = expect(job).rejects.toMatchObject({ code: "CANCELLED" });
    controller.abort();
    await rejection;
    expect(await readdir(work)).toEqual([]);
  });
  it("bounds concurrent work globally and for each signed-in actor", async () => {
    const binary = await executable(
      `setTimeout(()=>fs.copyFileSync(args[1],args[args.indexOf('--out')+1]),180);`
    );
    const processor = new ImageProcessor({ binary, workRoot: work });
    const first = processor.process(input(), "a");
    await expect(processor.process(input(), "a")).rejects.toMatchObject({
      code: "BUSY",
    });
    const second = processor.process(input(), "b");
    await expect(processor.process(input(), "c")).rejects.toMatchObject({
      code: "BUSY",
    });
    await Promise.all([first, second]);
    expect(await readdir(work)).toEqual([]);
  });
});
