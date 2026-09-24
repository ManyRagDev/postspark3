import re

with open("DOCUMENTO_MESTRE.md", "r") as f:
    content = f.read()

adr_content = """
## 13.13 ADR — Word Wrap e Nova Física da Caixa de Texto no CanvasLab (2026-09-23)
Implementada a Etapa 1 da refatoração de redimensionamento de texto para o editor oficial:
1. **Redimensionamento Natural (Word Wrap Vivo)**: A deformação anamórfica de arrastar textos com escala livre foi removida. O componente `<Transformer>` do Konva agora oculta alças verticais para textos (`enabledAnchors`). Ajustar pelas alças laterais altera ativamente a propriedade `width` das caixas (`onTransform`), acionando o word wrap em tempo real sem esticar as letras.
2. **Dimensionamento Proporcional**: Arrastar pelas quinas altera o estado de escala proporcional da fonte e reinicia os atributos de matriz para 1, evitando acumulação de transformações na renderização.
3. **Persistência de Propriedades por Slide**: `CanvasPostModel.CarouselSlideItem` foi expandido para rastrear individualmente `headlineWidth`, `subtextWidth`, `headlineScale` e `subtextScale`, permitindo customizações seguras por slide que interagem perfeitamente com os manipuladores em `CanvasLabPage`.

## 14. Comandos de Validação e Deploy"""

content = content.replace("## 14. Comandos de Validação e Deploy", adr_content.strip())

with open("DOCUMENTO_MESTRE.md", "w") as f:
    f.write(content)
