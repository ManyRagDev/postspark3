from pathlib import Path
from unittest import TestCase, mock
from io import BytesIO
import base64
import json
import os
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "processor"))
import director


class ReviewMedia(TestCase):
    @mock.patch.dict(os.environ, {"OPENROUTER_API_KEY":"test","MARE_DIRECTOR_MODEL":"test"})
    def test_review_sends_picture_and_sound_in_the_same_clip(self):
        content = subprocess.check_output(["ffmpeg","-loglevel","error","-f","lavfi","-i","color=red:s=90x160:d=2",
            "-f","lavfi","-i","sine=frequency=400:duration=2","-c:v","libx264","-c:a","aac",
            "-movflags","frag_keyframe+empty_moov","-f","mp4","pipe:1"])
        header=json.dumps({"clips":[],"duration":2}).encode()
        body=len(header).to_bytes(4,"big")+header+content
        with mock.patch.object(director,"complete",return_value={"output":{},"usage":{}}) as call:
            result=director.review(BytesIO(body),len(body))
        parts=call.call_args.args[2]
        video=base64.b64decode(parts[1]["video_url"]["url"].split(",",1)[1])
        self.assertEqual(len(video),result["proxyBytes"])
        metadata=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_streams","-of","json","pipe:0"],input=video))
        picture,sound=metadata["streams"]
        self.assertEqual((picture["codec_type"],picture["width"],picture["height"]),("video",540,960))
        self.assertEqual(sound["codec_type"],"audio")
