"""Private, same-origin lab on the VPS loopback interface."""
import json
import logging
import os
import re
import secrets
import shutil
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from montage import LIMIT, OVERLAY_MEDIA, TRANSITIONS, montage, suffix
from director import direct, review, model as director_model
from narration import NarrationError, synthesize
from render import render, number
from speech_jobs import SpeechJobs, available as speech_available

ROOT = Path(__file__).resolve().parents[1] / "dist"
PORT = int(os.environ.get("MARE_PORT", "18745"))
HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
slot = threading.BoundedSemaphore(1)
narration_slot = threading.BoundedSemaphore(1)
director_slot = threading.BoundedSemaphore(1)
speech_jobs = SpeechJobs(slot)
speech_path = re.compile(r"/api/speech/([0-9a-f]{40})(/mask)?")


# Serve large results independently so previewing a frame does not transfer the ZIP.
results = tempfile.TemporaryDirectory(prefix="mare-results-")
result_lock = threading.Lock()
expires = {}
result_types = {"preview.png": "image/png", "final.mp4": "video/mp4", "projects.zip": "application/zip"}


def discard(token):
    expires.pop(token, None)
    shutil.rmtree(Path(results.name) / token, ignore_errors=True)


def retain(work):
    token = secrets.token_hex(20)
    with result_lock:
        if len(expires) >= 3:
            discard(min(expires, key=expires.get))
        directory = Path(results.name) / token
        directory.mkdir()
        try:
            for name in result_types:
                (work / name).rename(directory / name)
        except OSError:
            discard(token)
            raise
        expires[token] = time.monotonic() + 1200
    return token


def expire_results():
    while True:
        time.sleep(30)
        speech_jobs.expire()
        with result_lock:
            for token in list(expires):
                if expires[token] <= time.monotonic():
                    discard(token)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def list_directory(self, path):
        self.send_error(404)

    def translate_path(self, path):
        match = re.fullmatch(r"/transition-media/([a-z0-9_]+)/(frame-\d{3}\.webp)", path.split("?", 1)[0])
        if match and self.headers.get("Host") in HOSTS:
            effect, frame = match.groups()
            if "overlay" in TRANSITIONS.get(effect, {}):
                return str(OVERLAY_MEDIA / effect / frame)
        return super().translate_path(path)

    def do_GET(self):
        if self.headers.get("Host") not in HOSTS:
            return self.send_error(403)
        if self.path.startswith("/renders/"):
            return self.serve_result()
        analysis = speech_path.fullmatch(self.path)
        if analysis:
            return self.serve_analysis(*analysis.groups())
        if self.path.split("?")[0] in ("/", "/index.html"):
            meta = b'<meta name="mare-processor" content="enabled">'
            if os.environ.get("OPENROUTER_API_KEY"):
                meta += b'<meta name="mare-narration" content="enabled">'
            if director_model():
                meta += b'<meta name="mare-director" content="enabled">'
            if speech_available():
                meta += b'<meta name="mare-speech" content="enabled">'
            body = (ROOT / "index.html").read_bytes().replace(
                b"</head>", meta + b"</head>")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def serve_result(self):
        match = re.fullmatch(r"/renders/([0-9a-f]{40})/(preview\.png|final\.mp4|projects\.zip)", self.path)
        if not match:
            return self.send_error(404)
        token, name = match.groups()
        with result_lock:
            if expires.get(token, 0) <= time.monotonic():
                return self.send_error(410, "Resultado expirado")
            stream = (Path(results.name) / token / name).open("rb")
        with stream:
            size = os.fstat(stream.fileno()).st_size
            start, end = 0, size - 1
            requested = self.headers.get("Range")
            if requested:
                part = re.fullmatch(r"bytes=(\d{0,16})-(\d{0,16})", requested)
                if part and any(part.groups()):
                    left, right = part.groups()
                    start = int(left) if left else max(0, size-int(right))
                    end = min(end, int(right)) if left and right else end
                else:
                    start = size
                if start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.end_headers()
                    return
            self.send_response(206 if requested else 200)
            self.send_header("Content-Type", result_types[name])
            self.send_header("Cache-Control", "no-store")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            if requested:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            stream.seek(start)
            remaining = end - start + 1
            try:
                while remaining:
                    data = stream.read(min(1024 * 1024, remaining))
                    if not data:
                        break
                    self.wfile.write(data)
                    remaining -= len(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def message(self, status, msg):
        self.send_json(status, {"message": msg})

    def same_origin(self):
        host = self.headers.get("Host")
        return host in HOSTS and self.headers.get("Origin") == "http://" + host

    def serve_analysis(self, token, matte):
        if not matte:
            status = speech_jobs.status(token)
            if status is None:
                return self.message(410, "A análise expirou. Analise o clipe novamente.")
            return self.send_json(200, status)
        stream = speech_jobs.mask(token)
        if stream is None:
            return self.message(404, "Recorte de pessoa indisponível.")
        with stream:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-mare-mask")
            self.send_header("Content-Length", str(os.fstat(stream.fileno()).st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                shutil.copyfileobj(stream, self.wfile)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_DELETE(self):
        match = speech_path.fullmatch(self.path)
        if not match or match[2]:
            return self.send_error(404)
        if not self.same_origin():
            return self.send_error(403)
        speech_jobs.cancel(match[1])
        self.send_json(200, {})

    def start_analysis(self, size):
        if not speech_available():
            return self.message(503, "Os modelos de análise estão indisponíveis neste laboratório.")
        try:
            self.connection.settimeout(30)
            token = speech_jobs.admit(self.rfile, size, float(self.headers.get("X-Mare-Start", "nan")),
                                      float(self.headers.get("X-Mare-End", "nan")),
                                      self.headers.get("X-Mare-Speech", "0"), self.headers.get("X-Mare-Mask", "0"),
                                      self.headers.get("X-Mare-Language", "auto"), suffix)
            if token is None:
                return self.message(429, "A VPS está processando outro vídeo. Tente novamente em instantes.")
            try:
                self.send_json(202, {"job": token})
            except (BrokenPipeError, ConnectionResetError):
                speech_jobs.cancel(token)
        except ValueError as error:
            self.message(400, str(error))
        except (BrokenPipeError, ConnectionResetError):
            pass

    def generate_narration(self, size):
        if not narration_slot.acquire(blocking=False):
            return self.message(429, "Outra narração está sendo gerada. Aguarde um instante.")
        try:
            self.connection.settimeout(30)
            audio = synthesize(json.loads(self.rfile.read(size)))
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except (ValueError, RecursionError):
            self.message(400, "Confira o roteiro, o modelo e a voz selecionados.")
        except NarrationError as error:
            self.message(error.status, str(error))
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        finally:
            narration_slot.release()

    def do_POST(self):
        full = self.path == "/api/montage"
        analyze = self.path == "/api/speech"
        narrate = self.path == "/api/narration"
        reviewing = self.path == "/api/director/review"
        editorial = self.path == "/api/director" or reviewing
        if not (full or analyze or narrate or editorial) and self.path != "/api/compose":
            return self.send_error(404)
        if not self.same_origin():
            return self.send_error(403)
        if self.headers.get_content_type() != ("application/octet-stream" if full or analyze or reviewing else "application/json"):
            return self.send_error(415)
        size = self.headers.get("Content-Length", "")
        if not size.isdecimal() or not 0 < int(size) <= (LIMIT if full or analyze or reviewing else 6 * 1024 * 1024 if editorial else 256 * 1024):
            return self.message(413, "O projeto ultrapassa o limite de envio.")
        if editorial:
            if not director_slot.acquire(blocking=False):
                return self.message(429, "Outra chamada editorial está em andamento.")
            try:
                self.connection.settimeout(30)
                result = review(self.rfile, int(size)) if reviewing else direct(json.loads(self.rfile.read(int(size))))
                self.send_json(200, result)
            except (ValueError, KeyError, TypeError, RecursionError):
                self.message(400, "Briefing ou amostras inválidos.")
            except RuntimeError as error:
                self.message(503, str(error))
            finally:
                director_slot.release()
            return
        if narrate:
            if int(size) > 16 * 1024:
                return self.message(413, "O roteiro ultrapassa o limite de envio.")
            return self.generate_narration(int(size))
        if analyze:
            return self.start_analysis(int(size))
        if not slot.acquire(blocking=False):
            return self.message(429, "O Maré está preparando outro vídeo. Tente novamente em instantes.")
        try:
            self.connection.settimeout(30)
            with tempfile.TemporaryDirectory(prefix="mare-") as directory:
                work = Path(directory)
                if full:
                    cursor = float(self.headers.get("X-Mare-Cursor", "0"))
                    if not number(cursor, 0, 86400):
                        raise ValueError("Posição do cursor inválida.")
                    remaining = int(size)
                    with (work / "montagem.mare").open("wb") as output:
                        while remaining:
                            chunk = self.rfile.read(min(remaining, 1024 * 1024))
                            if not chunk:
                                raise ValueError("O envio do projeto foi interrompido.")
                            output.write(chunk)
                            remaining -= len(chunk)
                    montage(work, cursor)
                    token = retain(work)
                    body = json.dumps({"base": "/renders/" + token + "/"}).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                else:
                    render(json.loads(self.rfile.read(int(size))), work)
                boundary = secrets.token_hex(24)
                self.send_response(200)
                self.send_header("Content-Type", "multipart/form-data; boundary=" + boundary)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                for name, mime in (("preview.png", "image/png"), ("final.mp4", "video/mp4"), ("projects.zip", "application/zip")):
                    header = (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"'
                              f'\r\nContent-Type: {mime}\r\n\r\n')
                    self.wfile.write(header.encode())
                    with (work / name).open("rb") as file:
                        shutil.copyfileobj(file, self.wfile)
                    self.wfile.write(b"\r\n")
                self.wfile.write(f"--{boundary}--\r\n".encode())
        except (BrokenPipeError, ConnectionResetError):
            return
        except (TypeError, KeyError, ValueError) as err:
            self.message(400, str(err) if isinstance(err, ValueError) else "Estrutura de composição inválida.")
        except Exception:
            logging.exception("Falha no render nativo")
            self.message(500, "O motor não conseguiu concluir esta exportação.")
        finally:
            slot.release()


if __name__ == "__main__":
    threading.Thread(target=expire_results, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
