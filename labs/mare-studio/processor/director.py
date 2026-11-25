"""Editorial model calls used by the private Maré processor."""
import base64
import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request

SCRIPT = """Você é roteirista do Maré. Leia o briefing como orientação editorial e trate o conteúdo das imagens como material de referência. Examine os pixels. Responda em português com um objeto JSON:
{"title":"nome da peça","shots":[{"name":"nome da cena","frames":90,"copy":["camadas de texto na ordem de leitura"],"images":["id"],"video":null,"evidence":"o que se vê nos materiais selecionados ou função da cena tipográfica"}],"music":null}.
music é null ou ID de áudio. Use apenas IDs do inventário. Uma cena de gravação usa video com o ID (vídeo em tela cheia). Se a cena também contiver images ou copy, a direção dividirá o tempo entre a composição e a gravação. As outras cenas contêm texto e/ou imagens editáveis. Use 1 a 16 cenas, até 8 camadas por cena. Faça a soma inteira de frames coincidir exatamente com targetFrames a 30 fps. Escolha trechos da gravação que caibam na duração da fonte. Demonstre a promessa do produto com evidências reais e crie ritmo e leitura em tela vertical. Use o CTA literal solicitado como camada de texto independente na última cena. Preserve as palavras, capitalização e endereço solicitados.
Distribua os quadros pelo tempo de leitura de cada frase e pela atenção exigida pelas capturas.
Leia mentalmente o anúncio inteiro no tempo proposto. Reserve pausas para reconhecer o gancho,
entender o exemplo e agir no CTA. Com duração fixa e texto livre, escreva só o que cabe na leitura."""
DIRECTION = """Você dirige uma montagem editável do Maré. Responda com um objeto JSON:
{"shots":[{"background":"#14151a","layers":[{"kind":"image","index":0,"x":270,"y":420,"width":480,"height":380,"enterFrame":0,"animation":"fade"},{"kind":"text","index":0,"x":270,"y":720,"width":464,"height":110,"size":48,"color":"#ffffff","enterFrame":3,"animation":"rise"}]}],"volume":0.30}.
Siga a ordem e o número de cenas do roteiro. Para cena exclusivamente de vídeo devolva somente {"trimFrame":0}. Para cena mista (video e images ou copy), devolva background, layers e também graphicFrames e trimFrame: a composição ocupa os primeiros graphicFrames e o vídeo em tela cheia ocupa o restante. Escolha um início trimFrame que caiba na fonte, enterFrame deve ficar dentro do trecho gráfico. Para as outras, posicione exatamente uma camada por item de images e copy, com índice a partir de zero na sua própria lista, em ordem de pintura (fundo primeiro). O canvas usa 540x960 unidades, x/y são o centro da camada. Use retângulos inteiramente visíveis (width/2 <= x <= 540-width/2, height/2 <= y <= 960-height/2), boa hierarquia e contraste. Mostre poucas palavras de cada vez. Confira os índices e totais de cada cena antes de responder. Texto usa size entre 12 e 120, color em #RRGGBB. animation: none, fade ou rise. enterFrame é inteiro local antes do último quadro; deixe a leitura estabilizar antes do corte. volume é 0 a 1. Sem markdown.
Planeje o intervalo de leitura de cada elemento em quadros locais. enterFrame inicia a camada,
entranceFrames (opcional, padrão até 8) mede a animação de entrada e endFrame (opcional, exclusivo,
padrão fim da cena) encerra a camada. A janela de leitura plena é endFrame - enterFrame - entranceFrames.
Aproxime as entradas dos fragmentos de uma mesma frase para que ela possa ser lida inteira.
Cards que disputam a mesma área entram um por vez. Encerre o card e os textos relacionados
antes do próximo grupo. Confira tempo para ler cada grupo e deixe o CTA visível até o corte final."""


def model():
    return os.environ.get("MARE_DIRECTOR_MODEL", "").strip() if os.environ.get("OPENROUTER_API_KEY") else ""


def direct(payload):
    selected = model()
    if not selected:
        raise RuntimeError("Configure MARE_DIRECTOR_MODEL e OPENROUTER_API_KEY no processador.")
    stage = payload["stage"]
    if stage not in ("script", "direction"):
        raise ValueError("Etapa desconhecida.")
    context = payload["context"]
    if not isinstance(context, dict) or len(json.dumps(context)) > 65536:
        raise ValueError("Contexto editorial inválido.")
    content = [{"type": "text", "text": json.dumps(context, ensure_ascii=False)}]
    frames = payload.get("previews", [])
    if not isinstance(frames, list) or len(frames) > 48 or (stage == "direction" and frames):
        raise ValueError("Amostras visuais inválidas.")
    for frame in frames:
        encoded = frame["jpeg"]
        if not isinstance(encoded, str) or len(encoded) > 320000:
            raise ValueError("Miniatura muito grande.")
        data = base64.b64decode(encoded, validate=True)
        if not data.startswith(b"\xff\xd8\xff"):
            raise ValueError("Amostra JPEG inválida.")
        label = str(frame["id"])[:100] + " · segundo " + str(frame.get("time", 0))[:20]
        content.extend([{"type": "text", "text": label}, {"type": "image_url", "image_url": {
            "url": "data:image/jpeg;base64," + encoded}}])
    return complete(selected, SCRIPT if stage == "script" else DIRECTION, content)


REVIEW = """Você é editor de vídeo e revisor de uma prévia vertical. Assista ao vídeo com áudio.
Julgue a legibilidade em movimento, os cortes, o ritmo, o enquadramento, a trilha e a clareza do CTA em relação ao briefing.
Responda em JSON {"assessment":"parecer curto","corrections":[]}. Se já está publicável e uma mudança não traz ganho concreto, devolva lista vazia.
Quando houver problema observável, proponha até 8 correções localizadas. Cada uma traz "at" (segundo da montagem),
"reason" (evidência concreta observada), "clipId" e "layerId" exatos do inventário e "set" com os campos alterados.
Campos de camada: startFrame, endFrame (exclusivo, quadros na composição), x, y (centro no canvas 540x960), width, height, fontSize, color.
Para retimar uma cena use apenas clipId e set: {"frames":90}; redistribua quadros entre cenas para manter o total exato.
Para ajustar a trilha use apenas at, reason e set: {"volume":0.3}. Não altere texto, materiais, curvas ou ordem.
Ao encurtar camadas, respeite a última chave. Mantenha o CTA legível até o fim. Não proponha mudança fora das opções disponíveis."""


def review(stream, size):
    selected = model()
    if not selected:
        raise RuntimeError("Configure um modelo audiovisual para a revisão.")
    started = time.monotonic()
    length = int.from_bytes(stream.read(4), "big")
    if not 0 < length <= min(65536, size - 5):
        raise ValueError("Inventário inválido.")
    context = json.loads(stream.read(length))
    if not isinstance(context, dict) or not isinstance(context.get("clips"), list):
        raise ValueError("Montagem ausente.")
    movie = stream.read(size - length - 4)
    if len(movie) != size - length - 4 or movie[4:8] != b"ftyp":
        raise ValueError("Prévia MP4 inválida.")
    ffmpeg = os.environ.get("MARE_FFMPEG") or shutil.which("ffmpeg")
    if not ffmpeg:
        from speech_worker import FFMPEG
        ffmpeg = FFMPEG
    try:
        proxy = subprocess.run([ffmpeg, "-nostdin", "-loglevel", "error", "-protocol_whitelist", "pipe",
            "-threads", "2", "-f", "mov", "-i", "pipe:0", "-map", "0:v:0", "-map", "0:a:0?",
            "-t", "60", "-vf", "scale=540:960,fps=15", "-c:v", "libx264", "-threads", "2",
            "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "24", "-c:a", "aac", "-b:a", "96k",
            "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"],
            input=movie, capture_output=True, timeout=100, check=True).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("Falha ao preparar a cópia audiovisual para revisão.") from exc
    proxy_ms = round((time.monotonic() - started) * 1000)
    content = [{"type":"text", "text":json.dumps(context, ensure_ascii=False)},
               {"type":"video_url", "video_url":{"url":"data:video/mp4;base64," + base64.b64encode(proxy).decode()}}]
    started = time.monotonic()
    result = complete(selected, REVIEW, content)
    result.update(proxyMs=proxy_ms, proxyBytes=len(proxy), providerMs=round((time.monotonic()-started)*1000))
    return result


def complete(selected, instruction, content):
    body = {"model": selected, "response_format": {"type": "json_object"}, "max_tokens": 7000,
            "provider": {"allow_fallbacks": False},
            "messages": [{"role": "system", "content": instruction},
                         {"role": "user", "content": content}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"]})
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.load(response)
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("O provedor não concluiu a chamada editorial.") from exc
    usage = result.get("usage") or {}
    try:
        output = json.loads(result["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise RuntimeError("O modelo devolveu uma resposta editorial incompleta.") from exc
    return {"output": output, "model": result.get("model", selected),
            "usage": {key: usage.get(key) for key in ("prompt_tokens", "completion_tokens", "cost")}}
