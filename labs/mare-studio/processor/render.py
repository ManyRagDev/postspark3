"""Compile a Maré vector scene to native projects in a disposable working directory."""
import json
import math
import os
import re
import subprocess
from pathlib import Path
from zipfile import ZipFile

BASE = Path("/opt/postspark/mare-lab/engines")
EFFECT = os.environ.get("MARE_EFFECT", str(BASE / "effectcraft-0.24.1/usr/bin/effectcraft-cli"))
FILM = os.environ.get("MARE_FILM", str(BASE / "filmcraft-0.20.1/usr/bin/filmcraft-cli"))
ELEMENTS = json.loads((Path(__file__).resolve().parents[1] / "dist/assets/elements.json").read_text())
FPS = 30
RANGES = {"x": (-10000, 10000), "y": (-10000, 10000), "scaleX": (0, 100),
          "scaleY": (0, 100), "rotation": (-36000, 36000), "opacity": (0, 1), "reveal": (0, 1)}


def check(condition, message):
    if not condition:
        raise ValueError(message)


def number(n, low, high):
    return type(n) in (float, int) and low <= n <= high and math.isfinite(n)


def validate(spec):
    c = spec["composition"]
    check("template" not in c, "Use a exportação com as mídias para modelos do Maré.")
    check(c["version"] == 1 and re.fullmatch("#[0-9a-fA-F]{6}", c["background"]), "Composição inválida.")
    check(number(spec["duration"], 1 / FPS, 15) and number(spec["trim"], 0, 86400)
          and number(spec["time"], 0, 86400), "O laboratório aceita cenas de até 15 segundos.")
    check(isinstance(c["layers"], list) and 1 <= len(c["layers"]) <= 12, "Use de uma a doze camadas.")
    for layer in c["layers"]:
        check(not any(key in layer for key in ("wrap", "fit", "revealFrom", "outline", "wave")),
              "Use a exportação com as mídias para esta camada.")
        check(layer["type"] in ("triangle", "circle", "square", "text") or layer["type"] in ELEMENTS, "A VPS aceita formas e títulos.")
        check(isinstance(layer["name"], str) and len(layer["name"]) <= 256 and
              re.fullmatch("#[0-9a-fA-F]{6}", layer["color"]), "Nome ou cor inválidos.")
        check(number(layer["start"], 0, 86400) and number(layer["end"], layer["start"], 86400),
              "Intervalo da camada inválido.")
        check(all(number(layer[k], 1, 8000) for k in ("width", "height")) and
              number(layer["fontSize"], 1, 960), "Dimensões inválidas.")
        check(isinstance(layer["text"], str) and len(layer["text"]) <= 256 and
              not any(ord(c) < 32 for c in layer["text"]), "Use títulos de uma linha com até 256 caracteres.")
        for channel, limits in RANGES.items():
            keys = layer["keys"][channel]
            check(number(layer["props"][channel], *limits) and isinstance(keys, list) and len(keys) <= 128,
                  "Propriedade ou quantidade de keyframes inválida.")
            previous = -1
            for key in keys:
                check(number(key["t"], 0, 86400) and previous < key["t"] and number(key["value"], *limits)
                      and valid_ease(key["ease"]), "Keyframe inválido.")
                previous = key["t"]


def valid_ease(ease):
    if isinstance(ease, list):
        return (len(ease) == 4 and number(ease[0], 0, 1) and number(ease[2], 0, 1)
                and number(ease[1], -3, 4) and number(ease[3], -3, 4))
    return ease in ("linear", "hold", "in", "out", "inOut")


def bezier_weight(t, ease):
    def cubic(u, a, b):
        return 3 * (1 - u) * u * ((1 - u) * a + u * b) + u ** 3

    if t <= 0 or t >= 1:
        return t
    low, high = 0., 1.
    for _ in range(26):
        u = (low + high) / 2
        if cubic(u, ease[0], ease[2]) < t:
            low = u
        else:
            high = u
    return cubic((low + high) / 2, ease[1], ease[3])


def evaluate(layer, channel, time):
    value, start = layer["props"][channel], 0
    for key in layer["keys"][channel]:
        if time < key["t"]:
            f = (time - start) / (key["t"] - start)
            ease = key["ease"]
            if ease == "hold":
                f = 0
            elif ease == "in":
                f = f * f
            elif ease == "out":
                f = 1 - (1 - f) ** 2
            elif ease == "inOut":
                f = f * f * (3 - 2 * f)
            elif isinstance(ease, list):
                f = bezier_weight(f, ease)
            low, high = RANGES[channel]
            return min(high, max(low, value + (key["value"] - value) * f))
        value, start = key["value"], key["t"]
    return value


def frame_count(spec):
    return math.ceil(spec["duration"] * FPS - 1e-8)


def commands(spec):
    ops = []

    def add(cmd, **params):
        ops.append({"command": cmd, "params": params})

    count, trim = frame_count(spec), spec["trim"]
    comp = spec["composition"]
    add("comp.new", name="Main", width=540, height=960, frameRate=FPS, duration=count/FPS, background=comp["background"])
    for layer in comp["layers"]:
        first = max(0, math.ceil((layer["start"] - trim) * FPS - 1e-8))
        end = min(count, math.ceil((layer["end"] - trim) * FPS - 1e-8))
        if end <= first:
            continue
        w, h = layer["width"], layer["height"]
        attrs = dict(name=layer["name"], position=[270, 480])
        if layer["type"] == "text":
            add("layer.newText", **attrs, text=layer["text"], size=layer["fontSize"],
                font="Inter", style="Bold", fill=layer["color"], justify="center")
            add("prop.set", path="transform/anchor", value=[0, -layer["fontSize"] * .33])
        elif layer["type"] in ELEMENTS:
            add("layer.newShape", **attrs, kind="none")
            points = ELEMENTS[layer["type"]]["points"]
            add("shape.newPath", vertices=[[(x/100-.5)*w, (y/100-.5)*h] for x, y in points],
                closed=True, space="layer", fill=layer["color"], stroke=False)
        elif layer["type"] == "triangle":
            add("layer.newShape", **attrs, kind="none")
            add("shape.newPath", vertices=[[0, -h/2], [w/2, h/2], [-w/2, h/2]],
                closed=True, space="layer", fill=layer["color"], stroke=False)
        else:
            add("layer.newShape", **attrs, kind="ellipse" if layer["type"] == "circle" else "rect",
                size=[w,h], fill=layer["color"], strokeWidth=0)

        def animate(path, channels, factor=1, offset=0):
            marks = {round((layer["start"] + k["t"] - trim) * FPS)
                     for ch in channels for k in layer["keys"][ch]}
            frames = range(first, end) if marks else [first]
            samples = [tuple(round(offset + factor * evaluate(layer, ch, max(0, trim + i/FPS - layer["start"])), 6)
                             for ch in channels) for i in frames]
            for j, vals in enumerate(samples):
                i = j + first
                value = vals[0] if len(vals) == 1 else list(vals)
                if j == 0:
                    add("prop.set", path=path, value=value)
                if not marks:
                    continue
                if 0 < j < len(samples)-1 and i not in marks:
                    if all(abs(a + c - 2*b) < 0.00001 for a,b,c in zip(samples[j-1], vals, samples[j+1])):
                        continue
                add("prop.addKey", path=path, time=i/FPS, timeBase="comp", value=value)

        animate("transform/position", ["x", "y"])
        animate("transform/scale", ["scaleX", "scaleY"], 100)
        animate("transform/rotation", ["rotation"])
        animate("transform/opacity", ["opacity"], 100)
        if layer["keys"]["reveal"] or layer["props"]["reveal"] != 1:
            add("effect.apply", effect="Linear Wipe")
            animate("effects/#1/completion", ["reveal"], -100, 100)
        add("layer.timing", **{"in": first/FPS, "out": end/FPS})
    return ops


def runner(work, timeout=100):
    work = work.resolve()
    env = dict(os.environ, HOME=str(work), XDG_CACHE_HOME=str(work / "cache"), RAYON_NUM_THREADS="2")

    def run(*args):
        p = subprocess.run(args, cwd=work, env=env, capture_output=True, timeout=timeout)
        if p.returncode:
            raise RuntimeError((p.stderr or p.stdout).decode(errors="replace")[-600:])
        return p.stdout

    return run


def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def compile_scene(spec, work):
    validate(spec)
    run = runner(work)
    ops = commands(spec)
    check(len(ops) <= 6000, "Esta animação excede o limite de keyframes da VPS.")
    dump(work / "commands.json", ops)
    result = json.loads(run(EFFECT, "run", "--commands", "commands.json", "--empty", "--save-as", "scene.ecproj", "--json"))
    if isinstance(result, list) and any(r.get("error") or r.get("ok") is False for r in result):
        raise RuntimeError(str(next(r for r in result if r.get("error") or r.get("ok") is False))[:400])


def render_scene(spec, work, preview=False):
    compile_scene(spec, work)
    run = runner(work)
    frame = min(frame_count(spec)-1, max(0, round((spec["time"] - spec["trim"]) * FPS)))
    if preview:
        run(EFFECT, "render-frame", "--project", "scene.ecproj", "--time", str(frame/FPS), "--out", str(work/"preview.png"))
    run(EFFECT, "render", "--project", "scene.ecproj", "--out", str(work/"source.mp4"), "--format", "h264",
        "--audio", "off", "--fps", str(FPS))
    return frame


def render(spec, work):
    frame = render_scene(spec, work, preview=True)
    run = runner(work)
    imported = json.loads(run(FILM, "import", "source.mp4", "--save-as", "edit.fcproj", "--compact"))
    if imported.get("errors") or len(imported["items"]) != 1:
        raise RuntimeError("FilmCraft não importou a composição.")
    run(FILM, "exec", "file.newSequence", json.dumps({"fromItem": imported["items"][0], "name": "Maré"}),
        "--project", "edit.fcproj", "--save", "--compact")
    # FilmCraft records an absolute import path. Store the bundled media alongside the project.
    edit = json.loads((work / "edit.fcproj").read_text())
    media = edit["project"]["items"][str(imported["items"][0])]["kind"]["Media"]["media"]["File"]
    media["path"] = "source.mp4"
    dump(work / "edit.fcproj", edit)
    sequence = json.loads(run(FILM, "inspect", "sequence", "--project", "edit.fcproj", "--compact"))
    if sequence["durationFrames"] != frame_count(spec):
        raise RuntimeError("A duração exportada diverge da composição.")
    run(FILM, "export", "final.mp4", "--project", "edit.fcproj", "--settings", '{"h264Profile":"baseline"}', "--no-audio", "--format", "h264", "--gpu-rendering", "off")
    dump(work / "scene.json", spec)
    dump(work / "render.json", dict(frames=frame_count(spec), previewFrame=frame, fps=FPS, width=540, height=960))
    with ZipFile(work / "projects.zip", "w") as archive:
        for name in ("scene.json", "scene.ecproj", "edit.fcproj", "source.mp4", "preview.png", "final.mp4", "render.json"):
            archive.write(work/name, arcname=name)
