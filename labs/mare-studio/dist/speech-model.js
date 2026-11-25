import { FPS } from "./montage-model.js";

export const TALK_DEFAULTS = Object.freeze({
  captions: "off", accent: "#ff784d", background: "original", color: "#26464d",
  title: "", titleY: .32, exposure: 0,
});
export const HESITATIONS = "ahn, hum, ãh, éé";
const frame = 1 / FPS;
const epsilon = 1e-7;
const color = /^#[0-9a-f]{6}$/i;
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const string = (value, size) => typeof value === "string" && value.length <= size;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function needsMatte(talk) {
  return Boolean(talk && (talk.background !== "original" || talk.title || talk.exposure));
}

export function validateTalk(talk) {
  if (!talk || !["off", "classic", "highlight"].includes(talk.captions) ||
      !["original", "blur", "solid", "gradient", "image"].includes(talk.background) ||
      !color.test(talk.color) || !color.test(talk.accent) || !string(talk.title, 80) ||
      !number(talk.titleY, .12, .8) || !number(talk.exposure, -1, 1))
    throw Error("Ajustes de vídeo falado inválidos.");
  if (talk.image && (typeof talk.image.src !== "string" ||
      !/^(?:data:image\/png;base64,iVBORw0KGgo|mare-image:\d+$)/.test(talk.image.src) ||
      talk.image.src.length > 12 * 1024 * 1024)) throw Error("Imagem de fundo inválida.");
  if (talk.background === "image" && !talk.image) throw Error("Escolha uma imagem de fundo.");
  if (talk.matte && (typeof talk.matte.id !== "string" || !talk.matte.id ||
      !number(talk.matte.start, 0, 86400) ||
      !number(talk.matte.end, talk.matte.start + .06, talk.matte.start + 62.1)))
    throw Error("Recorte de pessoa inválido.");
  if (needsMatte(talk) && !talk.matte) throw Error("Detecte a pessoa antes de aplicar o visual.");
  if (talk.captions !== "off" && !talk.speech) throw Error("Gere a transcrição antes de aplicar as legendas.");
  if (talk.speech) validateSpeech(talk.speech);
  return talk;
}

function validateSpeech(speech) {
  const {start, end, words, voices, language} = speech;
  if (!number(start, 0, 86400) || !number(end, start + .03, start + 60.000001) ||
      !string(language, 12) || !Array.isArray(words) || words.length > 1500 ||
      !Array.isArray(voices) || voices.length > 600 ||
      !words.every((word, index) => word && string(word.text, 160) && word.text.trim() &&
        number(word.start, index ? words[index - 1].start : start - epsilon, end) &&
        number(word.end, word.start + epsilon, end + epsilon)) ||
      !voices.every((voice, index) => Array.isArray(voice) && voice.length === 2 &&
        number(voice[0], index ? voices[index - 1][1] : start - epsilon, end) &&
        number(voice[1], voice[0] + epsilon, end + epsilon)))
    throw Error("Transcrição ou intervalos de fala inválidos.");
}

export function coversClip(range, clip, tolerance = .002) {
  return Boolean(range && range.start <= clip.trim + tolerance &&
    range.end >= clip.trim + clip.duration - tolerance);
}

export function captionCues(speech, trim, duration) {
  if (!speech?.words.length) return [];
  const end = trim + duration;
  const cues = [];
  let line = [];
  const flush = () => {
    if (!line.length) return;
    cues.push({words: line, start: line[0].start, end: line.at(-1).end,
      text: line.map(word => word.text).join(" ")});
    line = [];
  };
  speech.words.forEach((word, index) => {
    const center = (word.start + word.end) / 2;
    if (center < trim - epsilon || center >= end - epsilon) return;
    const previous = line.at(-1);
    if (previous && (word.start - previous.end > .4 || /[.!?…]$/.test(previous.text) ||
        line.length >= 6 || word.end - line[0].start > 2.8 ||
        line.reduce((n, entry) => n + entry.text.length + 1, word.text.length) > 32)) flush();
    line.push({...word, index, start: Math.max(trim, word.start), end: Math.min(end, word.end)});
  });
  flush();
  return cues.map((cue, index) => ({...cue, end: Math.min(end, cues[index + 1]?.start ?? end,
    Math.max(cue.start + .25, cue.end + .12))})).filter(cue => cue.end - cue.start >= .001);
}

export function rewriteCue(speech, cue, text) {
  const first = cue.words[0].index, count = cue.words.length;
  const original = speech.words.slice(first, first + count);
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const start = original[0].start;
  const end = Math.min(original.at(-1).end, speech.words[first + count]?.start ?? Infinity);
  const words = tokens.map((word, index) => tokens.length === count
    ? {...original[index], text: word}
    : {text: word, start: start + (end - start) * index / tokens.length,
      end: start + (end - start) * (index + 1) / tokens.length});
  return {...speech, words: [...speech.words.slice(0, first), ...words, ...speech.words.slice(first + count)]};
}

const normalize = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const wordsOf = value => normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];

function matchingWords(words, expression) {
  const query = wordsOf(expression);
  if (!query.length) return [];
  const normalized = words.map(word => wordsOf(word.text).join(" "));
  return words.flatMap((word, index) => query.every((text, offset) => normalized[index + offset] === text)
    ? [[word.start, words[index + query.length - 1].end]] : []);
}

function merge(ranges) {
  const merged = [];
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1] + epsilon) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function remaining(start, end, ranges) {
  const result = [];
  for (const [a, b] of ranges) {
    if (b <= start || a >= end) continue;
    if (a > start) result.push([start, a]);
    start = Math.max(start, b);
  }
  if (end > start) result.push([start, end]);
  return result;
}

export function suggestExcerpt(speech, clip, target = 20) {
  const words = speech.words.filter(word => word.start >= clip.trim && word.end <= clip.trim + clip.duration + epsilon);
  const blocks = [];
  let first = 0;
  words.forEach((word, index) => {
    if (/[.!?…]$/.test(word.text) || !words[index + 1] || words[index + 1].start - word.end > .8) {
      blocks.push(words.slice(first, index + 1));
      first = index + 1;
    }
  });
  const candidates = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i; j < blocks.length; j++) {
      const start = Math.max(clip.trim, blocks[i][0].start - .18);
      const end = Math.min(clip.trim + clip.duration, blocks[j].at(-1).end + .22);
      const duration = end - start;
      if (duration > Math.min(40, target * 1.5)) break;
      if (duration < Math.min(6, target * .6) || duration >= clip.duration - frame) continue;
      const fragment = blocks.slice(i, j + 1).flat();
      const text = fragment.map(word => word.text).join(" ");
      const hook = /\?|\b(?:descubra|segredo|aprenda|motivo|por que|sabia|importante|dica)\b/i.test(text.slice(0, 140));
      const complete = /[.!?]$/.test(text);
      const score = (complete ? 2 : 0) + (hook ? 2 : 0) + Math.min(3, fragment.length / duration)
        - Math.abs(duration - target) / 4;
      candidates.push({start, end, text, score});
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

export function planSpeechCuts(clip, talk, options) {
  const speech = talk.speech;
  const start = clip.trim, end = start + clip.duration;
  const words = speech?.words.filter(word => (word.start + word.end) / 2 >= start &&
    (word.start + word.end) / 2 < end) ?? [];
  const ranges = (options.manual ?? []).map(range => [...range]);
  if (options.pauses && coversClip(speech, clip)) {
    const voiced = merge([...speech.voices.map(range => [...range]), ...words.map(word => [word.start, word.end])]
      .map(([a,b]) => [Math.max(a,start), Math.min(b,end)]).filter(([a,b]) => b > a));
    if (voiced.length) {
      for (const [a,b] of remaining(start, end, voiced)) {
        if (b - a >= options.minimum) ranges.push([
          a <= start + epsilon ? start : a + options.margin,
          b >= end - epsilon ? end : b - options.margin,
        ]);
      }
    }
  }
  for (const filler of options.fillers ?? []) ranges.push(...matchingWords(words, filler));
  const found = options.phrase ? matchingWords(words, options.phrase) : [];
  ranges.push(...found);
  if (options.excerpt) ranges.push([start, options.excerpt.start], [options.excerpt.end, end]);
  // Keep cuts on the frame grid inside the selected intervals. Avoid touching adjacent syllables.
  const snapped = ranges.map(([a,b]) => [
    clamp(start + Math.ceil((a - start) * FPS - epsilon) / FPS, start, end),
    b >= end - epsilon ? end : clamp(start + Math.floor((b - start) * FPS + epsilon) / FPS, start, end),
  ]).filter(([a,b]) => b - a >= frame - epsilon);
  const cuts = merge(snapped);
  return {cuts, found: found.length, removed: cuts.reduce((n,[a,b]) => n + b - a, 0)};
}

export function applySpeechEdit(project, clip, talk, cuts, rippleExtra, uid = () => crypto.randomUUID()) {
  validateTalk(talk);
  const index = project.clips.indexOf(clip);
  if (index < 0) throw Error("O clipe mudou. Abra a edição automática novamente.");
  const clips = [...project.clips];
  if (!cuts.length) {
    clips[index] = {...clip, talk};
    return {...project, clips};
  }
  const kept = remaining(clip.trim, clip.trim + clip.duration, cuts).filter(([a,b]) => b - a >= frame - epsilon);
  if (!kept.length) throw Error("Mantenha pelo menos um quadro do clipe.");
  const replacements = kept.map(([start, end], i) => {
    const next = {...clip, talk, trim: start, duration: end - start, id: i ? uid() : clip.id};
    if (i) delete next.transitionIn;
    return next;
  });
  const following = clips[index + 1];
  if (following?.transitionIn?.from === clip.id)
    clips[index + 1] = {...following, transitionIn: {...following.transitionIn, from: replacements.at(-1).id}};
  const timelineStart = clips.slice(0, index).reduce((n, item) => n + item.duration, 0);
  clips.splice(index, 1, ...replacements);
  const timelineCuts = cuts.map(([a,b]) => [timelineStart + a - clip.trim, timelineStart + b - clip.trim]);
  const offset = time => timelineCuts.reduce((n,[a,b]) => n + clamp(time - a, 0, b - a), 0);
  const extraTracks = rippleExtra ? (project.extraTracks ?? []).map(track => ({...track,
    clips: track.clips.flatMap(item => remaining(item.start, item.start + item.duration, timelineCuts)
      .filter(([a,b]) => b - a >= frame - epsilon)
      .map(([a,b], i) => ({...item, id: i ? uid() : item.id, start: a - offset(a),
        trim: item.trim + a - item.start, duration: b - a}))),
  })) : project.extraTracks;
  if (clips.length + (extraTracks ?? []).reduce((n, track) => n + track.clips.length, 0) > 48)
    throw Error("Os cortes ultrapassam 48 clipes. Revise a seleção.");
  return {...project, clips, extraTracks};
}

const srtTime = value => {
  const ms = Math.max(0, Math.round(value * 1000));
  return [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
    .map(n => String(n).padStart(2, "0")).join(":") + "," + String(ms % 1000).padStart(3, "0");
};

export function montageSrt(clips) {
  const entries = [];
  let offset = 0;
  for (const clip of clips) {
    if (clip.talk?.captions && clip.talk.captions !== "off") {
      for (const cue of captionCues(clip.talk.speech, clip.trim, clip.duration)) {
        entries.push((entries.length + 1) + "\n" + srtTime(offset + cue.start - clip.trim) + " --> " +
          srtTime(offset + cue.end - clip.trim) + "\n" + cue.text.replace(/[\r\n]+/g, " ") + "\n");
      }
    }
    offset += clip.duration;
  }
  return entries.join("\n");
}
