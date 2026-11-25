import { setTemplateControl, templateControls } from "./animation-templates.js";
import { elementWords } from "./elements.js";
import { newLayer, assertComposition, setKey } from "./composition-model.js";
import { canonical, classifyIntent, unfamiliarWords } from "./intent-model.js";

const palette = {
  coral: "#ff693e",
  laranja: "#ff8b38",
  azul: "#72acff",
  verde: "#71d7a2",
  vermelho: "#ef5350",
  vermelha: "#ef5350",
  roxo: "#ab83ee",
  roxa: "#ab83ee",
  violeta: "#ab83ee",
  lilas: "#c89bd9",
  amarelo: "#f8c954",
  amarela: "#f8c954",
  dourado: "#f0be59",
  rosa: "#f294bd",
  branco: "#fff5e7",
  branca: "#fff5e7",
  preto: "#171820",
  preta: "#171820",
  ciano: "#48dce2",
  turquesa: "#4ce0c1",
};
const assetWord = new RegExp("\\b(?:" + Object.keys(elementWords).join("|") + ")\\b", "g");
// The classifier knows the grammatical role of a shape. Keep its actual asset ID for the edit.
const forClassification = text => text.replace(assetWord, (word, offset) =>
  word === "faixa" && text.slice(0, offset).endsWith("em ") ? word : "circulo"
);
const shapeTokens =
  /\b(quadrado|caixa|triangulo|circulo|bola|bolinha|disco|esfera|titulo|texto|letreiro|frase|palavra)\b/;
const colorTokens = new RegExp(
  "\\b(" + Object.keys(palette).join("|") + ")\\b"
);
const directions =
  /\b(direita|esquerda|cima|baixo|centro|suba|desca|subir|descer|subindo|descendo|centraliz\w*)\b/;
const unsupported = msg => {
  throw new Error(msg);
};
function typeIn(text) {
  const token = text.match(shapeTokens)?.[1];
  if (!token) return null;
  if (token === "triangulo") return "triangle";
  if (["quadrado", "caixa"].includes(token)) return "square";
  if (["circulo", "bola", "bolinha", "disco", "esfera"].includes(token))
    return "circle";
  return "text";
}
export function colorIn(text) {
  const hex = text.match(/#([a-f0-9]{6})\b/);
  return hex?.[0] || palette[text.match(colorTokens)?.[1]];
}

const gentleEntrance = String.raw`(?:o\s+)?t[íi]tulo\s+(?:entr(?:a|e|ando|ar)|aparec(?:e|endo|er))\s+(?:suavemente|aos\s+poucos|gradualmente)`;
const gentleTitle = new RegExp(String.raw`^(?:(?:faca|deixe)\s+)?` + gentleEntrance + "$");
const titleBriefPattern = new RegExp(
  String.raw`^(?:crie|criar|fa[çc]a|monte|quero)\s+(?:um[ao]?\s+)?(?:anima[çc][ãa]o|v[íi]deo|reels?|story)` +
  String.raw`(?:\s+para\s+(?:divulgar|anunciar|promover)\s+([\p{L}\s'-]+?))?\s+com\s+(?:(?:um|o)\s+)?` +
  String.raw`(?:texto|t[íi]tulo)\s+([^,.;?!\n]+?)\s+e\s+` + gentleEntrance + "[.!?]*$",
  "iu"
);
// A creation brief may add context before the requested title and its entrance.
// Leave ambiguous or unsupported phrases to the normal parser.
function titleBrief(text) {
  const match = text.match(titleBriefPattern);
  if (!match) return null;
  const purpose = canonical(match[1] ?? "");
  const title = match[2].trim();
  if (
    /\b(?:e|com|sem|nao|fundo|camada|animacao|duracao|segundos?|quadros?|corte|musica|narracao)\b/.test(purpose) ||
    /\b(?:e|com|que)\b/.test(canonical(title))
  ) return null;
  return title;
}

function titlesFrom(prompt) {
  const titles = [];
  const save = raw => {
    const value = raw.trim();
    if (!value || value.length > 180)
      unsupported("Use um título com até 180 caracteres.");
    titles.push(value);
    return " LITERAL" + (titles.length - 1) + " ";
  };
  let safe = prompt.replace(/["“«]([^"”»]+)["”»]/g, (_, name) => save(name));
  const brief = titleBrief(safe);
  if (brief) {
    const match = brief.match(/^LITERAL(\d+)$/);
    const literal = match && titles[Number(match[1])] ? brief : save(brief);
    return {
      text: canonical("Crie um título " + literal + " e o título entrando suavemente"),
      titles,
    };
  }
  // Unquoted titles are accepted only at a terminal position. Quotes keep a
  // phrase with conjunctions or additional instructions unambiguous.
  safe = safe.replace(
    /\b(t[ií]tulo|frase|palavra|texto)\s*(?:[=:]\s*|(?:para|diga|escrito|escrita|dizendo|chamad[oa]|com os dizeres)\s+|\s+)([^,;.?!\n]+)(?=[,.!?;]*$)/iu,
    (all, noun, value) => {
      const norm = canonical(value).trim();
      if (
        !norm ||
        /^(?:e|que|com|sem|por|antes|depois|agora|para|de|da|do|a|o|na|no|em)\b/.test(
          norm
        ) ||
        /^literal\d+|\b(?:meio segundo|segundos?|mais tarde|antes|depois|atras|entrada|camada|fundo|giro)\b|\b(?:e|que)\s+(?:gira|revele|abra|seja|fique|pulsa|muda|abre)\b/.test(
          norm
        )
      )
        return all;
      if (
        colorIn(norm) ||
        directions.test(norm) ||
        /^\d|^(?:apare|entr|sair|puls|gir|desliz|centraliz)/.test(norm)
      )
        return all;
      return noun + " " + save(value);
    }
  );
  // A trailing explanation of a quoted name supplies context, not another
  // animation. Keep subsequent coordinated actions for the normal parser.
  const text = canonical(safe).replace(
    /(literal\d+)\s*,\s*que e o nome (?:d[aeo]s?|de um[ae]?)\s+(?:[a-z-]+\s+){0,3}?[a-z-]+(?=\s*(?:[.,;!?]|$)|\s+e\s+)/g,
    "$1"
  );
  return { text, titles };
}

const embeddedMotion = new RegExp(
  String.raw`^(.*?\b(?:` + Object.keys(elementWords).join("|") +
  String.raw`|quadrado|caixa|triangulo|circulo|bola|bolinha|esfera|disco|texto|titulo)\b.*?)\s+(?:que\s+)?((?:surge|aparece|gir\w*|rod\w*|puls\w*|desliza\w*|se (?:abre|estica)|revela\w*|vira\b).*)$`
);
function normalizeClauses(text) {
  const numerals = ["zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
  text = text
    .replace(/\b(\d+|zero|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:quadros?|frames?)\b/g,
      (_, amount) => {
        const frames = numerals.includes(amount) ? numerals.indexOf(amount) : Number(amount);
        return Number((frames / 30).toFixed(6)) + " segundos";
      })
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\bmei[oa]\s+segundo\b/g, "0.5 segundo")
    .replace(/\bum\s+segundo\b/g, "1 segundo")
    .replace(/\bdois segundos\b/g, "2 segundos");
  // Keep known compound motion phrases and end-of-rotation qualifiers intact.
  text = text
    .replace(
      /cresce e diminui|cresça e diminua|cresca e diminua|aumenta e volta ao tamanho original|expande e encolhe/g,
      "pulsa"
    )
    .replace(/(?:antes de|ao)\s+(?:se\s+)?abrir/g, "antes_da_abertura")
    .replace(/\bno (?:meio|centro) da (?:tela|cena)\b/g, "no centro")
    .replace(
      /\b(?:comeca|comece) (?:a girar )?(?:suave|devagar) e (?:acelere|ganha velocidade)/g,
      "acelere no começo"
    )
    .replace(
      /\b(?:sem (?:mexer|tocar) (?:no|na)|sem (?:alterar|mudar) (?:o|a)) (?:titulo|texto|outra camada)\b/g,
      ""
    );
  if (
    /\b(nao|exceto|menos que|em vez|ao inves|remov\w*|exclu\w*|apag\w*|delete|apaga|tirar)\b/.test(
      text
    )
  )
    unsupported(
      "Para manter os ajustes existentes, descreva diretamente uma alteração positiva de cada vez."
    );
  text = text.replace(/\bpara (revelar|mostrar|exibir)\b/g, ", $1");
  const parts = text.split(
    /[,;\n]|\.(?=\s|$)|\b(?:e depois|em seguida|depois disso|depois entao|depois,|para que|e entao|entao)\b|\s+e\s+(?!meia\b)/
  );
  const clauses = [];
  for (let fragment of parts) {
    fragment = fragment.trim().replace(/^[.:!?\s]+|[.!?\s]+$/g, "");
    if (!fragment) continue;
    // A single noun phrase often carries embedded motion: "um círculo azul
    // pulsando", "um quadrado que gira". Split at that grammatical boundary.
    const embedded = fragment.match(embeddedMotion);
    if (
      embedded &&
      !/\b(desacel\w*|aceler\w*|atras\w*|antecip\w*|suaviz\w*)\b/.test(
        embedded[1]
      )
    )
      clauses.push(embedded[1], embedded[2]);
    else clauses.push(fragment);
  }
  return clauses;
}

function detectInstruction(clause, titles) {
  const asset = clause.match(assetWord)?.[0];
  const shapeType = asset && !/\bem faixa\b/.test(clause) ? elementWords[asset] : typeIn(clause);
  const literal = clause.match(/\bliteral(\d+)\b/);
  const title = literal ? titles[Number(literal[1])] : null;
  const cleaned = clause
    .replace(/\bliteral\d+\b/g, "")
    .replace(/antes_da_abertura/g, "antes de abrir")
    .replace(/#[a-f0-9]{6}\b/g, "")
    .trim();
  const known = forClassification(cleaned);
  if (gentleTitle.test(known))
    return { intent: "fadeIn", shapeType: "text", title, clause: cleaned, color: null };
  const unknown = unfamiliarWords(known);
  if (unknown.length)
    unsupported(
      "A edição rápida reconhece pedidos de texto, cor e movimento. Tente “Adicione um triângulo coral que gira”."
    );
  const withoutColor = known.replace(colorTokens, "").trim();
  const referenceOnly =
    /^(?:(?:faz|faca|deixe|quero que)\s+)?(?:o|a)\s+(?:quadrado|triangulo|circulo|bola|bolinha|disco|forma|titulo|texto|camada)$/.test(
      known
    );
  // "girar para a direita" has the same destination words as "deslizar
  // para a direita". Canonicalize the directional complement before inference.
  const rotationPhrase =
    /\b(?:girar|gira|gire|girando|rodar|roda|rode|rodando|rotaciona|rotacionar|rotacione)\b/.test(
      cleaned
    )
      ? cleaned.replace(/(?:para|pra) a (?:direita|esquerda)/g, " no eixo")
      : cleaned;
  const intent = referenceOnly
    ? "reference"
    : classifyIntent(forClassification(rotationPhrase)) || classifyIntent(withoutColor);
  if (!intent)
    unsupported("Tente indicar uma ação, como girar, pulsar, revelar um título ou atrasar a entrada.");
  return { intent, shapeType, title, clause: cleaned, color: colorIn(clause) };
}
function controlTime(text) {
  const match = text.match(
    /\b(\d+(?:\.\d+)?)\s*(ms|milissegundos?|s|segundos?)\b/
  );
  return match
    ? Number(match[1]) * (match[2].startsWith("m") ? 0.001 : 1)
    : null;
}
function label(layer) {
  return (
    layer.name ||
    {
      text: "Título",
      circle: "Círculo",
      square: "Quadrado",
      triangle: "Triângulo",
      image: "Imagem",
    }[layer.type]
  );
}
function requireTarget(layer) {
  if (!layer)
    unsupported(
      "Selecione a camada que deseja animar ou comece pedindo uma forma."
    );
  return layer;
}
function openTarget(doc, scope, focus, type) {
  if (scope) {
    if (type && scope.type !== type)
      unsupported(
        "Esse pedido menciona outra camada. Selecione a camada desejada ou escolha a composição inteira."
      );
    return scope;
  }
  if (focus && (!type || focus.type === type)) return focus;
  const options = doc.layers.filter(l => !type || l.type === type);
  if (options.length > 1)
    unsupported(
      "Há mais de uma camada possível. Selecione uma camada e repita o pedido."
    );
  return options[0];
}

const round = n => Math.round(n * 1000) / 1000;
function setPair(layer, channel, t1, v1, t2, v2, ease = "inOut") {
  const len = layer.end - layer.start;
  const from = round(Math.max(0, Math.min(t1, len)));
  const to = round(Math.max(0, Math.min(t2, len)));
  if (to <= from)
    unsupported(
      "A duração da camada é curta para esse movimento. Aumente a duração e tente novamente."
    );
  setKey(layer, channel, from, v1, "linear");
  setKey(layer, channel, to, v2, ease);
}
function unfold(layer, cursor) {
  const len = layer.end - layer.start;
  const begin = Math.min(cursor || len * 0.2, len * 0.65),
    end = Math.min(begin + 0.65, len * 0.84);
  setPair(
    layer,
    "scaleX",
    begin,
    layer.props.scaleX,
    end,
    Math.min(7, 425 / layer.width),
    "out"
  );
  setPair(
    layer,
    "scaleY",
    begin,
    layer.props.scaleY,
    end,
    Math.min(1, 95 / layer.height),
    "out"
  );
  return end;
}
function applyInstructions(doc, instructions, selectedId, duration) {
  const selected = selectedId
    ? doc.layers.find(l => l.id === selectedId)
    : null;
  if (selectedId && !selected)
    unsupported("A camada selecionada mudou. Selecione-a novamente.");
  let focus = selected,
    lastNew,
    cursor = 0;
  const changes = [];

  for (const op of instructions) {
    const { intent, shapeType, title, clause, color } = op;
    if (intent === "reference") {
      focus = requireTarget(openTarget(doc, selected, focus, shapeType));
      continue;
    }
    if (intent === "create") {
      if (selected)
        unsupported(
          "Para acrescentar outra camada, selecione a composição inteira e envie o pedido."
        );
      if (!shapeType)
        unsupported(
          "Indique um elemento da biblioteca ou um título."
        );
      if (shapeType === "text" && !title)
        unsupported("Escreva o conteúdo entre aspas para criar o título.");
      const layer = newLayer(shapeType, duration);
      if (color) layer.color = color;
      if (shapeType === "text") layer.text = title;
      doc.layers.push(layer);
      focus = layer;
      lastNew ??= layer;
      cursor = 0;
      if (/\b(?:esquerda|direita)\b/.test(clause))
        layer.props.x = /\besquerda\b/.test(clause) ? 135 : 405;
      if (/\b(?:cima|alto|baixo)\b/.test(clause))
        layer.props.y = /\bbaixo\b/.test(clause) ? 720 : 240;
      changes.push("Adicionar " + label(layer));
      continue;
    }
    if (intent === "reveal") {
      if (selected && selected.type !== "text")
        unsupported(
          "Revelar um título exige uma camada de texto. Selecione o texto ou a composição inteira."
        );
      if (
        focus?.type === "square" &&
        !selected &&
        /\b(vira|transform\w*)\b/.test(clause) &&
        !focus.keys.scaleX.length
      ) {
        cursor = unfold(focus, cursor);
        changes.push("Quadrado se abre em faixa");
      }
      let layer = focus?.type === "text" ? focus : selected;
      if (!layer && !title) layer = openTarget(doc, null, null, "text");
      if (!layer) {
        layer = newLayer("text", duration);
        layer.text = title || "Seu título";
        layer.color = "#fff5e7";
        layer.name = "Título";
        layer.fontSize = 43;
        layer.start = round(Math.min(cursor, duration * 0.65));
        doc.layers.push(layer);
      } else if (title) layer.text = title;
      const len = layer.end - layer.start;
      setPair(layer, "reveal", 0, 0, Math.min(0.75, len * 0.7), 1, "out");
      changes.push("Revelação de “" + layer.text + "”");
      focus = layer;
      lastNew ??= layer;
      continue;
    }
    if (intent === "color" && /\bfundo\b/.test(clause)) {
      if (selected)
        unsupported("Selecione a composição inteira para editar o fundo.");
      if (!color) unsupported("Informe uma cor, como coral, azul ou #FF693E.");
      doc.background = color;
      changes.push("Cor de fundo alterada");
      continue;
    }
    const layer = requireTarget(openTarget(doc, selected, focus, shapeType));
    focus = layer;
    const len = layer.end - layer.start;
    if (intent === "rotate") {
      const degrees = clause.match(/(-?\d+(?:\.\d+)?)\s*(?:graus|°)/);
      const turn = clause.match(/\b(\d+(?:\.\d+)?)\s*voltas?/);
      const delta = degrees
        ? Number(degrees[1])
        : turn
          ? Number(turn[1]) * 360
          : /meia volta/.test(clause)
            ? 180
            : /\b(?:volta (?:inteira|completa)|uma volta)\b/.test(clause)
              ? 360
              : 180;
      if (!Number.isFinite(delta) || Math.abs(delta) > 3600)
        unsupported("Use um giro de até dez voltas.");
      const slow = /\b(?:devagar|lentamente)\b/.test(clause),
        fast = /\b(?:rapido|rapidamente)\b/.test(clause);
      const start = cursor;
      const end =
        start +
        (controlTime(clause) ??
          Math.min(
            slow ? 1.8 : fast ? 0.45 : 0.95,
            (len - start) * (slow ? 0.48 : 0.29)
          ));
      setPair(
        layer,
        "rotation",
        start,
        layer.props.rotation,
        end,
        layer.props.rotation +
          delta *
            (/anti.horario|(?:pra|para) a esquerda/.test(clause) ? -1 : 1),
        "inOut"
      );
      cursor = Math.min(len, end);
      changes.push("Giro de " + delta + "° em " + label(layer));
      continue;
    }
    if (intent === "easeOut" || intent === "easeIn") {
      const keys = layer.keys.rotation;
      if (!keys || keys.length < 2)
        unsupported(
          "A camada selecionada precisa ter um giro para ajustar sua aceleração."
        );
      const end = keys[keys.length - 1],
        ease = intent === "easeOut" ? "out" : "in";
      if (end.ease === ease)
        unsupported("O giro selecionado já usa essa aceleração.");
      end.ease = ease;
      changes.push(
        intent === "easeOut"
          ? "Giro desacelera ao terminar"
          : "Giro ganha velocidade ao iniciar"
      );
      continue;
    }
    if (intent === "unfold") {
      if (layer.type !== "square")
        unsupported("Selecione um quadrado para abri-lo em faixa.");
      cursor = unfold(layer, cursor);
      changes.push("Quadrado se abre em faixa");
      continue;
    }
    if (intent === "pulse") {
      const repetition = clause.match(
        /\b(\d+|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+vezes/
      );
      const repeat = repetition
        ? Number(quantityWords[repetition[1]] ?? repetition[1])
        : 1;
      if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10)
        unsupported("Use de uma a dez pulsações.");
      const half = Math.min(0.38, len / (2 * repeat)),
        factor = 1.23;
      for (const channel of ["scaleX", "scaleY"]) {
        setKey(layer, channel, 0, layer.props[channel], "linear");
        for (let i = 0; i < repeat; i++) {
          setKey(
            layer,
            channel,
            round(half * (2 * i + 1)),
            layer.props[channel] * factor,
            "out"
          );
          setKey(
            layer,
            channel,
            round(half * (2 * i + 2)),
            layer.props[channel],
            "inOut"
          );
        }
      }
      changes.push(
        "Pulsação em " +
          label(layer) +
          (repeat > 1 ? " · " + repeat + " vezes" : "")
      );
      continue;
    }
    if (intent === "move") {
      const direction = clause.match(directions)?.[1];
      if (!direction)
        unsupported(
          "Informe a direção: esquerda, direita, cima, baixo ou centro."
        );
      const amount = Number(
        clause.match(/\b(\d+(?:\.\d+)?)\s*(?:px|pixels?)\b/)?.[1] || 90
      );
      if (amount > 800) unsupported("Use um deslocamento de até 800 px.");
      const end = controlTime(clause) ?? Math.min(1, len * 0.55);
      const targets =
        direction === "direita"
          ? { x: layer.props.x + amount }
          : direction === "esquerda"
            ? { x: layer.props.x - amount }
            : ["cima", "suba", "subir", "subindo"].includes(direction)
              ? { y: layer.props.y - amount }
              : ["baixo", "desca", "descer", "descendo"].includes(direction)
                ? { y: layer.props.y + amount }
                : { x: 270, y: 480 };
      for (const [channel, value] of Object.entries(targets))
        setPair(layer, channel, 0, layer.props[channel], end, value, "inOut");
      changes.push("Movimento de " + label(layer) + " para " + direction);
      continue;
    }
    if (intent === "color") {
      if (!color)
        unsupported(
          "Informe uma cor conhecida ou um valor hexadecimal de seis dígitos."
        );
      layer.color = color;
      changes.push("Cor de " + label(layer) + " alterada");
      continue;
    }
    if (intent === "retitle") {
      if (layer.type !== "text" || !title)
        unsupported(
          "Selecione um texto e informe o novo conteúdo entre aspas."
        );
      layer.text = title;
      changes.push("Texto alterado para “" + title + "”");
      continue;
    }
    if (intent === "delay") {
      const step = controlTime(clause);
      if (step === null)
        unsupported(
          "Indique quanto mover a entrada, por exemplo “atrase a entrada em meio segundo”."
        );
      const sign = /\b(antecip\w*|adiant\w*|antes|cedo)\b/.test(clause)
        ? -1
        : 1;
      const target = round(layer.start + sign * step);
      if (target < 0 || target >= layer.end - 0.025)
        unsupported(
          "A nova entrada precisa ficar dentro da duração da camada."
        );
      if (
        Object.values(layer.keys).some(keys =>
          keys.some(k => k.t > layer.end - target + 0.0001)
        )
      )
        unsupported(
          "A nova entrada cortaria um keyframe existente. Estenda a camada ou mova-o antes."
        );
      layer.start = target;
      changes.push(
        "Entrada de " +
          label(layer) +
          " em " +
          target.toLocaleString("pt-BR") +
          " s"
      );
      continue;
    }
    if (intent === "fadeIn" || intent === "fadeOut") {
      const isIn = intent === "fadeIn",
        duration = controlTime(clause) ?? Math.min(0.8, len * 0.45);
      const begin = isIn ? 0 : Math.max(0, len - duration);
      setPair(
        layer,
        "opacity",
        begin,
        isIn ? 0 : layer.props.opacity,
        begin + duration,
        isIn ? layer.props.opacity : 0,
        "inOut"
      );
      if (isIn) cursor = Math.max(cursor, Math.min(duration, len * 0.65));
      changes.push("Opacidade animada em " + label(layer));
      continue;
    }
    unsupported("Não consegui aplicar esse pedido à seleção.");
  }
  if (!changes.length) unsupported("Escreva o que deseja criar ou alterar.");
  return {
    composition: doc,
    selectedId: selected?.id ?? lastNew?.id ?? focus?.id ?? null,
    summary: changes.join(" · "),
    changes,
  };
}

function planOfferEdit(composition, prompt, selectedId) {
  if (composition.template !== "offer") return null;
  const request = canonical(prompt.trim()).replace(/[.!?]+$/, "").replace(/\s+/g, " ");
  const price = request.match(
    /^(?:troque|altere|mude|atualize) (?:o )?preco(?: da oferta)? para (?:r\$\s*)?(\d{1,7}(?:[.,]\d{2})?)(?: e (.+))?$/
  );
  if (!price) return null;
  const entrance = price[2]?.match(
    /^(?:faca (?:o )?selo entrar mais cedo|antecipe a entrada do selo)(?: em (\d+(?:[.,]\d+)?)\s*(s|segundos?|ms|milissegundos?))?$/
  );
  if (price[2] && !entrance) return null;
  if (selectedId && (selectedId !== "price" || entrance))
    unsupported("Escolha Composição inteira para editar a oferta.");

  const doc = structuredClone(composition);
  const control = templateControls(doc).find(field => field.id === "price" && field.type === "text");
  if (control?.layers[0]?.type !== "text")
    unsupported("Este modelo precisa da camada Preço novo para alterar a oferta.");
  const value = "R$ " + Number(price[1].replace(",", ".")).toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  setTemplateControl(doc, control.index, value);
  const changes = ["Preço da oferta atualizado para " + value];
  if (entrance) {
    const layers = ["badge", "tag"].map(id => doc.layers.find(layer => layer.id === id));
    if (layers.some(layer => !layer))
      unsupported("Este modelo precisa das camadas Selo e Mensagem do selo para antecipar a entrada.");
    const step = entrance[1] ? round(controlTime(entrance[1].replace(",", ".") + entrance[2])) : .2;
    const starts = layers.map(layer => layer.start - step);
    if (!(step > 0) || starts.some(start => start < 0))
      unsupported("Informe uma antecipação que mantenha as duas camadas do selo depois do início.");
    layers.forEach((layer, index) => { layer.start = starts[index]; });
    changes.push("Selo entra " + step.toLocaleString("pt-BR") + " s mais cedo");
  }
  return { composition: doc, selectedId, changes, summary: changes.join(" · ") };
}

export async function planCompositionEdit({
  prompt,
  composition,
  selectedId = null,
  duration = 4,
  signal,
}) {
  signal?.throwIfAborted();
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 650)
    unsupported("Escreva um pedido de até 650 caracteres.");
  if (!Number.isFinite(duration) || duration <= 0.1)
    unsupported("Defina uma duração válida para a composição.");
  assertComposition(composition);
  const offer = planOfferEdit(composition, prompt, selectedId);
  if (offer) {
    assertComposition(offer.composition);
    return offer;
  }
  const source = titlesFrom(prompt.trim());
  const parts = normalizeClauses(source.text);
  const instructions = parts.map(p => detectInstruction(p, source.titles));
  const result = applyInstructions(
    structuredClone(composition),
    instructions,
    selectedId,
    duration
  );
  assertComposition(result.composition);
  return result;
}

const quantityWords = {
  meio: 0.5,
  meia: 0.5,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
};
export function interpretGroupDuration(prompt) {
  const fail = () =>
    unsupported(
      "Indique uma duração total para a seleção, como “encurte a seleção para seis segundos”."
    );
  if (typeof prompt !== "string" || prompt.length > 200) fail();
  const normalized = canonical(prompt.trim())
    .replace(/[,](?=\d)/g, ".")
    .replace(/[.!?]+$/, "");
  const command = normalized.match(
    /^(?:(?:por favor|quero que|por gentileza|voce pode|pode|por favor,)\s+)*(?:encurt\w*|reduz\w*|ajust\w*|deix\w*|defin\w*|limit\w*|compact\w*|fac[ao]|fazer|mude?|alter\w*)\s+(?:(?:a|o|as|os|todos|todas|das|dos|do|da|em|total|duracao|trecho|clipes?|cenas?|bloco|grupo|selecao|selecionad[oa]s?|juntos|juntas|combinad[oa]s?)\s+)*(?:para(?:\s+ter)?|com|durar|durarem|ate)\s+([\d.,]+|[a-z]+(?: e (?:meio|meia|um|dois|tres|quatro|cinco|seis|sete|oito|nove))?)\s*(s|segundos?|minutos?|min)(?:\s+(?:no total|ao todo|de duracao))?$/
  );
  if (!command) fail();
  const parts = command[1].split(" e ");
  const value = /^\d+(?:\.\d+)?$/.test(command[1])
    ? Number(command[1])
    : parts.reduce((sum, k) => sum + (quantityWords[k] ?? NaN), 0);
  const seconds = value * (command[2].startsWith("min") ? 60 : 1);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) fail();
  return seconds;
}
