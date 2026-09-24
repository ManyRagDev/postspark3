import re

with open("DOCUMENTO_MESTRE.md", "r") as f:
    content = f.read()

adr_content = """
## 13.14 ADR — Inspetor Contextual Universal no CanvasLab (2026-09-23)
Implementada a Etapa 2 da refatoração de UX do editor oficial:
1. **Property Inspector (UX Universal)**: O CanvasLab agora possui o módulo `PropertyInspector.tsx` responsável por substituir os painéis inteiros da Barra Lateral (`CanvasSidebar`) e do Drawer (`CanvasMobileDrawer`) quando há um elemento de texto selecionado.
2. **Separação de Abas vs Propriedades**: As abas globais de "Estilo", "Mídia" e "Conteúdo" continuam disponíveis apenas quando o CanvasLab não possui seleção ativa. Ao clicar em Título, Subtítulo ou Texto Extra, o Property Inspector fornece controles unificados (Cor, Fonte, Opacidade, Fundo de Legibilidade, Z-Index) focados estritamente na seleção atual.
3. **Limpeza da aba Style**: `TypographyColorControls` foi migrado globalmente para o escopo do Inspector.

## 14. Comandos de Validação e Deploy"""

content = content.replace("## 14. Comandos de Validação e Deploy", adr_content.strip())

with open("DOCUMENTO_MESTRE.md", "w") as f:
    f.write(content)
