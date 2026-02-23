/**
 * tour-3-workbench.ts — Tour: Workbench (Step 3 of 3)
 * Full editor tour — layout, colors, typography, font size, architect mode.
 */

import type { Page } from 'playwright';
import type { Annotation } from '../lib/annotator';

export interface TourStep {
    description: string;
    action: (page: Page) => Promise<void>;
    annotations?: Annotation[];
    delayAfterMs?: number;
}

export const TOUR_NAME = 'tour-3-workbench';
export const TOUR_TITLE = 'Passo 3: Personalizando no Workbench';

export const steps: TourStep[] = [
    {
        description: 'O Workbench é o editor completo. O post fica no centro, controles na lateral.',
        action: async (page) => {
            await page.waitForTimeout(1000);
        },
        annotations: [
            {
                type: 'caption',
                label: 'Workbench: editor completo com visualizador central e painel de controles.',
            },
        ],
        delayAfterMs: 2000,
    },
    {
        description: 'Altere o Layout do post — centered, left-aligned, split, minimal.',
        action: async (page) => {
            // Click the layout section trigger
            const layoutSection = page.locator('[data-tour="wb-layout"], button:has-text("Layout"), button:has-text("Composição")').first();
            if (await layoutSection.isVisible()) {
                await layoutSection.click();
                await page.waitForTimeout(600);
            }
            // Try to click a different layout option
            const layoutBtn = page.locator('button:has-text("Split"), button:has-text("Bipartido"), [data-value="split"]').first();
            if (await layoutBtn.isVisible()) {
                await layoutBtn.click();
                await page.waitForTimeout(700);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Layout "Split" — divide o card em duas áreas visuais distintas.',
            },
        ],
        delayAfterMs: 1600,
    },
    {
        description: 'Volte para o layout Centered — clean e focado.',
        action: async (page) => {
            const centeredBtn = page.locator('button:has-text("Centered"), button:has-text("Centralizado"), [data-value="centered"]').first();
            if (await centeredBtn.isVisible()) {
                await centeredBtn.click();
                await page.waitForTimeout(600);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Layout "Centered" — texto centralizado, foco na mensagem principal.',
            },
        ],
        delayAfterMs: 1400,
    },
    {
        description: 'Personalize as Cores — fundo, texto e acento.',
        action: async (page) => {
            const colorSection = page.locator('[data-tour="wb-colors"], button:has-text("Cores"), button:has-text("Design")').first();
            if (await colorSection.isVisible()) {
                await colorSection.click();
                await page.waitForTimeout(700);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Cores: ajuste a cor de fundo, do texto e do acento individualmente.',
            },
        ],
        delayAfterMs: 1500,
    },
    {
        description: 'Ajuste o tamanho da fonte dos textos com os sliders.',
        action: async (page) => {
            // Find the font size sliders — look for range inputs or labeled sliders
            const slider = page.locator('input[type="range"], [data-tour="wb-font-size"]').first();
            if (await slider.isVisible()) {
                const box = await slider.boundingBox();
                if (box) {
                    // Drag slider to the right (increase font size)
                    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
                    await page.mouse.down();
                    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 });
                    await page.mouse.up();
                    await page.waitForTimeout(600);
                }
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Sliders de tamanho: aumente ou diminua fonte do título e do corpo.',
            },
        ],
        delayAfterMs: 1500,
    },
    {
        description: 'Ative o Modo Arquiteto — drag & drop livre dos elementos.',
        action: async (page) => {
            const architectToggle = page.locator('[data-tour="wb-architect"], button:has-text("Arquiteto"), button:has-text("Architect")').first();
            if (await architectToggle.isVisible()) {
                await architectToggle.click();
                await page.waitForTimeout(800);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Modo Arquiteto: arraste livremente o título e o corpo para qualquer posição.',
            },
        ],
        delayAfterMs: 1800,
    },
    {
        description: 'Veja o Design Checklist — análise automatizada de qualidade visual.',
        action: async (page) => {
            const checklistBtn = page.locator('[data-tour="wb-checklist"], button:has-text("Checklist"), button:has-text("Design Check")').first();
            if (await checklistBtn.isVisible()) {
                await checklistBtn.click();
                await page.waitForTimeout(700);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Design Checklist: verifica contraste, hierarquia, tipografia e mais.',
            },
        ],
        delayAfterMs: 1600,
    },
    {
        description: 'Gere uma imagem de fundo com IA — basta clicar em "Gerar Imagem".',
        action: async (page) => {
            const imageSection = page.locator('button:has-text("Gerar Imagem"), button:has-text("Imagem"), [data-tour="wb-image"]').first();
            if (await imageSection.isVisible()) {
                await imageSection.click();
                await page.waitForTimeout(700);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Geração de imagem com IA: Pollinations (rápida) ou Gemini (premium).',
            },
        ],
        delayAfterMs: 1500,
    },
    {
        description: 'Quando estiver satisfeito, salve o post!',
        action: async (page) => {
            const saveBtn = page.locator('button:has-text("Salvar"), button:has-text("Consolidar"), [data-tour="wb-save"]').first();
            if (await saveBtn.isVisible()) {
                // Hover only — don't actually save in the tour
                await saveBtn.hover();
                await page.waitForTimeout(500);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Pronto! Salve o post para consolidá-lo na sua biblioteca.',
            },
        ],
        delayAfterMs: 1600,
    },
];
