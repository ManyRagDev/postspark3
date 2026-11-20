/** Private Linux processing transport. Never register this server on a public app route. */
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  imageEditorToolsForGroups,
  imageEditInputSchema,
} from "../../shared/imageEditor";
import { ImageProcessor } from "./processor";
import { ImageEditorError } from "./raster";

const internalInput = imageEditInputSchema
  .extend({ actor: z.string().uuid() })
  .strict();
export function imageProcessorServer(options: {
  token: string;
  binary: string;
  workRoot?: string;
}) {
  if (options.token.length < 32)
    throw new Error(
      "Configure a private processing credential of at least 32 characters."
    );
  const tokenHash = createHash("sha256")
    .update(`Bearer ${options.token}`)
    .digest();
  const processor = new ImageProcessor(options);
  let incoming = 0;
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const send = (status: number, data: unknown) => {
      if (!res.destroyed) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      }
    };
    if (req.method === "GET" && req.url === "/healthz") {
      try {
        await access(options.binary, constants.X_OK);
        send(200, { ready: true });
      } catch {
        send(503, { ready: false });
      }
      return;
    }
    if (
      !timingSafeEqual(
        tokenHash,
        createHash("sha256")
          .update(req.headers.authorization ?? "")
          .digest()
      )
    ) {
      send(401, { error: "unauthorized" });
      return;
    }
    if (req.method === "GET" && req.url === "/capabilities") {
      send(200, {
        tools: imageEditorToolsForGroups(
          process.env.ADVANCED_IMAGE_CORE_ENABLED === "true",
          process.env.ADVANCED_IMAGE_FINISHING_ENABLED === "true",
          process.env.ADVANCED_IMAGE_IRIS_ENABLED === "true"
        ),
      });
      return;
    }
    if (req.method !== "POST" || req.url !== "/process") {
      send(404, { error: "not_found" });
      return;
    }
    if (incoming >= 2) {
      send(429, { error: "busy" });
      return;
    }
    incoming++;
    const controller = new AbortController();
    const abort = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", abort);
    res.once("close", abort);
    try {
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        send(400, { error: "invalid" });
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) {
          send(413, { error: "too_large" });
          return;
        }
        chunks.push(chunk);
      }
      const { actor, ...input } = internalInput.parse(
        JSON.parse(Buffer.concat(chunks).toString())
      );
      send(200, await processor.process(input, actor, controller.signal));
    } catch (error) {
      const status =
        error instanceof ImageEditorError
          ? (
              {
                INVALID: 400,
                BUSY: 429,
                UNAVAILABLE: 503,
                TIMEOUT: 504,
                CANCELLED: 499,
                FAILED: 422,
              } as const
            )[error.code]
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 500;
      send(status, {
        error:
          error instanceof ImageEditorError
            ? error.code.toLowerCase()
            : "invalid",
      });
    } finally {
      incoming--;
      req.removeListener("aborted", abort);
      res.removeListener("close", abort);
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = imageProcessorServer({
    token: process.env.ADVANCED_IMAGE_PROCESSOR_TOKEN ?? "",
    binary:
      process.env.PHOTOCRAFT_BIN ??
      "/opt/postspark/photocraft/current/photocraft-cli",
    workRoot: process.env.PHOTOCRAFT_WORK_ROOT,
  });
  server.requestTimeout = 110_000;
  server.listen(
    Number(process.env.IMAGE_PROCESSOR_PORT ?? 9417),
    process.env.IMAGE_PROCESSOR_HOST ?? "127.0.0.1",
    () => console.log("Private image processor ready.")
  );
  const stop = () => {
    server.close();
    setTimeout(() => process.exit(0), 100_000).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
