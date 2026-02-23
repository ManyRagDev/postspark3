/**
 * assembler.ts — Converts an array of annotated PNG buffers into GIF/MP4/HTML.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
// @ts-ignore
import GIFEncoder from 'gif-encoder-2';

export interface AssemblerOptions {
  outputDir: string;
  tourName: string;
  frameDelayMs?: number; // default 1200ms per frame
}

/**
 * Write all raw frames as individual PNGs to frameDir (for debugging / ffmpeg input).
 */
export async function saveFrames(frames: Buffer[], frameDir: string): Promise<string[]> {
  fs.mkdirSync(frameDir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const filePath = path.join(frameDir, `frame-${String(i).padStart(3, '0')}.png`);
    fs.writeFileSync(filePath, frames[i]);
    paths.push(filePath);
  }
  return paths;
}

/**
 * Generate an animated GIF from frames.
 */
export async function buildGif(
  frames: Buffer[],
  opts: AssemblerOptions
): Promise<string> {
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const outputPath = path.join(opts.outputDir, `${opts.tourName}.gif`);
  const delay = opts.frameDelayMs ?? 1200;

  // Load first frame to get dimensions
  const firstImg = await loadImage(frames[0]);
  const width = firstImg.width;
  const height = firstImg.height;

  const encoder = new GIFEncoder(width, height, 'neuquant', true);
  encoder.setDelay(delay);
  encoder.setRepeat(0); // loop forever
  encoder.setQuality(10);
  encoder.start();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (const frameBuffer of frames) {
    const img = await loadImage(frameBuffer);
    ctx.drawImage(img, 0, 0);
    // @ts-ignore
    encoder.addFrame(ctx);
  }

  encoder.finish();
  const buffer = encoder.out.getData();
  fs.writeFileSync(outputPath, buffer);
  console.log(`[assembler] ✅ GIF saved → ${outputPath}`);
  return outputPath;
}

/**
 * Generate an MP4 video from frames using ffmpeg CLI.
 * Requires ffmpeg to be installed and on PATH.
 */
export async function buildMp4(
  frameDir: string,
  opts: AssemblerOptions
): Promise<string> {
  const { execSync } = await import('child_process');
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const outputPath = path.join(opts.outputDir, `${opts.tourName}.mp4`);
  const fps = Math.round(1000 / (opts.frameDelayMs ?? 1200));

  const inputPattern = path.join(frameDir, 'frame-%03d.png');

  const cmd = [
    'ffmpeg -y',
    `-framerate ${fps}`,
    `-i "${inputPattern}"`,
    '-c:v libx264',
    '-pix_fmt yuv420p',
    '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"',
    `"${outputPath}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`[assembler] ✅ MP4 saved → ${outputPath}`);
  } catch (e) {
    console.warn(`[assembler] ⚠️ ffmpeg not found or failed. MP4 skipped. Install ffmpeg and re-run.`);
  }

  return outputPath;
}

/**
 * Build an interactive HTML slideshow from frames.
 */
export async function buildHtml(
  frames: Buffer[],
  captions: string[],
  opts: AssemblerOptions
): Promise<string> {
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const outputPath = path.join(opts.outputDir, `${opts.tourName}.html`);

  // Embed frames as base64 data URIs
  const slides = frames
    .map((buf, i) => {
      const b64 = buf.toString('base64');
      const caption = captions[i] ?? '';
      return `{ src: "data:image/png;base64,${b64}", caption: ${JSON.stringify(caption)} }`;
    })
    .join(',\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>PostSpark — How To: ${opts.tourName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d1a;
      color: #e2e2f0;
      font-family: 'Inter', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    h1 { font-size: 1.4rem; margin-bottom: 16px; background: linear-gradient(90deg, #8b5cf6, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .viewer { position: relative; max-width: 900px; width: 100%; background: #111124; border-radius: 16px; overflow: hidden; box-shadow: 0 0 60px rgba(139, 92, 246, 0.2); }
    img.slide { width: 100%; display: block; }
    .caption { padding: 16px 20px; font-size: 0.9rem; color: #a0a0c0; border-top: 1px solid rgba(255,255,255,0.06); }
    .controls { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
    button {
      background: linear-gradient(135deg, #8b5cf6, #ec4899);
      border: none; border-radius: 8px; color: #fff;
      padding: 8px 20px; font-size: 0.9rem; cursor: pointer; transition: opacity 0.2s;
    }
    button:hover { opacity: 0.85; }
    button:disabled { opacity: 0.3; cursor: default; }
    .counter { font-size: 0.85rem; color: #666; min-width: 60px; text-align: center; }
    .progress { width: 100%; height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 12px; overflow: hidden; }
    .progress-bar { height: 100%; background: linear-gradient(90deg, #8b5cf6, #ec4899); transition: width 0.3s ease; }
    .autoplay { font-size: 0.8rem; color: #888; cursor: pointer; padding: 6px 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: transparent; color: #aaa; }
    .autoplay.active { border-color: #8b5cf6; color: #8b5cf6; }
  </style>
</head>
<body>
  <h1>✦ PostSpark — ${opts.tourName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h1>
  <div class="viewer">
    <img class="slide" id="slideImg" src="" alt="Tour frame" />
    <div class="caption" id="slideCaption"></div>
  </div>
  <div class="controls">
    <button id="prevBtn">← Anterior</button>
    <span class="counter" id="counter">1 / 1</span>
    <button id="nextBtn">Próximo →</button>
    <button class="autoplay" id="autoBtn">▶ Auto</button>
  </div>
  <div class="progress"><div class="progress-bar" id="progressBar"></div></div>

  <script>
    const slides = [${slides}];
    let current = 0;
    let autoInterval = null;

    const img = document.getElementById('slideImg');
    const caption = document.getElementById('slideCaption');
    const counter = document.getElementById('counter');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const autoBtn = document.getElementById('autoBtn');
    const progressBar = document.getElementById('progressBar');

    function show(index) {
      current = Math.max(0, Math.min(index, slides.length - 1));
      img.src = slides[current].src;
      caption.textContent = slides[current].caption;
      counter.textContent = \`\${current + 1} / \${slides.length}\`;
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === slides.length - 1;
      progressBar.style.width = \`\${((current + 1) / slides.length) * 100}%\`;
    }

    prevBtn.addEventListener('click', () => show(current - 1));
    nextBtn.addEventListener('click', () => show(current + 1));

    autoBtn.addEventListener('click', () => {
      if (autoInterval) {
        clearInterval(autoInterval);
        autoInterval = null;
        autoBtn.textContent = '▶ Auto';
        autoBtn.classList.remove('active');
      } else {
        autoInterval = setInterval(() => {
          if (current < slides.length - 1) show(current + 1);
          else { clearInterval(autoInterval); autoInterval = null; autoBtn.textContent = '▶ Auto'; autoBtn.classList.remove('active'); }
        }, 1800);
        autoBtn.textContent = '⏸ Pausar';
        autoBtn.classList.add('active');
      }
    });

    show(0);
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`[assembler] ✅ HTML saved → ${outputPath}`);
  return outputPath;
}
