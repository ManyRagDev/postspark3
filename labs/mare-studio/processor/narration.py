"""Generate an MP3 for the private montage editor."""
import json
import os
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CATALOG = json.loads((Path(__file__).resolve().parents[1] / "dist/assets/narration.json").read_text())
MAX_AUDIO_BYTES = 4 * 1024 * 1024


class NarrationError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def synthesize(draft):
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
            audio = response.read(MAX_AUDIO_BYTES + 1)
        if len(audio) <= MAX_AUDIO_BYTES and (audio.startswith(b"ID3") or
                (len(audio) > 3 and audio[0] == 255 and audio[1] & 0xe0 == 0xe0)):
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
