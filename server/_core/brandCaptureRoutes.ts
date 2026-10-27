import type { Express, Request } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { legacyCapture } from "../brandCapture";
import { captureScreenshot } from "../screenshotService";
export function registerBrandCaptureRoutes(
  app: Express,
  deps = {
    authenticate: (req: Request) => sdk.authenticateRequest(req),
    capture: legacyCapture,
    screenshot: captureScreenshot,
  }
) {
  app.post("/api/extract", async (req, res) => {
    try {
      const user = await deps.authenticate(req);
      if (user.role !== "admin") return res.sendStatus(403);
    } catch {
      return res.sendStatus(401);
    }
    const { url } = req.body;
    if (!url || typeof url !== "string")
      return res
        .status(400)
        .json({ success: false, error: "Missing or invalid URL" });
    try {
      const [desktop, mobile] = await Promise.all([
        deps.screenshot(url, "desktop"),
        deps.screenshot(url, "mobile"),
      ]);
      return res.json({
        success: true,
        url,
        desktopSizeKB: desktop
          ? Number((desktop.byteLength / 1024).toFixed(2))
          : 0,
        mobileSizeKB: mobile
          ? Number((mobile.byteLength / 1024).toFixed(2))
          : 0,
      });
    } catch {
      return res
        .status(500)
        .json({ success: false, error: "Screenshot unavailable" });
    }
  });
  app.post("/api/brand-dna", async (req, res) => {
    if (!ENV.aiSiteIntelligenceEnabled)
      return res
        .status(503)
        .json({ error: "Site intelligence is temporarily disabled" });
    let user;
    try {
      user = await deps.authenticate(req);
    } catch {
      return res.sendStatus(401);
    }
    const { url } = req.body;
    if (!url || typeof url !== "string")
      return res.status(400).json({ error: "Missing or invalid URL" });
    try {
      return res.json({ success: true, ...(await deps.capture(user.id, url)) });
    } catch (e) {
      const error = e as { code?: string; message?: string };
      return res
        .status(error.code === "PT429" ? 429 : 500)
        .json({ error: error.message ?? "Capture unavailable" });
    }
  });
}
