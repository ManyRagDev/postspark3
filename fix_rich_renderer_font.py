import re

with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "r") as f:
    content = f.read()

# Troca ctx.font = ...
content = content.replace(
    'ctx.font = `${cStyle}${chunkFontSize}px "${fontFamily}", sans-serif`;',
    'ctx.font = `${cStyle}${chunkFontSize}px ${fontFamily}`;'
)
content = content.replace(
    'ctx.font = `${w.fontStyle} ${w.fontSize}px "${fontFamily}", sans-serif`;',
    'ctx.font = `${w.fontStyle} ${w.fontSize}px ${fontFamily}`;'
)

# Há mais um lugar que precisa de atenção?
# Se a fonte falhar e o browser ignorar, a font property lida do ctx continua a velha.
# Vou adicionar um log ou validação manual se eu quisesse, mas tirar aspas falsas já resolve.

with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "w") as f:
    f.write(content)

