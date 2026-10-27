import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { runContinuityVerification } from "./verifyContinuity";
import { runExportVerification } from "./verifyExports";
import { runInteractionsVerification } from "./verifyInteractions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || `/tmp/postspark-canvaslab-integrada-${Date.now()}`;
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function main() {
  console.log(`[VERIFY-INTEGRATED] Iniciando verificação integrada OS-003 a OS-008...`);
  console.log(`[VERIFY-INTEGRATED] Diretório de artefatos: ${ARTIFACT_DIR}`);

  const report: {
    timestamp: string;
    artifactDir: string;
    modules: Record<string, any>;
    bundleSuccess: boolean;
    browserAvailable: boolean;
    checks: Record<string, boolean>;
    success: boolean;
  } = {
    timestamp: new Date().toISOString(),
    artifactDir: ARTIFACT_DIR,
    modules: {},
    bundleSuccess: false,
    browserAvailable: false,
    checks: {},
    success: false,
  };

  try {
    // 1. Verificação de Continuidade
    console.log(`[1/4] Executando verificação de continuidade de carrossel...`);
    const continuity = await runContinuityVerification();
    report.modules.continuity = continuity;
    Object.assign(report.checks, continuity.checks);

    // 2. Verificação de Exportação 4K
    console.log(`[2/4] Executando verificação de exportação e prontidão de recursos...`);
    const exportsResult = await runExportVerification();
    report.modules.exports = exportsResult;
    Object.assign(report.checks, exportsResult.checks);

    // 3. Verificação de Interações
    console.log(`[3/4] Executando verificação de interações, geometria e z-order...`);
    const interactions = await runInteractionsVerification();
    report.modules.interactions = interactions;
    Object.assign(report.checks, interactions.checks);

    // 4. Verificação de bundle do harness
    console.log(`[4/4] Compilando bundle de harness via esbuild...`);
    const outfile = path.join(ARTIFACT_DIR, "harness.bundle.js");
    await esbuild.build({
      entryPoints: [path.join(__dirname, "main.tsx")],
      bundle: true,
      format: "iife",
      outfile,
      sourcemap: "inline",
      jsx: "automatic",
      define: {
        "process.env.NODE_ENV": '"production"',
        "import.meta.env": "{}",
        global: "window",
      },
      loader: {
        ".png": "dataurl",
        ".woff2": "dataurl",
      },
    });
    assertFileExists(outfile);
    report.bundleSuccess = true;
    report.checks.harnessBundleBuilt = true;
    console.log(`[VERIFY-INTEGRATED] Bundle gerado com sucesso: ${outfile}`);

    // 5. Descoberta e execução real de navegador (BUG-CL-029)
    console.log(`[5/5] Descobrindo navegador Chromium para execução do gate de integração real...`);
    const browserExecutable = findBrowserExecutable();
    if (browserExecutable) {
      console.log(`[VERIFY-INTEGRATED] Navegador encontrado em: ${browserExecutable}`);
      try {
        const { chromium } = await import("playwright-core");
        const browser = await chromium.launch({
          executablePath: browserExecutable,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        });
        report.browserAvailable = true;
        report.checks.browserAvailable = true;
        console.log(`[VERIFY-INTEGRATED] Navegador iniciado com sucesso (${browser.version()}).`);
        const page = await browser.newPage();
        page.on("pageerror", (err) => console.error("[PAGE_ERROR]", err));
        page.on("console", (msg) => {
          if (msg.type() === "error") console.error("[PAGE_CONSOLE_ERR]", msg.text());
        });
        await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>CanvasLab Harness</title></head><body style="margin:0;padding:0;background:#000;"><div id="root" style="width:1200px;height:800px;"></div></body></html>`);
        await page.addScriptTag({ content: fs.readFileSync(outfile, "utf8") });
        await page.waitForFunction(() => (window as any).audit && typeof (window as any).audit.getPost === "function", { timeout: 15000 });
        await page.waitForSelector(".konvajs-content", { timeout: 15000 });
        const postTitle = await page.evaluate(() => {
          const post = (window as any).audit?.getPost?.();
          return post?.slides?.[0]?.headline;
        });
        if (!postTitle) throw new Error("Stage Konva ou documento do CanvasLab não inicializado no DOM");
        console.log(`[VERIFY-INTEGRATED] Stage Konva e CanvasLabPage montados com sucesso no navegador real (Slide 1: "${postTitle}").`);
        await browser.close();
        report.checks.browserStageExecution = true;
      } catch (browserErr: any) {
        console.error(`❌ [VERIFY-INTEGRATED] Falha ao executar o navegador:`, browserErr);
        report.browserAvailable = false;
        report.checks.browserAvailable = false;
        report.checks.browserStageExecution = false;
      }
    } else {
      report.browserAvailable = false;
      report.checks.browserAvailable = false;
      report.checks.browserStageExecution = false;
      console.warn(`⚠️ [VERIFY-INTEGRATED] NAVEGADOR INDISPONÍVEL: Nenhum executável válido de Chromium/Chrome foi encontrado no ambiente.`);
      console.warn(`[VERIFY-INTEGRATED] Gate de navegador: NÃO EXECUTADO. O runner reprova a aprovação integrada (código não zero) conforme BUG-CL-029.`);
    }

    report.success = report.browserAvailable && Object.values(report.checks).every(Boolean);
    if (report.success) {
      console.log(`\n✅ [VERIFY-INTEGRATED] Verificação integrada concluída com sucesso!`);
    } else {
      console.error(`\n❌ [VERIFY-INTEGRATED] Verificação integrada NÃO APROVADA (checks pendentes ou navegador indisponível).`);
    }
    console.log(`Checks registrados:`, JSON.stringify(report.checks, null, 2));
  } catch (err: any) {
    console.error(`❌ [VERIFY-INTEGRATED] Falha durante verificação:`, err);
    report.success = false;
  } finally {
    const resultsFile = path.join(ARTIFACT_DIR, "integrated-results.json");
    fs.writeFileSync(resultsFile, JSON.stringify(report, null, 2));
    console.log(`Resultados gravados em: ${resultsFile}`);
    if (!report.success) {
      process.exit(1);
    }
  }
}

function findBrowserExecutable(): string | null {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
    "/opt/google/chrome/google-chrome",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const real = fs.realpathSync(candidate);
        if (fs.existsSync(real)) {
          return real;
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const { chromium } = require("playwright-core");
    const pPath = chromium.executablePath?.();
    if (pPath && fs.existsSync(pPath)) {
      return pPath;
    }
  } catch {
    // ignore
  }

  return null;
}

function assertFileExists(filepath: string) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Arquivo não encontrado: ${filepath}`);
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
