/**
 * ScreenshotService: Capture website screenshots for visual analysis
 *
 * Uses Google PageSpeed Insights API (free, no extra dependencies).
 * The API runs Lighthouse which renders the page in a real browser,
 * solving the SPA problem — it captures the fully-rendered page.
 *
 * Fallback: returns null if capture fails (pipeline continues without vision).
 */

/** Capture a screenshot of a URL via Google PageSpeed Insights API */
export async function captureScreenshot(url: string): Promise<string | null> {
    console.log("[screenshotService] Capturing screenshot for:", url);

    try {
        // PageSpeed Insights API - renders the page fully (handles SPAs)
        // The 'final-screenshot' audit captures the rendered page as base64
        const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
        apiUrl.searchParams.set("url", url);
        apiUrl.searchParams.set("strategy", "desktop");
        // Only request the screenshot-related audit to minimize response time
        apiUrl.searchParams.set("category", "performance");

        const response = await fetch(apiUrl.toString(), {
            signal: AbortSignal.timeout(30000), // 30s timeout (Lighthouse takes time)
            headers: {
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            console.warn("[screenshotService] PageSpeed API error:", response.status);
            return null;
        }

        const data = await response.json();

        // Extract the final screenshot from Lighthouse results
        const screenshot = data?.lighthouseResult?.audits?.["final-screenshot"]?.details?.data;
        if (!screenshot) {
            // Try the full-page-screenshot audit as fallback
            const fullScreenshot = data?.lighthouseResult?.audits?.["full-page-screenshot"]?.details?.screenshot?.data;
            if (fullScreenshot) {
                console.log("[screenshotService] Got full-page screenshot");
                return fullScreenshot;
            }
            console.warn("[screenshotService] No screenshot in PageSpeed response");
            return null;
        }

        console.log("[screenshotService] Screenshot captured successfully");
        // screenshot is already a data URI (data:image/jpeg;base64,...)
        return screenshot;
    } catch (error) {
        console.warn("[screenshotService] Screenshot capture failed:", error);
        return null;
    }
}
