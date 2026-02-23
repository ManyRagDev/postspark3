/**
 * tour-2-holodeck.ts — Tour: HoloDeck (Step 2 of 3)
 * Demonstrates the variation picker, aspect ratio and style selection.
 *
 * NOTE: This tour runs with pre-loaded mock state injected via localStorage
 * so it doesn't rely on a live API call.
 */

import type { Page } from 'playwright';
import type { Annotation } from '../lib/annotator';

export interface TourStep {
    description: string;
    action: (page: Page) => Promise<void>;
    annotations?: Annotation[];
    delayAfterMs?: number;
}

export const TOUR_NAME = 'tour-2-holodeck';
export const TOUR_TITLE = 'Passo 2: Escolhendo a Variação';

// Mock post variation data injected into the app for the demo
export const MOCK_STATE_SCRIPT = `
  // Inject mock variations into the app via window globals
  // The runner will evaluate this before navigating to holodeck state
  window.__TOUR_MOCK__ = true;
`;

export const steps: TourStep[] = [
    {
        description: 'O HoloDeck exibe as variações criadas pela IA. Deslize para explorar.',
        action: async (page) => {
            await page.waitForTimeout(1000);
        },
        annotations: [
            {
                type: 'caption',
                label: 'HoloDeck: a IA gerou variações únicas. Deslize os cards para explorar.',
            },
        ],
        delayAfterMs: 2000,
    },
    {
        description: 'Cada variação tem um tom, layout e estilo visual diferentes.',
        action: async (page) => {
            // Swipe/drag to reveal next card — simulate mouse drag on the card
            const card = page.locator('[class*="wallet"], [class*="card"]').first();
            if (await card.isVisible()) {
                const box = await card.boundingBox();
                if (box) {
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await page.mouse.down();
                    await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 10 });
                    await page.mouse.up();
                    await page.waitForTimeout(600);
                }
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Deslize para a esquerda ou direita para navegar entre as variações.',
            },
        ],
        delayAfterMs: 1600,
    },
    {
        description: 'Selecione a proporção do post: 1:1 (quadrado), 5:6 (retrato) ou 9:16 (stories).',
        action: async (page) => {
            // Click the 9:16 ratio button
            const ratioBtn = page.locator('button:has-text("9:16"), [data-tour="holodeck-aspect-916"]').first();
            if (await ratioBtn.isVisible()) {
                await ratioBtn.click();
                await page.waitForTimeout(700);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Proporção 9:16 selecionada — ideal para Stories e Reels.',
            },
        ],
        delayAfterMs: 1500,
    },
    {
        description: 'Voltar para proporção 1:1 — o formato quadrado padrão para o feed.',
        action: async (page) => {
            const ratioBtn = page.locator('button:has-text("1:1"), [data-tour="holodeck-aspect-11"]').first();
            if (await ratioBtn.isVisible()) {
                await ratioBtn.click();
                await page.waitForTimeout(600);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: '1:1 selecionado — formato quadrado clássico para feed do Instagram.',
            },
        ],
        delayAfterMs: 1400,
    },
    {
        description: 'Explore os temas visuais disponíveis.',
        action: async (page) => {
            // Open the style selector if there's a button for it
            const styleBtn = page.locator('button:has-text("Estilo"), button:has-text("Tema"), [data-tour="holodeck-style"]').first();
            if (await styleBtn.isVisible()) {
                await styleBtn.click();
                await page.waitForTimeout(700);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Escolha um tema visual — cada tema muda toda a paleta de cores do post.',
            },
        ],
        delayAfterMs: 1600,
    },
    {
        description: 'Selecione a variação favorita e avance para o editor completo.',
        action: async (page) => {
            // Click the "Editar" / "Selecionar" / "Workbench" button
            const selectBtn = page.locator('button:has-text("Editar"), button:has-text("Selecionar"), button:has-text("Personalizar"), [data-tour="holodeck-select"]').first();
            if (await selectBtn.isVisible()) {
                await selectBtn.click();
                await page.waitForTimeout(1000);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Selecionada! Abrindo o editor completo — Workbench.',
            },
        ],
        delayAfterMs: 1500,
    },
];
