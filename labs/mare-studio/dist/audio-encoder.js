import { getFirstEncodableAudioCodec } from "./vendor/mediabunny-1.66.4.js";

let softwareEncoder;
export async function chooseAacEncoder(config) {
  if (await getFirstEncodableAudioCodec(["aac"], config)) return "aac";
  try {
    softwareEncoder ??= import("./vendor/aac-encoder-1.66.4.js")
      .then(module => module.registerAacEncoder());
    await softwareEncoder;
    return await getFirstEncodableAudioCodec(["aac"], config);
  } catch {
    softwareEncoder = undefined;
    return null;
  }
}
