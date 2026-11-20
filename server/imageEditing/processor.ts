import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  IMAGE_EDITOR_MAX_BYTES,
  IMAGE_EDITOR_TIMEOUT_MS,
  imageEditInputSchema,
  imageEditorToolsForGroups,
  type ImageEditInput,
  type ImageEditOperation,
  type ImageEditResult,
} from "../../shared/imageEditor";
import { decodeImageData, ImageEditorError, inspectRaster } from "./raster";

export function operationCommands(
  operation: ImageEditOperation,
  width: number,
  height: number
): Array<[string, Record<string, unknown>]> {
  switch (operation.kind) {
    case "black-white":
      return [["image.adjustments.blackWhite", {}]];
    case "duotone":
      return [
        [
          "image.adjustments.gradientMap",
          {
            stops: [
              [0, operation.dark],
              [1, operation.light],
            ],
            dither: true,
          },
        ],
      ];
    case "shadows-highlights":
      return [
        [
          "image.adjustments.shadowsHighlights",
          {
            shadowAmount: operation.shadows,
            highlightAmount: operation.highlights,
            radius: 30,
            color: 0,
          },
        ],
      ];
    case "look":
      return [
        [
          "image.adjustments.colorLookup",
          { lut: operation.preset === "warm" ? "warm" : "tealOrange" },
        ],
      ];
    case "iris":
      return [
        [
          "filter.blurGallery.irisBlur",
          {
            blur: 12,
            centerX: 0.5,
            centerY: 0.5,
            radiusX: 0.3,
            radiusY: 0.25,
            feather: 0.65,
          },
        ],
      ];
    case "grain":
      return [
        [
          "filter.noise.addNoise",
          {
            amount: operation.amount,
            distribution: "gaussian",
            monochromatic: true,
            seed: 42,
          },
        ],
      ];
    case "adjust":
      return [
        [
          "image.adjustments.brightnessContrast",
          { brightness: operation.brightness, contrast: operation.contrast },
        ],
        [
          "image.adjustments.hueSaturation",
          { saturation: operation.saturation },
        ],
      ];
    case "crop": {
      const x = Math.min(width - 1, Math.floor(operation.x * width)),
        y = Math.min(height - 1, Math.floor(operation.y * height));
      return [
        [
          "image.crop",
          {
            x,
            y,
            width: Math.max(
              1,
              Math.min(
                width,
                Math.round((operation.x + operation.width) * width)
              ) - x
            ),
            height: Math.max(
              1,
              Math.min(
                height,
                Math.round((operation.y + operation.height) * height)
              ) - y
            ),
          },
        ],
      ];
    }
    case "resize":
      return [
        [
          "image.imageSize",
          { width: operation.width, height: operation.height },
        ],
      ];
    case "trim":
      return [["image.trim", { basedOn: "transparent" }]];
    case "mask":
    case "blur":
      return [
        [
          "select.lasso",
          { points: operation.points.map(([x, y]) => [x * width, y * height]) },
        ],
        [
          "select.refineEdge",
          {
            output: operation.kind === "mask" ? "layerMask" : "selection",
            feather: operation.feather,
          },
        ],
        ...(operation.kind === "blur"
          ? [
              ["filter.blur.gaussianBlur", { radius: operation.radius }] as [
                string,
                Record<string, unknown>,
              ],
            ]
          : []),
      ];
  }
}

/** One Linux process group; a terminal outcome waits for close before scratch cleanup. */
export function runImageCli(
  binary: string,
  args: string[],
  directory: string,
  signal?: AbortSignal,
  timeoutMs = IMAGE_EDITOR_TIMEOUT_MS
) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted)
      return reject(new ImageEditorError("CANCELLED", "Edição cancelada."));
    const child = spawn(binary, args, {
      cwd: directory,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        TMPDIR: directory,
        XDG_CACHE_HOME: join(directory, "cache"),
        PHOTOCRAFT_GPU: "0",
        PHOTOCRAFT_NO_DESKTOP_INTEGRATION: "1",
        RAYON_NUM_THREADS: "2",
      },
    });
    let terminal: ImageEditorError | undefined,
      outputBytes = 0;
    const stop = (error: ImageEditorError) => {
      terminal ??= error;
      if (child.pid) {
        try {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch {
          /* The process may have just exited. */
        }
      }
    };
    const abort = () =>
      stop(new ImageEditorError("CANCELLED", "Edição cancelada."));
    const timer = setTimeout(
      () =>
        stop(
          new ImageEditorError(
            "TIMEOUT",
            "A edição demorou demais. Tente uma imagem menor."
          )
        ),
      timeoutMs
    );
    signal?.addEventListener("abort", abort, { once: true });
    const collect = (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 256 * 1024)
        stop(
          new ImageEditorError("FAILED", "Não foi possível concluir a edição.")
        );
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", () => {
      terminal ??= new ImageEditorError(
        "UNAVAILABLE",
        "A edição avançada está temporariamente indisponível."
      );
    });
    child.once("close", code => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (terminal) reject(terminal);
      else if (code !== 0)
        reject(
          new ImageEditorError(
            "FAILED",
            "Não foi possível concluir a edição. Confira a imagem e a seleção."
          )
        );
      else resolve();
    });
    if (signal?.aborted) abort();
  });
}

export class ImageProcessor {
  private active = 0;
  private actors = new Set<string>();
  constructor(
    private options: {
      binary: string;
      workRoot?: string;
      concurrency?: number;
      timeoutMs?: number;
      coreTreatments?: boolean;
      finishingTreatments?: boolean;
      irisTreatment?: boolean;
    }
  ) {}
  async process(
    raw: ImageEditInput,
    actor: string,
    signal?: AbortSignal
  ): Promise<ImageEditResult> {
    const input = imageEditInputSchema.parse(raw);
    const tools = imageEditorToolsForGroups(
      this.options.coreTreatments ??
        process.env.ADVANCED_IMAGE_CORE_ENABLED === "true",
      this.options.finishingTreatments ??
        process.env.ADVANCED_IMAGE_FINISHING_ENABLED === "true",
      this.options.irisTreatment ??
        process.env.ADVANCED_IMAGE_IRIS_ENABLED === "true"
    );
    if (!tools.some(tool => tool.kind === input.operation.kind))
      throw new ImageEditorError(
        "UNAVAILABLE",
        "Este tratamento está temporariamente indisponível."
      );
    if (
      this.active >= (this.options.concurrency ?? 2) ||
      this.actors.has(actor)
    )
      throw new ImageEditorError(
        "BUSY",
        "O editor está ocupado. Aguarde um instante e tente novamente."
      );
    if (signal?.aborted)
      throw new ImageEditorError("CANCELLED", "Edição cancelada.");
    this.active++;
    this.actors.add(actor);
    let directory: string | undefined;
    try {
      const source = decodeImageData(input.imageData);
      const tool = tools.find(t => t.kind === input.operation.kind)!;
      if (
        "maxDimension" in tool &&
        Math.max(source.width, source.height) > tool.maxDimension
      )
        throw new ImageEditorError(
          "INVALID",
          `Este tratamento aceita até ${tool.maxDimension} px por eixo. Use Dimensões antes de aplicar.`
        );
      const root = this.options.workRoot ?? tmpdir();
      await mkdir(root, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(root, "image-edit-"));
      const original = join(
          directory,
          `input.${source.mimeType.split("/")[1]}`
        ),
        output = join(directory, `result.${input.format}`);
      await writeFile(original, source.bytes, { mode: 0o600 });
      const args = ["run", original, "--no-gpu"];
      for (const [command, parameters] of operationCommands(
        input.operation,
        source.width,
        source.height
      ))
        args.push("--cmd", command, "--params", JSON.stringify(parameters));
      args.push("--out", output);
      await runImageCli(
        this.options.binary,
        args,
        directory,
        signal,
        this.options.timeoutMs
      );
      if (signal?.aborted)
        throw new ImageEditorError("CANCELLED", "Edição cancelada.");
      if ((await stat(output)).size > IMAGE_EDITOR_MAX_BYTES)
        throw new ImageEditorError(
          "INVALID",
          "O resultado excede 8 MiB. Reduza as dimensões ou escolha WebP."
        );
      const bytes = await readFile(output),
        result = inspectRaster(bytes);
      if (result.mimeType !== `image/${input.format}`)
        throw new ImageEditorError(
          "FAILED",
          "O resultado da edição não é válido."
        );
      if (
        !["resize", "crop", "trim"].includes(input.operation.kind) &&
        (result.width !== source.width || result.height !== source.height)
      )
        throw new ImageEditorError(
          "FAILED",
          "A edição retornou dimensões inesperadas."
        );
      if (
        input.operation.kind === "resize" &&
        (result.width !== input.operation.width ||
          result.height !== input.operation.height)
      )
        throw new ImageEditorError(
          "FAILED",
          "A edição retornou dimensões inesperadas."
        );
      if (input.operation.kind === "crop") {
        const expected = operationCommands(
          input.operation,
          source.width,
          source.height
        )[0][1];
        if (
          result.width !== expected.width ||
          result.height !== expected.height
        )
          throw new ImageEditorError(
            "FAILED",
            "A edição retornou dimensões inesperadas."
          );
      }
      return {
        requestId: input.requestId,
        imageData: `data:${result.mimeType};base64,${bytes.toString("base64")}`,
        sourceSha256: source.sha256,
        resultSha256: result.sha256,
        sourceDimensions: { width: source.width, height: source.height },
        resultDimensions: { width: result.width, height: result.height },
        format: input.format,
      };
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.active--;
        this.actors.delete(actor);
      }
    }
  }
}
