#!/usr/bin/env python3
"""Exercise the actual installed CLI with synthetic images; no PostSpark integration.

Uses only the Python standard library. No DISPLAY, GPU, network or user photos needed.
Temporary inputs, native documents and outputs are removed on success and failure.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib


def write_fixture(path, with_subject=True):
    width = height = 256
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # PNG filter: None.
        for x in range(width):
            # A high-contrast subject on a uniform backdrop, deliberately simple.
            inside = with_subject and ((x - 128) / 61) ** 2 + ((y - 128) / 83) ** 2 < 1
            raw.extend((195 + x % 20, 32 + y % 24, 36, 255) if inside else (244, 244, 244, 255))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def read_png(path):
    """Decode only the bounded RGB/RGBA8, non-interlaced PNGs made by this check."""
    png = path.read_bytes()
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Output is not a PNG")
    offset, compressed, header = 8, bytearray(), None
    while offset < len(png):
        size = struct.unpack(">I", png[offset:offset + 4])[0]
        kind, data = png[offset + 4:offset + 8], png[offset + 8:offset + 8 + size]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", data)
        elif kind == b"IDAT":
            compressed.extend(data)
        offset += size + 12
    if header is None:
        raise ValueError("Missing IHDR")
    w, h, depth, colour, compression, filtering, interlace = header
    if (w > 1024 or h > 1024 or depth != 8 or colour not in (2, 6)
            or (compression, filtering, interlace) != (0, 0, 0)):
        raise ValueError(f"Unexpected smoke-test PNG: {header}")
    channels = 4 if colour == 6 else 3
    stride = w * channels
    raw = zlib.decompress(compressed)
    if len(raw) != h * (stride + 1):
        raise ValueError("Unexpected PNG pixel count")

    def paeth(a, b, c):
        p = a + b - c
        distances = (abs(p - a), abs(p - b), abs(p - c))
        return (a, b, c)[distances.index(min(distances))]

    pixels, previous = bytearray(), bytearray(stride)
    for y in range(h):
        start = y * (stride + 1)
        method, row = raw[start], bytearray(raw[start + 1:start + stride + 1])
        if method not in range(5):
            raise ValueError("Unsupported PNG filter")
        for i in range(stride):
            a, b, c = (row[i - channels] if i >= channels else 0), previous[i], (previous[i - channels] if i >= channels else 0)
            predictor = (0, a, b, (a + b) // 2, paeth(a, b, c))[method]
            row[i] = (row[i] + predictor) & 255
        pixels.extend(row)
        previous = row
    return w, h, channels, pixels


def check_alpha(image):
    w, h, channels, pixels = image
    assert (w, h, channels) == (256, 256, 4), "Mask output must keep the original canvas and alpha"
    assert pixels[3] < 16, "Corner should be transparent"
    assert pixels[((h // 2) * w + w // 2) * 4 + 3] > 240, "Subject centre disappeared"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin", default=os.environ.get("PHOTOCRAFT_BIN", "photocraft-cli"))
    args = parser.parse_args()
    binary = args.bin
    if os.path.sep in binary:
        binary = str(Path(binary).resolve(strict=True))
    env = os.environ.copy()
    env.pop("DISPLAY", None)
    env.pop("WAYLAND_DISPLAY", None)
    env.update(PHOTOCRAFT_GPU="0", PHOTOCRAFT_NO_DESKTOP_INTEGRATION="1", RAYON_NUM_THREADS="2")

    def cli(*arguments, cwd=None):
        result = subprocess.run([binary, *arguments], cwd=cwd, env=env, text=True, capture_output=True, timeout=60, check=False)
        if result.returncode:
            raise RuntimeError(f"CLI exited {result.returncode}: {result.stderr[-4000:]}\n{result.stdout[-4000:]}")
        return result.stdout

    print(cli("--version").strip())
    cli("run", "--help")
    commands = json.loads(cli("commands", "--json"))
    ids = {entry["id"] for entry in commands}
    required = {"select.subject", "select.refineEdge", "select.lasso", "layer.layerMask.revealSelection",
                "image.crop", "image.imageSize", "image.adjustments.brightnessContrast", "filter.blur.gaussianBlur"}
    assert required <= ids, f"Missing commands: {sorted(required - ids)}"

    with tempfile.TemporaryDirectory(prefix="postspark-photocraft-check-") as temp:
        root = Path(temp)
        source = root / "source.png"
        write_fixture(source)

        def run_case(folder, steps, suffix="png"):
            folder.mkdir()
            output = folder / f"result.{suffix}"
            argv = ["run", str(source), "--no-gpu"]
            for command, params in steps:
                argv.extend(["--cmd", command, "--params", json.dumps(params, separators=(",", ":"))])
            argv.extend(["--out", str(output)])
            receipt = cli(*argv, cwd=folder)
            assert output.is_file() and output.stat().st_size > 0, "CLI returned no output"
            return output, receipt

        mask_steps = [("select.lasso", {"points": [[64, 32], [192, 32], [224, 224], [32, 224]]}),
                      ("select.refineEdge", {"output": "layerMask", "feather": 0.5})]
        # Two independent processes and working directories, with overlapping execution.
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda n: run_case(root / f"mask-{n}", mask_steps), range(2)))
        for output, _ in results:
            check_alpha(read_png(output))
        print("PASS: polygon mask, PNG alpha and two concurrent independent CLI processes")

        output, _ = run_case(root / "adjust", [
            ("image.adjustments.brightnessContrast", {"brightness": 10, "contrast": 10}),
            ("filter.blur.gaussianBlur", {"radius": 2}),
        ])
        adjusted = read_png(output)
        assert adjusted[:2] == (256, 256)
        _, _, channels, pixels = adjusted
        source_pixels = read_png(source)[3]
        centre = (128 * 256 + 128)
        assert pixels[centre * channels:centre * channels + 3] != source_pixels[centre * 4:centre * 4 + 3], "Colour adjustment changed no centre pixels"
        assert any(80 < pixels[i + 1] < 220 for i in range(0, len(pixels), channels)), "Blur produced no intermediate edge colours"
        print("PASS: colour adjustment changes pixels and blur softens the synthetic edge")

        output, _ = run_case(root / "geometry", [
            ("image.crop", {"x": 16, "y": 16, "width": 224, "height": 224}),
            ("image.imageSize", {"width": 108, "height": 108}),
        ])
        assert read_png(output)[:2] == (108, 108)
        print("PASS: crop and resize to 108x108")

        native, _ = run_case(root / "native", mask_steps, "pcraft")
        reopened = root / "reopened.png"
        cli("convert", str(native), str(reopened), "--no-gpu")
        assert read_png(reopened) == read_png(results[0][0]), "Native save/reopen changed the rendered mask"
        print("PASS: native .pcraft save/reopen preserves the synthetic mask render")

        for extension in ("webp", "jpg"):
            exported = root / f"converted.{extension}"
            cli("convert", str(source), str(exported), "--no-gpu")
            assert exported.stat().st_size > 0
            info = json.loads(cli("info", str(exported), "--compact"))
            assert info, "Conversion cannot be reopened"
        print("PASS: WebP and JPEG conversion and reopening")

        output, receipt = run_case(root / "subject", [
            ("select.subject", {"sampleAllLayers": False, "mode": "replace"}),
            ("select.refineEdge", {"output": "layerMask", "radius": 1, "smartRadius": True}),
        ])
        records = [json.loads(line) for line in receipt.splitlines() if line.strip()]
        subject = next(row for row in records if row.get("command") == "select.subject")
        assert subject["result"].get("selected") is True, "No subject selected; never report that as successful removal"
        check_alpha(read_png(output))
        print("PASS: classical Select Subject -> layer mask -> PNG on a simple synthetic fixture")

        blank = root / "no-subject.png"
        write_fixture(blank, with_subject=False)
        rejected_output = root / "must-not-exist.png"
        rejected = subprocess.run([
            binary, "run", str(blank), "--no-gpu",
            "--cmd", "select.subject", "--params", '{"mode":"replace"}',
            "--cmd", "select.refineEdge", "--params", '{"output":"layerMask"}',
            "--out", str(rejected_output),
        ], env=env, text=True, capture_output=True, timeout=60, check=False)
        records = [json.loads(line) for line in rejected.stdout.splitlines() if line.strip()]
        subject = next(row for row in records if row.get("command") == "select.subject")
        assert subject["result"].get("selected") is False
        assert rejected.returncode != 0 and not rejected_output.exists(), "An absent selection must not produce a successful cutout"
        print("PASS: a uniform image selects no subject and the mask pipeline fails without exporting")

    print("Temporary files removed. This check does not certify real-photo segmentation, VPS capacity or PostSpark integration.")


if __name__ == "__main__":
    main()
