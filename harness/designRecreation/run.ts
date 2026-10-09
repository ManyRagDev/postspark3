/** Replay local; --analyze-selected habilita uma análise por imagem autorizada. */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const downloads = path.join(homedir(), "Downloads");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.join(root, "artifacts/design-recreation", runId);
await mkdir(output, { recursive: true });
const analyzeSelected = process.argv.includes("--analyze-selected");
const cases: Array<{ id: string; title: string; recipe?: string; image?: string; sourcePath?: string; sha256?: string }> = analyzeSelected
  ? JSON.parse(await readFile(path.join(root, "artifacts/design-recreation/next-selection.json"), "utf8")).cases
  : [
  { id: "brutalism", title: "Brutalism", recipe: "postspark-admin2-306b5602.json", image: "14516d3436422c5c9d3a85e85b95b22a.jpg" },
  { id: "creative", title: "Creative People", recipe: "postspark-admin2-41a9ed0a.json", image: "0ee1f7691aaa5e28cfd0eb2c8a36cb23.jpg" },
  { id: "paper", title: "Papel rasgado", recipe: "postspark-admin2-d160ef79.json", image: "ed6e7942b198ca4ef238d0818c913535.jpg" },
];
if (cases.length > 4 || cases.some(c => !/^[a-z-]+$/.test(c.id))) throw new Error("Seleção inválida.");
const attempted = new Set<string>();
for (const item of cases) {
  if (item.recipe) await copyFile(path.join(downloads, item.recipe), path.join(output, `${item.id}-input.json`));
  const source = item.sourcePath ?? path.join(downloads, "sources postspark", item.image!);
  if (item.sha256 && createHash("sha256").update(await readFile(source)).digest("hex") !== item.sha256) throw new Error(`Imagem alterada: ${item.id}`);
  await copyFile(source, path.join(output, `${item.id}-reference.jpg`));
}
await writeFile(path.join(output, "manifest.json"), JSON.stringify({ runId, mode: analyzeSelected ? "fresh-analysis" : "replay-saved-recipes", cases }, null, 2));
const server = await createServer({
  configFile: false, root: here, envDir: here,
  plugins: [react(), {
    name: "local-recipe-evidence",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1:5178");
        if (!url.pathname.startsWith("/evidence")) return next();
        try {
          if (req.headers.host !== "127.0.0.1:5178") throw new Error("Host inválido");
          if (req.headers.origin && req.headers.origin !== "http://127.0.0.1:5178") throw new Error("Origem inválida");
          if (req.method === "GET" && url.pathname === "/evidence") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ runId, cases, analyzeSelected })); return;
          }
          const match = url.pathname.match(/^\/evidence\/([a-z-]+)\/(recipe|image|analyze|prepared|baseline|reopened|adapted)$/);
          if (!match) throw new Error("Rota inválida");
          const [, id, action] = match;
          const selected = cases.find(c => c.id === id);
          if (!selected) throw new Error("Caso não selecionado.");
          if (req.method === "GET" && (action === "recipe" || action === "image")) {
            res.setHeader("Content-Type", action === "recipe" ? "application/json" : "image/jpeg");
            try { res.end(await readFile(path.join(output, `${id}-${action === "recipe" ? "input.json" : "reference.jpg"}`))); }
            catch { res.statusCode = 404; res.end("Receita ainda não decodificada."); } return;
          }
          if (req.method !== "POST" || !["analyze", "prepared", "baseline", "reopened", "adapted"].includes(action)) throw new Error("Método inválido");
          if (req.headers.origin !== "http://127.0.0.1:5178") throw new Error("POST exige origem local.");
          let size = 0; const chunks: Buffer[] = [];
          for await (const chunk of req) { size += chunk.length; if (size > 30_000_000) throw new Error("Evidência acima do limite"); chunks.push(chunk); }
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (action === "analyze") {
            if (!analyzeSelected || attempted.has(id) || data.originalHash !== selected.sha256) throw new Error("Análise não autorizada ou já executada.");
            attempted.add(id);
            const started = Date.now();
            try {
              const { decodeRecreation } = await import("../../server/designRecreation");
              const recipe = await decodeRecreation(data.imageDataUrl);
              recipe.scene.source.originalHash = data.originalHash;
              await writeFile(path.join(output, `${id}-raw.json`), JSON.stringify(recipe, null, 2));
              await writeFile(path.join(output, `${id}-input.json`), JSON.stringify(recipe, null, 2));
              await writeFile(path.join(output, `${id}-analysis.json`), JSON.stringify({ status: "success", elapsedMs: Date.now() - started, model: recipe.model, provider: recipe.provider, usage: recipe.usage }, null, 2));
              res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(recipe));
            } catch (error) {
              await writeFile(path.join(output, `${id}-analysis.json`), JSON.stringify({ status: "error", elapsedMs: Date.now() - started, error: String(error) }, null, 2));
              throw error;
            }
            return;
          }
          if (action === "prepared") {
            const { recreationRecipeSchema } = await import("../../shared/designRecreation");
            await writeFile(path.join(output, `${id}-input.json`), JSON.stringify(recreationRecipeSchema.parse(data.recipe), null, 2));
            res.end("ok"); return;
          }
          if (typeof data.png !== "string" || !data.png.startsWith("data:image/png;base64,")) throw new Error("PNG inválido");
          const png = Buffer.from(data.png.split(",")[1], "base64");
          if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Assinatura inválida");
          const evidence = { ...data.metrics, pngSha256: createHash("sha256").update(png).digest("hex"), width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
          await writeFile(path.join(output, `${id}-${action}.png`), png);
          await writeFile(path.join(output, `${id}-${action}.json`), JSON.stringify(data.recipe, null, 2));
          await writeFile(path.join(output, `${id}-${action}-metrics.json`), JSON.stringify(evidence, null, 2));
          res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(evidence));
        } catch (error) { res.statusCode = 400; res.end(String(error)); }
      });
    },
  }],
  resolve: { alias: { "@": path.join(root, "client/src"), "@shared": path.join(root, "shared") } },
  server: { host: "127.0.0.1", port: 5178, strictPort: true, fs: { allow: [root] } },
});
await server.listen();
console.log(`Ensaio ${analyzeSelected ? "com análise autorizada (até 4 imagens)" : "sem IA"}: http://127.0.0.1:5178\nEvidências: ${output}`);
