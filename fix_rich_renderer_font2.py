import re

with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "r") as f:
    content = f.read()

# Substituir o uso direto para uma versão mais segura do font family parsing
old_code_1 = 'ctx.font = `${cStyle}${chunkFontSize}px ${fontFamily}`;'
new_code_1 = """const safeFontFamily = fontFamily.split(',').map(f => f.trim().startsWith('"') || f.trim().startsWith("'") ? f : `"${f.trim()}"`).join(', ');
          ctx.font = `${cStyle}${chunkFontSize}px ${safeFontFamily}`;"""

old_code_2 = 'ctx.font = `${w.fontStyle} ${w.fontSize}px ${fontFamily}`;'
new_code_2 = """const safeFontFamily = fontFamily.split(',').map(f => f.trim().startsWith('"') || f.trim().startsWith("'") ? f : `"${f.trim()}"`).join(', ');
         ctx.font = `${w.fontStyle} ${w.fontSize}px ${safeFontFamily}`;"""

content = content.replace(old_code_1, new_code_1)
content = content.replace(old_code_2, new_code_2)

with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "w") as f:
    f.write(content)
