import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createWriteStream, openAsBlob } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { z } from "zod";

export class MareError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
export const MAX_MEDIA_BYTES = 128 * 1024 * 1024;
export const mareAssetKinds = ["video", "project", "audio", "image"] as const;
export type MareAssetKind = (typeof mareAssetKinds)[number];
const MAX_METADATA = 16 * 1024 * 1024;
const run = promisify(execFile);
const projectMetadata = z.object({
  project: z.object({
    clips: z.array(z.unknown()),
    compositions: z
      .array(z.object({ id: z.string().min(1).max(200) }))
      .default([]),
  }),
  assets: z.array(z.object({ size: z.number().int().nonnegative() })),
  imageSizes: z.array(z.number().int().nonnegative()).default([]),
});
export interface ProbedMedia {
  mime: string;
  original_mime?: string;
  composition_ids?: string[];
  duration?: number;
  width?: number;
  height?: number;
}

interface ProbeResult {
  meta: ProbedMedia;
  playback?: Blob;
}
type Track = {
  codec_name: string;
  codec_type: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  color_transfer?: string;
  side_data_list?: { rotation?: number }[];
};
const rate = (value?: string) => {
  const [a, b] = (value || "0/1").split("/").map(Number);
  return b ? a / b : 0;
};
async function probe(
  path: string,
  size: number,
  kind: MareAssetKind
): Promise<ProbeResult> {
  if (kind === "image") {
    if (size > 8 * 1024 * 1024)
      throw new MareError(413, "Envie uma imagem de até 8 MiB.");
    try {
      const { verifyArsenalAsset } = await import(
        "./designCatalog/arsenalAssets"
      );
      const { manifest, metadata } = await verifyArsenalAsset(
        await readFile(path),
        {}
      );
      if (!manifest.mimeType.startsWith("image/")) throw new Error();
      return {
        meta: {
          mime: manifest.mimeType,
          width: Number(metadata.width),
          height: Number(metadata.height),
        },
      };
    } catch {
      throw new MareError(422, "Imagem incompatível.");
    }
  }
  const file = await open(path, "r");
  let format: string;
  let quicktime = false;
  try {
    const head = Buffer.alloc(16);
    await file.read(head, 0, 16, 0);
    if (kind === "project") {
      const length = head.readUInt32BE(12);
      if (
        !/^MARESTUDIO[123]\n$/.test(head.toString("ascii", 0, 12)) ||
        !length ||
        length > MAX_METADATA ||
        length + 16 > size
      )
        throw new MareError(422, "Pacote Maré inválido.");
      const bytes = Buffer.alloc(length);
      if ((await file.read(bytes, 0, length, 16)).bytesRead !== length)
        throw new MareError(422, "Pacote incompleto.");
      try {
        const data = projectMetadata.parse(JSON.parse(bytes.toString()));
        if (
          16 +
            length +
            data.assets.reduce((total, a) => total + a.size, 0) +
            data.imageSizes.reduce((total, n) => total + n, 0) !==
          size
        )
          throw new Error();
        return {
          meta: {
            mime: "application/octet-stream",
            composition_ids: Array.from(
              new Set(data.project.compositions.map(item => item.id))
            ),
          },
        };
      } catch {
        throw new MareError(422, "Índice de arquivos inválido.");
      }
    }
    quicktime = head.toString("ascii", 8, 12) === "qt  ";
    if (head.toString("ascii", 4, 8) === "ftyp") format = "mov";
    else if (head.readUInt32BE(0) === 0x1a45dfa3) format = "matroska";
    else if (
      kind === "audio" &&
      head.toString("ascii", 0, 4) === "RIFF" &&
      head.toString("ascii", 8, 12) === "WAVE"
    )
      format = "wav";
    else if (
      kind === "audio" &&
      (head.toString("ascii", 0, 3) === "ID3" ||
        (head[0] === 255 && (head[1] & 224) === 224))
    )
      format = "mp3";
    else if (kind === "audio" && head.toString("ascii", 0, 4) === "OggS")
      format = "ogg";
    else
      throw new MareError(
        415,
        kind === "video"
          ? "Envie um vídeo MP4, MOV ou WebM."
          : "Formato de áudio incompatível."
      );
  } finally {
    await file.close();
  }
  try {
    const sourceArgs = ["-protocol_whitelist", "file", "-f", format];
    const { stdout } = await run(
      process.env.MARE_FFPROBE || "ffprobe",
      [
        "-v",
        "error",
        ...sourceArgs,
        "-show_entries",
        "stream=codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,color_transfer:stream_side_data=rotation:format=duration",
        "-of",
        "json",
        path,
      ],
      { timeout: 15000, maxBuffer: 64 * 1024 }
    );
    const data = JSON.parse(stdout),
      tracks = data.streams as Track[],
      duration = Number(data.format?.duration);
    const maxDuration = Number(process.env.POSTSPARK_MEDIA_MAX_SECONDS || 600);
    if (!Number.isFinite(duration) || duration <= 0 || duration > maxDuration)
      throw new MareError(422, "Duração incompatível com o limite de mídia.");
    const video = tracks.find(s => s.codec_type === "video"),
      audio = tracks.find(s => s.codec_type === "audio");
    if (kind === "audio") {
      if (!audio || video)
        throw new MareError(422, "Arquivo precisa conter somente áudio.");
      return {
        meta: {
          duration,
          mime: (
            {
              mov: "audio/mp4",
              matroska: "audio/webm",
              mp3: "audio/mpeg",
              wav: "audio/wav",
              ogg: "audio/ogg",
            } as Record<string, string>
          )[format],
        },
      };
    }
    if (
      !video?.width ||
      !video.height ||
      video.width * video.height > 3840 * 2160
    )
      throw new MareError(422, "Dimensões de vídeo incompatíveis.");
    const rotated = video.side_data_list?.some(
      s => Math.abs(s.rotation ?? 0) % 180 === 90
    );
    const hdr = ["smpte2084", "arib-std-b67"].includes(
      video.color_transfer ?? ""
    );
    const vfr =
      Math.abs(rate(video.r_frame_rate) - rate(video.avg_frame_rate)) > 0.5;
    const normalize =
      format === "mov" &&
      (quicktime ||
        video.codec_name !== "h264" ||
        (audio && audio.codec_name !== "aac") ||
        rotated ||
        hdr ||
        vfr);
    const meta = {
      mime: format === "mov" ? "video/mp4" : "video/webm",
      ...(quicktime ? { original_mime: "video/quicktime" } : {}),
      duration,
      width: rotated ? video.height : video.width,
      height: rotated ? video.width : video.height,
    };
    if (!normalize) {
      if (
        format === "matroska" &&
        !["vp8", "vp9", "av1"].includes(video.codec_name)
      )
        throw new MareError(415, "Codec WebM incompatível.");
      return { meta };
    }
    const output = join(dirname(path), "playback.mp4");
    const filters = [
      ...(hdr
        ? [
            "zscale=transfer=linear:npl=100",
            "format=gbrpf32le",
            "tonemap=hable",
            "zscale=primaries=bt709:transfer=bt709:matrix=bt709:range=tv",
          ]
        : []),
      "fps=30",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "setsar=1",
      "format=yuv420p",
    ];
    await run(
      process.env.MARE_FFMPEG || "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-loglevel",
        "error",
        "-threads",
        "2",
        ...sourceArgs,
        "-i",
        path,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-vf",
        filters.join(","),
        "-filter_threads",
        "2",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 6 * 60_000, maxBuffer: 32 * 1024 }
    );
    if ((await stat(output)).size > MAX_MEDIA_BYTES)
      throw new MareError(413, "O vídeo normalizado excede o limite de mídia.");
    return {
      meta: {
        ...meta,
        width: Math.floor(meta.width / 2) * 2,
        height: Math.floor(meta.height / 2) * 2,
      },
      playback: await openAsBlob(output, { type: "video/mp4" }),
    };
  } catch (e) {
    if (e instanceof MareError) throw e;
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new MareError(503, "Processador de mídia indisponível.");
    throw new MareError(422, "Não foi possível preparar a mídia.");
  }
}

export async function receiveMareFile<T>(
  input: Readable,
  kind: MareAssetKind,
  consume: (
    file: Blob,
    hash: string,
    media: ProbedMedia,
    playback?: Blob
  ) => Promise<T>
) {
  const dir = await mkdtemp(join(tmpdir(), "postspark-mare-"));
  const path = join(dir, "upload");
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      input,
      new Transform({
        transform(chunk, _, done) {
          size += chunk.length;
          if (size > MAX_MEDIA_BYTES) {
            done(new MareError(413, "Arquivo excede 128 MiB."));
            return;
          }
          hash.update(chunk);
          done(null, chunk);
        },
      }),
      createWriteStream(path, { flags: "wx", mode: 0o600 })
    );
    const { meta: media, playback } = await probe(path, size, kind);
    return await consume(
      await openAsBlob(path, { type: media.original_mime || media.mime }),
      hash.digest("hex"),
      media,
      playback
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
