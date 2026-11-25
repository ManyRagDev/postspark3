import { elementNames, elementWords } from "./elements.js";
// The model emits drawing instructions. Only this interpreter can change the project.
import {
  CHANNELS,
  EASINGS,
  newLayer,
  setKey,
  assertComposition,
} from "./composition-model.js";

import { colorIn } from "./composition-ai.js";
import { canonical } from "./intent-model.js";

export { canInfer as canUseGenerativeModel } from "./local-inference.js";

const drawable = ["square", "circle", "triangle", ...Object.keys(elementNames), "text"];
const shapeWords = {quadrado: "square", circulo: "circle", triangulo: "triangle", ...elementWords};
const grammar = String.raw`root ::= "[" ws op (ws "," ws op)* ws "]"
op ::= newlayer | key | field | easing | unavailable
newlayer ::= "[\"add\"" sep ref sep kind sep stringval sep stringval "]"
key ::= "[\"key\"" sep ref sep channel sep number sep number sep curve "]"
field ::= "[\"set\"" sep ref sep property sep (number | stringval) "]"
easing ::= "[\"ease\"" sep ref sep channel sep curve "]"
unavailable ::= "[\"unsupported\"]"
ref ::= stringval
kind ::= ${drawable.map(id => JSON.stringify(JSON.stringify(id))).join(" | ")}
channel ::= "\"rotation\"" | "\"scaleX\"" | "\"scaleY\"" | "\"x\"" | "\"y\"" | "\"opacity\"" | "\"reveal\""
curve ::= "\"linear\"" | "\"in\"" | "\"out\"" | "\"inOut\"" | "\"hold\""
property ::= channel | "\"color\"" | "\"text\"" | "\"start\"" | "\"end\"" | "\"width\"" | "\"height\"" | "\"fontSize\""
number ::= "-"? ("0" | [1-9] [0-9]*) ("." [0-9]+)?
stringval ::= "\"" ([^"\\\x00-\x1F] | "\\" ["\\/bfnrt])* "\""
sep ::= ws "," ws
ws ::= [ \t\n\r]*
`;

const channelName = {
  x: "posição X",
  y: "posição Y",
  scaleX: "escala X",
  scaleY: "escala Y",
  rotation: "rotação",
  opacity: "opacidade",
  reveal: "revelação",
};
const fieldName = {
  ...channelName,
  color: "cor",
  text: "texto",
  start: "entrada",
  end: "saída",
  width: "largura",
  height: "altura",
  fontSize: "tamanho da fonte",
};
const reject = message => {
  throw new Error(message);
};

function brief(layer) {
  // Raster data is intentionally omitted. The model can move an image by its layer reference.
  return {
    type: layer.type,
    name: layer.name,
    text: layer.text,
    start: layer.start,
    end: layer.end,
    color: layer.color,
    animated: Object.fromEntries(
      Object.entries(layer.keys)
        .filter(([, keys]) => keys.length)
        .map(([k, keys]) => [
          k,
          keys.slice(0, 10).map(x => [x.t, x.value, x.ease]),
        ])
    ),
    props: Object.fromEntries(
      Object.entries(layer.props).filter(([k, v]) => v !== 1 || k === "scaleX")
    ),
  };
}

export function applyGeneratedOps(
  operations,
  { composition, selectedId = null, duration }
) {
  assertComposition(composition);
  if (
    !Array.isArray(operations) ||
    operations.length === 0 ||
    operations.length > 70
  )
    reject("O modelo devolveu uma sequência de edição inválida.");
  const doc = structuredClone(composition);
  const scoped = selectedId ? doc.layers.find(l => l.id === selectedId) : null;
  if (selectedId && !scoped) reject("A camada selecionada mudou.");
  const targets = new Map(doc.layers.map((l, i) => [String(i), l]));
  const changes = new Set();
  let first;
  for (const op of operations) {
    if (!Array.isArray(op) || op[0] === "unsupported")
      reject(
        "O modelo não conseguiu representar esse pedido com os controles disponíveis."
      );
    const [action, ref, field, value, arg, ease] = op;
    if (action === "add" && op.length === 5) {
      if (
        scoped ||
        typeof ref !== "string" ||
        !/^[a-z][a-z0-9_-]{0,20}$/i.test(ref) ||
        targets.has(ref) ||
        !drawable.includes(field) ||
        typeof value !== "string" ||
        typeof arg !== "string" ||
        !/^#[\da-f]{6}$/i.test(arg)
      )
        reject("O modelo propôs uma criação fora do escopo selecionado.");
      const layer = newLayer(field, duration, {
        color: arg,
        ...(field === "text"
          ? { text: value, name: value.slice(0, 50) || "Título" }
          : value
            ? { name: value.slice(0, 50) }
            : {}),
      });
      doc.layers.push(layer);
      targets.set(ref, layer);
      first ??= layer;
      changes.add("Adicionar " + layer.name + " · " + arg);
      continue;
    }
    const l = targets.get(ref);
    if (!l || (scoped && l.id !== scoped.id))
      reject(
        "A proposta tentou editar outra camada. O projeto foi preservado."
      );
    if (
      action === "key" &&
      op.length === 6 &&
      CHANNELS.includes(field) &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= duration &&
      Number.isFinite(arg) &&
      EASINGS.includes(ease)
    ) {
      setKey(l, field, value, arg, ease);
      changes.add(l.name + " · keyframes de " + channelName[field]);
      continue;
    }
    if (
      action === "ease" &&
      op.length === 4 &&
      CHANNELS.includes(field) &&
      EASINGS.includes(value)
    ) {
      const moving = l.keys[field].filter(k => k.t > 0);
      if (!moving.length)
        reject("A camada ainda não tem um segmento animado nessa propriedade.");
      for (const k of moving) k.ease = value;
      changes.add(l.name + " · curva de " + channelName[field]);
      continue;
    }
    if (
      action === "set" &&
      op.length === 4 &&
      Object.hasOwn(fieldName, field)
    ) {
      if (CHANNELS.includes(field)) l.props[field] = value;
      else if (field === "text" && l.type !== "text")
        reject("Escolha uma camada de texto para alterar a frase.");
      else l[field] = value;
      if (
        (field === "start" || field === "end") &&
        (!Number.isFinite(value) || value < 0 || value > duration)
      )
        reject("O tempo proposto fica fora da cena.");
      changes.add(l.name + " · " + fieldName[field] + " → " + value);
      continue;
    }
    reject(
      "A resposta inclui uma operação desconhecida. Tente descrever uma mudança por vez."
    );
  }
  assertComposition(doc);
  if (JSON.stringify(doc) === JSON.stringify(composition))
    reject("A proposta já corresponde ao estado da composição.");
  return {
    composition: doc,
    selectedId: scoped?.id ?? first?.id ?? null,
    summary: [...changes].join(" · "),
    changes: [...changes],
  };
}

const system = `You create editable motion graphics. Return ONLY a JSON array of operations, in order. Never write code or explanations. The user speaks Portuguese. Time is seconds, frame 540x960, center 270,480. Defaults x=270,y=480,rotation=0, opacity=1,scaleX=scaleY=reveal=1. Reference existing layers by their numeric string index; give each new layer a short letter id. A selected layer is the ONLY editable layer. No selection means the whole composition.
Commands: ["add","a",${drawable.map(id => JSON.stringify(id)).join("|")},"layer name (or exact text for text)","#RRGGBB"]; ["key","a","rotation",0.8,180,"out"] animates property to value at local layer time with specified arrival easing. ["set","a","start",1.2] sets scene entrance. ["ease","0","rotation","out"] adjusts just the existing rotation curve, preserving all values and timing. Use separate scaleX/scaleY; opacity/reveal 0..1. Key times relative to layer start. For a reveal animate reveal from 0 to 1. Only do what was requested. Unsupported -> [["unsupported"]].
Example: "crie um círculo azul que cresce" => [["add","a","circle","Círculo","#397BDF"],["key","a","scaleX",0,0.2,"linear"],["key","a","scaleY",0,0.2,"linear"],["key","a","scaleX",1,1,"out"],["key","a","scaleY",1,1,"out"]]`;

// Short single-shape requests use a compact vocabulary. The model picks a
// motion from the description. The editor expands it into editable keys.
const simpleMotions = {
  grow: { scaleX: [0.2, 1], scaleY: [0.2, 1] },
  shrink: { scaleX: [1, 0.2], scaleY: [1, 0.2] },
  pulse: { scaleX: [1, 1.35, 1], scaleY: [1, 1.35, 1] },
  spin: { rotation: [0, 360] },
  fadeIn: { opacity: [0, 1] },
  fadeOut: { opacity: [1, 0] },
  bounce: { y: [480, 365, 480] },
  float: { y: [480, 445, 480] },
};

function singleShape(prompt) {
  const text = canonical(prompt)
    .trim()
    .replace(/[.!?]+$/, "");
  const match = text.match(/^(?:crie|criar|adicione|desenhe|quero) (?:um|uma) ([a-z]+)(?: (#[a-f0-9]{6}|[a-z]+))? que (.{2,65})$/);
  if (!match || !Object.hasOwn(shapeWords, match[1])) return null;
  if (match[2] && !colorIn(match[2])) return null;
  if (
    /[,;:"“”0-9]|\b(?:e|depois|segundo|enquanto|titulo|texto|quadrado|circulo|triangulo|cor|fundo)\b/.test(
      match[3]
    )
  )
    return null;
  return {
    type: shapeWords[match[1]],
    color: colorIn(match[2] || "") || "#ff693e",
    description: match[3],
  };
}

async function generateSimpleMotion(
  shape,
  params,
  inferMotion,
  signal,
  onProgress
) {
  const choices = [...Object.keys(simpleMotions), "unsupported"];
  const result = await inferMotion({
    system:
      "Translate the Portuguese animation description into one English motion name. grow = get bigger. shrink = get smaller. pulse = grow and return. spin = turn. fadeIn = appear. fadeOut = disappear. bounce = jump. float = hover. Choose unsupported if the motion cannot be described with one name.",
    prompt: shape.description,
    grammar: "root ::= " + choices.map(x => JSON.stringify(x)).join(" | "),
    signal,
    onProgress,
  });
  if (!Object.hasOwn(simpleMotions, result.trim()))
    reject("O modelo não identificou um movimento editável nesse pedido.");
  const movement = simpleMotions[result.trim()];
  const name = { ...elementNames, square: "Quadrado", circle: "Círculo", triangle: "Triângulo" }[
    shape.type
  ];
  const ops = [["add", "a", shape.type, name, shape.color]];
  for (const [channel, values] of Object.entries(movement)) {
    values.forEach((value, index) => {
      const t = (Math.min(params.duration, 1.2) * index) / (values.length - 1);
      ops.push(["key", "a", channel, t, value, index ? "inOut" : "linear"]);
    });
  }
  return applyGeneratedOps(ops, params);
}

export async function planGenerativeEdit({
  prompt,
  composition,
  selectedId = null,
  duration,
  time = 0,
  signal,
  onProgress,
}) {
  const index = composition.layers.findIndex(l => l.id === selectedId);
  const included = selectedId
    ? [[String(index), composition.layers[index]]]
    : composition.layers.slice(0, 12).map((l, i) => [String(i), l]);
  if (selectedId && index < 0) reject("A camada selecionada mudou.");
  if (!selectedId && composition.layers.length > 12)
    reject("Selecione uma camada para editar esta cena com o modelo local.");
  const scene = JSON.stringify({
    duration,
    time,
    selected: index < 0 ? null : String(index),
    layers: Object.fromEntries(included.map(([k, l]) => [k, brief(l)])),
  });
  const { inferMotion } = await import("./local-inference.js");
  const simple = !selectedId && singleShape(prompt);
  if (simple)
    return generateSimpleMotion(
      simple,
      { composition, duration },
      inferMotion,
      signal,
      onProgress
    );
  const result = await inferMotion({
    system,
    prompt: "Scene: " + scene + "\nRequest: " + prompt,
    grammar,
    signal,
    onProgress,
  });
  let ops;
  try {
    ops = JSON.parse(result);
  } catch {
    reject("O modelo não concluiu a proposta. Tente uma instrução mais curta.");
  }
  return applyGeneratedOps(ops, { composition, selectedId, duration });
}
