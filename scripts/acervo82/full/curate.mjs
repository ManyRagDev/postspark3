import {readFile,writeFile} from 'node:fs/promises';
const registryPath='designs/acervo82/authored/registry.json';
const registry=JSON.parse(await readFile(registryPath,'utf8'));
const descriptions={
 REF:[
  'Cartaz de anúncio laranja com letras escuras sangradas, tarja preta inclinada e retrato na base.',
  'Ensaio em folhas de papel sobrepostas, com uma pergunta tipográfica e bloco contínuo de leitura.',
  'Cartaz de retrato em dois níveis: lettering azul de peso alto, selo amarelo inclinado e foto ampla abaixo.',
  'Pôster editorial cinza, tipografia vermelha condensada e recortes fotográficos oblíquos.',
  'Retrato editorial dominante acompanhado por uma legenda curta, como uma página de revista.',
  'Interface de desktop retrô com múltiplas janelas deslocadas, grade amarela e retrato recortado.',
  'Computador de tubo sobre papel texturizado, tela antiga e hierarquia de letras em pixel.',
  'Pergunta em tipografia condensada sobre página clara, palavra sublinhada por uma marca laranja e notas em lista.',
  'Anúncio brutalista amarelo: título condensado, cartão de produto ilustrado e selos em cores primárias.',
  'Retrato de recorte gráfico junto a grade de retalhos em verde cítrico e preto.',
  'Mensagem em poucos trechos, com faixas azuis inclinadas sobre superfície cinza e lettering central.',
  'Manchete sobre conversa direta, linguagem de promoção editorial e palavras destacadas em camadas.',
  'Três linhas pretas e condensadas no centro; a última recebe uma faixa verde de ênfase.',
  'Estudo de grade modular azul com elementos geométricos e texto organizado por blocos de cartaz.',
  'Página editorial de diagnóstico, com tensão entre a frase de abertura e uma explicação em papel.',
  'Título em letras extrudadas creme e amarelo, sombra preta diagonal e lema em volta do cartaz.',
  'Imagem fotográfica integral com tratamento de pôster editorial e interferência tipográfica mínima.',
  'Página de imprensa com manchetes em pesos diferentes, fundo de jornal e acento verde ácido.',
  'Janela fotográfica por trás de bordas irregulares de papel rasgado, com frase de revelação.',
  'Capa de revista de design gráfico, fotografia tratada e manchete editorial.',
  'Letra amarela muito espaçada na horizontal, frases brancas laterais e imagem de fundo escurecida.',
  'Manchete editorial em três linhas sobre faixa clara; fotografia ocupa a área inferior.',
  'Contraste entre duas ideias numa página editorial, com mudanças de peso e escala tipográfica.',
  'Amostras de texto em duas colunas regulares, com título de catálogo e muitas entradas independentes.',
 ],
 R9:[
  'Manchete alinhada em papel creme com fotografia em moldura inferior e pequena etiqueta amarela.',
  'Divisão horizontal entre carvão e verde luminoso; título de cartaz acima e explicação abaixo.',
  'Comparação com colunas opostas e rótulos distintos, duas ideias independentes em alto contraste.',
  'Fotografia enquadrada e recado curto em cartão de papel, com áreas distintas de mídia e texto.',
  'Janela levemente deslocada sobre folhas de papel, com impressão de movimento no enquadramento.',
  'Interface clara em uma janela com barra de título e texto centralizado na área útil.',
  'Interface de janela escura com uma mensagem curta em alto contraste e espaço interno generoso.',
  'Conjunto de janelas com barras azuis e indicadores de navegação, texto em áreas separadas.',
  'Pergunta editorial em preto sobre branco com trecho em cor de marcação e leitura vertical.',
  'Folhas claras em camadas para uma frase principal e comentário curto de ensaio.',
  'Página quase vazia e clara, frase em sans serif com nota de rodapé discreta.',
  'Composição modular guiada por grade suíça, blocos coloridos e alinhamento geométrico.',
  'Cartão de interface com barra de janela e chamada de ação destacada na área inferior.',
  'Imagem atrás da composição toda, com cartão de papel sobreposto para manter a leitura.',
  'Cartaz de blocos cromáticos vermelhos e faixa de destaque, com tipografia pesada.',
  'Letras monumentais com contorno contrastante; a textura é produzida pelo vazio dentro do título.',
  'Painel digital com falha cromática, sinal de interface e microtipografia técnica.',
  'Molduras de interface empilhadas e deslocadas para formar janelas de fundo e de conteúdo.',
  'Janela em movimento com botão e área de ação; sensação de recorte e deslocamento.',
  'Número em grande escala, pequena identificação do dado e área de explicação ao redor.',
  'Três cartões horizontais independentes, escuros, com pequenos marcadores numerados.',
  'Palavras grandes deslocadas em diferentes direções, cartaz de tipografia em movimento.',
  'Cartela cinematográfica escura, título monumental, moldura fina e leitura dramática.',
  'Página para leitura contínua com título e áreas sucessivas de texto breve.',
  'Síntese em cartão de interface sobre fundo contrastante, com mensagem em área compacta.',
  'Sobreposição de folhas claras com sombras de papel e hierarquia editorial de baixo ruído.',
  'Composição híbrida de papel e interface, usando moldura de janela para a mensagem.',
  'Caixas de janela sobre uma base de papel claro; cada superfície tem uma função visual distinta.',
  'Tarjas e avisos de tom gráfico sobre uma base de papel; palavras em faixas de contraste.',
 ],
 CON:[
  'Grade bento escura e assimétrica, com métrica central e cartões menores para fatos independentes.',
  'Página de revista em papel quente, com título serifado, respiro e composição de leitura.',
  'Cartaz suíço assimétrico, linhas de grade, tipografia precisa e áreas de cor controladas.',
  'Cartão de postagem curto sobre fundo noturno, com identidade de microblog e pequenos indicadores.',
  'Metades de cores opostas para dois argumentos, divididas por um selo central de contraste.',
  'Ficha técnica industrial com placas de advertência, linhas de especificação e título de manifesto.',
  'Cartaz de energia neon e prata, com formas cromadas e hierarquia tipográfica de pista.',
  'Impressão risográfica, pontos de retícula e duplicação rosa deslocada por trás da letra azul.',
  'Ficha arquivística em papel bege, selo, emblema geométrico e legenda de coleção.',
  'Cartaz geométrico de cores primárias e planos diagonais, com título pesado e descrição abaixo.',
  'Cupom de papel em preto e branco, linhas separadoras, colunas monoespaçadas e marcas de impressão.',
  'Editorial creme e vermelho com faixa Obi vertical escura e título serifado.',
  'Colagem dadaísta com recortes tipográficos, arco colorido, olho ilustrado e piso quadriculado.',
  'Moldura de art déco dourada e simétrica, serifas de alto contraste sobre preto.',
  'Painel de aparelho analógico em papel creme, barras cromáticas e uma pequena onda de áudio.',
  'Planta em azul profundo, grade arquitetônica e curvas brancas para explicação técnica.',
  'Portal cromático em arco com gradiente luminoso, estrela e título serifado central.',
  'Balão branco de quadrinhos sobre retícula azul, tarja de impacto e contorno preto espesso.',
  'Cartaz construtivista com cunha vermelha, diagonais pretas e cartela inclinada em primeiro plano.',
  'Moldura botânica fina e dourada sobre verde profundo, com painel claro e título de serifa.',
  'Ondas cromáticas na base de cartaz roxo; título deslocado em camadas de cor.',
  'Recortes xerográficos pretos, cartaz fluorescente e palavras de manifesto em tiras de papel.',
  'Formas Memphis, pontilhado regular e título numa caixa amarela de borda preta.',
  'Cartela de cinema simétrica, tons pastel, serifas e emblema circular central.',
  'Cartaz de jazz bicolor laranja e preto, com blocos de catálogo e título de entrelinha curta.',
  'Cartela escura e minimalista de cinema, com borda discreta e título contido.',
  'Cartaz monocromático com linhas de pulsar e hierarquia discreta de ficha musical.',
  'Mostrador circular de relojoaria, marcações finas, paleta sóbria e título serifado.',
  'Telemetria em fundo noturno, brilho neon em ciano e rosa, texto em painel retangular.',
 ],
};
const sets = groups=>new Set(groups.split(' '));
const quiet=sets('REF-05 REF-08 REF-13 REF-17 REF-20 REF-21 REF-22 R9-06 R9-09 R9-10 R9-11 R9-23 R9-24 R9-26 CON-02 CON-14 CON-20 CON-24 CON-26 CON-28');
const expressive=sets('REF-01 REF-03 REF-04 REF-06 REF-07 REF-09 REF-10 REF-11 REF-14 REF-16 REF-18 REF-19 R9-02 R9-08 R9-15 R9-16 R9-17 R9-18 R9-19 R9-22 R9-29 CON-03 CON-06 CON-07 CON-08 CON-10 CON-13 CON-17 CON-18 CON-19 CON-21 CON-22 CON-23 CON-25 CON-29');
const serif=sets('REF-15 REF-18 REF-20 CON-02 CON-09 CON-12 CON-14 CON-16 CON-17 CON-20 CON-24 CON-26 CON-28');
const mono=sets('REF-07 R9-17 CON-06 CON-11 CON-15 CON-27 CON-29');
const modular=sets('REF-06 REF-09 REF-10 REF-14 R9-08 R9-12 R9-18 CON-01 CON-03 CON-09 CON-15 CON-23');
const windows=sets('R9-05 R9-06 R9-07 R9-13 R9-19 R9-25 R9-27 R9-28 CON-04');
const carousel=sets('REF-02 REF-03 REF-07 REF-08 REF-14 REF-15 REF-18 R9-03 R9-08 R9-09 R9-10 R9-11 R9-12 R9-20 R9-21 R9-24 R9-25 CON-01 CON-02 CON-05 CON-06 CON-10 CON-14 CON-16 CON-20 CON-23');
const reflective=sets('REF-02 REF-08 REF-13 REF-15 REF-18 REF-20 REF-21 REF-22 R9-09 R9-10 R9-11 R9-24 CON-02 CON-09 CON-12 CON-14 CON-17 CON-20 CON-24 CON-26');
const action=sets('REF-01 REF-09 REF-11 REF-12 REF-19 R9-04 R9-13 R9-19 R9-25 CON-13 CON-18 CON-22 CON-29');
const explanation=sets('REF-02 REF-07 REF-08 REF-14 REF-15 REF-18 R9-09 R9-10 R9-11 R9-12 R9-24 R9-25 R9-26 CON-01 CON-02 CON-03 CON-04 CON-06 CON-09 CON-10 CON-11 CON-15 CON-16 CON-20 CON-23 CON-25 CON-27 CON-28');
const data=sets('R9-20 CON-01');
const comparison=sets('R9-03 CON-05');
const list=sets('REF-08 REF-24 R9-21');
const images=sets('REF-01 REF-03 REF-04 REF-05 REF-06 REF-09 REF-10 REF-17 REF-19 REF-20 REF-21 REF-22 R9-01 R9-04 R9-14');
for (const e of registry.entries){const [kind,order]=e.code.split('-');e.descriptor=descriptions[kind][Number(order)-1];if(!e.descriptor)throw Error('missing_descriptor:'+e.code);
 e.axes={organization:comparison.has(e.code)?'oposição':list.has(e.code)?'lista':windows.has(e.code)?'janela':modular.has(e.code)?'modular':'cartaz',density:quiet.has(e.code)?'contida':expressive.has(e.code)?'intensa':'equilibrada',typography:serif.has(e.code)?'serifada':mono.has(e.code)?'monoespaçada':'sem serifa',imageRole:images.has(e.code)?'fotografia':'grafismo'};
 e.carouselIntent=carousel.has(e.code)?comparison.has(e.code)?'comparison':list.has(e.code)?'list':images.has(e.code)?'image_commentary':data.has(e.code)?'highlight':explanation.has(e.code)?'reading':'highlight':null;
 e.editorialIntents=[...new Set([
  'afirmar_mensagem',...(reflective.has(e.code)?['estimular_reflexao']:[]),...(action.has(e.code)?['orientar_acao']:[]),...(explanation.has(e.code)?['explicar_raciocinio']:[]),...(data.has(e.code)?['destacar_dado']:[]),...(comparison.has(e.code)?['comparar_alternativas','esclarecer_equivoco']:[]),...(list.has(e.code)?['organizar_pontos']:[]),...(images.has(e.code)?['apresentar_com_imagem','comentar_imagem']:[]),
 ])];
}
await writeFile(registryPath,JSON.stringify(registry,null,2)+'\n');
