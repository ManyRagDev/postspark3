import { shot, fade, field, text, color, image, number, timing, lastTime, changeTiming } from "./animation-template-helpers.js";

const cream = "#fff1d7";
const dark = "#251b32";
const lavender = "#e1ceff";
const cyan = "#73eac9";
const k = (t, value, ease = "linear") => ({t, value, ease});

const route = [[117, 668], [161, 533], [303, 510], [325, 412], [419, 336]];
const routeTimes = [.32, .88, 1.44, 1.91, 2.54];
const routeSegments = route.slice(1).map((_, index) => "route-" + index);

function segment(box, id, name, from, to, thickness, fill, options = {}) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  box(id, name, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2,
    Math.hypot(dx, dy), thickness, fill, {
      ...options, props: {rotation: Math.atan2(dy, dx) * 180 / Math.PI, ...options.props},
    });
}

const repetitions = 18;
const revolution = 3.2;
function orbitKeys(radiusX, radiusY, tilt, phase) {
  const rotation = tilt * Math.PI / 180;
  const keys = {x: [], y: []};
  for (let i = 0; i <= repetitions * 4; i++) {
    const angle = i * 2 * Math.PI / repetitions + phase;
    const x = radiusX * Math.cos(angle), y = radiusY * Math.sin(angle);
    const time = i * revolution / repetitions;
    keys.x.push(k(time, 270 + x * Math.cos(rotation) - y * Math.sin(rotation)));
    keys.y.push(k(time, 436 + x * Math.sin(rotation) + y * Math.cos(rotation)));
  }
  return keys;
}

function barsValue(id, label) {
  return number(label, [id, id + "-value"],
    ([bar]) => Math.round(bar.height * 100 / 290),
    ([bar, caption], value) => {
      const height = value * 290 / 100;
      const difference = height - bar.height;
      bar.height = height;
      bar.props.y -= difference / 2;
      const initialTime = bar.keys.y[0]?.t ?? 0;
      for (const key of bar.keys.y) key.value -= difference * (key.t === initialTime ? .01 : .5);
      caption.props.y -= difference;
      for (const key of caption.keys.y) key.value -= difference;
      caption.text = value + "%";
    }, 5, 100, 1);
}

const portalFrames = Array.from({length: 8}, (_, index) => "frame-" + index);
const groupColor = (label, ids) => field(label, ids, "color", ([first]) => first.color,
  (layers, value) => { for (const layer of layers) layer.color = value; });

export const newAnimationTemplates = [
  {
    id: "kinetic-title", name: "Título cinético", category: "Divulgação", duration: 3.8, focus: "line-two",
    background: "#23223f",
    fields: [
      text("Primeira linha", "line-one"), text("Segunda linha", "line-two"), text("Terceira linha", "line-three"),
      text("Linha de apoio", "sub"), color("Cor da faixa", "band"),
      color("Cor da segunda linha", "line-two"),
    ],
    build({box, shape, text}) {
      box("rule", "Linha de apoio", 270, 222, 446, 2, "#7d71a1", {keys: {reveal: shot(0, 1, .56)}});
      text("line-one", "Primeira linha", "IDEIAS", 260, 355, 470, 145, 134, cream,
        {start: .13, keys: {x: shot(-275, 260, .6), ...fade(.26)}});
      box("band", "Faixa inclinada", 270, 489, 487, 139, "#c4f173", {
        start: .47, props: {rotation: -6}, keys: {scaleX: shot(.02, 1, .48), ...fade(.24)},
      });
      text("line-two", "Segunda linha", "EM", 270, 489, 400, 131, 121, "#25273a",
        {start: .61, props: {rotation: -6}, keys: {x: shot(740, 270, .55), ...fade(.21)}});
      text("line-three", "Terceira linha", "MOVIMENTO", 270, 626, 478, 131, 83, cream,
        {start: .94, keys: {y: shot(776, 626, .55), reveal: shot(0, 1, .53), ...fade(.22)}});
      text("sub", "Linha de apoio", "PROJETO ABERTO  /  NO. 01", 270, 807, 420, 45, 25, "#d4c9f3",
        {start: 1.4, keys: fade(.3)});
      shape("sparkle", "spark", "Estrela", 431, 757, 61, 61, "#c4f173",
        {start: 1.1, keys: {rotation: shot(-75, 45, 1.8), ...fade(.3)}});
    },
  },
  {
    id: "countdown", name: "Contagem regressiva", category: "Divulgação", duration: 4.5, focus: "count-1", poster: 3.55,
    background: "#192853",
    fields: [
      text("Linha superior", "label"), text("Mensagem final", "go"), text("Linha de apoio final", "caption"),
      groupColor("Cor da contagem", ["count-1", "count-2", "count-3", "progress", "go"]),
      number("Intervalo dos números (s)", ["count-1", "count-2", "count-3", "progress", "go", "caption"],
        ([first]) => first.end,
        ([first, second, third, progress, ...endCards], value) => {
          const ratio = value / first.end;
          for (const layer of [first, second, third]) {
            layer.start *= ratio;
            layer.end *= ratio;
            changeTiming(layer, ["scaleX", "scaleY", "opacity"], ratio);
          }
          changeTiming(progress, ["reveal"], ratio);
          for (const layer of endCards) layer.start *= ratio;
        }, .45, 1.15, .05),
    ],
    build({box, circle, text}) {
      circle("outer-ring", "Aro exterior", 270, 463, 375, 375, "#4663aa", {outline: 3});
      circle("inner-ring", "Aro interior", 270, 463, 312, 312, "#6f81bd", {outline: 2});
      text("label", "Linha superior", "A GENTE COMEÇA EM", 270, 192, 460, 62, 34, "#ccd8ff",
        {keys: fade(.28)});
      box("base", "Trilho do progresso", 270, 747, 356, 7, "#4663aa");
      box("progress", "Indicador de tempo", 270, 747, 356, 7, "#ffe168",
        {keys: {reveal: [k(0, 0), k(3, 1)]}});
      for (let index = 0; index < 3; index++) {
        const scale = [k(0,.72), k(.28,1,"out"), k(.82,1), k(1,1.16,"in")];
        text("count-" + (index + 1), "Número " + (3 - index), String(3 - index),
          270, 464, 271, 260, 214, "#ffe168", {
            start: index, end: index + 1,
            keys: {scaleX: scale, scaleY: scale, opacity: [k(0,0), k(.13,1,"out"), k(.84,1), k(1,0,"in")]},
          });
      }
      text("go", "Mensagem final", "JÁ!", 270, 478, 290, 184, 144, "#ffe168",
        {start: 3, keys: {scaleX: shot(.55, 1, .34), scaleY: shot(.55, 1, .34), ...fade(.2)}});
      text("caption", "Linha de apoio", "VALENDO", 270, 823, 400, 58, 33, "#ccd8ff", {start: 3.18, keys: fade()});
    },
  },
  {
    id: "illustrated-route", name: "Rota ilustrada", category: "Cena", duration: 4.6, focus: "traveler",
    background: "#e4ead7",
    fields: [
      text("Título", "title"), text("Origem", "origin"), text("Destino", "destination"),
      groupColor("Cor da rota", ["traveler", "origin-dot", "destination-dot", ...routeSegments]),
      number("Tempo de percurso (s)", ["traveler", "destination", "destination-dot", ...routeSegments],
        ([traveler]) => lastTime(traveler, "x"),
        ([traveler, ...layers], value) => {
          const ratio = value / lastTime(traveler, "x");
          changeTiming(traveler, ["x", "y", "opacity"], ratio);
          for (const layer of layers) {
            layer.start *= ratio;
            changeTiming(layer, ["reveal", "opacity"], ratio);
          }
        }, 1, 3.8, .05),
    ],
    build({box, circle, text}) {
      box("paper", "Fundo do mapa", 270, 499, 466, 557, "#f6efdc");
      box("inset", "Contorno do mapa", 270, 499, 466, 557, "#928f75", {outline: 2});
      circle("park-north", "Parque norte", 181, 363, 185, 128, "#d8e2c1");
      circle("park-south", "Parque sul", 352, 648, 147, 159, "#d5e5c7");
      segment(box, "river", "Rio", [94,286], [381,726], 26, "#bcdccf");
      segment(box, "street-1", "Via oeste", [80,583], [468,377], 8, "#ddd3bb");
      segment(box, "street-2", "Via norte", [66,390], [448,503], 8, "#ddd3bb");
      segment(box, "street-3", "Via sul", [112,688], [464,628], 8, "#ddd3bb");
      for (let index = 0; index < routeSegments.length; index++) {
        const start = routeTimes[index];
        segment(box, routeSegments[index], "Trecho " + (index + 1), route[index], route[index + 1],
          12, "#2a6957", {start, keys: {reveal: [k(0,0), k(routeTimes[index + 1] - start,1)]}});
      }
      circle("origin-dot", "Marco de partida", ...route[0], 23, 23, "#2a6957");
      circle("destination-dot", "Marco de chegada", ...route.at(-1), 27, 27, "#2a6957",
        {start: routeTimes.at(-1), keys: fade(.25)});
      circle("traveler", "Marcador em movimento", ...route[0], 22, 22, "#2a6957", {
        keys: {
          x: route.map(([x], index) => k(routeTimes[index], x)),
          y: route.map(([, y], index) => k(routeTimes[index], y)),
        },
      });
      text("title", "Título do mapa", "UM DIA NA COSTA", 270, 131, 466, 76, 49, "#26463d",
        {keys: fade(.3)});
      text("origin", "Origem", "Vila Sul", 112, 711, 139, 42, 28, "#26463d");
      text("destination", "Destino", "Mirante", 400, 295, 118, 36, 26, "#26463d",
        {start: 2.17, keys: fade(.32)});
    },
  },
  {
    id: "bar-chart", name: "Gráfico em barras", category: "Divulgação", duration: 4.3, focus: "bar-two",
    background: "#f3e9fd",
    fields: [
      text("Título", "title"), text("Legenda", "caption"),
      text("Nome da barra 1", "bar-one-name"), barsValue("bar-one", "Valor da barra 1 (%)"),
      text("Nome da barra 2", "bar-two-name"), barsValue("bar-two", "Valor da barra 2 (%)"),
      text("Nome da barra 3", "bar-three-name"), barsValue("bar-three", "Valor da barra 3 (%)"),
      color("Cor da barra 3", "bar-three"),
    ],
    build({box, text}) {
      text("eyebrow", "Linha superior", "EVOLUÇÃO MENSAL", 270, 147, 420, 48, 29, "#63457f");
      text("title", "Título", "Meta atingida", 270, 229, 448, 110, 71, dark, {keys: fade(.4)});
      box("panel", "Cartão do gráfico", 270, 543, 456, 440, "#fff7f9");
      for (const [index, y] of [390, 463, 535, 608, 680].entries())
        box("grid-" + index, "Linha de grade " + (index + 1), 270, y, 404, 2, "#e2d2f0");
      for (const [index, [id, label, value, fill]] of [
        ["bar-one", "Mai", 32, "#b1a1e5"], ["bar-two", "Jun", 58, "#805ec5"], ["bar-three", "Jul", 87, "#5736a3"],
      ].entries()) {
        const x = 133 + index * 137;
        const start = .34 + index * .19;
        const height = 290 * value / 100;
        box(id, "Barra " + (index + 1), x, 680 - height / 2, 77, height, fill, {
          start, keys: {scaleY: shot(.02, 1, .93), y: shot(680 - height * .01, 680 - height / 2, .93)},
        });
        text(id + "-value", "Valor " + (index + 1), value + "%", x, 649 - height, 105, 42, 31, dark,
          {start: start + .7, keys: fade(.35)});
        text(id + "-name", "Rótulo " + (index + 1), label, x, 717, 105, 42, 27, "#482e6e");
      }
      text("caption", "Legenda", "Percentual da meta mensal", 270, 832, 434, 66, 30, "#482e6e",
        {start: 1.2, keys: fade(.34)});
    },
  },
  {
    id: "spring-stamp", name: "Selo elástico", category: "Divulgação", duration: 3.8, focus: "stamp",
    background: "#304cca",
    fields: [
      text("Texto do selo", "title"), text("Linha menor", "eyebrow"), text("Linha de apoio", "caption"),
      color("Cor do selo", "stamp"), color("Cor do texto do selo", "title"),
    ],
    build({shape, text}) {
      const bounce = [k(0, .18), k(.31, 1.24, "out"), k(.54,.89,"inOut"), k(.73,1.07,"out"), k(.99,1,"inOut")];
      const spring = offset => ({scaleX: bounce, scaleY: bounce, rotation: shot(-35,-10,.93),
        y: [k(0, 366 + offset * .18), k(.31, 506 + offset * 1.24,"out"),
          k(.54, 486 + offset * .89,"inOut"), k(.73, 501 + offset * 1.07, "out"), k(.99, 495 + offset, "inOut")]});
      shape("badge", "shadow", "Sombra", 279, 509, 400, 412, "#172c80", {start: .16, keys: spring(12)});
      shape("badge", "stamp", "Selo", 268, 495, 391, 406, "#d9f47b", {start: .16, keys: spring(0)});
      text("eyebrow", "Linha menor", "ACABOU DE SAIR", 268, 426, 240, 54, 25, "#263d36",
        {start: .16, keys: {...spring(-69), ...fade(.36)}});
      text("title", "Texto do selo", "NOVIDADE!", 268, 519, 332, 104, 64, "#263d36",
        {start: .16, keys: {...spring(24), ...fade(.36)}});
      shape("sparkle","spark","Faísca", 427, 279, 71, 71, "#e7c7fb",
        {start: .46, keys: {rotation: shot(45,138,1.4), ...fade(.31)}});
      text("caption", "Linha de apoio", "DISPONÍVEL AGORA", 270, 778, 446, 61, 33, "#f6ebff",
        {start: .88, keys: {y: shot(840,778,.53), ...fade()}});
    },
  },
  {
    id: "orbits", name: "Órbitas", category: "Cena", duration: 4.8, focus: "satellite-1",
    background: "#0c1c2d",
    fields: [
      text("Título", "title"), text("Linha de apoio", "caption"), color("Cor do núcleo", "core"),
      color("Cor do primeiro satélite", "satellite-1"),
      groupColor("Cor das órbitas", ["orbit-1", "orbit-2", "orbit-3"]),
      number("Uma volta (s)", ["satellite-1", "satellite-2", "satellite-3"],
        ([satellite]) => satellite.keys.x[repetitions]?.t,
        (layers, value) => {
          const ratio = value / layers[0].keys.x[repetitions].t;
          for (const layer of layers) changeTiming(layer, ["x", "y"], ratio);
        }, 1.25, 4.8, .05),
    ],
    build({circle, shape, text}) {
      circle("halo", "Halo do núcleo", 270, 436, 127, 127, "#23394c",
        {keys: {scaleX: shot(.69,1,1.25), scaleY: shot(.69,1,1.25)}});
      circle("core", "Núcleo", 270, 436, 86, 86, "#fbbd72",
        {keys: {scaleX: shot(.74,1,1.14), scaleY: shot(.74,1,1.14)}});
      for (const [index, [tilt, phase, fill, size]] of [
        [-34, 1, cyan, 24], [31, 2.4, "#eeabe0", 18], [87, 5.1, "#ffe3a4", 15],
      ].entries()) {
        const n = index + 1;
        circle("orbit-" + n, "Órbita " + n, 270, 436, 382, 156, "#54788b",
          {outline: 3, props: {rotation: tilt}});
        circle("satellite-" + n, "Satélite " + n, 270, 436, size, size, fill,
          {keys: orbitKeys(190, 77, tilt, phase)});
      }
      shape("sparkle", "point", "Centelha", 411, 252, 30, 30, "#a3e3ea");
      text("title", "Título", "ÓRBITAS", 270, 728, 462, 110, 86, "#bdf2ef",
        {start: .16, keys: {reveal: shot(0,1,.63), ...fade(.29)}});
      text("caption", "Linha de apoio", "CADA PONTO TEM SEU RITMO", 270, 800, 438, 51, 30, "#94b9c7",
        {start: .56, keys: fade(.46)});
    },
  },
  {
    id: "geometric-portal", name: "Portal geométrico", category: "Cena", duration: 4.7, focus: "frame-0",
    background: "#22152d",
    fields: [
      text("Título", "title"), text("Linha de apoio", "sub"),
      groupColor("Cor principal", portalFrames.filter((_, i) => i % 2 === 0)),
      groupColor("Cor alternada", portalFrames.filter((_, i) => i % 2 === 1)),
      timing("Expansão (s)", portalFrames, "scaleX", ["scaleX", "scaleY", "opacity", "rotation"], 1.15, 3.2),
    ],
    build({box, shape, text}) {
      for (const [index, id] of portalFrames.entries()) {
        const start = index * .44;
        box(id, "Contorno " + (index + 1), 270, 443, 338, 417, index % 2 ? "#efabfd" : "#ff996b", {
          start, outline: 5, keys: {
            scaleX: shot(.08, 2.15, 2.45), scaleY: shot(.08, 2.15, 2.45),
            rotation: shot(-27, 21, 2.45), opacity: [k(0,0), k(.3,.92,"out"), k(1.9,.6), k(2.45,0,"in")],
          },
        });
      }
      shape("diamond", "prism", "Portal central", 270, 446, 58, 58, "#ffd5be",
        {keys: {rotation: shot(0, 180, 4.7), ...fade(.3)}});
      text("title", "Título", "OUTRA DIMENSÃO", 270, 771, 473, 104, 65, "#ffe2ec",
        {start: .4, keys: {y: shot(813,771,.53), ...fade()}});
      text("sub", "Linha de apoio", "UMA EXPERIÊNCIA EM MOVIMENTO", 270, 847, 453, 49, 25, "#fff0dc",
        {start: .82, keys: fade()});
    },
  },
  {
    id: "three-steps", name: "Três passos", category: "Divulgação", duration: 4.6, focus: "step-1",
    background: "#253e38",
    fields: [
      text("Título", "title"), text("Primeiro passo", "step-1"), text("Segundo passo", "step-2"),
      text("Terceiro passo", "step-3"), groupColor("Cor dos cartões", ["card-1", "card-2", "card-3"]),
    ],
    build({box, circle, text}) {
      text("tag", "Linha superior", "GUIA RÁPIDO", 270, 147, 421, 47, 29, "#d3ecbc");
      text("title", "Título", "Faça em 3 passos", 270, 229, 448, 103, 66, "#f1f4da", {keys: fade(.45)});
      segment(box,"rail","Linha dos passos",[96,374],[96,736],5,"#bbd7a6",
        {start:.21, keys:{reveal: shot(0,1,1.76)}});
      for (const [index, value] of ["Escolha seu formato", "Adicione seu conteúdo", "Compartilhe o resultado"].entries()) {
        const n = index + 1;
        const start = .44 + index * .53;
        const y = 406 + index * 151;
        circle("dot-" + n, "Marcador " + n, 96, y, 25, 25, "#d5ef95", {start, keys: fade(.23)});
        box("card-" + n, "Fundo do passo " + n, 304, y, 345, 112, "#d7e8cc", {
          start, keys: {x: shot(369,304,.43), ...fade(.36)},
        });
        text("label-" + n, "Número " + n, String(n).padStart(2,"0"), 161, y, 56, 50, 29, "#526a50",
          {start: start + .1, keys:fade(.32)});
        text("step-" + n, "Passo " + n, value, 331, y, 259, 94, 38, "#273e33",
          {start: start + .15, keys: {x: shot(365,331,.41), ...fade(.26)}});
      }
    },
  },
  {
    id: "event-invite", name: "Convite para evento", category: "Divulgação", duration: 4.5, focus: "event",
    background: "#66344e",
    fields: [
      text("Nome do evento", "event"), text("Data e hora", "when"), text("Local", "place"),
      text("Chamada final", "cta"), color("Cor do ingresso", "top"),
      color("Cor do canhoto", "bottom"),
    ],
    build({box, circle, shape, text}) {
      const upper = (y) => ({y: [k(0, y+480), k(.58, y+12,"out"), k(.96,y,"inOut")]});
      const lower = (y) => ({y: [k(0, y+446), k(.58, y-22,"out"), k(.96,y,"inOut")]});
      box("top", "Corpo do ingresso", 270, 388, 448, 298, "#fee0b6", {keys: upper(388)});
      box("bottom", "Canhoto", 270, 627, 448, 140, "#f0a884", {keys: lower(627)});
      text("label", "Categoria", "ACESSO LIVRE  /  CONVITE", 270, 283, 371, 48, 26, "#783750", {keys: upper(283)});
      text("event", "Nome do evento", "Noite do Café", 270, 397, 407, 146, 78, "#3c2234", {keys: upper(397)});
      text("when", "Data e hora", "24 AGO · 19H", 270, 602, 396, 57, 45, "#3c2234", {keys: lower(602)});
      text("place", "Local", "Pátio do Café Horizonte", 270, 656, 401, 43, 28, "#613147", {keys: lower(656)});
      for (let i = 0; i < 14; i++)
        circle("dot-" + i, "Perfuração " + (i + 1), 63 + i * 32, 546, 8, 8, "#ffca9f",
          {start: .65, keys: fade(.36)});
      shape("sparkle", "star", "Estrela", 429, 198, 68, 68, "#ffe1aa",
        {start: .5, keys: {rotation: shot(-35,80,1.3), ...fade(.3)}});
      text("cta", "Chamada final", "RESERVE A DATA", 270, 796, 443, 68, 38, cream,
        {start: .99, keys: {reveal: shot(0,1,.49), ...fade()}});
    },
  },
  {
    id: "mosaic-showcase", name: "Vitrine em mosaico", category: "Divulgação", duration: 4.4, focus: "photo-left",
    background: "#d5e9eb",
    sources: ["coast.jpg", "tide.jpg", "catalog-mosaic.jpg"],
    fields: [
      text("Título", "title"), text("Linha de apoio", "caption"), color("Cor da faixa", "panel"),
      image("Imagem maior", "photo-top"), image("Imagem inferior esquerda", "photo-left"),
      image("Imagem inferior direita", "photo-right"),
    ],
    build({box, image, text, shape}) {
      image("photo-top", "Foto maior", "coast.jpg", 270, 307, 449, 328,
        {keys: {y: shot(149,307,.68), ...fade(.4)}});
      image("photo-left", "Foto inferior esquerda", "tide.jpg", 154, 578, 216, 184,
        {start: .33, keys: {x: shot(-82,154,.62), ...fade(.32)}});
      image("photo-right", "Foto inferior direita", "catalog-mosaic.jpg", 386, 578, 216, 184,
        {start: .49, keys: {x: shot(620,386,.62), ...fade(.32)}});
      text("tag", "Linha superior", "DIÁRIO DE VIAGEM  /  VOLUME 01", 270, 95, 455, 55, 28, "#264550");
      box("panel", "Faixa do título", 270, 753, 449, 126, "#234958",
        {start: .76, keys: {reveal: shot(0,1,.55), ...fade(.33)}});
      text("title", "Título do mosaico", "Fim de semana na costa", 270, 753, 397, 96, 47, "#e8faff",
        {start: 1.02, keys: {y: shot(779,753,.48), ...fade(.3)}});
      text("caption", "Linha de apoio", "Três paisagens para salvar", 247, 859, 368, 70, 30, "#264550",
        {start: 1.38, keys: fade(.31)});
      shape("arrow", "arrow", "Seta", 451, 859, 47, 35, "#264550", {start: 1.38, keys: fade(.31)});
    },
  },
].map(template => ({...template, collection: 2}));
