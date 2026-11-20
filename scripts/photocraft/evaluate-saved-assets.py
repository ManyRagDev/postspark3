#!/usr/bin/env python3
"""Small, offline CLI evaluation of three explicitly prepared saved-post assets.

No database, network, credentials or application writes. Run as the dedicated
PhotoCraft identity in a bounded cgroup. Results are intentional review artifacts;
working directories are temporary and removed on exit. Visually review auto masks.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    binary = str(Path(args.bin).resolve(strict=True))
    manifest = json.loads(args.manifest.read_text())
    sources = {}
    for alias in ("market", "chart", "logo"):
        entry = manifest[alias]
        source = (args.manifest.parent / entry["file"]).resolve(strict=True)
        assert source.parent == args.manifest.parent.resolve(), "Input must be in the manifest directory"
        assert 0 < source.stat().st_size <= 8 * 1024 * 1024
        assert hashlib.sha256(source.read_bytes()).hexdigest() == entry["sha256"]
        sources[alias] = source
    args.out.mkdir(mode=0o700)
    env = os.environ.copy()
    for key in ("DISPLAY", "WAYLAND_DISPLAY"):
        env.pop(key, None)
    env.update(PHOTOCRAFT_GPU="0", PHOTOCRAFT_NO_DESKTOP_INTEGRATION="1", RAYON_NUM_THREADS="2")
    report = {"schema_version": 1, "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "cli_version": subprocess.check_output([binary, "--version"], env=env, text=True, timeout=30).strip(),
              "sources": manifest, "cases": [], "post_writes": 0,
              "limitation": "Existing post imagery, not a portrait/product corpus. Auto masks require visual review."}

    with tempfile.TemporaryDirectory(prefix="postspark-photocraft-real-") as temporary:
        work = Path(temporary)

        def measured(name, arguments, output_name):
            folder = work / name
            folder.mkdir()
            output = args.out / output_name
            arguments = [str(output) if value == "{output}" else value for value in arguments]
            begin = time.monotonic()
            with (folder / "stdout").open("wb") as stdout, (folder / "stderr").open("wb") as stderr:
                process = subprocess.Popen(
                    ["/usr/bin/time", "-f", "%e %U %S %M %x", "-o", str(folder / "time"), binary, *arguments],
                    cwd=folder, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
            timed_out = False
            try:
                status = process.wait(timeout=90)
            except subprocess.TimeoutExpired:
                timed_out = True
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                status = process.wait()
            records = []
            for line in (folder / "stdout").read_text().splitlines():
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
            row = {"name": name, "exit_status": status, "timed_out": timed_out,
                   "observed_wall_seconds": round(time.monotonic() - begin, 3), "receipts": records,
                   "output_exists": output.is_file()}
            metric_lines = (folder / "time").read_text().splitlines()
            if metric_lines and len(metric_lines[-1].split()) == 5:
                wall, user, system, rss, _ = metric_lines[-1].split()
                row.update(wall_seconds=float(wall), user_cpu_seconds=float(user), system_cpu_seconds=float(system), max_rss_kib=int(rss))
            if output.is_file():
                content = output.read_bytes()
                row.update(output=output.name, output_bytes=len(content), output_sha256=hashlib.sha256(content).hexdigest())
                if content.startswith(b"\x89PNG\r\n\x1a\n"):
                    row["output_dimensions"] = list(struct.unpack(">II", content[16:24]))
                    row["png_colour_type"] = content[25]
            row["technical_success"] = status == 0 and row["output_exists"]
            if "auto" in name:
                subject = next((r for r in records if r.get("command") == "select.subject"), {})
                row["subject_selected"] = subject.get("result", {}).get("selected")
                row["visual_approval"] = "pending"
            (args.out / f"{name}-receipts.json").write_text(json.dumps(row, indent=2) + "\n")
            print(json.dumps({k:v for k,v in row.items() if k!='receipts'}), flush=True)
            return row

        def edit(name, alias, steps):
            argv = ["run", str(sources[alias]), "--no-gpu"]
            for command, params in steps:
                argv.extend(["--cmd", command, "--params", json.dumps(params, separators=(",", ":"))])
            return measured(name, [*argv, "--out", "{output}"], f"{name}.png")

        colour_steps = [("image.adjustments.brightnessContrast", {"brightness": 8, "contrast": 8}),
                        ("image.adjustments.hueSaturation", {"saturation": -12})]
        local_blur = [("select.lasso", {"points": [[420,480],[600,480],[600,640],[420,640]]}),
                      ("filter.blur.gaussianBlur", {"radius": 10})]
        # One pair, two distinct images and independent working directories.
        pair_started = time.monotonic()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(edit, "market-colour", "market", colour_steps),
                    pool.submit(edit, "chart-local-blur", "chart", local_blur)]
            report["cases"].extend(job.result() for job in jobs)
        report["concurrent_pair_seconds"] = round(time.monotonic() - pair_started, 3)
        recipes = [
            ("logo-colour", "logo", [("image.adjustments.brightnessContrast", {"brightness": 12, "contrast": 5})]),
            ("logo-trim", "logo", [("image.trim", {"basedOn":"transparent"})]),
            ("market-crop-resize", "market", [("image.crop", {"x":60,"y":30,"width":480,"height":540}),
                                               ("image.imageSize", {"width":800,"height":900})]),
            ("chart-polygon-mask", "chart", [("select.lasso", {"points":[[50,330],[270,180],[510,240],[760,280],[760,520],[540,700],[250,630],[50,520]]}),
                                               ("select.refineEdge", {"output":"layerMask","feather":1})]),
            ("chart-feathered-blur", "chart", [("select.lasso", {"points":[[420,480],[600,480],[600,640],[420,640]]}),
                                               ("select.refineEdge", {"output":"selection","feather":12}),
                                               ("filter.blur.gaussianBlur", {"radius":10})]),
            ("market-auto-mask", "market", [("select.subject", {"sampleAllLayers":False,"mode":"replace"}),
                                              ("select.refineEdge", {"output":"layerMask","radius":1,"smartRadius":True})]),
            ("chart-auto-mask", "chart", [("select.subject", {"sampleAllLayers":False,"mode":"replace"}),
                                            ("select.refineEdge", {"output":"layerMask","radius":1,"smartRadius":True})]),
        ]
        for name, alias, steps in recipes:
            report["cases"].append(edit(name, alias, steps))
        mask = args.out / "chart-polygon-mask.png"
        if mask.is_file():
            native_steps = next(steps for name, _, steps in recipes if name == "chart-polygon-mask")
            native_argv = ["run", str(sources["chart"]), "--no-gpu"]
            for command, params in native_steps:
                native_argv.extend(["--cmd", command, "--params", json.dumps(params, separators=(",", ":"))])
            native = measured("mask-native-save", [*native_argv,"--out","{output}"], "mask.pcraft")
            report["cases"].append(native)
            if native["technical_success"]:
                report["cases"].append(measured("mask-native-reopen", ["convert",str(args.out/"mask.pcraft"),"{output}","--no-gpu"], "mask-reopened.png"))
        report["cases"].append(measured("logo-webp", ["convert",str(sources['logo']),"{output}","--no-gpu"], "logo.webp"))
    # Originals must be unchanged; approval is deliberately separate from exit status.
    for alias, source in sources.items():
        assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest[alias]["sha256"]
    report["originals_unchanged"] = True
    report["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print("Evaluation completed; review report and images before approving any tool.", flush=True)


if __name__ == "__main__":
    main()
