/**
 * verifyCorrections.ts — Executa e valida o conjunto de contraprovas e testes residuais
 * da rodada corretiva C04 (BUG-CL-016, 025, 027, 029, 031, 032, 033).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface CorrectionResult {
  suite: string;
  passed: boolean;
  output: string;
}

async function main() {
  console.log("=== [VERIFY-CORRECTIONS] Executando verificação de contraprovas e correções C04 ===");
  const results: Record<string, boolean> = {};

  const testFiles = [
    "client/src/pages/CanvasLab/CanvasLabPage.exit.test.tsx",
    "client/src/pages/CanvasLab/components/CanvasSidebar.test.tsx",
    "client/src/pages/CanvasLab/lib/savePreflight.test.ts",
    "client/src/pages/CanvasLab/lib/slideReplication.canonical.test.ts",
    "client/src/pages/CanvasLab/lib/exportReadiness.test.ts",
    "client/src/pages/CanvasLab/components/CanvasPostStage.export.test.tsx",
    "client/src/pages/StudioApp/StudioAppV2BPage.saveIntent.test.tsx",
  ];

  for (const testFile of testFiles) {
    console.log(`\n[RUN] ${testFile}...`);
    try {
      const output = execSync(`pnpm exec vitest run ${testFile} --reporter=dot`, {
        encoding: "utf8",
        stdio: "pipe",
      });
      results[testFile] = true;
      console.log(`✅ ${testFile}: APROVADO`);
    } catch (err: any) {
      results[testFile] = false;
      console.error(`❌ ${testFile}: FALHOU\n`, err.stdout || err.stderr || err.message);
    }
  }

  const allPassed = Object.values(results).every(Boolean);
  const outDir = path.resolve(process.cwd(), "docs/agent-work/canvaslab-reforma/evidencias-correcao-c05");
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "verify-corrections-results.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), allPassed, results }, null, 2)
    );
  } catch {
    // ignore
  }

  if (allPassed) {
    console.log("\n✅ [VERIFY-CORRECTIONS] Todas as contraprovas e testes residuais passaram com sucesso!");
    process.exit(0);
  } else {
    console.error("\n❌ [VERIFY-CORRECTIONS] Algumas contraprovas falharam.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});

