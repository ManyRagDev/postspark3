import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";
import fs from "node:fs/promises";
const capture = {
  name: "arsenal-v2-local-evidence",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (
        ![
          "/harness/arsenalV2/capture",
          "/harness/arsenalV2/benchmark",
          "/harness/arsenalV2/cold-batch",
        ].includes(req.url) ||
        req.method !== "POST"
      )
        return next();
      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 8 * 1024 * 1024) throw new Error("evidence too large");
          chunks.push(chunk);
        }
        const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (req.url === "/harness/arsenalV2/cold-batch") {
          if (
            report.source !== "browser-official-compiler" ||
            report.batches !== 1 ||
            report.variations !== 3 ||
            !Number.isFinite(report.durationMs)
          )
            throw new Error("Invalid cold batch");
          const file = resolve(
            "artifacts/arsenal-v2/browser-benchmark-cold.json"
          );
          let records = [];
          try {
            records = JSON.parse(await fs.readFile(file, "utf8")).records;
          } catch {}
          records.push({ ...report, recordedAt: new Date().toISOString() });
          const durations = records
            .map(r => r.durationMs)
            .sort((a, b) => a - b);
          await fs.writeFile(
            file,
            JSON.stringify(
              {
                condition: report.condition,
                batches: records.length,
                variations: records.length * 3,
                p95Ms: durations[Math.ceil(0.95 * durations.length) - 1],
                records,
              },
              null,
              2
            )
          );
          res.end("ok");
          return;
        }
        if (req.url === "/harness/arsenalV2/benchmark") {
          if (
            report.source !== "browser-official-compiler" ||
            report.batches !== 30 ||
            report.variations !== 90
          )
            throw new Error("Invalid benchmark");
          await fs.mkdir(resolve("artifacts/arsenal-v2"), { recursive: true });
          await fs.writeFile(
            resolve("artifacts/arsenal-v2/browser-benchmark-cache.json"),
            JSON.stringify(report, null, 2)
          );
          res.end("ok");
          return;
        }
        if (!/^[a-f0-9-]{36}:[a-zA-Z0-9_-]{1,160}$/.test(report.candidateId))
          throw new Error("invalid identity");
        const png = Buffer.from(report.png.split(",")[1], "base64");
        if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
          throw new Error("invalid PNG");
        const dir = resolve("artifacts/arsenal-v2/browser-previews");
        await fs.mkdir(dir, { recursive: true });
        const stem = report.candidateId.replace(":", "_");
        await fs.writeFile(resolve(dir, stem + ".png"), png);
        delete report.png;
        await fs.writeFile(
          resolve(dir, stem + ".json"),
          JSON.stringify(report, null, 2)
        );
        res.end("ok");
      } catch (e) {
        res.statusCode = 400;
        res.end(e.message);
      }
    });
  },
};
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  publicDir: resolve("client/public"),
  plugins: [react(), tailwind(), capture],
  resolve: {
    alias: { "@": resolve("client/src"), "@shared": resolve("shared") },
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    fs: { allow: [process.cwd()] },
    proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: false } },
  },
});
await server.listen();
console.log(
  "Arsenal V2 authenticated review: http://localhost:5180/harness/arsenalV2/index.html"
);
