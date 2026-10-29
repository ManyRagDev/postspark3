import {
  chromium,
  type Browser,
  type Page,
  type BrowserContext,
} from "playwright-core";
import { publicUrl } from "../publicUrl";
import { fetchPublicResource } from "./publicFetch";

/** One context at a time; batches yield the slot after every page. */
export class CaptureGate {
  private tail = Promise.resolve();
  private waiting = 0;

  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    if (this.waiting >= 8) throw new Error("Capture queue is full");
    this.waiting++;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(done => {
      release = done;
    });
    try {
      await previous;
      signal.throwIfAborted();
      return await work();
    } finally {
      this.waiting--;
      release();
    }
  }
}

export class CaptureBrowser {
  private launching?: Promise<Browser>;
  private browser?: Browser;
  private gate = new CaptureGate();

  constructor(private fetchResource = fetchPublicResource) {}

  private async getBrowser() {
    if (this.browser?.isConnected()) return this.browser;
    this.launching ??= chromium
      .launch({
        executablePath:
          process.env.CAPTURE_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-background-networking",
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ],
      })
      .then(browser => {
        this.browser = browser;
        browser.on("disconnected", () => {
          if (this.browser === browser) this.browser = undefined;
        });
        return browser;
      })
      .finally(() => {
        this.launching = undefined;
      });
    return this.launching;
  }

  async withPage<T>(
    url: string,
    viewport: { width: number; height: number },
    signal: AbortSignal,
    work: (page: Page) => Promise<T>
  ): Promise<T> {
    // Reject invalid destinations before taking a browser slot.
    await publicUrl(url, signal);
    return this.gate.run(signal, async () => {
      const stop = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
      let context: BrowserContext | undefined;
      const close = () => {
        void context?.close().catch(() => {});
      };
      stop.addEventListener("abort", close, { once: true });
      try {
        const browser = await this.getBrowser();
        stop.throwIfAborted();
        context = await browser.newContext({
          viewport,
          locale: "pt-BR",
          serviceWorkers: "block",
          acceptDownloads: false,
        });
        stop.throwIfAborted();
        context.setDefaultTimeout(1500);
        await context.routeWebSocket("**/*", socket => {
          socket.close();
        });
        let requests = 0,
          bytes = 0,
          nextLane = 0;
        const lanes = Array.from({ length: 6 }, () => Promise.resolve());
        await context.route("**/*", async route => {
          const request = route.request();
          if (
            request.method() !== "GET" ||
            ["media", "websocket"].includes(request.resourceType()) ||
            ++requests > 160 ||
            bytes > 32_000_000
          ) {
            await route.abort().catch(() => {});
            return;
          }
          const lane = nextLane++ % lanes.length,
            previous = lanes[lane];
          let release!: () => void;
          lanes[lane] = new Promise<void>(done => {
            release = done;
          });
          try {
            // Read-only public pages. Never forward service auth, POSTs or media streams.
            await previous;
            stop.throwIfAborted();
            if (bytes > 32_000_000) {
              await route.abort();
              return;
            }
            const response = await this.fetchResource(request.url(), {
              signal: AbortSignal.any([stop, AbortSignal.timeout(10_000)]),
              headers: request.headers(),
            });
            bytes += response.body.length;
            if (bytes > 32_000_000) {
              await route.abort();
              return;
            }
            await route.fulfill(response);
          } catch {
            await route.abort().catch(() => {});
          } finally {
            release();
          }
        });
        const page = await context.newPage();
        // Keep each request in one page; popups do not create extra browsing work.
        context.on("page", popup => {
          if (popup !== page) void popup.close().catch(() => {});
        });
        await page.addInitScript(() => {
          const remove = () =>
            document
              .querySelectorAll(
                '[class*="cookie"], [id*="cookie"], [class*="gdpr"], [id*="consent"], #onetrust-consent-sdk, .chat-widget'
              )
              .forEach(element => element.remove());
          document.addEventListener("DOMContentLoaded", remove);
          setInterval(remove, 800);
        });
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
        await page
          .waitForLoadState("networkidle", { timeout: 2500 })
          .catch(() => {});
        await page.evaluate(() => document.fonts.ready.then(() => {}));
        // Preserve the old service's settling time for client-rendered pages,
        // delayed hero reveals and hydration after networkidle.
        await page.waitForTimeout(2000);
        return await work(page);
      } finally {
        stop.removeEventListener("abort", close);
        await context?.close().catch(() => {});
      }
    });
  }

  async close() {
    const browser =
      this.browser ?? (await this.launching?.catch(() => undefined));
    await browser?.close();
  }
}
