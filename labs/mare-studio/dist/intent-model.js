// Supervised nearest-neighbour classifier. Each line supplies different examples
// of the same editing intent. Inputs are normalized before fitting and scoring.
const examples = {
  create: [
    "crie uma forma",
    "um quadrado no centro",
    "quero um círculo",
    "desenhe um quadrado",
    "coloque um círculo",
    "criar um disco",
    "adicione um quadrado",
    "inserir texto",
    "quero uma bolinha",
    "disco",
    "criar um disco violeta",
    "adicionar um título",
    "crie uma caixa",
    "comece com um círculo",
    "uma esfera no meio",
    "criar nova camada de texto",
    "montar um letreiro",
    "inclua uma forma",
    "desenha um círculo",
    "ponha uma bola",
    "um quadrado",
    "um círculo",
    "um triângulo",
    "adicione um triângulo",
    "criar título",
  ],
  rotate: [
    "gire",
    "girando",
    "faça rodar",
    "rodando",
    "rodar meia volta",
    "gira no centro",
    "uma rotação",
    "anime a rotação",
    "uma volta inteira",
    "rotaciona a forma",
    "girar o objeto",
    "quero que ele gire",
    "rode em torno do centro",
    "faz uma pirueta",
    "girar no próprio eixo",
  ],
  easeOut: [
    "desacelerar antes de abrir",
    "desacelera no final",
    "termine o giro devagar",
    "suavize o final da rotação",
    "faça frear aos poucos",
    "amorteça o fim do giro",
    "reduza a velocidade no fim",
    "termina a volta mais suave",
    "abrande o giro no fim",
    "retarde o fim da rotação",
    "quero um giro que termine lentamente",
    "desacelere ao concluir o giro",
    "o giro deve perder velocidade",
    "suavizar a chegada",
    "amenize a parada",
    "desacelere",
  ],
  easeIn: [
    "acelere no começo",
    "aceleração na partida",
    "comece a girar devagar e acelere",
    "começa suave e ganha velocidade",
    "acelere o início da rotação",
    "arranque devagar",
    "o giro começa lentamente",
    "acelerar o giro na saída",
    "dar impulso ao começo do giro",
  ],
  unfold: [
    "se abre",
    "abrindo uma faixa",
    "vira uma faixa",
    "alargue",
    "abra na horizontal",
    "se estica de lado",
    "estique na horizontal",
    "abrir como uma faixa",
    "esticando para os lados",
    "vira uma barra horizontal",
    "abrir horizontalmente",
    "espalhe para os lados",
    "alonga até virar faixa",
  ],
  reveal: [
    "revela o título",
    "vira o título",
    "vira um texto",
    "mostra a frase",
    "surge o título",
    "deixe o texto aparecer",
    "exiba a palavra",
    "revelar a frase",
    "abre revelando o título",
    "transforma em título",
    "transforme no texto",
    "se transforma em um título",
    "descortine a frase",
    "faz surgir o título",
    "revelando o texto",
    "que vira título",
  ],
  pulse: [
    "pulse",
    "pulse duas vezes",
    "pulsando",
    "pulsar",
    "pulsa no meio",
    "cresce e diminui",
    "respire suavemente",
    "efeito de pulsação",
    "expande e encolhe",
    "batendo como um coração",
    "faz uma batida",
    "aumenta e volta ao tamanho original",
    "uma pulsação",
  ],
  move: [
    "mova para a direita",
    "deslize para a esquerda",
    "suba um pouco",
    "desça até embaixo",
    "vai para cima",
    "escorrega para baixo",
    "arraste para a esquerda",
    "leva para o centro",
    "deslocar lateralmente",
    "mover para baixo",
    "subir",
    "descer",
    "subindo",
    "descendo",
    "ande para a direita",
    "centralize",
    "centralizar",
  ],
  color: [
    "mude a cor",
    "pinte de azul",
    "troque para coral",
    "fica verde",
    "quero em branco",
    "use tinta violeta",
    "altere a cor da camada",
    "deixe roxo",
    "recolorir",
    "mudar a tonalidade",
    "pintar o fundo",
    "fundo preto",
    "preencha com vermelho",
    "cor azul",
    "aplique a cor",
  ],
  retitle: [
    "troque o texto",
    "escreva no título",
    "mude a frase",
    "renomeie o título",
    "substitua as palavras",
    "corrija o título",
    "quero que o título diga",
    "trocar a frase para",
    "altere o conteúdo do texto",
    "reescreva o título",
    "mudar o título para",
  ],
  delay: [
    "atrase a entrada do título",
    "segure a entrada",
    "entra depois",
    "comece mais tarde",
    "aparece depois",
    "adie a entrada",
    "retarde o começo",
    "demore mais para aparecer",
    "empurre a entrada",
    "adiante a entrada",
    "antecipe o título",
    "começa mais cedo",
    "entra mais cedo",
    "faça aparecer antes",
    "atrasar o título",
  ],
  fadeIn: [
    "apareça aos poucos",
    "surge no centro",
    "surge",
    "aparece no centro",
    "fade in",
    "entre em fade",
    "ganhe opacidade",
    "começa transparente",
    "entrada suave de opacidade",
    "aparecer gradualmente",
    "aumente a opacidade aos poucos",
  ],
  fadeOut: [
    "fade out",
    "desapareça aos poucos",
    "suma no final",
    "desvaneça",
    "fique transparente no final",
    "sumindo suavemente",
    "vá desaparecendo",
    "perca opacidade",
    "sair em fade",
    "evapore no final",
  ],
};

export function canonical(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const ignore = new Set(
  "a o as os de do da dos das em no na nos nas pra pro para por ao aos com sem um uma uns umas que e se me meu minha ele ela eles elas isso isto esta este essa esse esse ai eu favor porfa porfavor agora quero gostaria pode poderia favor consegue faca faz fazer deixe gostaria queria pela pelo mais bem muito".split(
    " "
  )
);

function tokens(text) {
  return (
    canonical(text)
      .match(/[a-z]+/g)
      ?.filter(word => !ignore.has(word)) || []
  );
}

function features(words) {
  const counts = new Map();
  const add = (term, weight) =>
    counts.set(term, (counts.get(term) || 0) + weight);
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    add(word, 2.2);
    if (index) add(words[index - 1] + " " + word, 1);
    const bounded = "^" + word + "$";
    for (let size = 3; size <= 4; size++) {
      for (let i = 0; i <= bounded.length - size; i++)
        add("*" + bounded.slice(i, i + size), 0.52);
    }
  }
  return counts;
}

function train() {
  const documents = Object.entries(examples).flatMap(([intent, texts]) =>
    texts.map(text => ({ intent, vector: features(tokens(text)) }))
  );
  const frequencies = new Map();
  for (const { vector } of documents)
    for (const key of vector.keys())
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
  const idf = new Map(
    [...frequencies].map(([key, count]) => [
      key,
      Math.log((documents.length + 1) / (count + 1)) + 1,
    ])
  );
  const normalized = vector => {
    const out = new Map();
    let sum = 0;
    for (const [key, tf] of vector) {
      const value =
        Math.log1p(tf) * (idf.get(key) ?? Math.log(documents.length + 1));
      out.set(key, value);
      sum += value * value;
    }
    if (sum)
      for (const [key, value] of out) out.set(key, value / Math.sqrt(sum));
    return out;
  };
  for (const doc of documents) doc.vector = normalized(doc.vector);
  return { documents, normalized };
}
let model;
const vocabulary = new Set(Object.values(examples).flat().flatMap(tokens));
const knownModifiers = new Set(
  tokens(
    "antes depois abertura final inicio primeiro segunda devagar suavemente lentamente rapidamente rapido rapido devagar horizontal vertical gradualmente fundo camada objeto selecionado selecionada figura forma cena composicao atual seguinte esquerda direita acima abaixo alto baixo central no centro tela dele dela lado lados proprio eixo horario anti tres duas vez vezes graus grau giro segundo segundos ms s milissegundos px pixels porfavor por favor nova novo escrevendo rotacao destino posicao posicione localizado localizada metade volta voltas completa completo inteira durante ate apos literal apareca apareceu aparece tudo meio apenas somente so passa desenhado desenhada deixe deixa faz faca faze transformar transformar-se transforme torna vire abra virando dentro externo visual manual inicio final abertura abrir perder ganhando diminuir diminuindo baixa seu seus sua suas aquela esse mesma outra outros este isto aquela ali aqui imagem imagens quadrado quadrados retangulo circulo esfera bola bolinha branco branca preto preta coral laranja vermelho vermelha rosa verde amarelo amarela azul roxo roxa violeta lilas turquesa ciano dourado tamanho titulo texto"
  ).concat(["a", "o"])
);
export function unfamiliarWords(text) {
  const words = tokens(text);
  // Permit Portuguese inflections of a known word (rodar, rode, rodando).
  const stem = word =>
    word.replace(
      /(?:ando|endo|indo|amos|aria|aria|asse|esse|isse|arem|erem|irem|ado|ada|ava|iao|oes|em|am|ar|er|ir|ou|ei|es|as|os|a|o|e|s)$/,
      ""
    );
  const stems = new Set(
    [...vocabulary, ...knownModifiers].map(stem).filter(x => x.length >= 3)
  );
  return words.filter(
    w => !vocabulary.has(w) && !knownModifiers.has(w) && !stems.has(stem(w))
  );
}
export function classifyIntent(text) {
  model ??= train();
  const vector = model.normalized(features(tokens(text)));
  const scores = new Map();
  for (const { intent, vector: reference } of model.documents) {
    let similarity = 0;
    for (const [key, v] of vector) similarity += v * (reference.get(key) || 0);
    const values = scores.get(intent) || [];
    values.push(similarity);
    scores.set(intent, values);
  }
  const ranked = [...scores]
    .map(([intent, values]) => {
      values.sort((a, b) => b - a);
      return {
        intent,
        score: values[0] * 0.76 + values[1] * 0.16 + values[2] * 0.08,
      };
    })
    .sort((a, b) => b.score - a.score);
  if (ranked[0].score < 0.24 || ranked[0].score - ranked[1].score < 0.025)
    return null;
  return ranked[0].intent;
}
