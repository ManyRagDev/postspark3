import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getStripe, handleStripeWebhook } from "../billing";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const app = express();

// ─── Stripe webhook (raw body ANTES do json parser) ───────────────────────────
// Deve vir antes de express.json() para preservar o body raw que o Stripe exige.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!ENV.stripeWebhookSecret || !ENV.stripeSecretKey) {
      res.status(503).json({ error: "Billing not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    try {
      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        ENV.stripeWebhookSecret
      );
      await handleStripeWebhook(event);
      res.json({ received: true });
    } catch (err: any) {
      console.error("[Webhook] Error:", err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// Configure body parser with larger size limit for file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// NEW: Endpoint Validator / Screenshot Orchestrator
import { captureScreenshot } from "../screenshotService";
import { extractBrandDNA as extractBrandDNAFunc } from "../brandDNA";
import { generateThemesFromBrandDNA } from "../brandThemeGenerator";

app.post("/api/extract", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ success: false, error: "Missing or invalid URL" });
    return;
  }

  try {
    const [desktopBuffer, mobileBuffer] = await Promise.all([
      captureScreenshot(url, 'desktop'),
      captureScreenshot(url, 'mobile')
    ]);

    const desktopSizeKB = desktopBuffer ? (desktopBuffer.byteLength / 1024).toFixed(2) : 0;
    const mobileSizeKB = mobileBuffer ? (mobileBuffer.byteLength / 1024).toFixed(2) : 0;

    res.json({
      success: true,
      url,
      desktopSizeKB: Number(desktopSizeKB),
      mobileSizeKB: Number(mobileSizeKB)
    });
  } catch (error: any) {
    console.error("[/api/extract] Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REST endpoint for Brand DNA (direct, bypassing tRPC)
app.post("/api/brand-dna", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: "Missing or invalid URL" });
  }

  try {
    const brandDNA = await extractBrandDNAFunc(url);
    const themes = generateThemesFromBrandDNA(brandDNA, url);

    res.json({
      success: true,
      brandDNA,
      themes,
      fallbackUsed: !brandDNA.metadata.visionUsed
    });
  } catch (error: any) {
    console.error("[/api/brand-dna] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback under /api/oauth/callback
registerOAuthRoutes(app);

// tRPC API - Support both /api/trpc and /trpc for production robustness
app.use(
  ["/api/trpc", "/trpc"],
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

async function startServer() {
  const server = createServer(app);

  // On Vercel, static files are served by @vercel/static-build — skip entirely
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  // Only listen if not on Vercel
  if (!process.env.VERCEL) {
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);

    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }

    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }
}

startServer().catch(console.error);

export default app;

