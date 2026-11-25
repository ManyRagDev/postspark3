"""CPU analysis of one source interval. Run in an isolated process per job."""
import gzip
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys


RUNTIME = Path(os.environ.get("MARE_SPEECH_RUNTIME", "/opt/postspark/mare-lab/engines/speech-v1"))
FFMPEG = os.environ.get("MARE_FFMPEG", str(RUNTIME / "ffmpeg"))
MASK_MAGIC = b"MAREMASK1\n"
MASK_WIDTH, MASK_HEIGHT, MASK_FPS = 144, 256, 15
MASK_MAX_FRAMES = 62 * MASK_FPS


def portrait_filter(width, height):
    # Use display aspect, including non-square pixels, before the centered 9:16 crop.
    return (f"scale=w='if(gte(dar,9/16),ceil({height}*dar/2)*2,{width})':"
            f"h='if(gte(dar,9/16),{height},ceil({width}/dar/2)*2)',"
            f"crop={width}:{height},setsar=1")


def update(phase, value):
    print(json.dumps({"phase": phase, "progress": value}), flush=True)


def decoder(source, start, duration):
    return [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "2",
            "-filter_threads", "1", "-ss", str(start), "-t", str(duration),
            "-protocol_whitelist", "file,pipe", "-i", source]


def recognition(source, start, end, language):
    import numpy as np
    from faster_whisper import WhisperModel
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    update("audio", .03)
    audio = subprocess.run(decoder(source, start, end - start) + [
        "-map", "0:a:0?", "-vn", "-sn", "-dn", "-ac", "1", "-ar", "16000",
        "-f", "s16le", "pipe:1",
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
    result = {"start": start, "end": end, "language": language, "voices": [], "words": []}
    if audio.returncode or not audio.stdout:
        if not audio.stdout and b"does not contain any stream" in audio.stderr:
            return result
        raise ValueError("Não foi possível ler o áudio deste vídeo.")
    samples = np.frombuffer(audio.stdout, dtype="<i2").astype(np.float32) / 32768
    if not len(samples):
        return result

    options = VadOptions(min_silence_duration_ms=260, speech_pad_ms=85)
    chunks = get_speech_timestamps(samples, vad_options=options, sampling_rate=16000)
    result["voices"] = [[max(start, round(start + c["start"] / 16000, 4)),
                         min(end, round(start + c["end"] / 16000, 4))] for c in chunks]
    result["voices"] = [[a,b] for a,b in result["voices"] if b > a]
    if not chunks:
        return result

    update("speech", .12)
    model = WhisperModel(str(RUNTIME / "models/whisper-base"), device="cpu", compute_type="int8",
                         cpu_threads=2, num_workers=1, local_files_only=True)
    segments, info = model.transcribe(samples, language=None if language == "auto" else language,
                                      beam_size=3, word_timestamps=True, vad_filter=True,
                                      vad_parameters=options, condition_on_previous_text=False)
    result["language"] = info.language
    for segment in segments:
        for word in segment.words or []:
            a = max(start, round(start + word.start, 4))
            b = min(end, round(start + word.end, 4))
            text = word.word.strip()[:120]
            if text and a < b:
                result["words"].append({"text": text, "start": a, "end": b})
        update("speech", .14 + .29 * min(1, segment.end / (end - start)))
    result["words"].sort(key=lambda word: word["start"])
    return result


def segmentation(source, start, end):
    import numpy as np
    from ai_edge_litert.interpreter import Interpreter

    update("mask", .48)
    origin = max(0, start - 1)
    expected = min(MASK_MAX_FRAMES, math.ceil((end + 1 - origin) * MASK_FPS))
    interpreter = Interpreter(model_path=str(RUNTIME / "models/selfie.tflite"), num_threads=2)
    interpreter.allocate_tensors()
    feed = interpreter.get_input_details()[0]["index"]
    output = interpreter.get_output_details()[0]["index"]
    border = (256 - MASK_WIDTH) // 2
    picture = np.zeros((1, 256, 256, 3), dtype=np.float32)
    window = picture[0, :, border:border + MASK_WIDTH, :]
    args = decoder(source, origin, expected / MASK_FPS) + [
        "-map", "0:v:0", "-an", "-sn", "-dn", "-vf",
        f"fps={MASK_FPS}:start_time=0,{portrait_filter(MASK_WIDTH, MASK_HEIGHT)}",
        "-threads", "1", "-pix_fmt", "rgb24", "-frames:v", str(expected), "-f", "rawvideo", "pipe:1",
    ]
    count = found = 0
    last = None
    with open("decode.log", "wb") as errors, open("mask.bin", "wb") as file:
        file.write(MASK_MAGIC + b"\0\0")
        with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=errors) as video:
            try:
                with gzip.GzipFile(fileobj=file, mode="wb", compresslevel=3, mtime=0) as zip_file:
                    while count < expected:
                        pixels = video.stdout.read(MASK_WIDTH * MASK_HEIGHT * 3)
                        if not pixels:
                            break
                        if len(pixels) != MASK_WIDTH * MASK_HEIGHT * 3:
                            raise ValueError("A leitura do recorte de pessoa foi interrompida.")
                        window[:] = np.frombuffer(pixels, dtype=np.uint8).reshape(window.shape) / 255
                        interpreter.set_tensor(feed, picture)
                        interpreter.invoke()
                        confidence = interpreter.get_tensor(output)[0, :, border:border + MASK_WIDTH, 0]
                        if np.mean(confidence > .75) >= .015:
                            found += 1
                        alpha = np.clip((confidence - .17) / .69, 0, 1)
                        if last is not None:
                            # Small carry reduces shimmer without holding the matte on fast edges.
                            alpha = .82 * alpha + .18 * last
                        last = alpha
                        zip_file.write(np.rint(255 * alpha).astype(np.uint8).tobytes())
                        count += 1
                        if count % 15 == 0:
                            update("mask", .48 + .49 * count / expected)
                if video.wait(timeout=10) or not count:
                    raise ValueError("Não foi possível decodificar os quadros deste vídeo.")
            finally:
                if video.poll() is None:
                    video.kill()
        file.seek(len(MASK_MAGIC))
        file.write(struct.pack(">H", count))
    if found < max(1, count / 5):
        Path("mask.bin").unlink()
        return {"message": "A pessoa não apareceu com nitidez suficiente para separar o fundo."}
    return {"start": origin, "end": round(origin + count / MASK_FPS, 6)}


def main():
    source, a, b, wants_speech, wants_mask, language = sys.argv[1:]
    start, end = float(a), float(b)
    result = {}
    if wants_speech == "1":
        result["speech"] = recognition(source, start, end, language)
    if wants_mask == "1":
        result["matte"] = segmentation(source, start, end)
    Path("analysis.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        Path("analysis.json").write_text(json.dumps({"message": str(error)}), encoding="utf-8")
        sys.exit(1)
