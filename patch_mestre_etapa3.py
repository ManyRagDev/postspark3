import re

with open("DOCUMENTO_MESTRE.md", "r") as f:
    content = f.read()

adr_content = """
## 13.15 ADR — Motor de Rich Text Nativo Konva (2026-09-23)
Implementada a Etapa 3 da refatoração de tipografia do CanvasLab:
1. **Schema JSON de Rich Text**: A interface `CanvasRichTextChunk` foi criada no `CanvasPostModel` e implementada dentro de `CarouselSlideItem` (via `headlineRich` e `subtextRich`) e `CanvasCustomText`.
2. **Mini-Barra Flutuante (`RichTextFloatingToolbar.tsx`)**: Injetada acima da caixa de edição (`<textarea>`) do CanvasLab, capaz de captar seleções do DOM e disparar formatações granulares de Cor e Tamanho (Ex: T+, T-).
3. **Konva Rendering 2D Engine (`RichTextRenderer.tsx`)**: Para suportar nós de cores diferentes sem o DOM `foreignObject` (visando manter as fontes carregáveis na exportação zip), o motor cria os nós de `<Text>` do Konva posicionados individualmente. A quebra de linha utiliza `canvas.measureText()` nativo antes do envio ao WebGL. O alinhamento resolve conflitos com tamanhos variados usando `textBaseline="top"` nativo e cálculo de offsets locais para Y e alinhamento center/right.

## 14. Comandos de Validação e Deploy"""

content = content.replace("## 14. Comandos de Validação e Deploy", adr_content.strip())

with open("DOCUMENTO_MESTRE.md", "w") as f:
    f.write(content)
