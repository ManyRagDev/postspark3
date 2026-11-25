import { speechCommands } from "./speech-commands.js";
import {
  TALK_DEFAULTS,
  HESITATIONS,
  coversClip,
  needsMatte,
  planSpeechCuts,
  suggestExcerpt,
} from "./speech-model.js";

export function speechSettings(commands, talk, clip, settings, report) {
  for (const { id, params = {} } of commands) {
    if (id === speechCommands.captions && talk.speech?.words.length)
      talk.captions = params.style ?? "highlight";
    if (id === speechCommands.pauses) {
      settings.pauses = true;
      if (Number.isFinite(params.minimum)) settings.minimum = Math.max(0.25, Math.min(8, params.minimum));
    }
    if (id === speechCommands.fillers) settings.useFillers = true;
    if (id === speechCommands.phrase) settings.phrase = params.phrase;
    if (id === speechCommands.excerpt && talk.speech) {
      settings.excerpt = suggestExcerpt(talk.speech, clip, Math.max(5, Math.min(35, params.target ?? 20)));
      if (!settings.excerpt) report("A fala deste trecho é curta para sugerir um recorte.");
    }
  }
}

export function prepareSpeech(clip, actions, options = {}, analysis = {}) {
  const talk = { ...TALK_DEFAULTS, ...clip.talk };
  if (analysis.speech) talk.speech = analysis.speech;
  if (analysis.matte) talk.matte = analysis.matte;
  for (const { id, params } of actions) {
    if (id !== speechCommands.look) continue;
    const fields = ["background", "color", "title", "exposure", "titleY", "accent", "image"];
    if (Object.keys(params).some(k => !fields.includes(k)))
      throw Error("Propriedade de vídeo falado desconhecida.");
    Object.assign(talk, params);
  }
  if (actions.some(a => a.id !== speechCommands.look) && !coversClip(talk.speech, clip))
    throw Error("Analise a fala deste clipe e indique o trabalho de análise.");
  if (needsMatte(talk) && !coversClip(talk.matte, clip, 0.08))
    throw Error("Analise o recorte da pessoa antes de alterar o fundo.");
  const settings = {
    pauses: false,
    minimum: options.minimum ?? 0.8,
    margin: options.margin ?? 0.15,
    useFillers: false,
  };
  speechSettings(actions, talk, clip, settings, message => {
    throw Error(message);
  });
  const plan = planSpeechCuts(clip, talk, {
    ...settings,
    manual: options.manual ?? [],
    fillers: settings.useFillers ? (options.fillers ?? HESITATIONS.split(",")) : [],
  });
  if (settings.phrase && !plan.found) throw Error("A frase não foi encontrada na transcrição.");
  const cuts = plan.cuts.filter(
    ([start, end]) => !options.omitted?.some(([a, b]) => a === start && b === end)
  );
  return { talk, cuts, ripple: options.ripple ?? true };
}
