"""Bounded, private queue for analysis. Completed results can be fetched for 20 minutes."""
import json
import logging
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time

from render import number
from speech_worker import FFMPEG, RUNTIME

WORKER = Path(__file__).with_name("speech_worker.py")
LANGUAGES = {"auto", "pt", "en", "es"}


def available():
    return (os.access(FFMPEG, os.X_OK) and (RUNTIME / "lib/faster_whisper").is_dir()
            and (RUNTIME / "models/whisper-base/model.bin").is_file()
            and (RUNTIME / "models/selfie.tflite").is_file())


class SpeechJobs:
    def __init__(self, slot):
        self.slot = slot
        self.root = tempfile.TemporaryDirectory(prefix="mare-speech-")
        self.lock = threading.Lock()
        self.jobs = {}

    def forget(self, token):
        job = self.jobs.pop(token)
        shutil.rmtree(job["path"], ignore_errors=True)

    def expire(self):
        with self.lock:
            for token, job in list(self.jobs.items()):
                if job.get("expires", float("inf")) <= time.monotonic():
                    self.forget(token)

    def admit(self, stream, size, start, end, speech, mask, language, identify):
        if not number(start, 0, 86400) or not number(end, start + .03, start + 60.000001):
            raise ValueError("Analise um trecho de até 60 segundos.")
        if (speech, mask) not in {("1", "0"), ("0", "1"), ("1", "1")} or language not in LANGUAGES:
            raise ValueError("Opções de análise inválidas.")
        if not self.slot.acquire(blocking=False):
            return None
        token = secrets.token_hex(20)
        path = Path(self.root.name) / token
        try:
            path.mkdir()
            prefix = stream.read(min(32, size))
            name = "source" + identify(prefix)
            with (path / name).open("wb") as file:
                file.write(prefix)
                remaining = size - len(prefix)
                while remaining:
                    data = stream.read(min(1024 * 1024, remaining))
                    if not data:
                        raise ValueError("O envio do vídeo foi interrompido.")
                    file.write(data)
                    remaining -= len(data)
            job = {"path": path, "state": "running", "phase": "queued", "progress": 0}
            with self.lock:
                retained = [(item["expires"], key) for key, item in self.jobs.items() if "expires" in item]
                if len(retained) >= 3:
                    self.forget(min(retained)[1])
                self.jobs[token] = job
            threading.Thread(target=self.run, args=(token, name, start, end, speech, mask, language),
                             daemon=True).start()
        except BaseException:
            with self.lock:
                self.jobs.pop(token, None)
            shutil.rmtree(path, ignore_errors=True)
            self.slot.release()
            raise
        return token

    @staticmethod
    def stop(process):
        try:
            if process and process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def run(self, token, name, start, end, speech, mask, language):
        job = self.jobs[token]
        work = job["path"]
        message = "Não foi possível analisar este vídeo. Tente novamente ou use outro arquivo."
        result = None
        try:
            env = dict(os.environ, PYTHONPATH=str(RUNTIME / "lib"), HF_HOME=str(work / "hf"),
                       HF_HUB_OFFLINE="1", OMP_NUM_THREADS="2", OPENBLAS_NUM_THREADS="1")
            with (work / "worker.log").open("wb") as log, self.lock:
                if job.get("cancelled"):
                    return
                process = subprocess.Popen([sys.executable, str(WORKER), name, str(start), str(end),
                                            speech, mask, language], cwd=work, env=env, text=True,
                                           stdout=subprocess.PIPE, stderr=log, start_new_session=True)
                job["process"] = process
            timeout = threading.Timer(240, self.stop, args=(process,))
            timeout.start()
            try:
                with process.stdout:
                    for line in process.stdout:
                        event = json.loads(line)
                        with self.lock:
                            job.update(event)
                exit_code = process.wait(timeout=5)
            finally:
                timeout.cancel()
                self.stop(process)
                process.wait()
            output = work / "analysis.json"
            if output.is_file():
                payload = json.loads(output.read_text(encoding="utf-8"))
                if exit_code == 0:
                    result = payload
                else:
                    message = payload.get("message", message)
            elif not job.get("cancelled"):
                logging.error("Falha da análise de vídeo (%s): %s", exit_code,
                              (work / "worker.log").read_text(errors="replace")[-1500:])
        except Exception:
            logging.exception("Falha no processamento da análise de vídeo")
        finally:
            for file in (name, "decode.log", "worker.log", "analysis.json"):
                (work / file).unlink(missing_ok=True)
            with self.lock:
                job.pop("process", None)
                if job.get("cancelled"):
                    self.forget(token)
                elif result is not None:
                    job.update(state="ready", progress=1, result=result, expires=time.monotonic() + 1200)
                else:
                    job.update(state="failed", message=message, expires=time.monotonic() + 1200)
            self.slot.release()

    def status(self, token):
        self.expire()
        with self.lock:
            job = self.jobs.get(token)
            if not job or job.get("cancelled"):
                return None
            return {key: job[key] for key in ("state", "phase", "progress", "result", "message") if key in job}

    def mask(self, token):
        self.expire()
        with self.lock:
            job = self.jobs.get(token)
            if job and job["state"] == "ready" and (job["path"] / "mask.bin").is_file():
                return (job["path"] / "mask.bin").open("rb")
        return None

    def cancel(self, token):
        with self.lock:
            job = self.jobs.get(token)
            if job and job["state"] == "running":
                job["cancelled"] = True
                self.stop(job.get("process"))
            elif job:
                self.forget(token)
