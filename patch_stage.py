import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

# 1. Adicionar local state pro resize de largura
# Isso ja foi adicionado pelo replace_file_content!

# 2. Adicionar as definições de activeHeadlineWidth e handlers (Linha ~627)
def_patch = """
    const contentWidth = baseWidth - (isGlass ? 56 : 48);
    const activeHeadlineWidth = localHeadlineWidth ?? currentSlide?.headlineWidth ?? contentWidth;
    const activeSubtextWidth = localSubtextWidth ?? currentSlide?.subtextWidth ?? contentWidth;
    const activeHeadlineScale = currentSlide?.headlineScale ?? 1;
    const activeSubtextScale = currentSlide?.subtextScale ?? 1;

    const handleTextTransform = (e: any, setLocalWidth: any, setLocalScale: any) => {
      const activeAnchor = transformerRef.current?.getActiveAnchor();
      const node = e.target;
      const scaleX = node.scaleX();
      
      if (activeAnchor === "middle-left" || activeAnchor === "middle-right") {
        const currentWidth = node.width() || baseWidth;
        const newWidth = Math.max(40, Math.round(currentWidth * scaleX));
        node.scaleX(1);
        node.scaleY(1);
        node.width(newWidth);
        setLocalWidth(newWidth);
      } else if (activeAnchor) {
        // Canto
        const scale = scaleX;
        node.scaleX(1);
        node.scaleY(1);
        setLocalScale(scale);
      }
    };

    const handleTextTransformEnd = (e: any, elementKey: "headline" | "subtext", setLocalWidth: any, setLocalScale: any, currentScale: number) => {
      const node = e.target;
      const activeAnchor = transformerRef.current?.getActiveAnchor();
      if (activeAnchor === "middle-left" || activeAnchor === "middle-right") {
          const newWidth = node.width();
          if (onUpdateTextTransform) {
              onUpdateTextTransform(elementKey, { width: newWidth, x: Math.round(node.x()), y: Math.round(node.y()) });
          }
          setLocalWidth(null);
      } else if (activeAnchor) {
          const scaleOffset = localHeadlineScale ?? localSubtextScale ?? 1;
          const newScale = currentScale * scaleOffset;
          if (onUpdateTextTransform) {
              onUpdateTextTransform(elementKey, { scale: newScale, x: Math.round(node.x()), y: Math.round(node.y()) });
          }
          setLocalScale(null);
      }
    };
"""
content = re.sub(r'const contentWidth = baseWidth - \(isGlass \? 56 : 48\);', def_patch.strip(), content, count=1)

# 3. Atualizar fontSize para usar a escala do activeHeadlineScale
content = re.sub(
    r'const headlineFontSize = Math\.round\(baseWidth \* 0\.08\) \* \(post\.headlineSizeScale \|\| 1\);',
    r'const headlineFontSize = Math.round(baseWidth * 0.08) * (post.headlineSizeScale || 1) * activeHeadlineScale * (localHeadlineScale ?? 1);',
    content, count=1
)
content = re.sub(
    r'const subtextFontSize = Math\.round\(baseWidth \* 0\.038\) \* \(post\.subtextSizeScale \|\| 1\);',
    r'const subtextFontSize = Math.round(baseWidth * 0.038) * (post.subtextSizeScale || 1) * activeSubtextScale * (localSubtextScale ?? 1);',
    content, count=1
)

# 4. Modificar o Group do headline
content = re.sub(
    r'(<Group\s+ref=\{headlineRef\}\s+x=\{headlinePos\.x\}\s+y=\{headlinePos\.y\}\s+draggable=\{isInteractive\}\s+dragBoundFunc=\{isInteractive \? createSnapBoundFunc\(contentWidth, headlineHeight\) : undefined\}\s+onClick=\{\(\) => handleSelect\("headline"\)\}\s+onDblClick=\{\(\) => startEditing\("headline"\)\}\s+onDblTap=\{\(\) => startEditing\("headline"\)\}\s+onDragMove=\{handleDragMove\}\s+onDragEnd=\{\(e\) => handleDragEnd\(e, "headlinePos"\)\}\s+>)',
    r'\1\n                width={activeHeadlineWidth}\n                onTransform={(e) => handleTextTransform(e, setLocalHeadlineWidth, setLocalHeadlineScale)}\n                onTransformEnd={(e) => handleTextTransformEnd(e, "headline", setLocalHeadlineWidth, setLocalHeadlineScale, activeHeadlineScale)}',
    content, count=1
)

# Modificar a prop width e contentWidth do renderBackgroundEffect dentro do headline
content = re.sub(
    r'(effect: headlineEffect,\s+)contentWidth,',
    r'\1contentWidth: activeHeadlineWidth,',
    content, count=1
)

# Modificar a prop width do Text dentro do headline
content = re.sub(
    r'(<Text\s+text=\{activeHeadline\}\s+x=\{0\}\s+y=\{0\}\s+)width=\{contentWidth\}',
    r'\1width={activeHeadlineWidth}',
    content, count=1
)

# 5. Modificar o Group do subtext
content = re.sub(
    r'(<Group\s+ref=\{subtextRef\}\s+x=\{subtextPos\.x\}\s+y=\{subtextPos\.y\}\s+draggable=\{isInteractive\}\s+dragBoundFunc=\{isInteractive \? createSnapBoundFunc\(contentWidth, subtextHeight\) : undefined\}\s+onClick=\{\(\) => handleSelect\("subtext"\)\}\s+onDblClick=\{\(\) => startEditing\("subtext"\)\}\s+onDblTap=\{\(\) => startEditing\("subtext"\)\}\s+onDragMove=\{handleDragMove\}\s+onDragEnd=\{\(e\) => handleDragEnd\(e, "subtextPos"\)\}\s+>)',
    r'\1\n                width={activeSubtextWidth}\n                onTransform={(e) => handleTextTransform(e, setLocalSubtextWidth, setLocalSubtextScale)}\n                onTransformEnd={(e) => handleTextTransformEnd(e, "subtext", setLocalSubtextWidth, setLocalSubtextScale, activeSubtextScale)}',
    content, count=1
)

content = re.sub(
    r'(effect: subtextEffect,\s+)contentWidth,',
    r'\1contentWidth: activeSubtextWidth,',
    content, count=1
)

content = re.sub(
    r'(<Text\s+text=\{activeSubtext\}\s+x=\{0\}\s+y=\{0\}\s+)width=\{contentWidth\}',
    r'\1width={activeSubtextWidth}',
    content, count=1
)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)
print("Patcher executado com sucesso!")
