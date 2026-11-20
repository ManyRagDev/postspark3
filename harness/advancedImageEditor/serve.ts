import { imageEditorToolsForGroups } from "../../shared/imageEditor";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createImageEditorRouter } from "../../server/routers/imageEditor";
import { router } from "../../server/_core/trpc";
import { ImageProcessor } from "../../server/imageEditing/processor";
import { decodeImageData } from "../../server/imageEditing/raster";
const root = "/tmp/postspark-image-editor-browser";
const owner = "00000000-0000-0000-0000-000000000001";
await mkdir(join(root, "media"), { recursive: true, mode: 0o700 });
const processor = new ImageProcessor({
  binary:
    process.env.PHOTOCRAFT_BIN ??
    "/tmp/postspark-photocraft-validation/current/photocraft-cli",
  workRoot: join(root, "scratch"),
});
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: router({
      imageEditor: createImageEditorRouter({
        configured: () => true,
        capabilities: async () => ({ available:true, tools:imageEditorToolsForGroups(true,true) }),
        process: (input, actor, signal) =>
          processor.process(input, actor, signal),
        save: async (imageData, actor, signal) => {
          if (signal?.aborted) throw new Error("cancelled");
          const image = decodeImageData(imageData),
            hash = createHash("sha256").update(image.bytes).digest("hex");
          await writeFile(join(root, "media", hash), image.bytes, {
            mode: 0o600,
          });
          return { url: `/api/post-media/${actor}/${hash}` };
        },
      }),
    }),
    createContext: ({ req, res }) => ({
      req,
      res,
      user: {
        id: owner,
        name: "Local fixture",
        email: "fixture@example.test",
        role: "admin",
      },
    }),
  })
);
app.get("/api/post-media/:owner/:hash", async (req, res) => {
  if (req.params.owner !== owner || !/^[a-f0-9]{64}$/.test(req.params.hash)) {
    res.sendStatus(404);
    return;
  }
  try {
    const bytes = await readFile(join(root, "media", req.params.hash));
    res
      .type(bytes[0] === 137 ? "png" : bytes[0] === 255 ? "jpeg" : "webp")
      .send(bytes);
  } catch {
    res.sendStatus(404);
  }
});
app.get("/fixture-image", (_req, res) => {
  const image = createCanvas(320, 320),
    ctx = image.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 320, 320);
  gradient.addColorStop(0, "#2563eb");
  gradient.addColorStop(1, "#f97316");
  ctx.fillStyle = gradient;
  ctx.fillRect(24, 24, 272, 272);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(160, 160, 70, 0, Math.PI * 2);
  ctx.fill();
  res.type("png").send(image.toBuffer("image/png"));
});
app.post("/save-model", async (req, res) => {
  await writeFile(join(root, "saved.json"), JSON.stringify(req.body), {
    mode: 0o600,
  });
  res.json({ saved: true });
});
app.get("/saved-model", async (_req, res) => {
  try {
    res.type("json").send(await readFile(join(root, "saved.json")));
  } catch {
    res.sendStatus(404);
  }
});
app.post(
  "/capture.png",
  express.raw({ type: "*/*", limit: "24mb" }),
  async (req, res) => {
    await writeFile(join(root, "export.png"), req.body, { mode: 0o600 });
    res.sendStatus(200);
  }
);
app.post("/capture.zip", express.raw({ type: "*/*", limit: "64mb" }), async (req,res) => {
  await writeFile(join(root, "export.zip"), req.body, { mode: 0o600 }); res.sendStatus(200);
});
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  publicDir: resolve("client/public"),
  plugins: [
    react(),
    tailwind(),
    {
      name: "image-editor-local-api",
      configureServer(server) {
        server.middlewares.use(app);
      },
    },
  ],
  resolve: {
    alias: { "@": resolve("client/src"), "@shared": resolve("shared") },
  },
  server: {
    host: "127.0.0.1",
    port: 5189,
    strictPort: true,
    fs: { allow: [process.cwd()] },
  },
});
await server.listen();
console.log(
  "Local journey: http://127.0.0.1:5189/harness/advancedImageEditor/index.html"
);
console.log(
  "Actual CLI and API; fixture identity and filesystem media store. No hosted writes or paid providers."
);
