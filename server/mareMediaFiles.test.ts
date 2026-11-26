import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { receiveMareFile } from "./mareMediaFiles";
describe("upload de arquivos Maré", () => {
  it("checks embedded lengths independently of the MIME and preserves bytes", async () => {
    const data = Buffer.from(
      JSON.stringify({ project: { clips: [] }, assets: [], imageSizes: [] })
    );
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const bytes = Buffer.concat([Buffer.from("MARESTUDIO3\n"), size, data]);
    const result = await receiveMareFile(
      Readable.from([bytes]),
      "project",
      async (file, hash) => ({
        bytes: Buffer.from(await file.arrayBuffer()),
        hash,
      })
    );
    expect(result.bytes).toEqual(bytes);
    expect(result.hash).toMatch(/^[\da-f]{64}$/);
    await expect(
      receiveMareFile(
        Readable.from([bytes, Buffer.from([0])]),
        "project",
        async () => true
      )
    ).rejects.toThrow("Índice");
  });
  it("rejects arbitrary bytes as video", async () => {
    await expect(
      receiveMareFile(
        Readable.from([Buffer.from("not video")]),
        "video",
        async () => true
      )
    ).rejects.toThrow("vídeo");
  });
});

it("normalizes a phone MOV with rotated HEVC and retains its audio and original", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mare-fixture-"));
  try {
    const src = join(dir, "source.mov"),
      phone = join(dir, "phone.mov"),
      out = join(dir, "playback.mp4");
    const ffmpeg = (args: string[]) =>
      execFileSync(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-nostdin", ...args],
        { stdio: "pipe" }
      );
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=green:s=128x72:r=30:d=0.6",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=0.6",
      "-c:v",
      "libx265",
      "-threads",
      "1",
      "-x265-params",
      "pools=1:frame-threads=1:log-level=error",
      "-c:a",
      "aac",
      "-tag:v",
      "hvc1",
      src,
    ]);
    ffmpeg(["-display_rotation", "90", "-i", src, "-c", "copy", phone]);
    await receiveMareFile(
      createReadStream(phone),
      "video",
      async (original, _, meta, proxy) => {
        expect(meta).toMatchObject({
          width: 72,
          height: 128,
          mime: "video/mp4",
        });
        expect(original.size).toBeGreaterThan(1000);
        expect(proxy).toBeDefined();
        await writeFile(out, new Uint8Array(await proxy!.arrayBuffer()));
      }
    );
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", out],
        { encoding: "utf8" }
      )
    );
    expect(probe.streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codec_name: "h264", width: 72, height: 128 }),
        expect.objectContaining({ codec_name: "aac" }),
      ])
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
