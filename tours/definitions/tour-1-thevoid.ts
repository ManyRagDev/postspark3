/**
 * tour-1-thevoid.ts — Tour: TheVoid (Step 1 of 3)
 * Shows how to enter a topic, select a mode, and submit.
 */

import type { Page } from 'playwright';
import type { Annotation } from '../lib/annotator';

export interface TourStep {
    description: string;
    action: (page: Page) => Promise<void>;
    annotations?: Annotation[];
    delayAfterMs?: number;
}

export const TOUR_NAME = 'tour-1-thevoid';
export const TOUR_TITLE = 'Passo 1: Criando um Post';

export const steps: TourStep[] = [
    {
        description: 'Bem-vindo ao PostSpark! Comece digitando uma ideia, tema ou cole uma URL.',
        action: async (page) => {
            // Just land on the page and let it settle
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);
        },
        annotations: [
            {
                type: 'caption',
                label: 'Bem-vindo ao PostSpark! Aqui você transforma ideias em posts.',
            },
        ],
        delayAfterMs: 1800,
    },
    {
        description: 'Digite o tema do seu post no campo de texto principal.',
        action: async (page) => {
            // Focus the smart input — it's a textarea/input inside SmartInput
            const input = page.locator('textarea, input[type="text"]').first();
            await input.click();
            await input.type('Dicas de produtividade para empreendedores', { delay: 40 });
            await page.waitForTimeout(600);
        },
        annotations: [
            {
                type: 'caption',
                label: 'Digite o tema do post, cole uma URL ou envie uma imagem.',
            },
        ],
        delayAfterMs: 1500,
    },
    {
        description: 'Escolha entre criar um post estático ou um carrossel.',
        action: async (page) => {
            // Just screenshot; highlighting will be applied via bounding box lookup
            await page.waitForTimeout(400);
        },
        annotations: [
            {
                type: 'caption',
                label: 'Escolha o formato: Post Estático ou Carrossel (múltiplos slides).',
            },
        ],
        delayAfterMs: 1500,
    },
    {
        description: 'Clique em "Carrossel" para criar um carrossel de slides.',
        action: async (page) => {
            // Try to click the carousel toggle button
            const carouselBtn = page.locator('button:has-text("Carrossel"), [data-tour="void-carousel"]').first();
            if (await carouselBtn.isVisible()) {
                await carouselBtn.click();
                await page.waitForTimeout(600);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Modo Carrossel selecionado — gera múltiplos slides sequencialmente.',
            },
        ],
        delayAfterMs: 1400,
    },
    {
        description: 'Voltamos para Post Estático e clicamos em Gerar.',
        action: async (page) => {
            // Switch back to static
            const staticBtn = page.locator('button:has-text("Post"), button:has-text("Estático"), [data-tour="void-static"]').first();
            if (await staticBtn.isVisible()) {
                await staticBtn.click();
                await page.waitForTimeout(400);
            }
        },
        annotations: [
            {
                type: 'caption',
                label: 'Selecionado: Post Estático. Pronto para gerar variações!',
            },
        ],
        delayAfterMs: 1200,
    },
    {
        description: 'A IA começa a gerar variações criativas do seu post.',
        action: async (page) => {
            // Click submit button — find by common patterns
            const submitBtn = page.locator('button[type="submit"], button:has-text("Gerar"), [data-tour="void-submit"]').first();
            if (await submitBtn.isVisible()) {
                await submitBtn.click();
            }
            // Wait a bit to show loading state
            await page.waitForTimeout(1200);
        },
        annotations: [
            {
                type: 'caption',
                label: 'PostSpark analisa seu tema com IA e cria múltiplas variações criativas.',
            },
        ],
        delayAfterMs: 1200,
    },
];
