import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const rootDir = process.cwd();
const showcaseUrl = 'http://127.0.0.1:8085/design_showcase.html';
const assetsDir = '/home/emanuel/.gemini/antigravity/brain/970d81a5-1b67-4d2b-ae3f-7a67fdc49db0/assets';
const outputDir = path.join(rootDir, 'designs', 'showcase_consolidado');

// Folder structure
const subdirs = [
  '01_referencias_curadas_r4',
  '02_catalogo_oficial_r9',
  '03_novos_conceitos/serie_1_brutalism_bauhaus',
  '03_novos_conceitos/serie_2_retro_tech_cyberpunk',
  '03_novos_conceitos/serie_3_neo_pop_playful',
  '03_novos_conceitos/serie_4_dark_luxury_glass',
  '03_novos_conceitos/serie_5_high_ticket_executive',
];

for (const sub of subdirs) {
  await fs.mkdir(path.join(outputDir, sub), { recursive: true });
}

console.log('✓ Pastas de destino criadas com sucesso!');

// Inicia o Chromium headless
const browser = await chromium.launch({
  executablePath: '/home/emanuel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  headless: true
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 1800 },
  deviceScaleFactor: 2 // 2x Retina resolution para fidelidade máxima (2160x2700 px em 4:5)
});

console.log('⏳ Carregando o showcase consolidado no Chromium...');
await page.goto(showcaseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  if (typeof switchMasterView === 'function') {
    switchMasterView('all');
  }
});
await page.waitForTimeout(1000); // Aguarda estabilização do layout

console.log('====================================================');
console.log('1. Exportando os 29 Novos Conceitos (Séries 1 a 5)...');
console.log('====================================================');

const seriesMapping = {
  'Série 1': 'serie_1_brutalism_bauhaus',
  'Série 2': 'serie_2_retro_tech_cyberpunk',
  'Série 3': 'serie_3_neo_pop_playful',
  'Série 4': 'serie_4_dark_luxury_glass',
  'Série 5': 'serie_5_high_ticket_executive',
};

const futureCards = await page.$$('#portfolio-future > div.grid > div');
console.log(`Encontrados ${futureCards.length} cards em Novos Conceitos.`);

for (let i = 0; i < futureCards.length; i++) {
  const card = futureCards[i];
  const metadata = await card.evaluate(el => {
    const titleEl = el.querySelector('span.font-bold') || el.querySelector('h3');
    const seriesEl = el.querySelector('span.font-mono-tech');
    return {
      title: titleEl ? titleEl.textContent.trim() : `design_${i + 1}`,
      series: seriesEl ? seriesEl.textContent.trim() : 'Série 1'
    };
  });

  const folderName = seriesMapping[metadata.series] || 'serie_1_brutalism_bauhaus';
  // Normaliza o nome do arquivo
  const cleanTitle = metadata.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const fileName = `${cleanTitle}.png`;
  const filePath = path.join(outputDir, '03_novos_conceitos', folderName, fileName);

  const visualEl = await card.$('.ratio-4-5');
  if (visualEl) {
    await visualEl.screenshot({ path: filePath, type: 'png' });
    console.log(`  ✓ [${metadata.series}] ${metadata.title} -> ${folderName}/${fileName}`);
  }
}

console.log('====================================================');
console.log('2. Exportando os 29 Complete Designs do Catálogo R9...');
console.log('====================================================');

const r9Cards = await page.$$('#portfolio-original > div.grid > div');
console.log(`Encontrados ${r9Cards.length} cards no Catálogo R9.`);

for (let i = 0; i < r9Cards.length; i++) {
  const card = r9Cards[i];
  const metadata = await card.evaluate(el => {
    const titleEl = el.querySelector('span.font-bold') || el.querySelector('h3');
    return {
      title: titleEl ? titleEl.textContent.trim() : `r9_design_${i + 1}`
    };
  });

  const cleanTitle = metadata.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const fileName = `${cleanTitle}.png`;
  const filePath = path.join(outputDir, '02_catalogo_oficial_r9', fileName);

  const visualEl = await card.$('.ratio-4-5');
  if (visualEl) {
    await visualEl.screenshot({ path: filePath, type: 'png' });
    console.log(`  ✓ [R9] ${metadata.title} -> ${fileName}`);
  }
}

console.log('====================================================');
console.log('3. Exportando as 24 Referências Icônicas (R4)...');
console.log('====================================================');

// Para as 24 referências, copiamos a imagem original e o render Konva
const refCards = await page.$$('#portfolio-references > div.grid > div');
console.log(`Encontradas ${refCards.length} referências curadas.`);

for (let i = 0; i < refCards.length; i++) {
  const card = refCards[i];
  const info = await card.evaluate(el => {
    const titleEl = el.querySelector('h4');
    const origImg = el.querySelector('img[id$="-img-orig"]');
    const renderImg = el.querySelector('img[id$="-img-render"]');
    return {
      title: titleEl ? titleEl.textContent.trim() : `ref_${i + 1}`,
      origSrc: origImg ? origImg.getAttribute('src') : null,
      renderSrc: renderImg ? renderImg.getAttribute('src') : null,
    };
  });

  const cleanTitle = `${String(i + 1).padStart(2, '0')}_${info.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;

  if (info.origSrc && info.origSrc.startsWith('assets/')) {
    const assetFile = info.origSrc.replace('assets/', '');
    const ext = path.extname(assetFile) || '.png';
    const srcPath = path.join(assetsDir, assetFile);
    const destPath = path.join(outputDir, '01_referencias_curadas_r4', `${cleanTitle}_foto${ext}`);
    try {
      await fs.copyFile(srcPath, destPath);
    } catch (e) {
      console.warn(`    Aviso: Foto original não encontrada (${assetFile})`);
    }
  }

  if (info.renderSrc && info.renderSrc.startsWith('assets/')) {
    const assetFile = info.renderSrc.replace('assets/', '');
    const srcPath = path.join(assetsDir, assetFile);
    const destPath = path.join(outputDir, '01_referencias_curadas_r4', `${cleanTitle}_render.png`);
    try {
      await fs.copyFile(srcPath, destPath);
    } catch (e) {
      console.warn(`    Aviso: Render Konva não encontrado (${assetFile})`);
    }
  }

  // Também tiramos um print do card de curadoria completo (com cabeçalho e paleta)
  const cardShotPath = path.join(outputDir, '01_referencias_curadas_r4', `${cleanTitle}_card_curadoria.png`);
  await card.screenshot({ path: cardShotPath, type: 'png' });
  console.log(`  ✓ [R4] ${info.title} -> ${cleanTitle}`);
}

await browser.close();
console.log('====================================================');
console.log('✓ Exportação concluída com sucesso em: designs/showcase_consolidado/');
