import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const captures = {
  name: "canvaslab-local-capture",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (
        req.method !== "POST" ||
        !["/capture.png", "/capture.zip"].includes(req.url)
      )
        return next();
      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 24 * 1024 * 1024) throw new Error("capture too large");
          chunks.push(chunk);
        }
        const data = Buffer.concat(chunks),
          png = req.url.endsWith("png");
        if (
          png
            ? data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
            : data.subarray(0, 2).toString() !== "PK"
        )
          throw new Error("invalid capture");
        await mkdir("/tmp/postspark-canvaslab-browser", { recursive: true });
        await writeFile(
          `/tmp/postspark-canvaslab-browser/export.${png ? "png" : "zip"}`,
          data
        );
        res.end("ok");
      } catch (error) {
        res.statusCode = 400;
        res.end(String(error));
      }
    });
  },
};
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  publicDir: resolve("client/public"),
  plugins: [react(), tailwind(), captures],
  resolve: {
    alias: { "@": resolve("client/src"), "@shared": resolve("shared") },
  },
  server: {
    host: "127.0.0.1",
    port: 5187,
    strictPort: true,
    fs: { allow: [process.cwd()] },
  },
});
await server.listen();
console.log(
  "Conferência local: http://127.0.0.1:5187/harness/canvaslabStabilization/index.html"
);
