import "dotenv/config";
import { registerBrandCaptureRoutes } from "./brandCaptureRoutes";
import {installNetworkDiagnostics,withNetworkDiagnosticScope} from "./networkDiagnostics";
import {registerGenerationStream} from "./generationStream";
import {stopDemandSupervisor} from "../ai/workflows/localDemandSupervisor";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerSupabaseAuthRoutes } from "./supabaseAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getStripe, handleStripeWebhook } from "../billing";
import { ENV } from "./env";
import { startLocalGenerationWorker } from "../ai/workflows/localGenerationWorker";
import { registerUserMediaRoutes } from "../mediaAssets";
import {
  appendOperationalLog,
  httpStatusFileLogger,
  installConsoleErrorFileLogging,
} from "./operationalLog";
import { ALL_FONTS, checkAvailability, FONT_DIR } from "@shared/typography/fonts/registry";

const fontAvailability = checkAvailability(ALL_FONTS);
if (fontAvailability.missing.length > 0) {
  console.error(
    `[typography] ${fontAvailability.missing.length} fonte(s) ausente(s) em ${FONT_DIR}: ` +
      fontAvailability.missing.map((entry) => entry.family).join(", ") +
      " — snapshots vão cair no caminho legado e sobrepor texto.",
  );
  void appendOperationalLog("TYPOGRAPHY_FONTS_MISSING", {
    fontDir: FONT_DIR,
    missing: fontAvailability.missing.map((entry) => entry.family),
  });
}

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

installConsoleErrorFileLogging();

const app = express();
app.use(httpStatusFileLogger);

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
const networkDiagnostics=installNetworkDiagnostics("backend",app);

// Legacy routes share the same protected, durable free capture service.
registerBrandCaptureRoutes(app);

// Analytics endpoints (LGPD-compliant, no personal data)
import { trackPageView, trackEvent } from "./analytics";

app.post("/api/analytics/pageview", async (req, res) => {
  try {
    const { path, referrer, timestamp } = req.body;
    await trackPageView({ path, referrer, timestamp });
    res.json({ received: true });
  } catch (error: any) {
    console.error("[Analytics] Error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/analytics/event", async (req, res) => {
  try {
    const { event, properties, timestamp } = req.body;
    await trackEvent({ event, properties, timestamp });
    res.json({ received: true });
  } catch (error: any) {
    console.error("[Analytics] Error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Supabase Auth bridge (email, Google SSO → PostSpark session cookie)
registerSupabaseAuthRoutes(app);
registerGenerationStream(app);
registerUserMediaRoutes(app);

// tRPC API - Support both /api/trpc and /trpc for production robustness
app.use(
  ["/api/trpc", "/trpc"],
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

async function startServer() {
  await networkDiagnostics.ready;
  const server = createServer(app);
  if(!process.env.VERCEL){
    const shutdown=()=>{networkDiagnostics.stop();stopDemandSupervisor();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();};
    process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
  }

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
      // Start the configured local executor only after the server binds successfully.
      withNetworkDiagnosticScope({source:"startup-recovery"},()=>startLocalGenerationWorker());
    });
  }
}

startServer().catch(console.error);

export default app;
