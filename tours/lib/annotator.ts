/**
 * annotator.ts — Draws visual annotations on top of screenshots.
 * Uses node-canvas natively without DOM dependencies.
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as path from 'path';

export interface HighlightAnnotation {
    type: 'highlight';
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    label?: string;
}

export interface ArrowAnnotation {
    type: 'arrow';
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    color?: string;
    label?: string;
}

export interface TooltipAnnotation {
    type: 'tooltip';
    x: number;
    y: number;
    label: string;
    color?: string;
}

export interface SpotlightAnnotation {
    type: 'spotlight';
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
}

export interface CaptionAnnotation {
    type: 'caption';
    label: string;
}

export type Annotation =
    | HighlightAnnotation
    | ArrowAnnotation
    | TooltipAnnotation
    | SpotlightAnnotation
    | CaptionAnnotation;

const BRAND_PURPLE = '#8B5CF6';
const BRAND_PINK = '#EC4899';
const WHITE = '#FFFFFF';
const DARK = '#0D0D1A';

/**
 * Apply one or more annotations to a screenshot buffer.
 * Returns a new PNG Buffer with annotations painted on top.
 */
export async function annotateFrame(
    screenshotBuffer: Buffer,
    annotations: Annotation[]
): Promise<Buffer> {
    const img = await loadImage(screenshotBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Draw base screenshot
    ctx.drawImage(img, 0, 0);

    for (const ann of annotations) {
        switch (ann.type) {
            case 'highlight':
                drawHighlight(ctx, ann);
                break;
            case 'arrow':
                drawArrow(ctx, ann);
                break;
            case 'tooltip':
                drawTooltip(ctx, ann);
                break;
            case 'spotlight':
                drawSpotlight(ctx, ann, img.width, img.height);
                break;
            case 'caption':
                drawCaption(ctx, ann, img.width, img.height);
                break;
        }
    }

    return canvas.toBuffer('image/png');
}

function drawHighlight(ctx: any, ann: HighlightAnnotation) {
    const color = ann.color || BRAND_PURPLE;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeRect(ann.x - 4, ann.y - 4, ann.width + 8, ann.height + 8);

    // Fill with semi-transparent overlay
    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(ann.x - 4, ann.y - 4, ann.width + 8, ann.height + 8);

    if (ann.label) {
        drawTooltip(ctx, {
            type: 'tooltip',
            x: ann.x + ann.width / 2,
            y: ann.y - 16,
            label: ann.label,
            color,
        });
    }
    ctx.restore();
}

function drawArrow(ctx: any, ann: ArrowAnnotation) {
    const color = ann.color || BRAND_PINK;
    const headLen = 16;
    const dx = ann.toX - ann.fromX;
    const dy = ann.toY - ann.fromY;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    // Line
    ctx.beginPath();
    ctx.moveTo(ann.fromX, ann.fromY);
    ctx.lineTo(ann.toX, ann.toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(ann.toX, ann.toY);
    ctx.lineTo(
        ann.toX - headLen * Math.cos(angle - Math.PI / 6),
        ann.toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        ann.toX - headLen * Math.cos(angle + Math.PI / 6),
        ann.toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    if (ann.label) {
        drawTooltip(ctx, {
            type: 'tooltip',
            x: (ann.fromX + ann.toX) / 2,
            y: (ann.fromY + ann.toY) / 2 - 20,
            label: ann.label,
            color,
        });
    }
    ctx.restore();
}

function drawTooltip(ctx: any, ann: TooltipAnnotation) {
    const color = ann.color || BRAND_PURPLE;
    const padding = 10;
    const radius = 8;

    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    const textWidth = ctx.measureText(ann.label).width;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = 32;
    const bx = ann.x - boxWidth / 2;
    const by = ann.y - boxHeight;

    // Background pill
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    roundRect(ctx, bx, by, boxWidth, boxHeight, radius);
    ctx.fill();

    // Text
    ctx.shadowBlur = 0;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ann.label, ann.x, by + boxHeight / 2);

    ctx.restore();
}

function drawSpotlight(ctx: any, ann: SpotlightAnnotation, canvasW: number, canvasH: number) {
    ctx.save();

    // Dark overlay everywhere
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Clear the spotlight area (cut out the element)
    ctx.globalCompositeOperation = 'destination-out';
    const pad = 8;
    roundRect(ctx, ann.x - pad, ann.y - pad, ann.width + pad * 2, ann.height + pad * 2, 12);
    ctx.fill();

    // Re-draw neon border on top
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = BRAND_PURPLE;
    ctx.lineWidth = 3;
    ctx.shadowColor = BRAND_PURPLE;
    ctx.shadowBlur = 16;
    roundRect(ctx, ann.x - pad, ann.y - pad, ann.width + pad * 2, ann.height + pad * 2, 12);
    ctx.stroke();

    if (ann.label) {
        ctx.shadowBlur = 0;
        drawTooltip(ctx, {
            type: 'tooltip',
            x: ann.x + ann.width / 2,
            y: ann.y - 20,
            label: ann.label,
        });
    }

    ctx.restore();
}

function drawCaption(ctx: any, ann: CaptionAnnotation, canvasW: number, canvasH: number) {
    ctx.save();

    const barHeight = 52;
    const by = canvasH - barHeight;

    // Gradient bar at bottom
    const grad = ctx.createLinearGradient(0, by, 0, canvasH);
    grad.addColorStop(0, 'rgba(13, 13, 26, 0.92)');
    grad.addColorStop(1, 'rgba(13, 13, 26, 1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, by, canvasW, barHeight);

    // Purple accent line
    const lineGrad = ctx.createLinearGradient(0, 0, canvasW, 0);
    lineGrad.addColorStop(0, BRAND_PURPLE);
    lineGrad.addColorStop(1, BRAND_PINK);
    ctx.fillStyle = lineGrad;
    ctx.fillRect(0, by, canvasW, 2);

    // Logo dot
    ctx.fillStyle = BRAND_PURPLE;
    ctx.beginPath();
    ctx.arc(28, by + barHeight / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    // Caption text
    ctx.font = '16px sans-serif';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ann.label, 46, by + barHeight / 2);

    ctx.restore();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
