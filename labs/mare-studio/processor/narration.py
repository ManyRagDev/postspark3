"""Generate an MP3 for the private montage editor."""
import json
import logging
import math
import os
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "dist/assets/narration.json").read_text())
MAX_AUDIO_BYTES = 4 * 1024 * 1024


class NarrationError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def generation_cost(generation_id, key):
    url = "https://openrouter.ai/api/v1/generation?" + urlencode({"id": generation_id})
    request = Request(url, headers={"Authorization": "Bearer " + key})
    try:
        with urlopen(request, timeout=3) as response:
            data = json.loads(response.read(65537)).get("data") or {}
        value = data.get("total_cost")
        if data.get("id") == generation_id and type(value) in (float, int) and math.isfinite(value) and value >= 0:
            return value
    except (ValueError, AttributeError, OSError, HTTPException):
        return None
    return None


def synthesize(draft, receipt=None):
    if not isinstance(draft, dict):
        raise ValueError("Dados da narração inválidos.")
    text, model, voice = (draft.get(key) for key in ("text", "model", "voice"))
    if not isinstance(text, str) or not 0 < len(text.strip()) <= CATALOG["maxCharacters"]:
        raise ValueError("Confira o tamanho do roteiro.")
    if not isinstance(model, str) or model not in CATALOG["models"]:
        raise ValueError("Escolha um modelo de narração disponível.")
    if not isinstance(voice, str) or voice not in CATALOG["voices"]:
        raise ValueError("Escolha uma voz disponível.")
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise NarrationError(503, "Configure OPENROUTER_API_KEY no processador do Maré.")
    payload = dict(model=model, input=text.strip(), voice=voice, response_format="mp3",
                   provider={"options": {"elevenlabs": {"language_code": "pt"}}})
    request = Request("https://openrouter.ai/api/v1/audio/speech", data=json.dumps(payload).encode(),
                      headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                               "Accept": "audio/mpeg", "User-Agent": "PostSpark-Mare/1"})
    try:
        with urlopen(request, timeout=65) as response:
            generation_id = response.headers.get("X-Generation-Id")
            logging.info("mare_voice_receipt %s", json.dumps({"id": generation_id, "model": model,
                "characters": len(text.strip())}))
            if receipt is not None and generation_id:
                receipt["generationId"] = generation_id
            audio = response.read(MAX_AUDIO_BYTES + 1)
        if len(audio) <= MAX_AUDIO_BYTES and (audio.startswith(b"ID3") or
                (len(audio) > 3 and audio[0] == 255 and audio[1] & 0xe0 == 0xe0)):
            if receipt is not None and generation_id:
                receipt["cost"] = generation_cost(generation_id, key)
            return audio
        raise NarrationError(502, "O provedor devolveu um áudio inválido.")
    except HTTPError as error:
        messages = {400: "O provedor recusou o roteiro ou a voz. Experimente outra voz.",
                    401: "Confira a chave do OpenRouter no processador.",
                    402: "O saldo do OpenRouter é insuficiente.",
                    403: "A chave do OpenRouter não tem acesso a essa voz ou modelo.",
                    429: "O provedor está ocupado. Tente novamente em instantes."}
        raise NarrationError(429 if error.code == 429 else 502,
                             messages.get(error.code, "O provedor não conseguiu gerar a narração.")) from error
    except (OSError, URLError, HTTPException) as error:
        raise NarrationError(502, "Falha de conexão com o OpenRouter. Tente novamente.") from error
