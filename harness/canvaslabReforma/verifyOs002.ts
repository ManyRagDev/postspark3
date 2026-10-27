import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import esbuild from "esbuild";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const defaultArtifactDir = `/tmp/postspark-os002-c02-${Date.now()}`;
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || defaultArtifactDir;
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
console.log(`Diretório de artefatos desta execução: ${ARTIFACT_DIR}`);

interface GuardDiagnostic {
  etapa: string;
  slide: string;
  instancia: string;
  motivo: string;
}

class VisualGuardError extends Error {
  diagnostic: GuardDiagnostic;
  constructor(diag: GuardDiagnostic) {
    super(
      `[GUARD REJEITOU CAPTURA] Etapa: ${diag.etapa} | Slide: ${diag.slide} | Instância: ${diag.instancia} | Motivo: ${diag.motivo}`
    );
    this.name = "VisualGuardError";
    this.diagnostic = diag;
  }
}

interface VisualReadinessTarget {
  stepName: string;
  expectedSlideIndex: number;
  expectedSlideId?: string;
  minAuthorialImages?: number;
  timeoutMs?: number;
}

async function assertStageVisualReadiness(
  page: any,
  target: VisualReadinessTarget
): Promise<any> {
  const timeoutMs = target.timeoutMs ?? 7000;
  const startTime = Date.now();
  let lastDiagnosis: GuardDiagnostic = {
    etapa: target.stepName,
    slide: `índice ${target.expectedSlideIndex}`,
    instancia: "desconhecida",
    motivo: "Aguardando inicialização do Stage",
  };

  while (Date.now() - startTime < timeoutMs) {
    const result = await page.evaluate(
      (args: {
        stepName: string;
        expectedSlideIndex: number;
        expectedSlideId?: string;
        minAuthorialImages: number;
      }) => {
        const audit = (window as any).audit;
        if (!audit?.mainProps?.post) {
          return { ready: false, reason: "audit.mainProps.post ainda não disponível" };
        }

        const post = audit.mainProps.post;
        if (post.currentSlideIndex !== args.expectedSlideIndex) {
          return {
            ready: false,
            slide: `índice ${post.currentSlideIndex}`,
            reason: `Slide ativo divergente (esperado: índice ${args.expectedSlideIndex}, atual: índice ${post.currentSlideIndex})`,
          };
        }

        const activeSlide = post.slides[post.currentSlideIndex];
        if (!activeSlide) {
          return {
            ready: false,
            slide: `índice ${post.currentSlideIndex}`,
            reason: `Slide ativo no índice ${post.currentSlideIndex} não encontrado em post.slides`,
          };
        }

        const slideLabel = `${activeSlide.id} (índice ${post.currentSlideIndex})`;

        if (args.expectedSlideId && activeSlide.id !== args.expectedSlideId) {
          return {
            ready: false,
            slide: slideLabel,
            reason: `ID do slide ativo diverge do esperado (esperado: ${args.expectedSlideId}, atual: ${activeSlide.id})`,
          };
        }

        // 1. Status de erro no Stage alvo
        const mainStageContainer = document.querySelector('[data-audit-stage="main"]');
        if (!mainStageContainer) {
          return { ready: false, slide: slideLabel, reason: "Container [data-audit-stage='main'] ausente no DOM" };
        }

        const statusEl = mainStageContainer.querySelector('[role="status"]');
        if (statusEl) {
          const text = (statusEl.textContent || "").trim();
          if (
            text.includes("indisponível") ||
            text.includes("error") ||
            text.includes("Erro") ||
            text.includes("BLOCKED")
          ) {
            return {
              ready: false,
              fatalError: true,
              slide: slideLabel,
              failedLayerId: "status-recurso",
              reason: `Status de recurso em erro no Stage: "${text}"`,
            };
          }
        }

        // 2. Stage Konva principal
        const konvaStages = audit.Konva?.stages || [];
        const stage = konvaStages.find((s: any) =>
          s.container().closest("[data-audit-stage]")?.getAttribute("data-audit-stage") === "main"
        );
        if (!stage) {
          return { ready: false, slide: slideLabel, reason: "Stage Konva principal não inicializado" };
        }

        // 3. Composição e camadas autorais de imagem
        const comp = activeSlide.composition;
        if (!comp) {
          return { ready: false, fatalError: true, slide: slideLabel, reason: "Composição ausente no slide ativo" };
        }

        const authorialLayers = comp.authorialLayers || [];
        const authorialImages = authorialLayers.filter((l: any) => l.kind === "image");

        if (authorialImages.length < args.minAuthorialImages) {
          return {
            ready: false,
            fatalError: true,
            slide: slideLabel,
            failedLayerId: "camadas-autorais",
            reason: `Desaparecimento de camadas de imagem: esperado no mínimo ${args.minAuthorialImages}, encontradas ${authorialImages.length}`,
          };
        }

        // 4. Validação de cada imagem autoral na cena
        const imageManifest: any[] = [];
        for (const layer of authorialImages) {
          const groupName = `arsenal-${layer.id}`;
          const group = stage.find((n: any) => n.name && n.name() === groupName)[0];
          if (!group) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Grupo Konva '${groupName}' não encontrado na cena para a camada autoral '${layer.id}'`,
            };
          }

          if (!group.isVisible() || group.getAbsoluteOpacity() <= 0) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Grupo Konva '${groupName}' não está visível (visible=${group.isVisible()}, opacity=${group.getAbsoluteOpacity()})`,
            };
          }

          const imageNodes = group.find("Image");
          if (!imageNodes || imageNodes.length === 0) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Nó Konva Image ausente no grupo '${groupName}' para camada autoral '${layer.id}' (recurso não decodificado ou não montado)`,
            };
          }

          const konvaImg = imageNodes[0];
          if (!konvaImg.isVisible() || konvaImg.getAbsoluteOpacity() <= 0 || konvaImg.width() <= 0 || konvaImg.height() <= 0) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Nó Konva Image no grupo '${groupName}' possui dimensões ou visibilidade inválidas (visible=${konvaImg.isVisible()}, opacity=${konvaImg.getAbsoluteOpacity()}, ${konvaImg.width()}x${konvaImg.height()})`,
            };
          }

          const htmlImg = konvaImg.image();
          if (!htmlImg) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Nó Konva Image no grupo '${groupName}' não possui objeto HTMLImageElement`,
            };
          }

          if (!htmlImg.complete) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Objeto HTMLImageElement no grupo '${groupName}' ainda não concluiu carregamento (complete=false)`,
            };
          }

          if (htmlImg.naturalWidth <= 0 || htmlImg.naturalHeight <= 0) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Objeto HTMLImageElement no grupo '${groupName}' possui dimensões naturais inválidas (${htmlImg.naturalWidth}x${htmlImg.naturalHeight})`,
            };
          }

          if (layer.url && typeof htmlImg.src === "string") {
            if (!htmlImg.src.startsWith(layer.url) && !layer.url.startsWith(htmlImg.src)) {
              return {
                ready: false,
                slide: slideLabel,
                failedLayerId: layer.id,
                reason: `URL da imagem no nó Konva diverge da esperada`,
              };
            }
          }

          const layerNode = konvaImg.getLayer();
          if (!layerNode || !layerNode.isVisible()) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `Camada Konva contendo o nó Image no grupo '${groupName}' não está visível`,
            };
          }

          let clientRect = { x: 0, y: 0, width: 0, height: 0 };
          try {
            clientRect = konvaImg.getClientRect({ skipTransform: false });
          } catch {}

          if (clientRect.width <= 0 || clientRect.height <= 0) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: layer.id,
              reason: `ClientRect do nó Image no grupo '${groupName}' tem área zero (${clientRect.width}x${clientRect.height})`,
            };
          }

          imageManifest.push({
            layerId: layer.id,
            groupName,
            urlPrefix: (layer.url || "").slice(0, 30) + "...",
            complete: htmlImg.complete,
            naturalWidth: htmlImg.naturalWidth,
            naturalHeight: htmlImg.naturalHeight,
            nodeWidth: konvaImg.width(),
            nodeHeight: konvaImg.height(),
            nodeOpacity: konvaImg.getAbsoluteOpacity(),
            clientRect: {
              x: Math.round(clientRect.x),
              y: Math.round(clientRect.y),
              width: Math.round(clientRect.width),
              height: Math.round(clientRect.height),
            },
          });
        }

        // Validação das camadas autorais de texto
        const authorialTexts = authorialLayers.filter((l: any) => l.kind === "text");
        const textManifest: any[] = [];
        for (const textLayer of authorialTexts) {
          const textGroupName = `arsenal-${textLayer.id}`;
          const textGroup = stage.find((n: any) => n.name && n.name() === textGroupName)[0];
          if (!textGroup) {
            return {
              ready: false,
              slide: slideLabel,
              failedLayerId: textLayer.id,
              reason: `Grupo Konva de texto '${textGroupName}' ausente no Stage`,
            };
          }
          textManifest.push({
            layerId: textLayer.id,
            groupName: textGroupName,
            text: textLayer.text,
            visible: textGroup.isVisible(),
          });
        }

        return {
          ready: true,
          step: args.stepName,
          slide: slideLabel,
          authorialImagesCount: authorialImages.length,
          images: imageManifest,
          texts: textManifest,
        };
      },
      {
        stepName: target.stepName,
        expectedSlideIndex: target.expectedSlideIndex,
        expectedSlideId: target.expectedSlideId,
        minAuthorialImages: target.minAuthorialImages ?? 1,
      }
    );

    if (result.ready) {
      return result;
    }

    lastDiagnosis = {
      etapa: target.stepName,
      slide: result.slide ?? `índice ${target.expectedSlideIndex}`,
      instancia: result.failedLayerId ?? "autoral",
      motivo: result.reason ?? "Não pronto",
    };

    if (result.fatalError) {
      throw new VisualGuardError(lastDiagnosis);
    }

    await page.waitForTimeout(60);
  }

  throw new VisualGuardError({
    etapa: target.stepName,
    slide: lastDiagnosis.slide,
    instancia: lastDiagnosis.instancia,
    motivo: `Timeout de ${timeoutMs}ms aguardando prontidão visual: ${lastDiagnosis.motivo}`,
  });
}

async function countVisiblePixels(pngBuffer: Buffer): Promise<{ total: number; visible: number }> {
  const img = await loadImage(pngBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let visible = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) visible++;
  }
  return { total: img.width * img.height, visible };
}

async function buildHarness(): Promise<string> {
  const root = process.cwd();
  const stagePath = path.join(root, "client/src/pages/CanvasLab/components/CanvasPostStage.tsx");
  const outfile = path.join(ARTIFACT_DIR, "os002.bundle.js");

  const plugin: esbuild.Plugin = {
    name: "os002-audit-boundaries",
    setup(build) {
      build.onResolve({ filter: /CanvasPostStage(?:\.tsx)?$/ }, (args) =>
        args.importer === "audit-stage" ? null : { path: "audit-stage", namespace: "audit" }
      );
      build.onLoad({ filter: /audit-stage/, namespace: "audit" }, () => ({
        loader: "tsx",
        resolveDir: root,
        contents: `import React from 'react';
import { CanvasPostStage as Real } from ${JSON.stringify(stagePath)};
export const CanvasPostStage = React.forwardRef((p, ref) => {
  const main = Boolean(p.onUpdateText);
  window.audit[main ? 'mainProps' : 'previewProps'] = p;
  return <div data-audit-stage={main ? 'main' : 'preview'}><Real {...p} ref={ref} /></div>;
});`,
      }));
      build.onResolve({ filter: /(?:^|\/)lib\/trpc(?:\.ts)?$/ }, () => ({
        path: "audit-trpc",
        namespace: "audit",
      }));
      build.onLoad({ filter: /audit-trpc/, namespace: "audit" }, () => ({
        loader: "js",
        contents: `const proxy = new Proxy(() => {}, {
  get(_, key) {
    if (key === 'useMutation') return () => ({ isPending: false, mutateAsync: async () => { throw Error('AUDIT_REMOTE_MUTATION_BLOCKED'); } });
    if (key === 'useQuery') return () => ({ data: undefined, isLoading: false, isPending: false });
    if (key === 'useUtils') return () => proxy;
    if (key === 'invalidate') return async () => {};
    return proxy;
  }
});
export const trpc = proxy;`,
      }));
      build.onResolve({ filter: /UserTopMenu(?:\.tsx)?$/ }, () => ({
        path: "audit-user",
        namespace: "audit",
      }));
      build.onLoad({ filter: /audit-user/, namespace: "audit" }, () => ({
        contents: "export default function() { return null; }",
        loader: "js",
      }));
    },
  };

  await esbuild.build({
    entryPoints: [path.join(root, "harness/canvaslabReforma/os002.tsx")],
    bundle: true,
    outfile,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: {
      "import.meta.env": "{}",
      "process.env.NODE_ENV": '"production"',
    },
    plugins: [plugin],
    logLevel: "warning",
  });

  return outfile;
}

(async () => {
  const isMissingRequiredFont = process.argv.includes("--scenario=missing-required-font");
  console.log(`Iniciando harness OS-002 (cenário: ${isMissingRequiredFont ? "missing-required-font" : "positivo"})...`);

  const bundlePath = await buildHarness();
  const bundleJs = fs.readFileSync(bundlePath, "utf8");

  const executablePath = fs.existsSync("/opt/google/chrome/chrome")
    ? "/opt/google/chrome/chrome"
    : fs.existsSync("/opt/google/chrome/google-chrome")
    ? "/opt/google/chrome/google-chrome"
    : fs.existsSync("/usr/bin/google-chrome")
    ? "/usr/bin/google-chrome"
    : chromium.executablePath();

  console.log(`Lançando navegador: ${executablePath}`);
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  console.log("Navegador lançado!");

  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors: string[] = [];
  const blocked: string[] = [];
  page.on("pageerror", (e) => {
    console.error("[PAGEERROR]", e.message);
    errors.push(e.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("[CONSOLE ERROR]", msg.text());
    }
  });

  const cssPath = path.join(process.cwd(), "dist/public/assets/index-yq1an1TV.css");
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("https://audit-os002.invalid/")) {
      return route.fulfill({
        contentType: "text/html",
        body: `<!DOCTYPE html>
<html>
<head>
  <style>${css}</style>
</head>
<body style="margin:0;background:#121214;color:white;">
  <div id="root"></div>
</body>
</html>`,
      });
    }
    blocked.push(url);
    return route.abort();
  });

  const wait = (ms = 350) => page.waitForTimeout(ms);
  const doc = () => page.evaluate(() => structuredClone((window as any).audit.mainProps.post));
  const pixels = async (role = "main"): Promise<string> =>
    page.evaluate((r) => {
      const stage = (window as any).audit.Konva.stages.find(
        (s: any) =>
          s.container().closest("[data-audit-stage]")?.getAttribute("data-audit-stage") === r
      );
      if (!stage) throw Error("Missing stage " + r);
      return stage.toDataURL({ pixelRatio: 1 });
    }, role);

  // ══════════════════════════════════════════════════════════════════════════════
  // CENÁRIO NEGATIVO: missing-required-font (RC-06)
  // ══════════════════════════════════════════════════════════════════════════════
  if (isMissingRequiredFont) {
    console.log("Executando cenário controlado: missing-required-font...");
    try {
      await page.goto("https://audit-os002.invalid/?scenario=missing-required-font");
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("postspark.savePreference", "new");
        (window as any).fetch = async () => {
          throw Error("AUDIT_NETWORK_BLOCKED");
        };
      });

      await page.addScriptTag({ content: bundleJs });
      await page.waitForFunction(() => (window as any).audit?.mainProps);
      await wait(600);

      // 1. Verifica se o banner de status de erro de fonte apareceu no DOM
      const statusElement = await page.waitForSelector('[data-audit-stage="main"] [role="status"]', { timeout: 6000 });
      const statusText = (await statusElement.textContent()) || "";
      console.log(`Status detectado no Stage: "${statusText}"`);
      assert.ok(
        statusText.includes("Fonte indisponível") || statusText.includes("AUDIT_NETWORK_BLOCKED"),
        `Status deve alertar fonte indisponível, recebido: "${statusText}"`
      );

      // 2. Verifica que a camada do Stage está vazia (0 pixels visíveis desenhados)
      const stageDataUrl = await pixels("main");
      const emptyBuf = Buffer.from(stageDataUrl.split(",")[1], "base64");
      const emptyAnalysis = await countVisiblePixels(emptyBuf);
      assert.equal(
        emptyAnalysis.visible,
        0,
        `Stage não deve renderizar arte com fonte obrigatória indisponível (esperado 0, obtido ${emptyAnalysis.visible})`
      );

      const negResult = {
        scenario: "missing-required-font",
        statusText,
        visiblePixels: emptyAnalysis.visible,
        totalPixels: emptyAnalysis.total,
        rejectionDemonstrated: true,
        exitCode: 1,
        reason: "Fonte obrigatória bloqueada com sucesso; Stage recusou desenho e notificou indisponibilidade conforme RC-06",
      };

      fs.writeFileSync(
        path.join(ARTIFACT_DIR, "negative-scenario.json"),
        JSON.stringify(negResult, null, 2)
      );

      console.log("Cenário negativo concluído com sucesso (falha esperada por ausência de fonte obrigatória):");
      console.log(JSON.stringify(negResult, null, 2));

      await browser.close();
      // Conforme RC-06: encerra com exit diferente de zero!
      process.exit(1);
    } catch (err: any) {
      console.error("Falha inesperada no cenário negativo:", err);
      await browser.close();
      process.exit(2);
    }
  }

  console.log("Navegando para https://audit-os002.invalid/...");
  await page.goto("https://audit-os002.invalid/");
  console.log("Navegado com sucesso!");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("postspark.savePreference", "new");
    (window as any).fetch = async () => {
      throw Error("AUDIT_NETWORK_BLOCKED");
    };
  });

  console.log(`Injetando bundle (${bundleJs.length} bytes)...`);
  await page.addScriptTag({ content: bundleJs });
  console.log("Script injetado! Aguardando audit.mainProps...");

  const out: Record<string, any> = {
    browser: browser.version(),
    artifactDir: ARTIFACT_DIR,
    checks: {},
    manifest: {},
    errors,
    blockedRequests: blocked,
    pixels: {},
    pixelCounts: {},
  };

  try {
    await page.waitForFunction(() => Boolean((window as any).audit?.mainProps), null, { timeout: 15000 });
    console.log("audit.mainProps detectado!");
    await wait(400);

    console.log("Passo 0: verificando statusBanner no Stage principal...");
    const statusBanner = await page.$('[data-audit-stage="main"] [role="status"]');
    console.log("statusBanner:", statusBanner);
    assert.equal(statusBanner, null, "Stage não deve exibir banner de erro no percurso positivo");
    out.checks.stageReadyNoErrors = true;

    console.log("Passo 0b: obtendo initialDoc...");
    const initialDoc = await doc();
    console.log("initialDoc obtido! slides:", initialDoc.slides.length);
    assert.equal(initialDoc.slides.length, 3, "Fixture C deve iniciar com 3 slides");
    assert.equal(initialDoc.currentSlideIndex, 0, "Slide 0 deve ser o ativo inicial");

    // 1. Validar prontidão visual da origem e capturar pixels iniciais do slide 0
    console.log("Passo 1: validando prontidão visual e imagens autorais na origem...");
    const originReadiness = await assertStageVisualReadiness(page, {
      stepName: "initialOrigin",
      expectedSlideIndex: 0,
      expectedSlideId: "slide-0",
      minAuthorialImages: 1,
    });
    out.manifest.initialOrigin = originReadiness;
    out.checks.authorialImageReadiness = true;
    console.log("Origem validada com sucesso pelo guard! Imagens autorais:", originReadiness.images.length);

    console.log("Passo 1b: capturando pixels da origem via pixels('main')...");
    const initialOriginPixels = await pixels("main");
    console.log("initialOriginPixels capturado! length:", initialOriginPixels?.length);

    console.log("Passo 1c: calculando hash e visiblePixels...");
    const initialOriginHash = crypto.createHash("sha256").update(initialOriginPixels).digest("hex");
    const originBuf = Buffer.from(initialOriginPixels.split(",")[1], "base64");
    const originAnalysis = await countVisiblePixels(originBuf);
    console.log("originAnalysis:", originAnalysis);

    assert.ok(
      originAnalysis.visible > 0,
      `Pixels da origem devem ser visíveis (alpha > 0), encontrados: ${originAnalysis.visible}/${originAnalysis.total}`
    );
    out.pixels.initialOrigin = initialOriginHash;
    out.pixelCounts.origin = originAnalysis;
    fs.writeFileSync(path.join(ARTIFACT_DIR, "os002-origin.png"), originBuf);
    out.checks.originPixelsVisible = true;
    console.log("Passo 1 concluído!");

    // 2. Duplicar Slide C (slide 0) com camadas autorais e acabamento
    console.log("Executando: Duplicar slide 0...");
    const slideCards = page.locator('[draggable="true"]');
    await slideCards.first().hover();
    await page.locator('button[title="Duplicar Slide"]').first().click({ force: true });
    await wait();

    const afterDupDoc = await doc();
    assert.equal(afterDupDoc.slides.length, 4, "Após duplicar, documento deve ter 4 slides");
    assert.equal(afterDupDoc.currentSlideIndex, 1, "Cópia deve ser o novo slide ativo (índice 1)");

    const originSlide = afterDupDoc.slides[0];
    const copySlide = afterDupDoc.slides[1];

    // Validar prontidão visual da cópia recém-duplicada
    console.log("Passo 2b: validando prontidão visual e imagens autorais na cópia inicial...");
    const initialCopyReadiness = await assertStageVisualReadiness(page, {
      stepName: "initialCopy",
      expectedSlideIndex: 1,
      expectedSlideId: copySlide.id,
      minAuthorialImages: 1,
    });
    out.manifest.initialCopy = initialCopyReadiness;
    console.log("Cópia inicial validada com sucesso pelo guard! Imagens autorais:", initialCopyReadiness.images.length);

    // Pixels da cópia recém-criada (antes de editar) devem ser equivalentes à origem
    const initialCopyPixels = await pixels("main");
    const initialCopyHash = crypto.createHash("sha256").update(initialCopyPixels).digest("hex");
    const copyInitialBuf = Buffer.from(initialCopyPixels.split(",")[1], "base64");
    const copyInitialAnalysis = await countVisiblePixels(copyInitialBuf);

    assert.ok(copyInitialAnalysis.visible > 0, "Pixels da cópia inicial devem ser visíveis");
    assert.equal(
      initialCopyHash,
      initialOriginHash,
      "Cópia recém-criada deve ser visualmente equivalente à origem antes da edição"
    );
    fs.writeFileSync(path.join(ARTIFACT_DIR, "os002-initial-copy.png"), copyInitialBuf);
    out.checks.initialCopyEquivalentToOrigin = true;

    assert.ok(copySlide.composition, "Slide cópia deve possuir composition");
    const parseResult = await page.evaluate(
      (comp) => Boolean((window as any).audit.readArsenalComposition(comp)),
      copySlide.composition
    );
    assert.ok(parseResult, "Composition da cópia deve passar por readArsenalComposition");

    // Validar integridade e remapeamento de IDs das camadas autorais
    const originAuth = originSlide.composition.authorialLayers.find((l: any) => l.kind === "text");
    const copyAuth = copySlide.composition.authorialLayers.find((l: any) => l.kind === "text");
    assert.ok(originAuth && copyAuth, "Camadas autorais de texto devem existir na origem e na cópia");
    assert.notEqual(originAuth.id, copyAuth.id, "Camadas autorais devem ter IDs distintos");
    assert.ok(copyAuth.id.startsWith("tx-"), "ID autoral deve respeitar prefixo tx-");

    // Efeitos e richText na cópia devem apontar para o novo ID
    assert.ok(
      copySlide.composition.effects[copyAuth.id],
      "Efeitos devem estar indexados no novo ID na cópia"
    );
    assert.equal(
      copySlide.composition.effects[originAuth.id],
      undefined,
      "Efeito do ID antigo não deve permanecer na cópia"
    );
    assert.ok(
      copySlide.composition.richText[copyAuth.id],
      "RichText deve estar indexado no novo ID na cópia"
    );
    assert.equal(
      copySlide.composition.richText[originAuth.id],
      undefined,
      "RichText do ID antigo não deve permanecer na cópia"
    );
    out.checks.cCopyIntegrity = true;

    // 3. Editar cópia sem alterar origem
    console.log("Executando: Editar cópia sem alterar origem...");
    const copyAuthId = copyAuth.id;
    await page.evaluate((targetId) => {
      (window as any).audit.mainProps.onUpdateExtraTextContent(targetId, "Café Especial - Cópia Modificada");
    }, copyAuthId);
    await wait();

    const afterEditDoc = await doc();
    const editedAuthLayer = afterEditDoc.slides[1].composition?.authorialLayers?.find((l: any) => l.id === copyAuthId);
    assert.equal(
      editedAuthLayer?.text,
      "Café Especial - Cópia Modificada",
      "Slide 1 deve receber texto autoral editado na cópia"
    );
    const originAuthLayer = afterEditDoc.slides[0].composition?.authorialLayers?.find((l: any) => l.id === originAuth.id);
    assert.equal(
      originAuthLayer?.text,
      "Camada Autoral com Efeito",
      "Slide 0 (origem) NÃO deve ser alterado pela edição da cópia"
    );

    // Validar prontidão visual da cópia editada
    console.log("Passo 3b: validando prontidão visual da cópia editada...");
    const editedCopyReadiness = await assertStageVisualReadiness(page, {
      stepName: "editedCopy",
      expectedSlideIndex: 1,
      expectedSlideId: copySlide.id,
      minAuthorialImages: 1,
    });
    out.manifest.editedCopy = editedCopyReadiness;

    // Pixels da cópia editada
    const copyPixels = await pixels("main");
    const copyHash = crypto.createHash("sha256").update(copyPixels).digest("hex");
    assert.notEqual(
      copyHash,
      initialCopyHash,
      "Edição canônica no texto da cópia deve alterar seus pixels"
    );
    const copyBuf = Buffer.from(copyPixels.split(",")[1], "base64");
    const copyAnalysis = await countVisiblePixels(copyBuf);
    assert.ok(copyAnalysis.visible > 0, "Pixels da cópia editada devem ser visíveis");
    fs.writeFileSync(path.join(ARTIFACT_DIR, "os002-copy.png"), copyBuf);
    out.pixels.editedCopy = copyHash;
    out.pixelCounts.editedCopy = copyAnalysis;
    out.checks.editCopyPixelChange = true;

    // Navega de volta para a origem e confirma pixels inalterados
    await slideCards.first().click();
    await wait();
    assert.equal((await doc()).currentSlideIndex, 0, "Slide 0 deve estar ativo");

    // Validar prontidão visual no retorno à origem
    console.log("Passo 3c: validando prontidão visual no retorno à origem...");
    const returnOriginReadiness = await assertStageVisualReadiness(page, {
      stepName: "returnToOrigin",
      expectedSlideIndex: 0,
      expectedSlideId: "slide-0",
      minAuthorialImages: 1,
    });
    out.manifest.returnToOrigin = returnOriginReadiness;

    const currentOriginPixels = await pixels("main");
    const currentOriginHash = crypto.createHash("sha256").update(currentOriginPixels).digest("hex");
    assert.equal(
      currentOriginHash,
      initialOriginHash,
      "Pixels da origem devem permanecer estritamente idênticos aos iniciais antes e após edição da cópia"
    );
    out.checks.originRemainsIdentical = true;

    // 4. Excluir último slide ativo e verificar reconciliação
    console.log("Executando: Excluir último slide ativo...");
    await page.locator('[draggable="true"]').nth(3).click();
    await wait();
    assert.equal((await doc()).currentSlideIndex, 3, "Último slide deve estar selecionado");

    await page.locator('[draggable="true"]').nth(3).hover();
    await page.locator('button[title="Excluir Slide"]').nth(3).click({ force: true });
    await wait();

    const afterDeleteDoc = await doc();
    assert.equal(afterDeleteDoc.slides.length, 3, "Documento deve ter 3 slides após exclusão");
    assert.equal(
      afterDeleteDoc.currentSlideIndex,
      2,
      "Ao excluir o último slide ativo, o anterior (índice 2) deve se tornar o ativo"
    );
    out.checks.deleteLastActiveReconciliation = true;

    // 5. Undo -> navegar -> Redo
    console.log("Executando: Undo -> navegar -> Redo...");
    await page.getByRole("button", { name: "Desfazer" }).click();
    await wait();
    assert.equal((await doc()).slides.length, 4, "Undo deve restaurar o slide excluído");

    await page.getByRole("button", { name: "Desfazer" }).click();
    await wait();
    const afterUndoDoc = await doc();
    const restoredAuthLayer = afterUndoDoc.slides[1].composition?.authorialLayers?.find((l: any) => l.id === copyAuthId);
    assert.equal(
      restoredAuthLayer?.text,
      "Camada Autoral com Efeito",
      "Undo deve reverter a edição da cópia"
    );

    // Navegar para slide 0 enquanto há Redo pendente
    await page.locator('[draggable="true"]').first().click();
    await wait();
    assert.equal((await doc()).currentSlideIndex, 0, "Slide 0 deve estar ativo após navegação");
    assert.equal(
      await page.evaluate(() => (window as any).audit.saveCalls.length),
      0,
      "Navegação pura não deve acionar save"
    );

    // Disparar Redo para recuperar a edição da cópia
    await page.getByRole("button", { name: "Refazer" }).click();
    await wait();

    const afterRedoDoc = await doc();
    const redoneAuthLayer = afterRedoDoc.slides[1].composition?.authorialLayers?.find((l: any) => l.id === copyAuthId);
    assert.equal(
      redoneAuthLayer?.text,
      "Café Especial - Cópia Modificada",
      "Redo após navegação deve restaurar a edição na cópia"
    );
    out.checks.undoNavigateRedo = true;

    // 6. Save Adapter local e reabertura com seleção da cópia editada
    console.log("Executando: Save Adapter e Reopen local...");
    const copySlideId = copySlide.id;
    const payload = await page.evaluate(() => {
      const p = (window as any).audit.mainProps.post;
      return (window as any).audit.canvasModelToSavePayload(p, {
        inputType: "text",
        inputContent: "audit-os002",
      });
    });

    assert.ok(payload.canvasModel, "Payload deve conter canvasModel serializado");

    const reopened = await page.evaluate((pl) => {
      const restored = (window as any).audit.savedPostToCanvasModel({
        id: 99,
        canvas_model: JSON.parse(JSON.stringify(pl.canvasModel)),
      });
      (window as any).audit.openPost(restored);
      return restored;
    }, payload);
    await wait();

    assert.equal(reopened.slides.length, 4, "Post reaberto deve ter 4 slides");
    const reopenedAuthLayer = reopened.slides[1].composition?.authorialLayers?.find((l: any) => l.id === copyAuthId);
    assert.equal(reopenedAuthLayer?.text, "Café Especial - Cópia Modificada", "Edição autoral deve persistir após reabertura");

    const reopenedCopyCompValid = await page.evaluate(
      (comp) => Boolean((window as any).audit.readArsenalComposition(comp)),
      reopened.slides[1].composition
    );
    assert.ok(reopenedCopyCompValid, "Composição da cópia no post reaberto deve ser válida");

    // Seleciona a cópia editada pelo slide card
    const reopenedSlideCards = page.locator('[draggable="true"]');
    await reopenedSlideCards.nth(1).click();
    await wait();
    assert.equal((await doc()).currentSlideIndex, 1, "Cópia editada deve estar ativa após reopen");
    assert.equal((await doc()).slides[1].id, copySlideId, "ID da cópia reaberta deve ser idêntico");

    // Validar prontidão visual da cópia editada reaberta
    console.log("Passo 6b: validando prontidão visual da cópia editada reaberta...");
    const reopenedReadiness = await assertStageVisualReadiness(page, {
      stepName: "reopenedCopy",
      expectedSlideIndex: 1,
      expectedSlideId: copySlideId,
      minAuthorialImages: 1,
    });
    out.manifest.reopenedCopy = reopenedReadiness;

    // Captura imagem da cópia editada reaberta
    const reopenedCopyPixels = await pixels("main");
    const reopenedCopyHash = crypto.createHash("sha256").update(reopenedCopyPixels).digest("hex");
    assert.equal(
      reopenedCopyHash,
      copyHash,
      "Pixels da cópia editada reaberta devem ser idênticos aos pixels da cópia editada antes de fechar"
    );
    const reopenedBuf = Buffer.from(reopenedCopyPixels.split(",")[1], "base64");
    const reopenedAnalysis = await countVisiblePixels(reopenedBuf);
    assert.ok(reopenedAnalysis.visible > 0, "Pixels da cópia reaberta devem ser visíveis");
    fs.writeFileSync(path.join(ARTIFACT_DIR, "os002-reopened.png"), reopenedBuf);
    out.pixels.reopenedCopy = reopenedCopyHash;
    out.pixelCounts.reopenedCopy = reopenedAnalysis;
    out.checks.localSaveReopenCopyFidelity = true;

    out.checks.noPageErrors = errors.length === 0;
    out.success = Object.values(out.checks).every(Boolean);

    console.log("Sucesso! Todos os checks G-02 passaram com pixels visíveis e arte comprovada:");
    console.log(JSON.stringify(out.checks, null, 2));
    console.log("Contagem de pixels visíveis:", JSON.stringify(out.pixelCounts, null, 2));
  } catch (err: any) {
    out.failure = err.stack || err.message;
    if (err.diagnostic) {
      out.guardFailure = err.diagnostic;
      console.error("\n❌ [GUARD DE PRONTIDÃO VISUAL FALHOU]:");
      console.error(`   Etapa: ${err.diagnostic.etapa}`);
      console.error(`   Slide: ${err.diagnostic.slide}`);
      console.error(`   Instância: ${err.diagnostic.instancia}`);
      console.error(`   Motivo: ${err.diagnostic.motivo}\n`);
    } else {
      console.error("Falha no harness OS-002:", err);
    }
    try {
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "os002-failure.png") });
    } catch {}
  } finally {
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, "os002-results.json"),
      JSON.stringify(out, null, 2)
    );
    await browser.close();
    if (!out.success) {
      process.exit(1);
    }
  }
})();
