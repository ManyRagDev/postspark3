/**
 * ScreenshotService: Bridge to the Railway Playwright microservice
 *
 * Provides typed wrappers for all Railway endpoints:
 *   captureScreenshot()          — single page PNG (original, backward compat)
 *   captureMultipleScreenshots() — batch capture → Record<url, ArrayBuffer>
 *   captureElements()            — element-level capture → Record<selector, ArrayBuffer>
 *   discoverPages()              — discover internal pages from a homepage
 *
 * All functions return null / empty on failure — the pipeline continues gracefully.
 */

const SCREENSHOT_SERVICE_URL = process.env.SCREENSHOT_SERVICE_URL;
const DEFAULT_TIMEOUT_MS = 30_000;
const BATCH_TIMEOUT_MS = 90_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredPage {
  url: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serviceUrl(path: string): string {
  return `${SCREENSHOT_SERVICE_URL}${path}`;
}

function warnMissing(fn: string): null {
  console.warn(`[screenshotService] ${fn}: SCREENSHOT_SERVICE_URL not configured`);
  return null;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Capture a single page screenshot — returns PNG as ArrayBuffer.
 * Backward compatible with the original single-endpoint service.
 */
export async function captureScreenshot(
    url: string,
    type: 'desktop' | 'mobile' = 'desktop',
): Promise<ArrayBuffer | null> {
    console.log(`[screenshotService] Capturing ${type} screenshot for: ${url}`);
    if (!SCREENSHOT_SERVICE_URL) return warnMissing('captureScreenshot');

    const endpoint = type === 'mobile' ? '/screenshot/mobile' : '/screenshot';

    try {
        const response = await fetch(serviceUrl(endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                viewport: type === 'desktop' ? { width: 1440, height: 900 } : undefined,
            }),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.warn(`[screenshotService] /screenshot error: ${response.status} ${response.statusText}`);
            return null;
        }

        console.log(`[screenshotService] ${type} screenshot captured ✓`);
        return await response.arrayBuffer();
    } catch (error) {
        console.warn(`[screenshotService] captureScreenshot failed:`, error);
        return null;
    }
}

/**
 * Capture multiple pages in one batch request.
 * Returns a Record<url, ArrayBuffer> for successful captures.
 * URLs that failed are silently omitted (check logs).
 */
export async function captureMultipleScreenshots(
    urls: string[],
    viewport = { width: 1440, height: 900 },
    maxPages = 5,
): Promise<Record<string, ArrayBuffer>> {
    if (!SCREENSHOT_SERVICE_URL) {
        warnMissing('captureMultipleScreenshots');
        return {};
    }
    if (urls.length === 0) return {};

    console.log(`[screenshotService] Multi-capture: ${urls.length} URL(s)`);

    try {
        const response = await fetch(serviceUrl('/screenshot/multi'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls, viewport, maxPages }),
            signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.warn(`[screenshotService] /screenshot/multi error: ${response.status}`);
            return {};
        }

        const json = (await response.json()) as {
            screenshots: Record<string, string>;
            errors: Record<string, string>;
        };

        if (Object.keys(json.errors).length > 0) {
            console.warn('[screenshotService] Multi-capture partial errors:', json.errors);
        }

        // Convert base64 strings back to ArrayBuffer
        const result: Record<string, ArrayBuffer> = {};
        for (const [url, b64] of Object.entries(json.screenshots)) {
            result[url] = Buffer.from(b64, 'base64').buffer;
        }

        console.log(`[screenshotService] Multi-capture: ${Object.keys(result).length}/${urls.length} succeeded ✓`);
        return result;
    } catch (error) {
        console.warn(`[screenshotService] captureMultipleScreenshots failed:`, error);
        return {};
    }
}

/**
 * Capture specific CSS selector elements on a page.
 * Returns a Record<selector, ArrayBuffer> for found elements.
 * Selectors not found or that error are in the notFound list (logged, not thrown).
 */
export async function captureElements(
    url: string,
    selectors: string[],
    viewport = { width: 1440, height: 900 },
): Promise<Record<string, ArrayBuffer>> {
    if (!SCREENSHOT_SERVICE_URL) {
        warnMissing('captureElements');
        return {};
    }
    if (selectors.length === 0) return {};

    console.log(`[screenshotService] Element capture: ${selectors.length} selector(s) on ${url}`);

    try {
        const response = await fetch(serviceUrl('/screenshot/element'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, selectors, viewport }),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.warn(`[screenshotService] /screenshot/element error: ${response.status}`);
            return {};
        }

        const json = (await response.json()) as {
            elements: Record<string, string>;
            notFound: string[];
        };

        if (json.notFound.length > 0) {
            console.log(`[screenshotService] Elements not found: ${json.notFound.join(', ')}`);
        }

        const result: Record<string, ArrayBuffer> = {};
        for (const [sel, b64] of Object.entries(json.elements)) {
            result[sel] = Buffer.from(b64, 'base64').buffer;
        }

        console.log(`[screenshotService] Element capture: ${Object.keys(result).length}/${selectors.length} found ✓`);
        return result;
    } catch (error) {
        console.warn(`[screenshotService] captureElements failed:`, error);
        return {};
    }
}

/**
 * Discover key internal pages from a homepage URL.
 * Returns up to maxLinks pages, sorted by relevance (high > medium > low priority).
 */
export async function discoverPages(
    url: string,
    maxLinks = 8,
): Promise<DiscoveredPage[]> {
    if (!SCREENSHOT_SERVICE_URL) {
        warnMissing('discoverPages');
        return [];
    }

    console.log(`[screenshotService] Discovering pages for: ${url}`);

    try {
        const response = await fetch(serviceUrl('/discover'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, maxLinks }),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.warn(`[screenshotService] /discover error: ${response.status}`);
            return [];
        }

        const json = (await response.json()) as {
            homepage: string;
            discoveredPages: DiscoveredPage[];
        };

        console.log(`[screenshotService] Discovered ${json.discoveredPages.length} pages ✓`);
        return json.discoveredPages;
    } catch (error) {
        console.warn(`[screenshotService] discoverPages failed:`, error);
        return [];
    }
}
