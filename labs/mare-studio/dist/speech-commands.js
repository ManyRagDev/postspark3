export const speechCommands = Object.freeze({
  captions: "montagem.gerarLegendas",
  pauses: "montagem.encurtarPausas",
  fillers: "montagem.removerHesitacoes",
  phrase: "montagem.cortarFrase",
  excerpt: "montagem.sugerirTrecho",
  look: "montagem.estilizarVideoFalado",
});

const simpleColors = Object.freeze({
  azul: "#214a73", verde: "#28624f", vinho: "#702640", preto: "#111318", branco: "#f1eee8",
  rosa: "#a23c67", laranja: "#b95d2f", roxo: "#543e77", vermelho: "#972c3d", cinza: "#505867",
});
const spelledSeconds = {um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5};

export function interpretSpeechRequest(request) {
  const normalized = request.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const commands = [];
  const push = (id, params = {}) => commands.push({id, params});
  if (/\blegendas?\b/.test(normalized)) push(speechCommands.captions, {
    style: /\b(simples|classicas?|discretas?)\b/.test(normalized) ? "classic" : "highlight",
  });
  if (/\b(pausas?|silencios?)\b/.test(normalized)) {
    const match = normalized.match(/(?:acima de|a partir de|maiores? (?:que|de)|mais de)\s+(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco)\s*(?:segundos?|s\b)/);
    const minimum = match ? spelledSeconds[match[1]] ?? Number(match[1].replace(",", ".")) : undefined;
    push(speechCommands.pauses, {minimum});
  }
  if (/\b(hesitaco(?:es|ao)|vicios?|muletas?|cacoetes?)\b/.test(normalized)) push(speechCommands.fillers);
  const phrase = request.match(/\bfrase\s+["“«]([^"”»]+)["”»]/iu)?.[1];
  if (phrase) push(speechCommands.phrase, {phrase});
  if (/\b(?:destaque|trecho (?:para|de) (?:um )?(?:reel|clipe|short))\b/.test(normalized)) {
    const seconds = normalized.match(/(\d+)\s*(?:segundos?|s\b)/)?.[1];
    push(speechCommands.excerpt, {target: seconds ? Number(seconds) : 20});
  }
  const look = {};
  if (/\bfundo\b/.test(normalized)) {
    const color = normalized.match(/#[0-9a-f]{6}\b/)?.[0] ??
      Object.entries(simpleColors).find(([name]) => new RegExp(`\\b${name}\\b`).test(normalized))?.[1];
    if (color) look.color = color;
    look.background = /\b(original|manter o fundo)\b/.test(normalized) ? "original" :
      /desfoc/.test(normalized) ? "blur" : /degrade/.test(normalized) || !color ? "gradient" : "solid";
  }
  const title = request.match(/(?:t[ií]tulo|texto)\s+["“«]([^"”»]+)["”»]/iu)?.[1];
  if (title && /\batras\b/.test(normalized)) look.title = title.slice(0, 80);
  if (/\b(?:clareie|ilumine|clarear|iluminar|mais luz)\b/.test(normalized)) look.exposure = .45;
  if (/\b(?:escureca|escurecer|menos luz)\b/.test(normalized)) look.exposure = -.35;
  if (Object.keys(look).length) push(speechCommands.look, look);
  if (!commands.length) throw Error('Tente “Encurte as pausas acima de 1 s e gere legendas” ou “Use fundo azul e título “Café 360” atrás da pessoa”.');
  return commands;
}
