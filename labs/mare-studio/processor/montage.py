"""Rebuild the portable Maré timeline as a FilmCraft sequence with linked sources."""
import json
import math
import os
import shutil
import struct
from pathlib import Path
from zipfile import ZipFile

from render import BASE, FILM, FPS, check, compile_scene, dump, number, render_scene, runner, validate
from speech_worker import FFMPEG, MASK_MAGIC, MASK_MAX_FRAMES, MASK_WIDTH, MASK_HEIGHT, portrait_filter

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent / "dist/assets"
TRANSITIONS = json.loads((ASSETS / "transitions.json").read_text())
OVERLAY_MEDIA = ROOT / "transition-media"
NODE = os.environ.get("MARE_NODE", str(BASE / "node22.23.4-canvas1.0.5/node"))
TICKS = 254016000000
FRAME = TICKS // FPS
LIMIT = 128 * 1024 * 1024
MASK_BYTES = MASK_MAX_FRAMES * MASK_WIDTH * MASK_HEIGHT + 65536
BUILTINS = {"coast": "coast.mp4", "tide": "tide.mp4", "sound": "sound.wav"}


def transition_spec(previous, clip):
    transition = clip.get("transitionIn")
    if transition is None:
        return None, 0
    check(isinstance(transition, dict) and isinstance(transition.get("type"), str)
          and transition["type"] in TRANSITIONS
          and type(transition.get("frames")) is int and 2 <= transition["frames"] <= 60
          and transition["frames"] % 2 == 0 and isinstance(transition.get("from"), str), "Transição inválida.")
    if previous is None or transition["from"] != previous.get("id"):
        return None, 0
    limit = 2 * math.floor(min(clip["duration"], previous["duration"]) * FPS/2 + 1e-8)
    return transition["type"], min(transition["frames"], limit)


def overlay_frame_index(overlay, frame, frames):
    # Keep the cut's source frame fixed when retiming either half, as in montage-model.js.
    half = frames // 2
    before_cut = frame < half
    start = 0 if before_cut else overlay["cut"]
    end = overlay["cut"] - 1 if before_cut else overlay["frames"] - 1
    offset = frame if before_cut else frame - half
    source = start + math.floor(offset * (end - start) / max(1, half - 1) + .5)
    return min(source, overlay["frames"] - 1 - source) if overlay.get("mirror") else source


def prepare_overlay(work, effect, frames):
    overlay = TRANSITIONS[effect]["overlay"]
    folder = Path("media") / f"{effect}-{frames:02d}"
    if not (work / folder).exists():
        (work / folder).mkdir()
        for frame in range(frames):
            index = overlay_frame_index(overlay, frame, frames)
            source = OVERLAY_MEDIA / effect / f"frame-{index:03d}.webp"
            check(source.is_file(), "A mídia da transição está indisponível neste laboratório.")
            shutil.copyfile(source, work / folder / f"frame-{frame+1:03d}.webp")
    return folder / "frame-001.webp"


def suffix(head):
    if head[4:8] == b"ftyp" or head[4:8] in (b"moov", b"mdat", b"wide", b"free"):
        return ".mp4"
    if head.startswith(b"RIFF") and head[8:12] in (b"WAVE", b"AVI "):
        return ".wav" if head[8:12] == b"WAVE" else ".avi"
    for magic, ext in [(b"\x1a\x45\xdf\xa3", ".webm"), (b"OggS", ".ogg"),
                       (b"fLaC", ".flac"), (b"ID3", ".mp3")]:
        if head.startswith(magic):
            return ext
    if len(head) >= 2 and head[0] == 255 and head[1] & 0xe0 == 0xe0:
        return ".aac" if head[1] & 6 == 0 else ".mp3"
    raise ValueError("Formato de mídia indisponível. Use MP4, WebM, WAV, AAC ou MP3.")


def unpack(work):
    media, images = {}, {}
    (work / "media").mkdir()
    with (work / "montagem.mare").open("rb") as source:
        version = source.read(12)
        check(version in (b"MARESTUDIO1\n", b"MARESTUDIO2\n", b"MARESTUDIO3\n"), "Arquivo de projeto inválido.")
        size = int.from_bytes(source.read(4), "big")
        check(0 < size <= 16 * 1024**2, "Cabeçalho de projeto inválido.")
        meta = json.loads(source.read(size))
        assets, sizes = meta["assets"], meta.get("imageSizes", [])
        check(isinstance(assets, list) and len(assets) <= 112 and isinstance(sizes, list) and len(sizes) <= 64,
              "O projeto excede o limite de mídias e recortes.")
        for i, item in enumerate(assets):
            size, asset = item["size"], item["id"]
            check(type(size) is int and 0 < size <= LIMIT and isinstance(asset, str) and
                  asset not in BUILTINS and asset not in media, "Índice de mídias inválido.")
            data = source.read(size)
            check(len(data) == size, "Mídia incompleta.")
            if item.get("type") == "application/x-mare-mask":
                head = len(MASK_MAGIC)
                check(head + 2 < size <= MASK_BYTES and data.startswith(MASK_MAGIC)
                      and 0 < int.from_bytes(data[head:head+2], "big") <= MASK_MAX_FRAMES, "Arquivo de recorte inválido.")
                ext = ".mask"
            else:
                ext = suffix(data[:32])
            dest = Path("media") / ("asset-%03d" % i + ext)
            (work / dest).write_bytes(data)
            media[asset] = dest
        for i, size in enumerate(sizes):
            check(type(size) is int and 32 <= size <= 8 * 1024**2, "Tamanho de imagem inválido.")
            data = source.read(size)
            check(len(data) == size and data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR"
                  and all(0 < n <= 1600 for n in struct.unpack(">II", data[16:24])), "Imagem PNG inválida.")
            dest = Path("media") / ("image-%03d.png" % i)
            (work / dest).write_bytes(data)
            images["mare-image:" + str(i)] = str((work / dest).resolve())
        check(not source.read(1), "O tamanho do projeto diverge do índice.")
    project = meta["project"]
    if version != b"MARESTUDIO1\n":
        project = dict(project, clips=resolve_compositions(project))
    return project, media, images


def resolve_compositions(project):
    entries, clips = project["compositions"], project["clips"]
    check(isinstance(entries, list) and isinstance(clips, list), "Biblioteca de composições inválida.")
    library = {}
    for entry in entries:
        check(isinstance(entry, dict) and isinstance(entry.get("id"), str)
              and bool(entry["id"]) and entry["id"] not in library
              and isinstance(entry.get("name"), str)
              and number(entry.get("duration"), 1e-9, math.inf), "Dados da composição inválidos.")
        if entry.get("kind") == "composition":
            check(isinstance(entry.get("document"), dict) and "scene" not in entry,
                  "Documento da composição inválido.")
        else:
            check(entry.get("kind") == "wave" and isinstance(entry.get("scene"), dict)
                  and "document" not in entry, "Fonte de animação inválida.")
        library[entry["id"]] = entry
    resolved = []
    for clip in clips:
        check(isinstance(clip, dict) and "composition" not in clip and "scene" not in clip,
              "Clipe inválido na montagem.")
        if clip.get("kind") != "scene":
            check("compositionId" not in clip, "Fonte de vídeo inválida na montagem.")
            resolved.append(clip)
            continue
        reference = clip.get("compositionId")
        entry = library.get(reference) if isinstance(reference, str) else None
        check(entry and number(clip.get("trim"), 0, 86400)
              and number(clip.get("duration"), 1e-9, 60)
              and clip["trim"] + clip["duration"] <= entry["duration"] + 1e-7,
              "O trecho usado pelo clipe precisa estar dentro da composição vinculada.")
        if entry["kind"] == "composition":
            resolved.append(dict(clip, composition=entry["document"]))
        else:
            resolved.append(dict(clip, scene=entry["scene"]))
    return resolved


def check_wave(scene):
    check(isinstance(scene["title"], str) and len(scene["title"]) <= 512 and
          isinstance(scene["color"], str) and len(scene["color"]) <= 16 and
          all(number(scene[k], 0, 100) for k in ("speed", "amplitude", "entry")) and
          isinstance(scene["keys"], list) and len(scene["keys"]) <= 512 and
          all(all(number(key[k], -100000, 100000) for k in ("t", "y", "opacity")) for key in scene["keys"]),
          "Parâmetros da onda inválidos.")


def raster_scene(work, clip, wave, images, frames):
    if "composition" not in clip:
        check_wave(wave)
    else:
        check(isinstance(clip["composition"]["layers"], list) and len(clip["composition"]["layers"]) <= 64,
              "Quantidade de camadas inválida.")
    dump(work / "input.json", {"clip": clip, "scene": wave, "images": images, "frames": frames})
    try:
        runner(work, timeout=360)(NODE, str(ROOT / "raster.mjs"))
    except RuntimeError as exc:
        raise ValueError("Não foi possível desenhar esta cena. Confira as camadas e as imagens.") from exc
    (work / "input.json").unlink()


def script_speech(work, data):
    config = work / "speech-render.json"
    dump(config, data)
    try:
        runner(work, timeout=360)(NODE, str(ROOT / "raster-speech.mjs"), config.name)
    finally:
        config.unlink(missing_ok=True)


def has_look(talk):
    return bool(talk and (talk.get("background") != "original" or talk.get("title") or talk.get("exposure")))


def styled_footage(work, clip, index, source, source_time, frames, before, after, media, images):
    talk = clip.get("talk")
    if not talk or (talk.get("captions") == "off" and not has_look(talk)):
        return source, source_time
    check(os.access(FFMPEG, os.X_OK), "O processador de vídeo falado está indisponível nesta VPS.")
    matte = talk.get("matte")
    mask = media.get(matte["id"]) if has_look(talk) and matte else None
    check(not has_look(talk) or (mask and mask.suffix == ".mask"), "Recorte de pessoa ausente no projeto.")
    image = images.get(talk["image"]["src"]) if talk.get("background") == "image" else None
    check(talk.get("background") != "image" or image, "Imagem de fundo ausente.")
    output = Path("media") / ("fala-%03d.mp4" % (index + 1))
    try:
        script_speech(work, dict(clip=clip, source=str(source), mask=str(mask) if mask else None,
                                 image=image, frames=before + frames + after, start=source_time - before/FPS,
                                 portrait=portrait_filter(540, 960), ffmpeg=FFMPEG, output=str(output)))
    except RuntimeError as error:
        raise ValueError("Não foi possível compor a fala e as camadas deste clipe.") from error
    return output, before / FPS


def montage(work, cursor):
    project, media, images = unpack(work)
    clips, sound = project["clips"], project["sound"]
    check(isinstance(clips, list) and 0 < len(clips) <= 48, "Use de 1 a 48 clipes.")
    check(all(c["kind"] in ("scene", "video") and number(c["duration"], 0.000001, 60)
              and number(c["trim"], 0, 86400) and isinstance(c["name"], str) and len(c["name"]) <= 256
              and ("volume" not in c or (c["kind"] == "video" and number(c["volume"], 0, 1)))
              and ("talk" not in c or (c["kind"] == "video" and isinstance(c["talk"], dict)))
              for c in clips), "Clipes ou cortes inválidos.")
    transitions = [transition_spec(clips[i-1] if i else None, clip) for i, clip in enumerate(clips)]
    has_overlays = any(frames and "overlay" in TRANSITIONS[effect] for effect, frames in transitions)
    total = sum(c["duration"] for c in clips)
    tracks = project.get("extraTracks", [])
    check(isinstance(tracks, list) and len(tracks) <= 2, "Use até cinco pistas no total.")
    count = len(clips)
    for track in tracks:
        check(isinstance(track, dict) and track.get("kind") in ("video", "audio")
              and isinstance(track.get("clips"), list), "Pista inválida.")
        count += len(track["clips"])
        check(count <= 48, "Use até 48 clipes no total.")
        previous_end = 0
        for c in sorted(track["clips"], key=lambda c: c["start"]):
            check(number(c["start"], 0, 60) and c["start"] >= previous_end - 1e-8
                  and number(c["duration"], 1/FPS - 1e-8, 60) and number(c["trim"], 0, 86400)
                  and isinstance(c["assetId"], str) and isinstance(c["name"], str) and len(c["name"]) <= 256,
                  "Intervalo de pista inválido ou sobreposto.")
            check(number(c.get("volume", 1), 0, 1), "Volume de clipe inválido.")
            previous_end = c["start"] + c["duration"]
            total = max(total, previous_end)
    check(total <= 60.000001, "Esta versão do laboratório aceita montagens de até 60 segundos.")
    check(isinstance(sound["enabled"], bool) and number(sound["volume"], 0, 1), "Volume de trilha inválido.")
    run = runner(work, timeout=360)
    project_file = work / "edit.fcproj"
    sources = {}
    doc = ["--project", "edit.fcproj", "--save", "--compact"]

    def command(command_id, **params):
        return json.loads(run(FILM, "exec", command_id, json.dumps(params), *doc))

    def asset_file(asset):
        if asset in BUILTINS:
            dest = Path("media") / BUILTINS[asset]
            if not (work / dest).exists():
                shutil.copyfile(ASSETS / BUILTINS[asset], work / dest)
            return dest
        check(asset in media, "Mídia ausente no arquivo da montagem.")
        return media[asset]

    def import_file(path, sequence=False):
        if path not in sources:
            result = command("file.import", paths=[str(path)], imageSequence=sequence)
            check(not result.get("errors") and len(result["items"]) == 1, "O FilmCraft não conseguiu abrir uma mídia.")
            item = result["items"][0]
            saved = json.loads(project_file.read_text())
            entry = saved["project"]["items"][str(item)]["kind"]["Media"]
            entry["media"]["File"]["path"] = str(path)
            if sequence:
                entry["info"]["video"]["frame_rate"] = {"num": FPS, "den": 1}
                entry["info"]["duration"] = result["imageSequences"][0]["frames"] * FRAME
            dump(project_file, saved)
            sources[path] = item, entry["info"]
        return sources[path]

    def fit_video(placed, video):
        par = video.get("par") or [1, 1]
        scale = 100 * max(540 / (video["width"] * par[0] / par[1]), 960 / video["height"])
        if abs(scale - 100) > 1e-6:
            command("effects.setParam", clip=placed, effect="motion", param="scale", value=scale)

    created = json.loads(run(FILM, "exec", "file.newSequence", json.dumps(dict(
        name=str(project.get("name", "Maré"))[:120], width=540, height=960, fps=FPS,
        video=1 + has_overlays + sum(t["kind"] == "video" for t in tracks),
        audio=2 + sum(t["kind"] == "audio" for t in tracks))),
        "--save-as", "edit.fcproj", "--compact"))
    sequence_id = str(created["sequence"])
    expected = []
    expected_overlays = []
    start = 0.0
    for i, clip in enumerate(clips):
        first = math.ceil(start * FPS - 1e-8)
        end_time = start + clip["duration"]
        end = math.ceil(end_time * FPS - 1e-8)
        source_time = clip["trim"] + max(0, first / FPS - start)
        start = end_time
        if first == end:
            continue
        expected.append((first, end))
        frames = end - first
        sequence = False
        if clip["kind"] == "video":
            path = asset_file(clip["assetId"])
        else:
            folder = Path("scene-%03d" % (i+1))
            dest = work / folder
            dest.mkdir()
            spec = dict(composition=clip.get("composition"), time=source_time, trim=source_time, duration=frames/FPS)
            native = bool(spec["composition"])
            if native:
                try:
                    validate(spec)
                except (KeyError, TypeError, ValueError):
                    native = False
            # The native text layer uses different font metrics and does not fit the preview's text box.
            shared_text = native and "compositionId" in clip and any(
                layer["type"] == "text" for layer in spec["composition"]["layers"])
            if not native or shared_text:
                if shared_text:
                    compile_scene(spec, dest)
                raster_scene(dest, dict(clip, duration=frames/FPS, trim=source_time),
                             clip.get("scene", project.get("scene")), images, frames)
                path, sequence = folder / "frame-00001.jpg", frames > 1
            else:
                render_scene(spec, dest)
                path = folder / "source.mp4"
            source_time = 0
        item, info = import_file(path, sequence)
        video = info.get("video")
        check(video and video["width"] > 0 and video["height"] > 0, "Um clipe está sem vídeo.")
        if clip.get("talk"):
            before = min(int(source_time * FPS + 1e-7), transitions[i][1] // 2)
            end_source = info["duration"] / TICKS
            after = min(max(0, int((end_source - source_time) * FPS + 1e-7) - frames),
                        transitions[i+1][1] // 2 if i+1 < len(transitions) else 0)
            out, source_time = styled_footage(work, clip, i, path, source_time, frames, before, after, media, images)
            if out != path:
                item, info = import_file(out)
                video = info["video"]
        gain = clip.get("volume", 1)
        place = command("timeline.place", item=item, frame=first, duration=frames * FRAME,
                        sourceIn=round(source_time * TICKS), track="V1", audioTrack="A1",
                        audio=gain == 1, matchSequence=False)
        placed = place["clips"][0]
        if 0 < gain < 1 and info.get("audio_streams"):
            audio = command("timeline.place", item=item, frame=first, duration=frames * FRAME,
                            sourceIn=round(source_time * TICKS), track="A1", audio=True,
                            video=False, matchSequence=False)["clips"][0]
            command("clip.audioGain", clips=[audio], mode="set", db=20 * math.log10(gain))
        command("clip.rename", clip=placed, name=clip["name"])
        fit_video(placed, video)
        effect, frames = transitions[i]
        if not frames:
            continue
        preset = TRANSITIONS[effect]
        if "overlay" not in preset:
            command("sequence.applyVideoTransition", clip=placed, effect=effect, frames=frames,
                    edge="in", align="center")
            continue
        path = prepare_overlay(work, effect, frames)
        item, info = import_file(path, sequence=True)
        overlay_start = first - frames // 2
        overlay = command("timeline.place", item=item, frame=overlay_start, duration=frames * FRAME,
                          track="V2", audio=False, matchSequence=False)["clips"][0]
        command("clip.rename", clip=overlay, name=preset["name"])
        fit_video(overlay, info["video"])
        if preset["overlay"]["blend"] == "screen":
            command("effects.setParam", clip=overlay, effect="opacity", param="blend", value="Screen")
        expected_overlays.append((overlay_start, overlay_start + frames))

    next_track = {"video": 1 + has_overlays, "audio": 2}
    for track in tracks:
        kind = track["kind"]
        video_lane = kind == "video"
        next_track[kind] += 1
        target = ("V" if video_lane else "A") + str(next_track[kind])
        for c in track["clips"]:
            first = math.ceil(c["start"] * FPS - 1e-8)
            last = math.ceil((c["start"] + c["duration"]) * FPS - 1e-8)
            path = asset_file(c["assetId"])
            if not video_lane and c.get("narration") and path.suffix == ".mp3":
                # FilmCraft rounds MP3 length down; retain decoder padding and the last timeline frame.
                pcm = path.with_suffix(".narration.wav")
                if not (work / pcm).exists():
                    run(FFMPEG, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
                        "-i", str(path), "-vn", "-af", "apad=pad_dur=0.08", "-t", "61", "-ac", "1",
                        "-ar", "44100", "-c:a", "pcm_s16le", str(pcm))
                path = pcm
            item, info = import_file(path)
            check(info.get("video") if video_lane else info.get("audio_streams"), "A mídia não corresponde à pista.")
            check(round((c["trim"] + c["duration"]) * TICKS) <= info["duration"] + FRAME,
                  "O corte ultrapassa o fim da mídia.")
            result = command("timeline.place", item=item, frame=first, duration=(last-first)*FRAME,
                             sourceIn=round((c["trim"] + first/FPS - c["start"]) * TICKS),
                             track=target, video=video_lane, audio=not video_lane, matchSequence=False)
            placed = result["clips"][0]
            command("clip.rename", clip=placed, name=c["name"])
            if video_lane:
                fit_video(placed, info["video"])
            elif c.get("volume", 1) == 0:
                command("clip.enable", clips=[placed])
            elif c.get("volume", 1) < 1:
                command("clip.audioGain", clips=[placed], mode="set", db=20 * math.log10(c["volume"]))

    end = math.ceil(total * FPS - 1e-8)
    if sound.get("assetId"):
        item, info = import_file(asset_file(sound["assetId"]))
        check(info["audio_streams"] and info["duration"] > 0, "A trilha selecionada está sem áudio.")
        length, stop = info["duration"], end * FRAME
        check(math.ceil(stop / length) <= 512, "Use uma trilha mais longa para esta montagem.")
        # timeline.place snaps audio edits to video frames. Use its native clip as the
        # template, then position each repeat in FilmCraft ticks at the source sample boundary.
        command("timeline.place", item=item, track="A2", frame=0, video=False)
        gain = 20 * math.log10(sound["volume"]) if sound["volume"] else -96
        command("timeline.setTrack", track="A2", muted=not sound["enabled"] or sound["volume"] == 0, volumeDb=gain)
        saved = json.loads(project_file.read_text())
        native = saved["project"]
        bed = native["items"][sequence_id]["kind"]["Sequence"]["audio_tracks"][1]["items"]
        template, = bed
        bed.clear()
        for tick in range(0, stop, length):
            clip_id = template["id"] if tick == 0 else native["next_id"]
            if tick:
                native["next_id"] += 1
            bed.append(dict(template, id=clip_id, start=tick, duration=min(length, stop - tick)))
        dump(project_file, saved)

    if any(c.get("talk") for c in clips):
        script_speech(work, {"clips": [{key: c[key] for key in ("duration", "trim", "talk") if key in c} for c in clips]})
        if (work / "legendas.srt").is_file():
            languages = {c["talk"]["speech"]["language"] for c in clips
                         if c.get("talk", {}).get("captions") in ("classic", "highlight")}
            language = next(iter(languages)) if len(languages) == 1 else "und"
            imported = command("captions.import", path="legendas.srt", name="Legendas editáveis", language=language)
            # Styled caption pixels are already in the derived media. The separate track is editable.
            command("captions.setTrack", track=imported["track"], enabled=False)

    layout = json.loads(run(FILM, "inspect", "sequence", "--project", "edit.fcproj", "--compact"))
    actual = [(c["startFrame"], c["endFrame"]) for c in layout["video"][0]["items"]]
    check(actual == expected and layout["durationFrames"] == end,
          "O motor não conseguiu reproduzir um corte com a duração solicitada.")
    if has_overlays:
        actual_overlays = [(c["startFrame"], c["endFrame"]) for c in layout["video"][1]["items"]]
        check(actual_overlays == expected_overlays, "O motor não conseguiu posicionar uma sobreposição.")
    frame = min(end - 1, max(0, round(cursor * FPS)))
    run(FILM, "render", "--seconds", str(frame/FPS), "--out", "preview.png", "--project", "edit.fcproj")
    audio = any(track["items"] and not track["muted"] for track in layout["audio"])
    run(FILM, "export", "final.mp4", "--project", "edit.fcproj", "--settings", '{"h264Profile":"baseline"}', "--format", "h264", "--gpu-rendering", "off",
        *([] if audio else ["--no-audio"]))
    dump(work / "render.json", dict(width=540, height=960, fps=FPS, frames=end, previewFrame=frame,
                                    cuts=actual, audio=audio))
    with ZipFile(work / "projects.zip", "w") as archive:
        for name in ["montagem.mare", "edit.fcproj", "preview.png", "render.json", "final.mp4"]:
            archive.write(work / name, name)
        if (work / "legendas.srt").is_file():
            archive.write(work / "legendas.srt", "legendas.srt")
        for file in sorted((work / "media").rglob("*")):
            if file.is_file():
                archive.write(file, file.relative_to(work))
        for folder in sorted(work.glob("scene-*")):
            for file in sorted(folder.iterdir()):
                if file.is_file() and file.suffix in (".ecproj", ".mp4", ".jpg"):
                    archive.write(file, file.relative_to(work))
