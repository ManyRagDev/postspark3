#!/usr/bin/env python3
"""Bounded Linux CLI benchmark with synthetic images, no PostSpark or user data.

Run inside an externally limited cgroup as an unprivileged service identity.
Uses GNU time for per-job peak RSS and samples the combined process-tree RSS.
Temporary images are deleted; only the requested JSON report is retained.
"""
import argparse
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
import zlib


def write_fixture(path, width, height):
    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff))

    compressor = zlib.compressobj(3)
    compressed = bytearray()
    for y in range(height):
        row = bytearray(b"\x00")
        for x in range(width):
            inside = ((x - width / 2) / (width * .24)) ** 2 + ((y - height / 2) / (height * .33)) ** 2 < 1
            row.extend((195 + (x // 3) % 20, 32 + (y // 3) % 24, 36, 255)
                       if inside else (232 + (x // 41) % 16, 232 + (y // 43) % 16, 244, 255))
        compressed.extend(compressor.compress(row))
    compressed.extend(compressor.flush())
    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", compressed) + chunk(b"IEND", b""))


def tree_rss_kib(pid):
    """Linux /proc RSS sum including the GNU time wrapper and its descendants."""
    total = 0
    try:
        for line in Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                total += int(line.split()[1])
        children = Path(f"/proc/{pid}/task/{pid}/children").read_text().split()
    except (FileNotFoundError, ProcessLookupError, PermissionError):
        return total
    return total + sum(tree_rss_kib(int(child)) for child in children)


def kill_jobs(jobs):
    for job in jobs:
        process = job["process"]
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    for job in jobs:
        job["process"].wait()


def execute_group(binary, env, group_dir, cases, timeout_seconds=90):
    group_dir.mkdir()
    jobs = []
    started = time.monotonic()
    combined_rss_kib = 0
    try:
        for index, case in enumerate(cases):
            folder = group_dir / str(index)
            folder.mkdir()
            output = folder / "result.png"
            argv = [binary, "run", str(case["source"]), "--no-gpu"]
            for command, params in case["steps"]:
                argv.extend(["--cmd", command, "--params", json.dumps(params, separators=(",", ":"))])
            argv.extend(["--out", str(output)])
            with (folder / "stdout").open("wb") as stdout, (folder / "stderr").open("wb") as stderr:
                process = subprocess.Popen(
                    ["/usr/bin/time", "-f", "%e %U %S %M %x", "-o", str(folder / "metrics"), *argv],
                    cwd=folder, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
            jobs.append({"process": process, "folder": folder, "case": case, "output": output})
        while any(job["process"].poll() is None for job in jobs):
            combined_rss_kib = max(combined_rss_kib, sum(tree_rss_kib(job["process"].pid) for job in jobs))
            if time.monotonic() - started > timeout_seconds:
                raise TimeoutError(f"Benchmark group exceeded {timeout_seconds} seconds")
            time.sleep(.05)
        records = []
        for job in jobs:
            folder, case = job["folder"], job["case"]
            if job["process"].returncode:
                raise RuntimeError(f"{case['operation']} failed: {(folder / 'stderr').read_text()[-1500:]}")
            wall, user, system, rss, status = (folder / "metrics").read_text().split()
            assert status == "0"
            output = job["output"].read_bytes()
            assert output[:8] == b"\x89PNG\r\n\x1a\n"
            width, height = struct.unpack(">II", output[16:24])
            assert (width, height) == tuple(case["expected_dimensions"])
            receipts = [json.loads(line) for line in (folder / "stdout").read_text().splitlines() if line.strip()]
            if case["operation"] == "subject_mask":
                subject = next(row for row in receipts if row.get("command") == "select.subject")
                assert subject["result"].get("selected") is True, "No subject; this is not a successful cutout"
            if case["operation"] in ("subject_mask", "polygon_mask"):
                assert output[25] == 6, "Mask output must be RGBA"
            records.append({
                "operation": case["operation"], "input_dimensions": case["input_dimensions"],
                "output_dimensions": [width, height], "input_bytes": case["source"].stat().st_size,
                "output_bytes": len(output), "output_sha256": hashlib.sha256(output).hexdigest(),
                "wall_seconds": float(wall), "user_cpu_seconds": float(user), "system_cpu_seconds": float(system),
                "max_rss_kib": int(rss), "exit_status": int(status),
            })
        return {"concurrency": len(cases), "elapsed_seconds": round(time.monotonic() - started, 3),
                "sampled_combined_peak_rss_kib": combined_rss_kib, "jobs": records}
    finally:
        kill_jobs(jobs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=2, choices=(1, 2, 3))
    args = parser.parse_args()
    binary = str(Path(args.bin).resolve(strict=True))
    env = os.environ.copy()
    for key in ("DISPLAY", "WAYLAND_DISPLAY"):
        env.pop(key, None)
    env.update(PHOTOCRAFT_GPU="0", PHOTOCRAFT_NO_DESKTOP_INTEGRATION="1", RAYON_NUM_THREADS="2")
    version = subprocess.check_output([binary, "--version"], env=env, text=True, timeout=30).strip()
    report = {"schema_version": 1, "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "cli_version": version, "synthetic_only": True, "rayon_threads_per_process": 2,
              "per_group_timeout_seconds": 90, "rss_sample_interval_seconds": .05,
              "repeats": args.repeats, "groups": [], "success": False}
    try:
        with tempfile.TemporaryDirectory(prefix="postspark-photocraft-benchmark-") as temp:
            root = Path(temp)
            large_cases = {}
            for width, height in ((1080, 1350), (2160, 2700), (3840, 3840)):
                source = root / f"source-{width}x{height}.png"
                write_fixture(source, width, height)
                inset_x, inset_y = width // 20, height // 20
                cropped_w, cropped_h = width - 2 * inset_x, height - 2 * inset_y
                output_h = round(1080 * cropped_h / cropped_w)
                operations = {
                    "adjust_blur": [("image.adjustments.brightnessContrast", {"brightness": 10, "contrast": 10}),
                                    ("filter.blur.gaussianBlur", {"radius": 2})],
                    "crop_resize": [("image.crop", {"x": inset_x, "y": inset_y, "width": cropped_w, "height": cropped_h}),
                                    ("image.imageSize", {"width": 1080, "height": output_h})],
                    "polygon_mask": [("select.lasso", {"points": [[width*.25, height*.125], [width*.75, height*.125],
                                                                 [width*.875, height*.875], [width*.125, height*.875]]}),
                                     ("select.refineEdge", {"output": "layerMask", "feather": .5})],
                    "subject_mask": [("select.subject", {"sampleAllLayers": False, "mode": "replace"}),
                                     ("select.refineEdge", {"output": "layerMask", "radius": 1, "smartRadius": True})],
                }
                for operation, steps in operations.items():
                    case = {"source": source, "operation": operation, "steps": steps,
                            "input_dimensions": [width, height],
                            "expected_dimensions": [1080, output_h] if operation == "crop_resize" else [width, height]}
                    for repeat in range(args.repeats):
                        group = execute_group(binary, env, root / f"{width}-{operation}-{repeat}", [case])
                        report["groups"].append(group)
                        print(json.dumps(group), flush=True)
                    if width == 3840:
                        large_cases[operation] = case
            for operation in ("polygon_mask", "subject_mask"):
                group = execute_group(binary, env, root / f"concurrent-{operation}", [large_cases[operation]] * 2)
                assert group["jobs"][0]["output_sha256"] == group["jobs"][1]["output_sha256"], "Concurrent independent results differ"
                report["groups"].append(group)
                print(json.dumps(group), flush=True)
        report["success"] = True
    except Exception as error:
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        report["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"PASS: report saved to {args.output}; temporary images removed", flush=True)


if __name__ == "__main__":
    main()
