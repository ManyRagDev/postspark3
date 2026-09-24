import re

# 1. CanvasLabPage.tsx
with open("client/src/pages/CanvasLab/CanvasLabPage.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'updatedSlide\[`\$\{elementKey\}Pos` as any\] = \{ x: props\.x, y: props\.y \};',
    r'(updatedSlide as any)[`${elementKey}Pos`] = { x: props.x, y: props.y };',
    content
)
content = re.sub(
    r'updatedSlide\[`\$\{elementKey\}Width` as any\] = props\.width;',
    r'(updatedSlide as any)[`${elementKey}Width`] = props.width;',
    content
)
content = re.sub(
    r'updatedSlide\[`\$\{elementKey\}Scale` as any\] = props\.scale;',
    r'(updatedSlide as any)[`${elementKey}Scale`] = props.scale;',
    content
)

with open("client/src/pages/CanvasLab/CanvasLabPage.tsx", "w") as f:
    f.write(content)

# 2. CanvasPostStage.tsx
with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

# Desestruturar prop
content = re.sub(
    r'onUpdateElementPosition,\s+onSelectElement,',
    r'onUpdateElementPosition,\n      onUpdateTextTransform,\n      onSelectElement,',
    content
)

# Tipagem do `e` nos jsx
content = re.sub(
    r'onTransform=\{\(e\) => handleTextTransform\(e,',
    r'onTransform={(e: any) => handleTextTransform(e,',
    content
)
content = re.sub(
    r'onTransformEnd=\{\(e\) => handleTextTransformEnd\(e,',
    r'onTransformEnd={(e: any) => handleTextTransformEnd(e,',
    content
)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)

print("Patch executado.")
