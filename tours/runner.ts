/**
 * runner.ts — Orchestrates the execution of tours using Playwright.
 */

import { chromium, type Page, type Browser } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { annotateFrame, type Annotation } from './lib/annotator';
import { buildGif, buildMp4, buildHtml, saveFrames } from './lib/assembler';

// Import tours
import * as tour1 from './definitions/tour-1-thevoid';
import * as tour2 from './definitions/tour-2-holodeck';
import * as tour3 from './definitions/tour-3-workbench';

interface TourConfig {
    name: string;
    title: string;
    steps: {
        description: string;
        action: (page: Page) => Promise<void>;
        annotations?: Annotation[];
        delayAfterMs?: number;
    }[];
    mockScript?: string;
    startUrl: string;
}

const TOURS: TourConfig[] = [
    { ...tour1, name: tour1.TOUR_NAME, title: tour1.TOUR_TITLE, startUrl: 'http://localhost:3002/' },
    { ...tour2, name: tour2.TOUR_NAME, title: tour2.TOUR_TITLE, startUrl: 'http://localhost:3002/', mockScript: tour2.MOCK_STATE_SCRIPT },
    { ...tour3, name: tour3.TOUR_NAME, title: tour3.TOUR_TITLE, startUrl: 'http://localhost:3002/', mockScript: undefined }, // To be fixed later
];

const OUTPUT_DIR = path.join(__dirname, 'output');
const TEMP_DIR = path.join(__dirname, '.temp');

/**
 * Execute a single tour
 */
async function runTour(browser: Browser, config: TourConfig) {
    console.log(`\n🚀 Iniciando Tour: ${config.title} (${config.name})`);

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2, // High DPI for better quality
    });

    const page = await context.newPage();

    // Array to hold annotated frame buffers
    const frames: Buffer[] = [];
    const captions: string[] = [];

    try {
        console.log(`   Navigating to ${config.startUrl}...`);
        // Pass injected state before navigating if available
        if (config.mockScript) {
            await page.addInitScript(config.mockScript);
        }

        await page.goto(config.startUrl, { waitUntil: 'networkidle' });

        // For HoloDeck Mock: We would need a way to force the app into state 2.
        // Assuming the app has a global window.__setAppState('holodeck') for demo purposes,
        // or we just rely on local storage.
        // For this simple demo, let's assume the mock script did enough.

        for (let i = 0; i < config.steps.length; i++) {
            const step = config.steps[i];
            console.log(`   ⏳ Passo ${i + 1}/${config.steps.length}: ${step.description}`);

            // Execute the interaction (click, type, etc.)
            await step.action(page);

            // Let animations settle
            await page.waitForTimeout(400);

            // Calculate dynamic highlighted elements based on CSS selectors
            const resolvedAnnotations: Annotation[] = [];
            if (step.annotations) {
                for (const ann of step.annotations) {
                    if ('target' in ann && ann.target) {
                        // Find bounding box for spotlight or highlight
                        const el = page.locator(ann.target).first();
                        if (await el.isVisible()) {
                            const box = await el.boundingBox();
                            if (box) {
                                resolvedAnnotations.push({
                                    ...ann,
                                    type: 'highlight',
                                    x: box.x,
                                    y: box.y,
                                    width: box.width,
                                    height: box.height,
                                } as Annotation);
                            }
                        } else {
                            console.log(`      ⚠️ Warning: Element ${ann.target} not visible. Annotation skipped.`);
                        }
                    } else {
                        // Pre-calculated or fixed annotation (like caption)
                        resolvedAnnotations.push(ann);
                    }
                }
            }

            // Take screenshot
            const rawScreenshot = await page.screenshot({ fullPage: false });

            // Annotate screenshot
            const annotatedBuffer = await annotateFrame(rawScreenshot, resolvedAnnotations);

            frames.push(annotatedBuffer);
            captions.push(step.description);

            // Wait before next action
            await page.waitForTimeout(step.delayAfterMs ?? 1200);
        }

        // Assemble outputs
        console.log(`\n   🎬 Assemble: Generating outputs from ${frames.length} frames...`);
        const tourTempDir = path.join(TEMP_DIR, config.name);

        // 1. Save raw frames
        await saveFrames(frames, tourTempDir);

        // 2. Build GIF
        await buildGif(frames, {
            outputDir: OUTPUT_DIR,
            tourName: config.name,
            frameDelayMs: 1400,
        });

        // 3. Build MP4
        await buildMp4(tourTempDir, {
            outputDir: OUTPUT_DIR,
            tourName: config.name,
            frameDelayMs: 1400,
        });

        // 4. Build HTML Slideshow
        await buildHtml(frames, captions, {
            outputDir: OUTPUT_DIR,
            tourName: config.name,
        });

    } catch (e) {
        console.error(`   ❌ Failed tour ${config.name}:`, e);
    } finally {
        await page.close();
        await context.close();
    }
}

/**
 * Main
 */
async function main() {
    const args = process.argv.slice(2);
    const runAll = args.includes('--all');
    const tourIndexStr = args.find(a => a.startsWith('--tour='))?.split('=')[1];

    if (!runAll && !tourIndexStr) {
        console.log(`
Uso:
  npm run tour:all         (Roda todos os tours)
  npm run tour:1           (Roda TheVoid apenas)
  npm run tour:2           (Roda HoloDeck apenas)
  npm run tour:3           (Roda Workbench apenas)
`);
        process.exit(1);
    }

    // Ensure output dirs
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    console.log('🌐 Starting Chromium...');
    const browser = await chromium.launch({ headless: true });

    try {
        if (runAll) {
            for (const t of TOURS) {
                await runTour(browser, t);
            }
        } else if (tourIndexStr) {
            const idx = parseInt(tourIndexStr, 10) - 1;
            if (idx >= 0 && idx < TOURS.length) {
                await runTour(browser, TOURS[idx]);
            } else {
                console.error(`Tour --tour=${tourIndexStr} não encontrado.`);
            }
        }
    } finally {
        console.log('🛑 Closing browser...');
        await browser.close();

        // Clean temp dir
        try {
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        } catch { }
    }
}

main().catch(console.error);
