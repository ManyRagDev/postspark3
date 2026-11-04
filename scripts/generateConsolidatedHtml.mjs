import fs from 'node:fs/promises';
import path from 'node:path';

const baseDir = path.resolve('designs/showcase_consolidado');

// Read files in 01_referencias_curadas_r4
const refFiles = await fs.readdir(path.join(baseDir, '01_referencias_curadas_r4'));
const refGroups = {};
for (const file of refFiles.sort()) {
  const match = file.match(/^(\d{2})_(.+?)_(foto|render|card_curadoria)\.(png|jpg|jpeg)$/);
  if (match) {
    const [_, num, name, kind] = match;
    if (!refGroups[num]) {
      refGroups[num] = { num, name: name.replace(/_/g, ' '), foto: null, render: null, card: null };
    }
    if (kind === 'foto') refGroups[num].foto = file;
    if (kind === 'render') refGroups[num].render = file;
    if (kind === 'card_curadoria') refGroups[num].card = file;
  }
}

// Read files in 02_catalogo_oficial_r9
const r9Files = (await fs.readdir(path.join(baseDir, '02_catalogo_oficial_r9')))
  .filter(f => f.endsWith('.png'))
  .sort()
  .map(file => {
    const title = file.replace(/\.png$/, '').replace(/^\d{2}_/, '').replace(/_/g, ' ');
    return { file, title };
  });

// Extract metadata for the 29 new concepts from scratch_step_75.html
const step75Html = await fs.readFile('/home/emanuel/.gemini/antigravity/brain/970d81a5-1b67-4d2b-ae3f-7a67fdc49db0/scratch_step_75.html', 'utf8');

const seriesMeta = [
  {
    id: 'serie_1_brutalism_bauhaus',
    name: 'Série 1: SaaS, Conversão & Editorial Clássico',
    color: 'emerald',
    items: [
      { num: '01', title: '01. Linear Bento Blueprint', sub: 'Tech & SaaS', params: 'Grid bento com sub-cards encapsulados, mira de canto (+), badges de status e monospaced metadata.', palette: 'Dark Carbon #080B11, Verde Ácido #34D399, Border Slate #1E293B.', file: '01_novos_conceitos/serie_1_brutalism_bauhaus/01_linear_bento.png' },
      { num: '02', title: '02. Warm Editorial Magazine', sub: 'Cultura & Reflexão', params: 'Capitular clássica serifada, linha de corte editorial, texto em duas colunas respiradas e folio clássico.', palette: 'Papel Linho #FAF7F2, Nanquim Queimado #1E1915, Terracota #8C4724.', file: '01_novos_conceitos/serie_1_brutalism_bauhaus/02_warm_editorial.png' },
      { num: '03', title: '03. Asymmetric Swiss Poster', sub: 'Pôster Suíço & Brutalismo', params: 'Tipografia monumental sem serifa, alinhamentos assimétricos, números de grande escala e bloco de alerta.', palette: 'Preto Absoluto #050505, Amarelo Sinal #FACC15, Branco Puro #FFFFFF.', file: '01_novos_conceitos/serie_1_brutalism_bauhaus/03_asymmetric_swiss.png' },
      { num: '04', title: '04. Floating Note / Glass UI', sub: 'Produto & Autoridade', params: 'Mockup de janela flutuante com sombra 3D suave, badges de verificação e glow radial de fundo.', palette: 'Deep Space #0A0A12, Glass Card #161626, Ciano #38BDF8, Roxo #A855F7.', file: '01_novos_conceitos/serie_1_brutalism_bauhaus/04_floating_note.png' },
      { num: '05', title: '05. Dual Split Dilemma', sub: 'Diagnóstico & Comparativo', params: 'Comparação em dois cards contrastantes com indicador central de tensão (VS) e selos de erro vs acerto.', palette: 'Alerta Vermelho #EF4444, Aprovação Verde #10B981, Base #0D0E12.', file: '01_novos_conceitos/serie_1_brutalism_bauhaus/05_dual_split.png' }
    ]
  },
  {
    id: 'serie_2_retro_tech_cyberpunk',
    name: 'Série 2: Vanguarda Artística & Anti-Uniformidade',
    color: 'orange',
    items: [
      { num: '06', title: '06. Industrial Tech-Spec', sub: 'Utilitarian / Off-White', params: 'Tabela técnica com borda de 2px, listras hazard em CSS puro, selo circular 100% RAW inclinado e código de barras SVG.', palette: 'International Orange #FF4400, Papel #F4F1EA, Nanquim #0A0A0A.', file: '01_novos_conceitos/serie_2_retro_tech_cyberpunk/06_industrial_tech_spec.png' },
      { num: '07', title: '07. Acid Chrome Poster', sub: 'Berlin Rave / Y2K Liquid', params: 'Estrela acid de 4 pontas vetorial, globo wireframe, texto cromado e contorno neon sobre grid em perspectiva.', palette: 'Vácuo #06030C, Verde Ácido #00FF66, Magenta Cyber #FF007F.', file: '01_novos_conceitos/serie_2_retro_tech_cyberpunk/07_acid_chrome_poster.png' },
      { num: '08', title: '08. Risograph Print Zine', sub: 'Fanzine / Estamparia Riso', params: 'Padrão halftone de retícula visível, desalinhamento proposital de tinta (registro CMYK) e borda de picote com tesoura.', palette: 'Papel Pólen #F4EFE6, Azul Cobalto #0044FF, Rosa Flúor #FF3385.', file: '01_novos_conceitos/serie_2_retro_tech_cyberpunk/08_risograph_print_zine.png' },
      { num: '09', title: '09. Archival Specimen', sub: 'Botânica & Museu', params: 'Linhas finas duplas estilo documento de arquivo, carimbo com data em carmim e tabela taxonômica com serifa e itálico.', palette: 'Pergaminho #EAE3D2, Verde Botânico #22382B, Carmim #A8201A.', file: '01_novos_conceitos/serie_2_retro_tech_cyberpunk/09_archival_specimen.png' },
      { num: '10', title: '10. Neo-Bauhaus Construct', sub: 'Dessau 1925 / Geometria Pura', params: 'Formas geométricas primárias (círculo, quadrado, triângulo), faixa diagonal a 45º e tipografia brutalista funcional.', palette: 'Creme #F2ECE1, Vermelho Bauhaus #D92B2B, Azul Ultramar #1D3557, Preto #111111.', file: '01_novos_conceitos/serie_2_retro_tech_cyberpunk/10_neo_bauhaus_construct.png' },
      { num: '11', title: '11. Thermal Receipt Punk', sub: 'Anti-Design / Recibo Térmico', params: 'Papel de bobina fiscal com serrilhado de rasgo, fonte mono 100%, código de barras de mercadoria e marcação com marca-texto.', palette: 'Papel Térmico #ECEBE6, Tinta Fraca #18181B, Marca-Texto #A3E635.', file: '01_novos_conceitos/serie_2_retro_tech_cyberpunk/11_thermal_receipt_punk.png' }
    ]
  },
  {
    id: 'serie_3_neo_pop_playful',
    name: 'Série 3: Alta Arte & Expressão Experimental',
    color: 'fuchsia',
    items: [
      { num: '12', title: '12. Neo-Tokyo Brutalist Obi', sub: 'Editorial Japonês / Cartaz', params: 'Faixa lateral preta (Obi) com tipografia vertical em kanji, selo hanko vermelho e bloco tipográfico serifado.', palette: 'Creme Washi #F7F3E8, Vermelho Shinto #D91E18, Nanquim #111111.', file: '01_novos_conceitos/serie_3_neo_pop_playful/12_neo_tokyo_obi_poster.png' },
      { num: '13', title: '13. Surrealist Dada Collage', sub: 'Dadaísmo / Carta de Resgate', params: 'Palavras coladas em recortes angulares individuais, carimbo número rotacionado e moldura com fita adesiva nos cantos.', palette: 'Azul Noite #162238, Papel Antigo #F3E9D2, Dourado Ocre #F4B942.', file: '01_novos_conceitos/serie_3_neo_pop_playful/13_surrealist_dada_collage.png' },
      { num: '14', title: '14. Art Déco Haute Couture', sub: 'Luxo Clássico / Anos 1920', params: 'Bordas geométricas ornamentais com cantos escalonados em losango, serifas elegantes Cinzel e hierarquia de alta costura.', palette: 'Veludo Noir #09080A, Ouro Champanhe #D4AF37, Marfim #FAF6F0.', file: '01_novos_conceitos/serie_3_neo_pop_playful/14_haute_couture_art_deco.png' },
      { num: '15', title: '15. 1979 Cassette Futurism', sub: 'Design Industrial Analógico', params: 'Janela acrílica central com carretéis de fita cassete em SVG, medidor analógico VU meter e tipografia utilitária 70s.', palette: 'Creme ABS #EAE0C8, Preto Plástico #231915, Amarelo VU #F7B801, Vermelho #D62828.', file: '01_novos_conceitos/serie_3_neo_pop_playful/15_1979_cassette_futurism.png' },
      { num: '16', title: '16. Cyanotype Blueprint', sub: 'Processo Fotográfico 1842', params: 'Grade técnica dupla de cianotipia arquitetônica, cotas de medição (1080px) com setas e serifa refinada de prancha histórica.', palette: 'Azul Prussiano #0B3B60, Branco Cianótipo #F0F7FC, Azul Giz #72C7FF.', file: '01_novos_conceitos/serie_3_neo_pop_playful/16_cyanotype_blueprint.png' },
      { num: '17', title: '17. Chromatic Aura Portal', sub: 'Instalação de Luz / James Turrell', params: 'Arco monumental superior com degradê de atmosfera luminescente, ruído suave e tipografia flutuante de contemplação.', palette: 'Vácuo Profundo #0E091C, Coral Turrell #FF5E5B, Violeta Elétrico #7928CA, Ciano #00F5D4.', file: '01_novos_conceitos/serie_3_neo_pop_playful/17_chromatic_aura_portal.png' }
    ]
  },
  {
    id: 'serie_4_dark_luxury_glass',
    name: 'Série 4: Movimentos Históricos & Pop-Cultura Radical',
    color: 'yellow',
    items: [
      { num: '18', title: '18. Pop Art Halftone Comic', sub: 'Lichtenstein / Quadrinhos', params: 'Retícula de pontos Ben-Day cyan, balão de fala com rabicho em SVG, sombras duras preenchidas a 100% de preto.', palette: 'Amarelo Primário #FFDE00, Vermelho Cômico #EE1C25, Ciano Ben-Day #00AEEF, Preto.', file: '01_novos_conceitos/serie_4_dark_luxury_glass/18_pop_art_comic.png' },
      { num: '19', title: '19. Constructivist Wedge', sub: 'Vanguarda Russa / El Lissitzky', params: 'Cunhas geométricas agudas perfurando o espaço, blocos de texto a 45º e diagramação assimétrica de alto impacto político.', palette: 'Vermelho Revolução #C81D11, Branco Giz #E8DFCA, Preto Asfalto #121212.', file: '01_novos_conceitos/serie_4_dark_luxury_glass/19_constructivist_wedge.png' },
      { num: '20', title: '20. Neo-Art Nouveau Mucha', sub: 'Belle Époque / Linhas Orgânicas', params: 'Arcos e molduras sinuosas florais em SVG, tipografia orgânica fluida e cartela central em tons botânicos aveludados.', palette: 'Verde Sálvia Escuro #1E352F, Ouro Imperial #D4A359, Rosa Antigo #F4D8CD, Creme #FBF7F0.', file: '01_novos_conceitos/serie_4_dark_luxury_glass/20_neo_art_nouveau_mucha.png' },
      { num: '21', title: '21. 1968 Psychedelic Groove', sub: 'Contracultura / Pôster Rock', params: 'Tipografia líquida psicodélica com tripla sombra 3D projetada, cores de alto contraste vibracional e curvas sinuosas.', palette: 'Roxo Elétrico #240046, Laranja #FF5400, Amarelo Solar #FFBE0B, Turquesa #00F5D4.', file: '01_novos_conceitos/serie_4_dark_luxury_glass/21_psychedelic_groove.png' },
      { num: '22', title: '22. Punk Xerox Fanzine 1977', sub: 'CBGB / Do It Yourself', params: 'Fita adesiva nos cantos, tipografia rotacionada como manchete de jornal rasgado e contraste de fotocópia crua.', palette: 'Amarelo Marca-Texto #FAFF00, Preto Fotocópia #050505, Branco Papel.', file: '01_novos_conceitos/serie_4_dark_luxury_glass/22_punk_xerox_fanzine_77.png' },
      { num: '23', title: '23. Memphis Milano 1981', sub: 'Pós-Modernismo / Ettore Sottsass', params: 'Padrão de bolinhas Memphis, triângulos e zig-zags geométricos coloridos com sombras duras deslocadas em preto.', palette: 'Amarelo Banana #FEE440, Turquesa Rad #00F5D4, Rosa Choque #F72585, Branco Puro.', file: '01_novos_conceitos/serie_4_dark_luxury_glass/23_memphis_milano_1981.png' }
    ]
  },
  {
    id: 'serie_5_high_ticket_executive',
    name: 'Série 5: Cinema Cult, Álbuns Lendários & Precisão Mecânica',
    color: 'cyan',
    items: [
      { num: '24', title: '24. Wes Anderson Symmetrical', sub: 'Grand Budapest / Futura 35mm', params: 'Simetria arquitetônica perfeita, moldura dupla concêntrica com cantos recortados, vinheta de capítulo numerado.', palette: 'Biscuit #EAD7C3, Verde Botânico #2C3E35, Vermelho Terracota #B85D43, Creme #F4E9DC.', file: '01_novos_conceitos/serie_5_high_ticket_executive/24_wes_anderson_symmetrical.png' },
      { num: '25', title: '25. Blue Note Records 1959', sub: 'Reid Miles / Hard-Bop Jazz', params: 'Bloco sólido em ângulo reto ocupando 2/3 da prancheta, tipografia ultra-condensada com kerning negativo e número de catálogo.', palette: 'Âmbar Queimado #C85A17, Preto Nanquim #0A0A0A, Branco Leite #F5F3EF.', file: '01_novos_conceitos/serie_5_high_ticket_executive/25_blue_note_hard_bop.png' },
      { num: '26', title: '26. A24 Widescreen Noir', sub: 'Cinematografia 2.39:1', params: 'Flare anamórfico horizontal sutil, proporção ultra-widescreen cinematográfica, tipografia serifada espaçada com tracking extremo.', palette: 'Widescreen Noir #030304, Cinza Prata #E0E0E0, Flare Carmesim #FF1E56.', file: '01_novos_conceitos/serie_5_high_ticket_executive/26_a24_cinematic_title_card.png' },
      { num: '27', title: '27. Factory Records Pulsar', sub: 'Peter Saville / Joy Division', params: 'Ondas de pulsar astronômico CP 1919 em SVG puro, minimalismo industrial de Manchester e número de catálogo FAC.', palette: 'Preto Cósmico #000000, Branco Laser #FFFFFF, Cinza Muted #666666.', file: '01_novos_conceitos/serie_5_high_ticket_executive/27_factory_records_pulsar.png' },
      { num: '28', title: '28. Swiss Haute Horlogerie', sub: 'Relojoaria de Genebra / Calibre', params: 'Guilloché concêntrico fino em CSS, linhas de precisão em ouro rosa, escala de frequência de balanço (28,800 VPH).', palette: 'Azul Meia-Noite #0A0F1A, Ouro Rosa Suíço #E0A96D, Aço Platina #CBD5E1.', file: '01_novos_conceitos/serie_5_high_ticket_executive/28_swiss_haute_horlogerie.png' },
      { num: '29', title: '29. Neo-Seoul Cyberpunk 2099', sub: 'Distopia Noturna & Neon Chuvoso', params: 'Efeito de scanlines de chuva com reflexo de neon, letreiros orientais de neon e contorno ciano fluorescente.', palette: 'Asfalto Molhado #080511, Ciano Laser #00F0FF, Magenta Neon #FF007F.', file: '01_novos_conceitos/serie_5_high_ticket_executive/29_neo_seoul_cyberpunk_2099.png' }
    ]
  }
];

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acervo Visual Consolidado PostSpark (82 Obras em Alta Fidelidade)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .ratio-4-5 { aspect-ratio: 4 / 5; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-4 md:p-8 font-sans selection:bg-indigo-500 selection:text-white">

  <!-- Header -->
  <header class="max-w-7xl mx-auto mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-800 pb-6">
    <div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        Acervo Consolidado do PostSpark • 82 Obras em Altíssima Definição (Qualidade Máxima Restaurada)
      </div>
      <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
        Galeria de Designs PostSpark
      </h1>
      <p class="text-slate-400 text-sm mt-1 max-w-3xl">
        Todos os 82 designs com sua integridade estética original, tipografia precisa, elementos gráficos vetoriais e paletas de cores restauradas.
      </p>
    </div>

    <!-- View Switcher -->
    <div class="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl text-xs">
      <button onclick="switchView('future')" id="btn-fut" class="px-3.5 py-2 rounded-lg bg-cyan-500 text-black font-extrabold transition">
        🚀 29 Novos Conceitos (Séries 1 a 5)
      </button>
      <button onclick="switchView('references')" id="btn-ref" class="px-3.5 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition">
        🌟 24 Referências Icônicas (R4)
      </button>
      <button onclick="switchView('original')" id="btn-orig" class="px-3.5 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition">
        📦 29 Complete Designs (R9)
      </button>
      <button onclick="switchView('all')" id="btn-all" class="px-3.5 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition">
        Ver Todos (82)
      </button>
    </div>
  </header>

  <!-- SEÇÃO 3: 29 NOVOS CONCEITOS RESTAURADOS EM ALTA FIDELIDADE (DEFAULT) -->
  <section id="sec-future" class="max-w-7xl mx-auto mb-16">
    <div class="mb-8 p-6 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2.5 py-0.5 rounded-full bg-cyan-400 text-black text-xs font-black uppercase font-mono tracking-wider">✨ QUALIDADE MÁXIMA RESTAURADA</span>
          <span class="text-xs font-mono text-cyan-300">Séries 1 a 5 • 29 Arquétipos Originais</span>
        </div>
        <h2 class="text-2xl font-extrabold text-white">Os 29 Novos Arquétipos de Vanguarda</h2>
        <p class="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
          Cada design foi re-renderizado com seus vetores SVG originais, códigos de barra, carimbos, estrelas acid, fitas industriais, retículas Ben-Day e tipografias históricas em alta resolução 2x Retina.
        </p>
      </div>
      <span class="text-xs font-mono text-cyan-400 font-bold shrink-0">29 ARQUÉTIPOS</span>
    </div>

    ${seriesMeta.map(series => `
      <div class="mb-14">
        <div class="flex items-center justify-between mb-6 pb-2 border-b border-slate-800">
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-${series.color}-400"></span>
            ${series.name}
          </h3>
          <span class="text-xs font-mono text-slate-400">${series.items.length} obras</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          ${series.items.map(item => `
            <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col justify-between hover:border-${series.color}-400/50 transition-all group">
              <div class="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                <div>
                  <span class="text-[10px] font-mono text-${series.color}-400 font-bold uppercase tracking-wider">${item.sub}</span>
                  <h4 class="text-sm font-bold text-white truncate max-w-[220px]" title="${item.title}">${item.title}</h4>
                </div>
                <span class="text-xs font-mono text-slate-500 font-bold">#${item.num}</span>
              </div>

              <div class="ratio-4-5 bg-black/60 relative overflow-hidden flex items-center justify-center p-2">
                <img src="03_novos_conceitos/${series.id}/${item.file.split('/').pop()}" class="w-full h-full object-cover rounded-xl shadow-inner transition-transform duration-300 group-hover:scale-[1.02]" alt="${item.title}">
              </div>

              <div class="p-3.5 space-y-2 text-xs bg-slate-950/60 border-t border-slate-800 flex-1 flex flex-col justify-between">
                <div>
                  <span class="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">DETALHES TÉCNICOS:</span>
                  <p class="text-slate-300 text-[11px] leading-relaxed">${item.params}</p>
                </div>
                <div class="pt-2 border-t border-slate-800/80">
                  <span class="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">PALETA AUTORAL:</span>
                  <span class="text-[11px] text-slate-300 font-mono">${item.palette}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </section>

  <!-- SEÇÃO 1: 24 REFERÊNCIAS CURADAS R4 -->
  <section id="sec-references" class="max-w-7xl mx-auto mb-16 hidden">
    <div class="mb-6 p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-amber-300">24 Referências Icônicas da Curadoria (R4)</h2>
        <p class="text-xs text-slate-400">Inclui o computador retrô, papéis empilhados, janelas vintage, tipografia 3D e papel rasgado.</p>
      </div>
      <span class="text-xs font-mono text-amber-400 font-bold">24 OBRAS</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      ${Object.values(refGroups).map(item => `
        <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col justify-between">
          <div class="p-3 border-b border-slate-800 flex items-center justify-between">
            <span class="text-xs font-bold text-amber-400 uppercase truncate">#${item.num} ${item.name}</span>
            <div class="flex gap-1 text-[10px]">
              ${item.foto ? `<button onclick="toggleRefImg('ref-${item.num}', 'foto')" id="btn-ref-${item.num}-foto" class="px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold">Foto</button>` : ''}
              ${item.render ? `<button onclick="toggleRefImg('ref-${item.num}', 'render')" id="btn-ref-${item.num}-render" class="px-1.5 py-0.5 rounded text-slate-400 hover:text-white">Render</button>` : ''}
              ${item.card ? `<button onclick="toggleRefImg('ref-${item.num}', 'card')" id="btn-ref-${item.num}-card" class="px-1.5 py-0.5 rounded text-slate-400 hover:text-white">Card</button>` : ''}
            </div>
          </div>
          <div class="ratio-4-5 bg-black/60 relative overflow-hidden flex items-center justify-center p-2">
            ${item.foto ? `<img id="img-ref-${item.num}-foto" src="01_referencias_curadas_r4/${item.foto}" class="w-full h-full object-cover rounded-xl" alt="Foto">` : ''}
            ${item.render ? `<img id="img-ref-${item.num}-render" src="01_referencias_curadas_r4/${item.render}" class="w-full h-full object-cover rounded-xl ${item.foto ? 'hidden' : ''}" alt="Render">` : ''}
            ${item.card ? `<img id="img-ref-${item.num}-card" src="01_referencias_curadas_r4/${item.card}" class="w-full h-full object-cover rounded-xl hidden" alt="Card">` : ''}
          </div>
          <div class="p-3 bg-slate-950/60 text-[11px] text-slate-400 border-t border-slate-800">
            Arquivos salvos em <code>01_referencias_curadas_r4/</code>
          </div>
        </div>
      `).join('')}
    </div>
  </section>

  <!-- SEÇÃO 2: 29 COMPLETE DESIGNS R9 -->
  <section id="sec-original" class="max-w-7xl mx-auto mb-16 hidden">
    <div class="mb-6 p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-emerald-300">29 Complete Designs do Catálogo R9</h2>
        <p class="text-xs text-slate-400">As composições completas oficiais do repositório em proporção 4:5 nativa.</p>
      </div>
      <span class="text-xs font-mono text-emerald-400 font-bold">29 DESIGNS</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      ${r9Files.map((item, i) => `
        <div class="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl flex flex-col justify-between">
          <div class="p-3 border-b border-slate-800 flex items-center justify-between">
            <span class="text-xs font-bold text-emerald-400 uppercase truncate">${item.title}</span>
            <span class="text-[10px] text-slate-500 font-mono">R9 #${String(i + 1).padStart(2, '0')}</span>
          </div>
          <div class="ratio-4-5 bg-black/60 relative overflow-hidden flex items-center justify-center p-2">
            <img src="02_catalogo_oficial_r9/${item.file}" class="w-full h-full object-cover rounded-xl" alt="${item.title}">
          </div>
          <div class="p-3 bg-slate-950/60 text-[11px] text-slate-400 border-t border-slate-800 truncate">
            <code>02_catalogo_oficial_r9/${item.file}</code>
          </div>
        </div>
      `).join('')}
    </div>
  </section>

  <script>
    function toggleRefImg(prefix, kind) {
      ['foto', 'render', 'card'].forEach(k => {
        const img = document.getElementById('img-' + prefix + '-' + k);
        const btn = document.getElementById('btn-' + prefix + '-' + k);
        if (img) {
          if (k === kind) img.classList.remove('hidden');
          else img.classList.add('hidden');
        }
        if (btn) {
          if (k === kind) {
            btn.className = 'px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold';
          } else {
            btn.className = 'px-1.5 py-0.5 rounded text-slate-400 hover:text-white';
          }
        }
      });
    }

    function switchView(view) {
      const sRef = document.getElementById('sec-references');
      const sOrig = document.getElementById('sec-original');
      const sFut = document.getElementById('sec-future');

      const bRef = document.getElementById('btn-ref');
      const bOrig = document.getElementById('btn-orig');
      const bFut = document.getElementById('btn-fut');
      const bAll = document.getElementById('btn-all');

      const activeFutClass = 'px-3.5 py-2 rounded-lg bg-cyan-500 text-black font-extrabold transition';
      const activeRefClass = 'px-3.5 py-2 rounded-lg bg-amber-500 text-black font-extrabold transition';
      const activeOrigClass = 'px-3.5 py-2 rounded-lg bg-emerald-500 text-black font-extrabold transition';
      const activeAllClass = 'px-3.5 py-2 rounded-lg bg-indigo-500 text-white font-extrabold transition';
      const inactive = 'px-3.5 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 font-medium transition';

      bFut.className = (view === 'future') ? activeFutClass : inactive;
      bRef.className = (view === 'references') ? activeRefClass : inactive;
      bOrig.className = (view === 'original') ? activeOrigClass : inactive;
      bAll.className = (view === 'all') ? activeAllClass : inactive;

      sFut.classList.toggle('hidden', view !== 'future' && view !== 'all');
      sRef.classList.toggle('hidden', view !== 'references' && view !== 'all');
      sOrig.classList.toggle('hidden', view !== 'original' && view !== 'all');
    }
  </script>
</body>
</html>`;

await fs.writeFile(path.join(baseDir, 'index.html'), html, 'utf8');
console.log('✓ designs/showcase_consolidado/index.html gerado com riqueza total!');
