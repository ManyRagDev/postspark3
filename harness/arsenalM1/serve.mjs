import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
let failFonts = false;
const faultPlugin = {
  name: "arsenal-local-font-test",
  configureServer(server) {
    // Local verification server only; these endpoints aren't in the product/server bundle.
    server.middlewares.use(async (req, res, next) => {
      if (
        req.url === "/harness/arsenalM1/capture-export" &&
        req.method === "POST"
      ) {
        try {
          const chunks = [];
          let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 8 * 1024 * 1024)
              throw new Error("PNG excede limite local");
            chunks.push(chunk);
          }
          const png = Buffer.concat(chunks);
          if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
            throw new Error("PNG inválido");
          await mkdir(resolve("artifacts/arsenal-m1"), { recursive: true });
          await writeFile(
            resolve("artifacts/arsenal-m1/browser-export.png"),
            png
          );
          res.statusCode = 200;
          res.end("ok");
        } catch (error) {
          res.statusCode = 400;
          res.end(error.message);
        }
        return;
      }
      if (req.url?.startsWith("/harness/arsenalM1/test-font-failure")) {
        failFonts =
          new URL(req.url, "http://localhost").searchParams.get("enabled") ===
          "1";
        res.statusCode = 200;
        res.end("ok");
        return;
      }
      if (failFonts && req.url?.startsWith("/arsenal/fonts/")) {
        res.statusCode = 503;
        res.end("Local font failure test");
        return;
      }
      next();
    });
  },
};
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  publicDir: resolve("client/public"),
  plugins: [react(), tailwind(), faultPlugin],
  resolve: {
    alias: { "@": resolve("client/src"), "@shared": resolve("shared") },
  },
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    fs: { allow: [process.cwd()] },
  },
});
await server.listen();
console.log(
  "Conferência local: http://127.0.0.1:5179/harness/arsenalM1/index.html"
);
