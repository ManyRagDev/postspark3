---
name: canvas-export-4k
description: >
  Diretrizes para renderização offscreen em resolução 4K Ultra-HD (pixelRatio: 4), 
  exportação em lote de carrosséis com JSZip e preloading dinâmico de fontes no Konva.js.
---

# Skill: Exportação 4K & Empacotamento de Carrosséis (PostSpark)

Esta habilidade estabelece as diretrizes para exportação de posts e carrosséis com fidelidade visual absoluta em resolução 4K Ultra-HD (3840px / 4x scaling) e geração de arquivos ZIP no cliente.

---

## 1. Renderização 4K no Konva (`pixelRatio: 4`)

A exportação é exposta pelo `CanvasPostStage` através do hook imperativo `useImperativeHandle`:

```ts
export interface CanvasPostStageRef {
  exportPng4K: () => string;
  exportZip4K: (onProgress?: (current: number, total: number) => void) => Promise<Blob>;
}
```

### Regras de Exportação Limpa:
1. **Desativação de Ferramentas de Edição:** Antes de disparar `stage.toDataURL()`, **SEMPRE** oculte as alças de seleção e zere os nós do Transformer:
   ```ts
   setSelectedId(null);
   transformerRef.current?.nodes([]);
   bgTransformerRef.current?.nodes([]);
   ```
2. **Forçar Redesenho Síncrono:** Dispare `stage.getLayers().forEach(l => l.batchDraw())` para garantir que o frame esteja limpo e consolidado antes da rasterização.
3. **Escala 4x:** Utilize `pixelRatio: 4` e `mimeType: "image/png"` para garantir saída nítida de 1440x1440 (base 360x360) até 1440x2560 (base 9:16).

---

## 2. Exportação em Lote de Carrosséis com JSZip

Para exportar todas as lâminas de um carrossel sem travar a interface do usuário:

1. Instancie `new JSZip()`.
2. Itere sequencialmente sobre cada slide de `post.slides`.
3. Notifique o progresso via callback `onProgress(i + 1, post.slides.length)`.
4. Capture o `dataURL`, remova o cabeçalho base64 (`replace(/^data:image\/png;base64,/, "")`) e anexe ao arquivo ZIP:
   ```ts
   zip.file(`slide-${i + 1}.png`, base64Data, { base64: true });
   ```
5. Gere o arquivo final compactado via `zip.generateAsync({ type: "blob" })`.

---

## 3. Preloading e Resolução de Fontes Dinâmicas (`useDynamicFont`)

Fontes customizadas e do Google Fonts são carregadas dinamicamente no navegador.

### O Risco de Exportação com Fonte de Sistema:
Se a exportação 4K for disparada antes da fonte terminar o download, o Canvas 2D renderizará com uma fonte genérica de sistema (*Arial* ou *Times New Roman*), quebrando a diagramação.

### Solução:
* O hook `useDynamicFont` injeta e monitora a família ativa.
* Verifique se `document.fonts.check(`16px "${post.fontFamily}"`)` ou aguarde `document.fonts.ready` antes de concluir fluxos automatizados de exportação.
