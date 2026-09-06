---
name: image-pipeline-resilience
description: >
  Padrão de resiliência para geração de imagens, validação estrita de assinatura binária,
  cadeia de fallback automática (OpenRouter -> Pollinations -> Unsplash) e manipulação no Canvas (Estilo Canva).
---

# Skill: Resiliência do Pipeline de Imagens & Fundo (PostSpark)

Esta habilidade orienta a implementação e manutenção de todo o ciclo de vida de imagens no PostSpark: geração com IA, prevenção contra arquivos corrompidos, e o editor interativo de planos de fundo no CanvasLab (estilo Canva).

---

## 1. Cadeia de Fallback de Geração de Fundo

A geração de fundos por IA opera com uma estratégia multi-nível de tolerância a falhas em `server/imageGenerateBackground.ts`:

1. **Provedor Primário (OpenRouter / Modelos Dedicados):**
   - Chamada HTTP com timeout estrito.
   - Resposta esperada: URL ou Base64 de imagem.
2. **Fallback Automático Nível 1 (Pollinations.ai):**
   - Se o provedor primário responder com erro de cota (429), indisponibilidade (502/503) ou timeout, o sistema comuta automaticamente para o Pollinations (`nanobanana-pro` / `pollinations_hd`).
   - Log padronizado: `[ImageGen] Switching image service { failedService, nextService: 'Pollinations.ai' }`.
3. **Fallback Nível 2 (Texturas / Unsplash / Sólidos):**
   - Se os provedores generativos falharem, o sistema consome uma textura visual compatível com a família visual do post, sem jamais travar a experiência do usuário.

---

## 2. Validação Estrita de Assinatura Binária (Magic Numbers)

**NUNCA confie apenas no cabeçalho `Content-Type` retornado pela API.** Provedores de IA frequentemente retornam status HTTP 200 com páginas HTML de erro de proxy ou JSONs de erro mascarados.

Toda imagem recebida deve passar pela validação de assinatura binária antes de ser gravada ou repassada ao cliente:
* **PNG:** Começa com os bytes `0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A` (`\x89PNG\r\n\x1a\n`).
* **JPEG:** Começa com `0xFF, 0xD8, 0xFF`.
* **WebP:** Contém `RIFF` nos bytes 0-3 e `WEBP` nos bytes 8-11.

Se a assinatura for inválida, a função `validatedDataUri` rejeita o payload imediatamente, forçando o fallback para o próximo provedor.

---

## 3. Manipulação de Imagens no CanvasLab (Estilo Canva)

A manipulação de fundo no canvas (`CanvasPostStage.tsx`) segue padrões rigorosos:

### A. Cálculo de Crop Proporcional (`getCoverCrop`)
Imagens inseridas no palco (1:1, 5:6 ou 9:16) devem simular `object-fit: cover` matematicamente sem distorção anamórfica:
```ts
function getCoverCrop(imageWidth: number, imageHeight: number, targetWidth: number, targetHeight: number) {
  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;
  let cropWidth = imageWidth;
  let cropHeight = imageHeight;
  let cropX = 0;
  let cropY = 0;

  if (imageRatio > targetRatio) {
    cropWidth = imageHeight * targetRatio;
    cropX = (imageWidth - cropWidth) / 2;
  } else {
    cropHeight = imageWidth / targetRatio;
    cropY = (imageHeight - cropHeight) / 2;
  }

  return { x: Math.round(cropX), y: Math.round(cropY), width: Math.round(cropWidth), height: Math.round(cropHeight) };
}
```

### B. Objeto de Transformação de Fundo (`BgImageTransform`)
A posição, escala e rotação customizadas da imagem pertencem ao slide ativo:
```ts
export interface BgImageTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation?: number;
}
```

### C. Modo de Edição de Fundo Isolado
Quando `isEditingBackground === true`:
1. O primeiro plano (textos, badges, logos) tem sua opacidade reduzida para `0.35` e seus eventos desativados (`listening={false}`);
2. O Transformer principal esvazia seus nós (`transformerRef.current.nodes([])`);
3. O `bgTransformerRef` é anexado ao nó da imagem com bordas em laranja (`#FF5C00`), rotação bloqueada e proporção travada (`keepRatio={true}`);
4. Ao sair do modo de edição, o `bgTransformerRef` é desanexado e as coordenadas consolidadas são salvas no slide.
