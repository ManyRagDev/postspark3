import re

with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "r") as f:
    content = f.read()

# 1. Adicionar x, y na desestruturação
old_sig = """  opacity = 1,
  ...restProps
}: RichTextRendererProps) {"""
new_sig = """  opacity = 1,
  x = 0,
  y = 0,
  ...restProps
}: RichTextRendererProps) {"""
content = content.replace(old_sig, new_sig)

# 2. Modificar o Group e Text
old_render = """  return (
    <Group opacity={opacity} {...restProps}>
      {finalWords.map((wordObj, i) => (
        <Text
          key={i}
          text={wordObj.text}
          x={wordObj.x}
          y={wordObj.y}
          fontSize={wordObj.fontSize}
          fontFamily={fontFamily}
          fontStyle={wordObj.fontStyle}
          fill={wordObj.fill}
          textBaseline="top"
          letterSpacing={letterSpacing}
          {...restProps}
        />
      ))}
    </Group>
  );"""

new_render = """  return (
    <Group opacity={opacity} x={x} y={y} {...restProps}>
      {finalWords.map((wordObj, i) => (
        <Text
          key={i}
          text={wordObj.text}
          x={wordObj.x}
          y={wordObj.y}
          fontSize={wordObj.fontSize}
          fontFamily={fontFamily}
          fontStyle={wordObj.fontStyle}
          fill={wordObj.fill}
          textBaseline="top"
          letterSpacing={letterSpacing}
          shadowColor={restProps.shadowColor}
          shadowBlur={restProps.shadowBlur}
          shadowOffsetX={restProps.shadowOffsetX}
          shadowOffsetY={restProps.shadowOffsetY}
          stroke={restProps.stroke}
          strokeWidth={restProps.strokeWidth}
        />
      ))}
    </Group>
  );"""

content = content.replace(old_render, new_render)

with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "w") as f:
    f.write(content)

