import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const rootDir = process.cwd();
const showcaseUrl = 'http://127.0.0.1:8085/design_showcase.html';
const outputBase = path.join(rootDir, 'designs', 'showcase_consolidado', '03_novos_conceitos');

const seriesConfig = [
  {
    sectionId: 'section-s1',
    folder: 'serie_1_brutalism_bauhaus',
    cards: [
      { num: '01', file: '01_linear_bento.png' },
      { num: '02', file: '02_warm_editorial.png' },
      { num: '03', file: '03_asymmetric_swiss.png' },
      { num: '04', file: '04_floating_note.png' },
      { num: '05', file: '05_dual_split.png' }
    ]
  },
  {
    sectionId: 'section-s2',
    folder: 'serie_2_retro_tech_cyberpunk',
    cards: [
      { num: '06', file: '06_industrial_tech_spec.png' },
      { num: '07', file: '07_acid_chrome_poster.png' },
      { num: '08', file: '08_risograph_print_zine.png' },
      { num: '09', file: '09_archival_specimen.png' },
      { num: '10', file: '10_neo_bauhaus_construct.png' },
      { num: '11', file: '11_thermal_receipt_punk.png' }
    ]
  },
  {
    sectionId: 'section-s3',
    folder: 'serie_3_neo_pop_playful',
    cards: [
      { num: '12', file: '12_neo_tokyo_obi_poster.png' },
      { num: '13', file: '13_surrealist_dada_collage.png' },
      { num: '14', file: '14_haute_couture_art_deco.png' },
      { num: '15', file: '15_1979_cassette_futurism.png' },
      { num: '16', file: '16_cyanotype_blueprint.png' },
      { num: '17', file: '17_chromatic_aura_portal.png' }
    ]
  },
  {
    sectionId: 'section-s4',
    folder: 'serie_4_dark_luxury_glass',
    cards: [
      { num: '18', file: '18_pop_art_comic.png' },
      { num: '19', file: '19_constructivist_wedge.png' },
      { num: '20', file: '20_neo_art_nouveau_mucha.png' },
      { num: '21', file: '21_psychedelic_groove.png' },
      { num: '22', file: '22_punk_xerox_fanzine_77.png' },
      { num: '23', file: '23_memphis_milano_1981.png' }
    ]
  },
  {
    sectionId: 'section-s5',
    folder: 'serie_5_high_ticket_executive',
    cards: [
      { num: '24', file: '24_wes_anderson_symmetrical.png' },
      { num: '25', file: '25_blue_note_hard_bop.png' },
      { num: '26', file: '26_a24_cinematic_title_card.png' },
      { num: '27', file: '27_factory_records_pulsar.png' },
      { num: '28', file: '28_swiss_haute_horlogerie.png' },
      { num: '29', file: '29_neo_seoul_cyberpunk_2099.png' }
    ]
  }
];

const browser = await chromium.launch({
  executablePath: '/home/emanuel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  headless: true
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 1800 },
  deviceScaleFactor: 2 // 2x Retina resolution
});

console.log('⏳ Carregando o showcase com os cards restaurados...');
await page.goto(showcaseUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  if (typeof switchMasterView === 'function') {
    switchMasterView('all');
  }
});
await page.waitForTimeout(1000);

let totalExported = 0;

for (const series of seriesConfig) {
  console.log(`\n=== Exportando ${series.folder} (${series.sectionId}) ===`);
  const folderPath = path.join(outputBase, series.folder);
  await fs.mkdir(folderPath, { recursive: true });

  const sectionEl = await page.$(`#${series.sectionId}`);
  if (!sectionEl) {
    console.error(`ERRO: Seção ${series.sectionId} não encontrada!`);
    continue;
  }

  // Find all .ratio-4-5 artboards inside this section
  const artboards = await sectionEl.$$('.ratio-4-5');
  console.log(`Encontrados ${artboards.length} artboards na seção ${series.sectionId}.`);

  for (let i = 0; i < series.cards.length; i++) {
    const cardInfo = series.cards[i];
    const artboard = artboards[i];
    if (!artboard) {
      console.warn(`Aviso: Artboard ${i} não encontrado em ${series.sectionId}`);
      continue;
    }

    const filePath = path.join(folderPath, cardInfo.file);
    await artboard.screenshot({ path: filePath, type: 'png' });
    console.log(`  ✓ [Card ${cardInfo.num}] Salvo em ${series.folder}/${cardInfo.file}`);
    totalExported++;
  }
}

await browser.close();
console.log(`\n✓ Concluído! ${totalExported} designs de altíssima qualidade reexportados.`);
