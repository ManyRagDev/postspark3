import { composeVariation, directCreative } from "@shared/creative";
import { FAMILIES } from "@shared/creative/families";
import { DEFAULT_DESIGN_TOKENS, type PostVariation } from "@shared/postspark";
import { buildCorpus } from "../harness/corpus";
import { extractSlots } from "../harness/slots";
import { fontkitMeasurer } from "../harness/measure/fontkitMeasurer";
import { greedyWrap } from "../shared/typography/wrap";

const HEADLINE_FLOOR = 24;
const HEADLINE_LH = 1.15;
const BODY_FLOOR = 16.8;
const BODY_LH = 1.5;
const BODY_TEXT = "A maioria dos times corrige o sintoma e ignora a causa. Comece pelo diagnóstico.";

async function main() {
  const corpus = await buildCorpus(3);
  const items = corpus.items;

  for (const family of FAMILIES) {
    const out: string[] = [];
    for (const aspect of ["1:1", "5:6", "9:16"] as const) {
      const base: PostVariation = {
        id: `cal-${family.id}`,
        headline: "placeholder",
        body: BODY_TEXT,
        caption: "",
        hashtags: [],
        callToAction: "",
        tone: "profissional",
        platform: "instagram",
        imagePrompt: "",
        backgroundColor: "",
        textColor: "",
        accentColor: "",
        layout: "minimal",
        aspectRatio: aspect,
        template: "simple",
        copyAngle: { type: "beneficio", label: "x", badge: "x", stickerText: "x" },
      } as PostVariation;
      const direction = directCreative(base, null, 7);
      base.creativeDirection = { ...direction, familyId: family.id, axes: family.axes, seed: 7 };
      const variation = composeVariation(base, DEFAULT_DESIGN_TOKENS);
      const extraction = extractSlots(variation, aspect);
      const hSlot = extraction.slots.find((s) => s.name === "headline")!;
      const bSlot = extraction.slots.find((s) => s.name === "body")!;
      const docHeight = extraction.docHeight;
      const hFont = variation.headlineFontFamily ?? "Inter";
      const bFont = variation.bodyFontFamily ?? "Inter";

      if (!hSlot.declared) {
        out.push(`${aspect}: SEM SLOT DECLARADO`);
        continue;
      }

      const widthPx = hSlot.widthPx;
      let worstLines = 0;
      let worstOverflow = 0;
      for (const item of items) {
        const wrap = greedyWrap(item.text, (t, s) => fontkitMeasurer.measureWidth(t, s), { fontFamily: hFont, fontSize: HEADLINE_FLOOR, lineHeight: HEADLINE_LH, textTransform: "none" }, widthPx);
        worstLines = Math.max(worstLines, wrap.lines.length);
        worstOverflow = Math.max(worstOverflow, wrap.overflowingWords.length);
      }
      const headlineBudgetPx = worstLines * HEADLINE_FLOOR * HEADLINE_LH + 8;
      const headlineHeightPct = Math.ceil((headlineBudgetPx / docHeight) * 1000) / 10;

      const bWrap = greedyWrap(BODY_TEXT, (t, s) => fontkitMeasurer.measureWidth(t, s), { fontFamily: bFont, fontSize: BODY_FLOOR, lineHeight: BODY_LH, textTransform: "none" }, bSlot.declared ? bSlot.widthPx : widthPx);
      const bodyBudgetPx = bWrap.lines.length * BODY_FLOOR * BODY_LH + 8;
      const bodyHeightPct = bSlot.declared ? Math.ceil((bodyBudgetPx / docHeight) * 1000) / 10 : 0;

      out.push(
        `${aspect}: headline ${worstLines} linhas@${HEADLINE_FLOOR}px → altura ${headlineHeightPct}% (${headlineBudgetPx.toFixed(0)}px/${docHeight}px, largura ${widthPx}px); overflowWords máx ${worstOverflow}; body ${bWrap.lines.length} linhas → ${bodyHeightPct}%`,
      );
    }
    console.log(`\n${family.id}:`);
    out.forEach((line) => console.log("  " + line));
  }
}

main();
