import { chromium } from "playwright-core";
import { randomUUID } from "node:crypto";
import { resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";
import { renderEditorial } from "./mareEditorialJobs";

describe.skipIf(!process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH)(
  "entregas editoriais com Chromium local",
  () => {
    it("renderiza o primeiro corte e reabre o pacote para revisão audiovisual", async () => {
      const files = new Map<string, Buffer>(),
        stages: string[] = [];
      const record = async (name: string, bytes: Buffer) => {
        files.set(name, bytes);
      };
      const read = async (name: string) =>
        new Blob([new Uint8Array(files.get(name)!)], {
          type: name === "movie" ? "video/mp4" : "application/octet-stream",
        });
      const infer = async (stage: string) => {
        stages.push(stage);
        const output =
          stage === "script"
            ? {
                title: "Corte",
                shots: [
                  {
                    name: "Chamada",
                    frames: 30,
                    images: [],
                    copy: ["Crie agora"],
                    evidence: "CTA",
                  },
                ],
              }
            : stage === "direction"
              ? {
                  shots: [
                    {
                      background: "#101010",
                      layers: [
                        {
                          kind: "text",
                          index: 0,
                          x: 270,
                          y: 420,
                          width: 420,
                          height: 64,
                          size: 32,
                          color: "#ffffff",
                          enterFrame: 0,
                          animation: "rise",
                        },
                      ],
                    },
                  ],
                }
              : { assessment: "Chamada legível", corrections: [] };
        return { output, model: "fixture" };
      };
      const common = { brief: "Apresente a chamada", cta: "Crie agora" };
      const cut = await renderEditorial(
        { operation: "firstCut", ...common, seconds: 1, materials: [] },
        read,
        record,
        infer
      );
      expect(cut.script.title).toBe("Corte");
      expect(files.get("movie")!.subarray(4, 8).toString()).toBe("ftyp");
      const original = files.get("project");
      const review = await renderEditorial(
        { operation: "review", ...common },
        read,
        record,
        infer
      );
      expect(review.review.assessment).toBe("Chamada legível");
      expect(files.get("project")).toEqual(original);
      const progress: number[] = [];
      const montage = await renderEditorial(
        { operation: "packageRender", format: "mp4" },
        read,
        record,
        infer,
        async value => {
          progress.push(value);
        }
      );
      expect(montage).toMatchObject({ width: 1080, height: 1920, duration: 1 });
      expect(progress.at(-1)).toBe(99);
      expect(files.get("movie")!.subarray(4, 8).toString()).toBe("ftyp");
      expect(stages).toEqual(["script", "direction", "review"]);
    }, 90000);
  }
);

describe.skipIf(!process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH)(
  "retorno Maré com cliente sem codificador",
  () => {
    it("confirma a franquia e retorna o WebM 4:5 criado pelo Chromium do worker", async () => {
      const browser = await chromium.launch({
        executablePath: process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH,
      });
      try {
        const page = await browser.newPage();
        await page.addInitScript(
          "Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true})"
        );
        const files = new Map<string, Buffer>(),
          kinds: string[] = [],
          quotes: string[] = [];
        const actor = randomUUID(),
          id = randomUUID(),
          projectId = randomUUID(),
          jobId = randomUUID(),
          assetId = randomUUID();
        let delivered: any, returned: any;
        const owner = {
          id,
          projectId,
          expectedRevision: 1,
          scope: "montage",
          revisionId: null,
          sourceComposition: {
            name: "Seleção 4:5",
            width: 360,
            height: 450,
            layers: [
              {
                kind: "rect",
                name: "Quadrado",
                x: 180,
                y: 225,
                width: 90,
                height: 90,
                color: "#ff0000",
              },
            ],
          },
        };
        page.on("dialog", async dialog => {
          quotes.push(dialog.message());
          await dialog.accept();
        });
        await page.route("**/*", async route => {
          const r = route.request(),
            url = new URL(r.url()),
            p = url.pathname;
          if (url.origin !== "http://localhost") return route.abort();
          if (p === "/api/mare/capabilities")
            return route.fulfill({
              json: { editor: true, projectRender: true },
            });
          if (p === "/api/mare/projects")
            return route.fulfill({ json: { actorId: actor, projects: [] } });
          if (p === "/api/mare/anchors/" + id)
            return route.fulfill({ json: owner });
          if (p === "/api/mare/uploads") {
            kinds.push(r.postDataJSON().kind);
            return route.fulfill({
              json: {
                uploadId: randomUUID(),
                partBytes: 3145728,
                received: [],
              },
            });
          }
          if (p.includes("/parts/")) {
            files.set(p.split("/")[4], r.postDataBuffer()!);
            return route.fulfill({ json: {} });
          }
          if (p.endsWith("/complete"))
            return route.fulfill({ json: { assetId: p.split("/")[4] } });
          if (p.endsWith("/project-render")) {
            if (url.searchParams.has("quote"))
              return route.fulfill({ json: { remaining: 2, limit: 10 } });
            const args = r.postDataJSON();
            const meta = await renderEditorial(
              { ...args, operation: "packageRender" },
              async () =>
                new Blob([new Uint8Array(files.get(args.revisionId)!)]),
              async (_, bytes) => {
                files.set(assetId, bytes);
              },
              async () => {
                throw Error("Render não chama IA");
              }
            );
            delivered = {
              ...meta,
              videoAssetId: assetId,
              revisionId: args.revisionId,
              mime: "video/webm",
            };
            return route.fulfill({ json: { id: jobId } });
          }
          if (p.endsWith("/jobs/" + jobId))
            return route.fulfill({ json: { status: "ready" } });
          if (p.endsWith("/jobs/" + jobId + "/result"))
            return route.fulfill({ json: delivered });
          if (p === "/api/mare/anchors/" + id + "/return") {
            returned = r.postDataJSON();
            return route.fulfill({ json: returned });
          }
          if (p === "/thevoid") return route.fulfill({ body: "Post" });
          if (p.startsWith("/mare/"))
            return route.fulfill({
              path: p.startsWith("/mare/fonts/")
                ? resolve("shared/typography/fonts/files", basename(p))
                : resolve("labs/mare-studio/dist", p.slice(6) || "index.html"),
            });
          return route.fulfill({ status: 404, body: "" });
        });
        await page.goto("http://localhost/mare/?anchor=" + id);
        await page.locator("#use-canvas-selection").click();
        await page.locator("#send-postspark").click();
        await page.waitForURL("http://localhost/thevoid?mareReturn=" + id, {
          timeout: 70000,
        });
        expect(quotes).toHaveLength(1);
        expect(quotes[0]).toContain("2 de 10");
        expect(kinds).toEqual(["project"]);
        expect(returned.videoAssetId).toBe(assetId);
        expect(returned.revisionId).toBe(delivered.revisionId);
        expect(returned.scope).toBe("composition");
        expect(delivered.height).toBe(1350);
        const probe = JSON.parse(
          execFileSync(
            "ffprobe",
            [
              "-v",
              "error",
              "-count_packets",
              "-show_streams",
              "-of",
              "json",
              "pipe:0",
            ],
            { input: files.get(assetId) }
          ).toString()
        );
        expect(probe.streams[0].codec_name).toBe("vp9");
        expect(probe.streams[0].width).toBe(1080);
        expect(probe.streams[0].height).toBe(1350);
        expect(
          probe.streams[0].tags.alpha_mode ?? probe.streams[0].tags.ALPHA_MODE
        ).toBe("1");
      } finally {
        await browser.close();
      }
    }, 90000);
  }
);
