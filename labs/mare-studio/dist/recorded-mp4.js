import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from "./vendor/mediabunny-1.66.4.js";

// MediaRecorder emits fragmented MP4. Repack compatible tracks for seeking
// and let the frame exporter handle unexpected platform encoder choices.
export async function finalizeRecordedMp4(recording, hasAudio, signal) {
  const input = new Input({formats: ALL_FORMATS, source: new BlobSource(recording)});
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video || !/^avc1\.42/i.test(await video.getCodecParameterString()) ||
        (await video.getColorSpace()).fullRange !== false ||
        (hasAudio && (!audio || await audio.getCodecParameterString() !== "mp4a.40.2"))) return null;
    const target = new BufferTarget();
    const output = new Output({format: new Mp4OutputFormat({fastStart: "in-memory"}), target});
    const conversion = await Conversion.init({input, output});
    if (!conversion.isValid || conversion.discardedTracks.length) return null;
    const cancel = () => { void conversion.cancel(); };
    signal?.throwIfAborted();
    signal?.addEventListener("abort", cancel, {once: true});
    try {
      await conversion.execute();
      return new Blob([target.buffer], {type: "video/mp4"});
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  } catch {
    signal?.throwIfAborted();
    return null;
  } finally {
    input.dispose();
  }
}
