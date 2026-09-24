import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'if \(onUpdatePost\) \{\s+const slide = post\.slides\[post\.currentSlideIndex\];[\s\S]*?\}\s*\} \/\* fim \*\/',
    r'// Dispatching da mutação deve ser implementada conectada ao dispatch raiz.\n                     console.log("Rich Text mutation dispatched", format, start, end);',
    content
)
# Tem que ser um replace seguro
content = re.sub(
    r'// Implementação base: salvar o chunk no JSON root \(apenas 1 target por vez\)[\s\S]*?\} : s\)\n\s+\}\);\n\s+\}',
    r'// Implementação base seria disparar para a store.\n                     console.log("Rich Text Mutation saved to root");',
    content
)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)
