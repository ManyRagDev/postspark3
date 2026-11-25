"""Run with the lab CLIs installed or MARE_FILM pointing to filmcraft-cli."""
import io
import json
import math
import shutil
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "processor"))
from montage import FILM, FRAME, OVERLAY_MEDIA, TICKS, montage, runner, unpack


class PortableMontage(unittest.TestCase):
    def test_custom_bezier_sampling_preserves_overshoot_and_opacity_bounds(self):
        from render import evaluate, valid_ease
        ease = [.2, 2, .4, 1]
        self.assertTrue(valid_ease(ease))
        self.assertFalse(valid_ease([.2, 2, .4, 5]))
        layer = {"props": {"y": 0, "opacity": 0}, "keys": {
            axis: [{"t": 2, "value": value, "ease": ease}] for axis, value in [("y", 100), ("opacity", 1)]}}
        self.assertAlmostEqual(evaluate(layer, "y", .7), 125, places=5)
        self.assertEqual(evaluate(layer, "opacity", .7), 1)
        self.assertEqual(evaluate(layer, "y", 2), 100)

    def test_v2_resolves_the_same_composition_for_both_source_windows(self):
        document = {"version": 1, "background": "#14151a", "layers": []}
        entry = {"id": "opening", "name": "Abertura", "duration": 4,
                 "kind": "composition", "document": document}
        clips = [
            dict(id="first", name="Primeira vez", kind="scene", compositionId="opening", trim=.5, duration=2),
            dict(id="second", name="Segunda vez", kind="scene", compositionId="opening", trim=1, duration=3),
        ]
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            header = json.dumps({"project": {"clips": clips, "compositions": [entry]}, "assets": []}).encode()
            (work / "montagem.mare").write_bytes(b"MARESTUDIO2\n" + struct.pack(">I", len(header)) + header)
            project, _, _ = unpack(work)
            first, second = project["clips"]
            self.assertIs(first["composition"], second["composition"])
            self.assertEqual(first["composition"], document)
            self.assertEqual([(c["trim"], c["duration"]) for c in (first, second)], [(.5, 2), (1, 3)])

    def test_overlay_tracks_reopen_with_the_source_frame_at_the_cut(self):
        clips = [
            dict(id="first", name="Um", kind="video", assetId="coast", trim=0, duration=.45),
            dict(id="second", name="Dois", kind="video", assetId="tide", trim=0, duration=.4,
                 transitionIn={"from": "first", "type": "film_burn_3", "frames": 8}),
            dict(id="third", name="Três", kind="video", assetId="coast", trim=1, duration=.48,
                 transitionIn={"from": "second", "type": "torn_paper_5", "frames": 60}),
        ]
        project = dict(clips=clips, sound=dict(enabled=False, volume=1), extraTracks=[
            dict(id="detail", kind="video", clips=[
                dict(name="Detalhe", assetId="tide", trim=.1, start=0, duration=.2)
            ])
        ])
        header = json.dumps({"project": project, "assets": []}).encode()
        with tempfile.TemporaryDirectory() as temp:
            work, reopened = Path(temp) / "work", Path(temp) / "reopened"
            work.mkdir()
            (work / "montagem.mare").write_bytes(b"MARESTUDIO1\n" + struct.pack(">I", len(header)) + header)
            montage(work, .45)
            with ZipFile(work / "projects.zip") as archive:
                archive.extractall(reopened)
            shutil.rmtree(work)

            run = runner(reopened)
            layout = json.loads(run(FILM, "inspect", "sequence", "--project", "edit.fcproj", "--compact"))
            intervals = [[(c["startFrame"], c["endFrame"]) for c in t["items"]] for t in layout["video"]]
            self.assertEqual(intervals, [[(0, 14), (14, 26), (26, 40)], [(10, 18), (20, 32)], [(0, 6)]])
            for effect, count, index in [("film_burn_3", 8, 7), ("torn_paper_5", 12, 13)]:
                actual = reopened / "media" / f"{effect}-{count:02d}" / f"frame-{count//2+1:03d}.webp"
                self.assertEqual(actual.read_bytes(), (OVERLAY_MEDIA / effect / f"frame-{index:03d}.webp").read_bytes())
            run(FILM, "export", "again.mp4", "--project", "edit.fcproj", "--format", "h264",
                "--gpu-rendering", "off", "--no-audio")

    def test_extra_tracks_extend_sequence_and_preserve_transition(self):
        project = {
            "clips": [
                dict(id="first", name="Um", kind="video", assetId="coast", trim=0, duration=.5),
                dict(id="second", name="Dois", kind="video", assetId="tide", trim=0, duration=.5,
                     transitionIn={"from": "first", "type": "dip_to_white", "frames": 8}),
            ],
            "sound": dict(enabled=False, volume=1),
            "extraTracks": [
                dict(id="overlay", kind="video", clips=[dict(name="Detalhe", assetId="tide", trim=.1, start=0, duration=.2)]),
                dict(id="voice", kind="audio", clips=[dict(name="Voz", assetId="sound", trim=0, start=.8, duration=.5)]),
            ],
        }

        def package(work):
            header = json.dumps({"project": project, "assets": []}).encode()
            (work / "montagem.mare").write_bytes(b"MARESTUDIO1\n" + struct.pack(">I", len(header)) + header)

        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            package(work)
            montage(work, .5)
            layout = json.loads(runner(work)(FILM, "inspect", "sequence", "--project", "edit.fcproj", "--compact"))
            self.assertEqual(layout["durationFrames"], 39)
            self.assertEqual((len(layout["video"]), len(layout["audio"])), (2, 3))
            self.assertEqual(layout["video"][1]["items"][0]["endFrame"], 6)
            self.assertEqual(layout["audio"][2]["items"][0]["startFrame"], 24)
            transition, = layout["video"][0]["transitions"]
            self.assertEqual((transition["effect"], transition["duration"]), ("dip_to_white", 8 * FRAME))

        project["extraTracks"].append(dict(id="sixth", kind="audio", clips=[]))
        with tempfile.TemporaryDirectory() as temp:
            package(Path(temp))
            with self.assertRaisesRegex(ValueError, "cinco pistas"):
                montage(Path(temp), 0)

    def test_trimmed_cuts_and_subframe_music_reopen(self):
        project = {
            "name": "Teste",
            "clips": [
                {"name": "Primeiro", "kind": "video", "assetId": "tide", "trim": .5, "duration": .11},
                {"name": "Segundo", "kind": "video", "assetId": "coast", "trim": 1, "duration": .29},
            ],
            "sound": {"enabled": True, "volume": .25, "assetId": "music"},
        }
        wav = io.BytesIO()
        with wave.open(wav, "wb") as stream:
            stream.setparams((1, 2, 48000, 0, "NONE", ""))
            stream.writeframes(bytes(7200 * 2))  # 150 ms = 4.5 video frames
        data = wav.getvalue()
        meta = json.dumps({"project": project, "assets": [{"id": "music", "size": len(data)}]}).encode()
        with tempfile.TemporaryDirectory() as temp:
            work, restored = Path(temp) / "work", Path(temp) / "reopened"
            work.mkdir()
            (work / "montagem.mare").write_bytes(b"MARESTUDIO1\n" + struct.pack(">I", len(meta)) + meta + data)
            montage(work, .2)
            with ZipFile(work / "projects.zip") as bundle:
                bundle.extractall(restored)
            shutil.rmtree(work)
            run = runner(restored)
            sequence = json.loads(run(FILM, "inspect", "sequence", "--project", "edit.fcproj", "--compact"))
            self.assertEqual([(c["name"], c["startFrame"], c["endFrame"])
                              for c in sequence["video"][0]["items"]], [("Primeiro", 0, 4), ("Segundo", 4, 12)])
            self.assertEqual(sequence["video"][0]["items"][0]["sourceIn"], TICKS // 2)
            self.assertEqual([(c["start"], c["duration"]) for c in sequence["audio"][1]["items"]],
                             [(0, TICKS*15//100), (TICKS*15//100, TICKS*15//100), (TICKS*30//100, TICKS//10)])
            doc = json.loads((restored / "edit.fcproj").read_text())
            seq = next(i["kind"]["Sequence"] for i in doc["project"]["items"].values() if "Sequence" in i["kind"])
            self.assertAlmostEqual(seq["audio_tracks"][1]["volume_db"], 20 * math.log10(.25))
            run(FILM, "export", "again.mp4", "--project", "edit.fcproj", "--format", "h264", "--gpu-rendering", "off")
            info = json.loads(run(FILM, "probe", "again.mp4", "--compact"))
            self.assertTrue(info["audio_streams"])
            self.assertLess(abs(info["duration"] - 12*FRAME), FRAME)


if __name__ == "__main__":
    unittest.main()
