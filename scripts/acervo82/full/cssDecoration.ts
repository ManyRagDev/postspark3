import { chromium, type Browser, type Page } from "playwright-core";
import { resolveReviewBrowser } from "../../../server/ai/workflows/proposalRenderer";

const properties = [
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "backgroundClip",
  "clipPath",
  "filter",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
] as const;
type DecorationStyle = Partial<Record<(typeof properties)[number], string>>;

let browser: Browser | undefined;
let page: Page | undefined;

/** Rasterize only the decorative CSS from the frozen source. No document text or remote assets enter this page. */
export async function paintCssDecoration(
  style: DecorationStyle,
  width: number,
  height: number,
  padding: { left: number; top: number; right: number; bottom: number }
) {
  if (
    !style.backgroundImage ||
    /url\s*\(/i.test(Object.values(style).join(" "))
  )
    throw new Error("CSS decorativo sem fundo local verificável");
  if (!page) {
    browser = await chromium.launch({
      executablePath: await resolveReviewBrowser(),
      timeout: 15_000,
    });
    page = await browser.newPage({
      viewport: { width: 1300, height: 1500 },
      deviceScaleFactor: 3,
    });
    await page.route("**/*", route => route.abort());
    await page.setContent(
      '<body style="margin:0"><div id="frame" style="position:relative;overflow:hidden"><div id="decoration" style="position:absolute"></div></div></body>'
    );
  }
  const css = Object.fromEntries(
    properties.flatMap(key => (style[key] ? [[key, style[key]]] : []))
  );
  await page.locator("#decoration").evaluate(
    (element, data) => {
      const frame = element.parentElement;
      if (!(element instanceof HTMLElement) || !frame)
        throw new Error("Camada decorativa ausente");
      const { left, top, right, bottom } = data.padding;
      frame.style.width = `${left + data.width + right}px`;
      frame.style.height = `${top + data.height + bottom}px`;
      element.style.cssText = "position:absolute";
      Object.assign(element.style, data.css, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${data.width}px`,
        height: `${data.height}px`,
      });
      if (getComputedStyle(element).backgroundImage === "none")
        throw new Error("Fundo CSS inválido");
    },
    { css, width, height, padding }
  );
  return page
    .locator("#frame")
    .screenshot({ omitBackground: true, timeout: 12_000 });
}

export async function closeCssDecoration() {
  await browser?.close();
  page = undefined;
  browser = undefined;
}
