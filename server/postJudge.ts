/**
 * PostJudge: LLM-as-Judge post quality evaluation
 *
 * Inspired by:
 * - Google Pomelli's LLM-as-judge evaluation methodology
 * - NIMA aesthetic scoring (image quality assessment)
 * - VQAScore (does the visual match the intended message?)
 *
 * A single LLM call evaluates all variations at once to minimize cost.
 * Runs AFTER generation completes (lazy scoring) — never blocks the user.
 *
 * Cost: ~0 ✦ (included as quality differentiation, not charged separately)
 */

import { invokeLLM } from "./_core/llm";
import type { PostVariation, PostEvaluation, PostQualityResult, BrandDNA } from "@shared/postspark";

// ─── Color contrast helper (WCAG AA) ────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
    const h = hex.replace('#', '');
    if (h.length < 6) return null;
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    if (!rgb1 || !rgb2) return 1;
    const l1 = relativeLuminance(...rgb1);
    const l2 = relativeLuminance(...rgb2);
    const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (light + 0.05) / (dark + 0.05);
}

/** Map contrast ratio to a 0-100 readability score (WCAG AA = 4.5:1 is 70+) */
function contrastToScore(ratio: number): number {
    if (ratio >= 7) return 100;     // AAA
    if (ratio >= 4.5) return 75;    // AA
    if (ratio >= 3) return 50;      // AA Large
    if (ratio >= 2) return 30;
    return 15;
}

// ─── Main evaluation function ─────────────────────────────────────────────────

/**
 * Evaluate the quality of generated post variations.
 * Returns one PostEvaluation per variation (parallel evaluation in a single LLM call).
 *
 * @param variations  Array of PostVariation objects (1-3 typically)
 * @param brandDNA    Optional — enables brand alignment scoring
 */
export async function evaluatePostQuality(
    variations: PostVariation[],
    brandDNA?: BrandDNA,
): Promise<PostEvaluation[]> {
    if (variations.length === 0) return [];

    console.log(`[postJudge] Evaluating ${variations.length} variation(s)...`);

    // ── Pre-compute deterministic metrics ─────────────────────────────────────
    const contrastScores = variations.map((v) => ({
        textContrast: contrastToScore(contrastRatio(v.backgroundColor, v.textColor)),
        accentContrast: contrastToScore(contrastRatio(v.backgroundColor, v.accentColor)),
    }));

    // ── Build brand context string ─────────────────────────────────────────────
    const brandContext = brandDNA
        ? `
Brand DNA Context:
- Brand: ${brandDNA.brandName} (${brandDNA.industry})
- Mood: ${brandDNA.emotionalProfile.mood}
- Primary color: ${brandDNA.colors.primary}
- Personality: serious=${100 - brandDNA.personality.seriousPlayful}/100, bold=${100 - brandDNA.personality.boldSubtle}/100
- Composition: ${brandDNA.composition.rhythm} rhythm, ${brandDNA.composition.dynamics} dynamics`
        : 'No brand DNA provided — evaluate without brand alignment context.';

    // ── Build variations summary ───────────────────────────────────────────────
    const variationsSummary = variations.map((v, i) => `
Variation ${i + 1}:
- Headline: "${v.headline}"
- Body: "${v.body.slice(0, 120)}${v.body.length > 120 ? '...' : ''}"
- CTA: "${v.callToAction}"
- Layout: ${v.layout}
- Colors: bg=${v.backgroundColor}, text=${v.textColor}, accent=${v.accentColor}
- Platform: ${v.platform}
- Measured contrast ratio (text/bg): ${contrastRatio(v.backgroundColor, v.textColor).toFixed(1)}:1`
    ).join('\n');

    // ── LLM evaluation ─────────────────────────────────────────────────────────
    try {
        const response = await invokeLLM({
            messages: [
                {
                    role: 'system',
                    content: `You are a Senior Brand Strategist and Social Media Art Director.
Your task is to evaluate ${variations.length} social media post variation(s) as an expert judge.

Evaluate each variation on these dimensions (0-100 each):
1. **brandAlignment** — how well do the copy/colors/tone match the brand's DNA? (50 if no brand DNA)
2. **aestheticQuality** — NIMA-inspired: is the visual composition appealing? Consider color harmony, contrast, visual hierarchy
3. **readability** — Is the text easy to read? Consider contrast, length, hierarchy (use the measured contrast data provided)
4. **messageClarity** — VQAScore-inspired: does every element serve the main message? Is the CTA clear?
5. **engagement** — will this catch attention on social media? Consider hook strength, emotional pull, shareability

For each variation, also provide:
- Up to 3 specific, actionable improvement suggestions (concrete, not generic)
- A verdict: "excellent" (avg ≥ 80), "good" (avg ≥ 60), "needs-improvement" (avg < 60)

Be honest and specific. Avoid inflated scores — real feedback is more valuable.`,
                },
                {
                    role: 'user',
                    content: `${brandContext}

${variationsSummary}

Evaluate all ${variations.length} variation(s). Return JSON matching the schema exactly.`,
                },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'post_quality_evaluation',
                    strict: true,
                    schema: {
                        type: 'object',
                        properties: {
                            evaluations: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        overallScore: { type: 'number', description: 'Average of all dimensions (0-100)' },
                                        dimensions: {
                                            type: 'object',
                                            properties: {
                                                brandAlignment: { type: 'number' },
                                                aestheticQuality: { type: 'number' },
                                                readability: { type: 'number' },
                                                messageClarity: { type: 'number' },
                                                engagement: { type: 'number' },
                                            },
                                            required: ['brandAlignment', 'aestheticQuality', 'readability', 'messageClarity', 'engagement'],
                                            additionalProperties: false,
                                        },
                                        suggestions: {
                                            type: 'array',
                                            items: { type: 'string' },
                                        },
                                        verdict: { type: 'string', enum: ['excellent', 'good', 'needs-improvement'] },
                                    },
                                    required: ['overallScore', 'dimensions', 'suggestions', 'verdict'],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ['evaluations'],
                        additionalProperties: false,
                    },
                },
            },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('No response from Judge LLM');
        const str = typeof content === 'string' ? content : JSON.stringify(content);
        const parsed = JSON.parse(str) as { evaluations: PostEvaluation[] };

        // Merge deterministic contrast score into readability
        const merged = parsed.evaluations.map((ev, i) => {
            const cs = contrastScores[i];
            if (!cs) return ev;
            // Blend LLM readability (70%) with measured contrast (30%)
            const blendedReadability = Math.round(ev.dimensions.readability * 0.7 + cs.textContrast * 0.3);
            const dims = { ...ev.dimensions, readability: blendedReadability };
            const overall = Math.round(
                (dims.brandAlignment + dims.aestheticQuality + dims.readability + dims.messageClarity + dims.engagement) / 5
            );
            const verdict: PostEvaluation['verdict'] =
                overall >= 80 ? 'excellent' : overall >= 60 ? 'good' : 'needs-improvement';
            return { ...ev, dimensions: dims, overallScore: overall, verdict };
        });

        console.log('[postJudge] Evaluation complete:', merged.map((e) => ({
            score: e.overallScore,
            verdict: e.verdict,
        })));

        return merged;
    } catch (err) {
        console.warn('[postJudge] LLM evaluation failed:', err);
        // Return neutral scores on failure — don't block the UI
        return variations.map((v, i) => ({
            overallScore: 70,
            dimensions: {
                brandAlignment: 70,
                aestheticQuality: 70,
                readability: contrastScores[i]?.textContrast ?? 70,
                messageClarity: 70,
                engagement: 70,
            },
            suggestions: [],
            verdict: 'good' as const,
        }));
    }
}
