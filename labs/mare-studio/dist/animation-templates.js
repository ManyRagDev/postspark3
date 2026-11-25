import { composition, shot, fade, pulse, field, text, color, image, number, select,
  lastTime, changeTiming, timing, initialX, changeX } from "./animation-template-helpers.js";
import { newAnimationTemplates } from "./animation-templates-collection-two.js";

const ivory = "#fff4df";
const mint = "#c9f47d";
const ink = "#152625";
export const animationTemplates = [
  {
    id: "dialogue", name: "Caixa de diálogo", category: "Cena", duration: 4, focus: "box",
    fields: [
      text("Fala", "speech"), text("Personagem", "speaker"),
      color("Cor da caixa", "box"), color("Cor da fala", "speech"),
      number("Largura da caixa", ["box", "speech", "speaker"], ([box]) => box.width,
        ([box, speech, speaker], width) => {
          box.width = width;
          speech.width = width - 58;
          speaker.width = width - 58;
        }, 250, 496, 2),
      number("Abertura (s)", ["box", "speech", "speaker", "marker"],
        ([box]) => lastTime(box, "scaleY"),
        ([box, ...labels], value) => {
          const previous = lastTime(box, "scaleY");
          changeTiming(box, ["scaleX", "scaleY"], value / previous);
          for (const label of labels)
            label.start = Math.max(0, Math.min(label.end - .1, label.start + value - previous));
        }, .25, 2, .05),
    ],
    build({box, shape, text}) {
      shape("star", "sky-star", "Estrela", 392, 227, 104, 104, "#d8a8ff",
        {keys: {rotation: shot(-12, 40, 4)}});
      shape("sparkle", "small-star", "Centelha", 127, 310, 50, 50, "#fcbcdd");
      box("box", "Caixa que se abre", 270, 580, 444, 250, "#432e68", {
        keys: {
          scaleX: shot(.015, 1, .34),
          scaleY: [{t: 0, value: .012, ease: "linear"}, ...shot(.012, 1, .8, .34)],
        },
      });
      text("speaker", "Nome do personagem", "·  VIAJANTE  ·", 270, 503, 386, 36, 23, "#efb1ff",
        {start: .82, keys: fade(.25)});
      text("speech", "Fala", "Você ouviu isso? O céu está chamando.", 270, 589, 386, 106, 42, ivory,
        {start: .9, keys: {reveal: shot(0, 1, .55)}});
      shape("arrow", "marker", "Indicador", 270, 677, 26, 26, "#efb1ff",
        {start: 1.55, props: {rotation: 90}, keys: {scaleX: pulse(), scaleY: pulse()}});
    },
    background: "#21152f",
  },
  {
    id: "sunrise", name: "Nascer do sol", category: "Cena", duration: 4.5,
    fields: [
      color("Cor do céu", "sky"), color("Cor do sol", "sun"),
      field("Cor da montanha da frente", ["front", "ground"], "color",
        ([front]) => front.color, (layers, value) => { for (const layer of layers) layer.color = value; }),
      number("Posição horizontal do sol", "sun", ([layer]) => initialX(layer),
        ([layer], value) => changeX(layer, value), 90, 450, 1),
      timing("Subida (s)", ["sun", "sky"], "y", ["y", "opacity"], .5, 4),
    ],
    build({box, circle, shape}) {
      box("sky", "Céu clareando", 270, 480, 540, 960, "#f4a894", {keys: fade(2.8)});
      circle("sun", "Sol", 293, 516, 178, 178, "#ffd584", {keys: {y: shot(785, 413, 2.8)}});
      shape("triangle", "far", "Montanha ao fundo", 350, 744, 590, 520, "#80658b");
      shape("triangle", "front", "Montanha da frente", 132, 760, 640, 540, "#342c57");
      box("ground", "Chão", 270, 855, 540, 212, "#342c57");
      shape("sparkle", "star", "Estrela que some", 131, 235, 36, 36, "#fff3e4",
        {keys: {opacity: shot(1, 0, 2.1)}});
    },
    background: "#2d2548",
  },
  {
    id: "offer", name: "Oferta com preço", category: "Divulgação", duration: 4,
    fields: [
      text("Produto", "product"), text("Preço anterior", "old"), text("Preço da oferta", "price"),
      text("Texto do selo", "tag"), color("Cor do destaque", "panel"), color("Cor do preço", "price"),
    ],
    build({box, shape, text}) {
      box("panel", "Fundo da oferta", 270, 512, 446, 568, "#ffcf73", {
        keys: {y: shot(1000, 512, .65), scaleX: shot(.84, 1, .65), scaleY: shot(.84, 1, .65)},
      });
      text("product", "Nome do produto", "Café da casa", 270, 382, 365, 142, 61, "#2f211c",
        {start: .43, keys: fade()});
      text("old", "Preço anterior", "R$ 49,90", 270, 504, 340, 62, 42, "#77623f", {start: .63, keys: fade()});
      box("strike", "Risco sobre o preço", 270, 504, 196, 5, "#b34335", {
        start: 1.07, props: {rotation: -7}, keys: {reveal: shot(0, 1, .28)},
      });
      text("price", "Preço novo", "R$ 34,90", 270, 634, 386, 120, 83, "#2f211c",
        {start: 1.22, keys: { ...fade(.28), scaleX: shot(.78, 1, .52), scaleY: shot(.78, 1, .52)}});
      shape("badge", "badge", "Selo", 398, 238, 153, 153, "#ff7b65", {
        start: .72, keys: {rotation: shot(-65, 11, .56), ...fade(.22)},
      });
      text("tag", "Mensagem do selo", "OFERTA", 398, 238, 113, 48, 25, "#2f211c",
        {start: 1.03, props: {rotation: 11}, keys: fade(.28)});
    },
    background: "#392921",
  },
  {
    id: "high-tide", name: "Maré alta", category: "Cena", duration: 4.5,
    fields: [
      text("Título", "headline"), color("Cor da malha", "mesh"),
      number("Amplitude", "mesh", ([layer]) => layer.wave.amplitude,
        ([layer], value) => { layer.wave.amplitude = value; }, 0, 2, .05),
      number("Velocidade", "mesh", ([layer]) => layer.wave.speed,
        ([layer], value) => { layer.wave.speed = value; }, .25, 2.5, .05),
    ],
    build({shape, text}) {
      shape("wave", "mesh", "Malha da onda", 270, 480, 540, 960, "#ff693e",
        {wave: {amplitude: 1, speed: 1}});
      text("eyebrow", "Linha superior", "ESTÚDIO DE MOVIMENTO", 270, 142, 420, 46, 24, "#f6b8a1");
      text("headline", "Título", "Maré alta", 270, 293, 458, 171, 109, ivory,
        {start: .35, keys: {y: shot(323, 293, .75), ...fade(.7)}});
    },
    background: "#100f14",
  },
  {
    id: "road", name: "Rodovia", category: "Cena", duration: 4.5,
    fields: [
      text("Destino", "destination"), text("Linha da placa", "route"), color("Cor da placa", "sign"),
      timing("Passagem das faixas (s)", ["lane-0", "lane-1", "lane-2", "lane-3", "lane-4", "lane-5"],
        "y", ["y", "scaleX", "scaleY", "opacity"], .7, 2.4),
    ],
    build({box, shape, circle, text}) {
      circle("sun", "Sol no horizonte", 372, 323, 164, 164, "#ffd28f");
      shape("triangle", "ridge", "Montanhas", 152, 605, 675, 480, "#8d637c");
      box("land", "Terreno", 270, 770, 540, 440, "#372c49");
      shape("trapezoid", "road-edge", "Acostamento", 270, 736, 750, 448, "#be8f99");
      shape("trapezoid", "road", "Asfalto", 270, 738, 683, 444, "#29293c");
      for (let index = 0; index < 6; index++) {
        const start = index * .72;
        box("lane-" + index, "Faixa " + (index + 1), 270, 539, 12, 78, "#fff0c9", {
          start, keys: {
            y: shot(535, 1020, 1.4), scaleX: shot(.22, 2.2, 1.4),
            scaleY: shot(.12, 2.3, 1.4), opacity: fade(.1).opacity,
          },
        });
      }
      const signMotion = (x, y) => ({
        x: shot(274 + (x - 355) * .54, x, 1.05),
        y: shot(490 + (y - 401) * .54, y, 1.05),
        scaleX: shot(.54, 1, 1.05), scaleY: shot(.54, 1, 1.05), ...fade(.7),
      });
      box("post", "Poste", 403, 478, 11, 173, "#c4aca8", {keys: signMotion(403, 478)});
      box("sign", "Placa", 355, 401, 289, 112, "#347069", {keys: signMotion(355, 401)});
      text("route", "Trajeto", "ROTA 07  /  SAÍDA 12", 355, 375, 250, 28, 19, "#dcf2da",
        {keys: signMotion(355, 375)});
      text("destination", "Destino", "Costa Norte", 355, 421, 257, 58, 37, "#ffffff",
        {keys: signMotion(355, 421)});
    },
    background: "#eeb49b",
  },
  {
    id: "spotlight", name: "Produto em destaque", category: "Divulgação", duration: 4.5,
    sources: ["catalog-product.png"],
    fields: [
      image("Foto do produto", "photo"), text("Nome", "product"), text("Benefício", "benefit"),
      color("Cor da faixa", "banner"),
      select("Enquadramento", "photo", ([layer]) => layer.fit,
        ([layer], value) => { layer.fit = value; }, {contain: "Mostrar imagem inteira", cover: "Preencher a área"}),
    ],
    build({box, circle, image, text}) {
      circle("halo", "Disco de fundo", 270, 365, 382, 382, "#57716b",
        {keys: {scaleX: shot(.8, 1, .9), scaleY: shot(.8, 1, .9)}});
      image("photo", "Foto do produto", "catalog-product.png", 270, 373, 363, 442,
        {fit: "contain", keys: {y: shot(780, 373, .95)}});
      box("banner", "Faixa do produto", 270, 664, 482, 158, mint, {keys: {y: shot(870, 664, .76)}});
      text("product", "Nome do produto", "Café Horizonte", 270, 646, 433, 89, 56, ink,
        {start: .55, keys: fade()});
      text("benefit", "Benefício do produto", "Torra média · Notas de cacau", 270, 707, 425, 56, 28, ink,
        {start: .85, keys: fade()});
    },
    background: "#243c37",
  },
  {
    id: "comparison", name: "Antes e depois", category: "Divulgação", duration: 4,
    sources: ["catalog-before.png", "coast.jpg"],
    fields: [
      image("Imagem do antes", "before"), image("Imagem do depois", "after"),
      text("Rótulo do antes", "label-before"), text("Rótulo do depois", "label-after"),
      select("Direção da revelação", ["after", "divider", "label-before", "label-after"], ([after]) => after.revealFrom,
        ([after, ...parts], value) => {
          if (value === after.revealFrom) return;
          after.revealFrom = value;
          for (const layer of parts) {
            layer.props.x = 540 - layer.props.x;
            for (const key of layer.keys.x) key.value = 540 - key.value;
          }
        }, {left: "Da esquerda", right: "Da direita"}),
      timing("Duração da revelação (s)", ["after", "divider"], "reveal", ["reveal", "x"], .55, 2.8),
    ],
    build({box, image, text}) {
      image("before", "Foto antes", "catalog-before.png", 270, 479, 540, 642);
      image("after", "Foto depois", "coast.jpg", 270, 479, 540, 642, {
        revealFrom: "left", start: .53, keys: {reveal: shot(0, 1, 1.7)},
      });
      box("divider", "Divisória", 0, 479, 4, 642, ivory, {start: .53, keys: {x: shot(0, 540, 1.7)}});
      text("label-before", "Rótulo antes", "ANTES", 402, 112, 240, 44, 30, "#ece8fb");
      text("label-after", "Rótulo depois", "DEPOIS", 138, 112, 240, 44, 30, "#c9f47d",
        {start: .66, keys: fade(.4)});
      text("caption", "Legenda", "O mesmo lugar. Outra luz.", 270, 865, 443, 79, 35, "#ece8fb");
    },
    background: "#1d1d34",
  },
  {
    id: "testimonial", name: "Depoimento", category: "Divulgação", duration: 5,
    sources: ["catalog-avatar.png"],
    fields: [
      text("Primeira parte da frase", "quote-first"), text("Segunda parte da frase", "quote-second"),
      text("Nome", "person"), image("Avatar", "avatar"), color("Cor do cartão", "card"),
      number("Tempo até mostrar o nome (s)", ["person", "avatar"], ([person]) => person.start,
        (layers, value) => { for (const layer of layers) layer.start = value; }, 1.2, 3.6, .05),
    ],
    build({box, image, text}) {
      box("card", "Cartão", 270, 502, 440, 560, "#fff1dc", {
        keys: {y: shot(555, 502, .48), ...fade(.3)},
      });
      text("quote", "Aspas", "“", 270, 331, 138, 134, 112, "#cd7156", {start: .23, keys: fade()});
      text("quote-first", "Primeira frase", "Dá para sentir o cuidado", 270, 453, 372, 106, 47, "#402e27",
        {start: .48, keys: fade()});
      text("quote-second", "Segunda frase", "desde a primeira xícara.", 270, 549, 365, 105, 40, "#674f44",
        {start: 1.07, keys: fade(.38)});
      image("avatar", "Avatar", "catalog-avatar.png", 147, 675, 65, 65, {start: 1.7, keys: fade()});
      text("person", "Nome de quem falou", "Joana Ribeiro", 293, 675, 217, 58, 33, "#402e27",
        {start: 1.7, keys: fade()});
    },
    background: "#8b4c47",
  },
  {
    id: "carousel-cover", name: "Capa de carrossel", category: "Divulgação", duration: 4,
    sources: ["tide.jpg"],
    fields: [
      text("Título", "title"), text("Linha superior", "series"), text("Chamada", "next"),
      image("Imagem", "photo"), color("Cor do bloco", "block"),
    ],
    build({box, image, text, shape}) {
      image("photo", "Imagem da capa", "tide.jpg", 270, 298, 449, 393,
        {keys: {reveal: shot(0, 1, .75), scaleX: shot(.89, 1, .8), scaleY: shot(.89, 1, .8)}});
      text("series", "Nome da série", "GUIA DE FIM DE SEMANA", 270, 64, 450, 41, 25, "#132740");
      box("block", "Bloco do título", 270, 622, 449, 255, "#292752",
        {start: .33, keys: {y: shot(930, 622, .55)}});
      text("title", "Título da capa", "Três praias para conhecer", 270, 616, 379, 174, 69, "#fff4df",
        {start: .78, keys: {y: shot(652, 616, .52), ...fade()}});
      text("next", "Chamada", "Deslize para ver o roteiro", 244, 827, 369, 65, 31, "#132740",
        {start: 1.12, keys: fade()});
      shape("arrow", "arrow", "Seta", 447, 827, 39, 32, "#132740",
        {start: 1.17, keys: {x: shot(426, 447, .43), ...fade()}});
    },
    background: "#d5e7f3",
  },
  {
    id: "call-to-action", name: "Chamada para ação", category: "Divulgação", duration: 4,
    fields: [
      text("Mensagem", "message"), text("Linha de apoio", "support"), color("Cor da faixa", "banner"),
      select("Ícone", "icon", ([layer]) => layer.type,
        ([layer], value) => { layer.type = value; }, {arrow: "Seta", heart: "Coração", sparkle: "Brilho"}),
      select("Direção de entrada", ["banner", "message", "icon"], ([banner]) => initialX(banner) < 270 ? "left" : "right",
        ([banner, ...parts], value) => {
          if ((initialX(banner) < 270) === (value === "left")) return;
          for (const layer of [banner, ...parts])
            for (const key of layer.keys.x) key.value = 2 * layer.props.x - key.value;
        }, {left: "Da esquerda", right: "Da direita"}),
      number("Intensidade do pulso", "icon", ([layer]) => layer.keys.scaleX[1]?.value,
        ([layer], value) => {
          for (const channel of ["scaleX", "scaleY"])
            for (const key of layer.keys[channel])
              if (key.value > 1 || key.t === .7 || key.t === 2.05) key.value = value;
        }, 1, 1.6, .05),
    ],
    build({box, shape, text}) {
      shape("sparkle", "spark", "Brilho", 270, 279, 144, 144, "#e4aff5",
        {keys: {rotation: shot(-18, 24, 4)}});
      box("banner", "Faixa animada", 270, 493, 448, 142, mint, {keys: {x: shot(-250, 270, .58)}});
      text("message", "Mensagem principal", "Veja a coleção", 242, 493, 320, 103, 49, ink,
        {start: .2, keys: {x: shot(-278, 242, .49), ...fade()}});
      shape("arrow", "icon", "Ícone pulsante", 444, 493, 54, 58, ink,
        {start: .33, keys: {x: shot(-76, 444, .36), scaleX: pulse(), scaleY: pulse(), ...fade()}});
      text("support", "Linha de apoio", "Novidades de quinta a domingo", 270, 630, 450, 80, 33, "#f8ddff",
        {start: .64, keys: fade()});
    },
    background: "#332045",
  },
  ...newAnimationTemplates,
];

export function buildAnimationTemplate(template, images = new Map()) {
  return composition(template.id, template.duration, template.background, images, template.build);
}

export function animationTemplateFor(doc) {
  return animationTemplates.find(template => template.id === doc.template);
}

export function templateControls(doc) {
  return (animationTemplateFor(doc)?.fields ?? []).flatMap((field, index) => {
    const ids = Array.isArray(field.id) ? field.id : [field.id];
    const layers = ids.map(id => doc.layers.find(layer => layer.id === id));
    if (layers.some(layer => !layer)) return [];
    const value = field.get(layers);
    return value == null ? [] : [{...field, index, value, layers}];
  });
}

export function setTemplateControl(doc, index, value) {
  const field = templateControls(doc).find(control => control.index === index);
  if (!field) return;
  if (field.type === "number" && (!Number.isFinite(value) || value < field.min || value > field.max))
    throw new Error("Digite um valor dentro do intervalo indicado.");
  if (field.type === "select" && !Object.hasOwn(field.choices, value))
    throw new Error("Escolha uma opção disponível.");
  field.set(field.layers, value);
}

