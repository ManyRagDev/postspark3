# 📋 Relatório: API de Geração de Imagens — Pollinations.ai

> Gerado em: 03/03/2026
> Fonte: [pollinations.ai](https://pollinations.ai) | [Documentação oficial](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)

---

## 🌐 Visão Geral

O **Pollinations.ai** é uma plataforma open-source de geração de IA baseada em Berlim, com mais de 500 apps na comunidade e 3 milhões de usuários mensais. Ela oferece uma **API unificada** no endpoint `https://gen.pollinations.ai` para geração de imagens, texto, áudio e vídeo.

A moeda interna da plataforma é o **Pollen** (~$1 ≈ 1 Pollen). Cada conta recebe uma cota diária gratuita de Pollen dependendo do tier:

| Tier | Pollen/dia | Como desbloquear |
|------|-----------|-----------------|
| 🌱 Spore | 1,5/semana | Verificar conta |
| 🌿 Seed | 3/dia | 8+ dev points (auto-upgrade semanal) |
| 🌸 Flower | 10/dia | Publicar um app |
| 🍯 Nectar | 20/dia | Em breve |

---

## 🔑 Autenticação

Existem dois tipos de chave de API, criadas em [enter.pollinations.ai](https://enter.pollinations.ai):

| Tipo | Prefixo | Uso recomendado | Rate Limit |
|------|---------|----------------|-----------|
| **Publishable** | `pk_` | Client-side, demos, protótipos (⚠️ Beta) | 1 Pollen/IP/hora |
| **Secret** | `sk_` | Server-side, produção | Sem rate limit |

> ⚠️ **Nunca exponha chaves `sk_` em código client-side, repositórios públicos ou URLs públicas.**

### Formas de enviar a chave

**Via header HTTP (recomendado):**

```
Authorization: Bearer YOUR_API_KEY
```

**Via query parameter:**

```
?key=YOUR_API_KEY
```

---

## 📖 Tutorial: Como Chamar a API de Geração de Imagens

### Endpoint principal

```
GET https://gen.pollinations.ai/image/{prompt}
```

O `{prompt}` deve ser **URL-encoded** (espaços viram `%20`, etc.).

**Parâmetros de query disponíveis:**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `model` | string | Modelo a usar (ex: `flux`, `nanobanana`, `gptimage`). Padrão: `flux` |
| `key` | string | Sua API key (alternativa ao header Authorization) |

---

### Método 1 — cURL (linha de comando)

```bash
curl 'https://gen.pollinations.ai/image/a%20beautiful%20sunset%20over%20mountains?model=flux' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -o imagem.jpg
```

---

### Método 2 — Python

```python
import requests

def gerar_imagem(prompt: str, model: str = "flux", api_key: str = "YOUR_API_KEY") -> None:
    url = f"https://gen.pollinations.ai/image/{requests.utils.quote(prompt)}"
    params = {"model": model}
    headers = {"Authorization": f"Bearer {api_key}"}

    response = requests.get(url, params=params, headers=headers)
    response.raise_for_status()

    with open("imagem_gerada.jpg", "wb") as f:
        f.write(response.content)
    print("✅ Imagem salva com sucesso!")

# Exemplo de uso
gerar_imagem(
    prompt="a futuristic city at night, neon lights, cyberpunk style",
    model="flux"
)
```

---

### Método 3 — JavaScript / Node.js

```javascript
const fs = require("fs");

async function gerarImagem(prompt, model = "flux", apiKey = "YOUR_API_KEY") {
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${model}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) throw new Error(`Erro: ${res.status} ${res.statusText}`);

  const buffer = await res.arrayBuffer();
  fs.writeFileSync("imagem_gerada.jpg", Buffer.from(buffer));
  console.log("✅ Imagem salva com sucesso!");
}

// Exemplo de uso
gerarImagem("a serene japanese garden in spring, cherry blossoms", "nanobanana");
```

---

### Método 4 — URL direta no navegador (sem autenticação)

Para testes rápidos, basta acessar no navegador:

```
https://pollinations.ai/p/a_beautiful_landscape_painting_impressionist_style
```

Substitua o texto pelo seu prompt (use `_` no lugar de espaços). Não requer API key.

---

### Método 5 — Listar modelos disponíveis via API

```bash
curl 'https://gen.pollinations.ai/image/models' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

---

### Gerenciar saldo e uso

```bash
# Verificar saldo de Pollen
curl 'https://gen.pollinations.ai/account/balance' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# Ver perfil da conta
curl 'https://gen.pollinations.ai/account/profile' \
  -H 'Authorization: Bearer YOUR_API_KEY'

# Ver histórico de uso
curl 'https://gen.pollinations.ai/account/usage' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

---

## 🏆 Modelos de Geração de Imagem

> 💡 A coluna **"Imgs com 3 Pollen"** mostra quantas imagens você consegue gerar com a cota diária do tier **Seed** (3 Pollen/dia), considerando apenas o custo de output. Prompts mais longos ou uso de imagem de entrada podem reduzir esse número.

---

### ⭐ Melhores em Qualidade

| Modelo | Nome Completo | Preço/imagem | Paga? | Destaque | 🖼️ Imgs com 3 Pollen |
|--------|--------------|-------------|-------|---------|----------------------|
| `kontext` | FLUX.1 Kontext | 0,04 Pollen | ✅ Pago | Edição contextual avançada, ideal para editar imagens existentes | **75 imagens** |
| `gptimage-large` | GPT Image 1.5 | 0,032 Pollen | ✅ Pago | Modelo avançado da OpenAI, altíssima qualidade e fidelidade ao prompt | **~93 imagens** |
| `nanobanana-pro` | NanoBanana Pro — Gemini 3 Pro | 0,00012 Pollen | ✅ Pago | Gemini 3 Pro, suporte a 4K e modo Thinking | **25.000 imagens** |
| `nanobanana-2` | NanoBanana 2 — Gemini 3.1 Flash | 0,00006 Pollen | ✅ Pago | Versão mais recente do NanoBanana, baseada no Gemini 3.1 Flash | **50.000 imagens** |
| `seedream5` | Seedream 5.0 Lite | 0,035 Pollen | ✅ Pago | ByteDance, web search integrado + reasoning | **~85 imagens** |
| `klein-large` | FLUX.2 Klein 9B | 0,012 Pollen | 🆓 Gratuito* | Alta qualidade, suporta edição de imagem | **250 imagens** |

---

### 💰 Melhores Custo-Benefício

| Modelo | Nome Completo | Preço/imagem | Paga? | Destaque | 🖼️ Imgs com 3 Pollen |
|--------|--------------|-------------|-------|---------|----------------------|
| `nanobanana` | NanoBanana — Gemini 2.5 Flash | 0,00003 Pollen | ✅ Pago | Extremamente barato, baseado no Gemini 2.5 Flash | **100.000 imagens** |
| `flux` | Flux Schnell | 0,0002 Pollen | 🆓 Gratuito | Rápido, alta qualidade, **modelo padrão** da plataforma | **15.000 imagens** |
| `zimage` | Z-Image Turbo | 0,0002 Pollen | 🆓 Gratuito | Flux 6B com upscaling 2x incluído | **15.000 imagens** |
| `gptimage` | GPT Image 1 Mini | 0,000008 Pollen | 🆓 Gratuito | Modelo Mini da OpenAI, boa qualidade a baixo custo | **375.000 imagens** |
| `imagen-4` | Imagen 4 (Google) | 0,0025 Pollen | 🆓 Gratuito* | Último modelo do Google para imagens | **1.200 imagens** |
| `grok-imagine` | Grok Imagine (xAI) | 0,0025 Pollen | 🆓 Gratuito* | Modelo de imagens da xAI | **1.200 imagens** |
| `klein` | FLUX.2 Klein 4B | 0,008 Pollen | 🆓 Gratuito* | Geração e edição rápidas no Modal | **375 imagens** |
| `flux-2-dev` | FLUX.2 Dev | 0,001 Pollen | 🆓 Gratuito* | Segunda geração do Flux | **3.000 imagens** |

---

### 🍌 Família NanoBanana (destaque especial)

Todos os modelos da família aceitam entrada de imagem (image-to-image) e são baseados nos modelos Gemini do Google:

| Modelo | Base | Preço output/img | Destaque | 🖼️ Imgs com 3 Pollen |
|--------|------|-----------------|---------|----------------------|
| `nanobanana` | Gemini 2.5 Flash | 0,00003 Pollen | O mais barato da família | **100.000 imagens** |
| `nanobanana-2` | Gemini 3.1 Flash | 0,00006 Pollen | Mais recente e rápido | **50.000 imagens** |
| `nanobanana-pro` | Gemini 3 Pro | 0,00012 Pollen | 4K + modo Thinking, maior qualidade | **25.000 imagens** |

> ⚠️ Modelos da família NanoBanana também cobram por tokens de texto e imagem de **entrada** (`promptTextTokens`, `promptImageTokens`), então o número real de imagens geradas será um pouco menor dependendo do tamanho do prompt.

---

## 📊 Recomendações por Caso de Uso

| Necessidade | Modelo recomendado | Motivo |
|-------------|-------------------|--------|
| Máxima qualidade sem limite de custo | `kontext` ou `gptimage-large` | Modelos de ponta |
| Melhor equilíbrio qualidade/custo | `flux` | Padrão da plataforma, rápido e gratuito |
| Máximo volume de imagens por Pollen | `nanobanana` | 100k imagens com apenas 3 Pollen |
| Prompts complexos com alta fidelidade | `nanobanana-pro` | 4K + Thinking mode |
| Edição de imagens existentes | `kontext` ou `nanobanana-pro` | Suporte a image-to-image avançado |
| Imagens com upscaling automático | `zimage` | Flux 6B com 2x upscaling incluído |

---

## 🔗 Links Úteis

| Recurso | Link |
|---------|------|
| Site oficial | [pollinations.ai](https://pollinations.ai) |
| Dashboard / API Keys | [enter.pollinations.ai](https://enter.pollinations.ai) |
| Documentação da API | [APIDOCS.md no GitHub](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md) |
| Repositório GitHub | [github.com/pollinations/pollinations](https://github.com/pollinations/pollinations) |
| Lista de modelos de imagem | [gen.pollinations.ai/image/models](https://gen.pollinations.ai/image/models) |
| Discord da comunidade | [discord.gg/pollinations](https://discord.gg/8HqSRhJVxn) |

---

*Relatório gerado com base na documentação oficial e nos endpoints da API do Pollinations.ai.*
