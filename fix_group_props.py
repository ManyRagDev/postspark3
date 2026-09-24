import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

# Arrumando Headline
content = content.replace(
"""                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "headlinePos")}
              >
                width={activeHeadlineWidth}
                onTransform={(e: any) => handleTextTransform(e, setLocalHeadlineWidth, setLocalHeadlineScale)}
                onTransformEnd={(e: any) => handleTextTransformEnd(e, "headline", setLocalHeadlineWidth, setLocalHeadlineScale, activeHeadlineScale)}""",
"""                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "headlinePos")}
                width={activeHeadlineWidth}
                onTransform={(e: any) => handleTextTransform(e, setLocalHeadlineWidth, setLocalHeadlineScale)}
                onTransformEnd={(e: any) => handleTextTransformEnd(e, "headline", setLocalHeadlineWidth, setLocalHeadlineScale, activeHeadlineScale)}
              >"""
)

# Arrumando Subtext
content = content.replace(
"""                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "subtextPos")}
              >
                width={activeSubtextWidth}
                onTransform={(e: any) => handleTextTransform(e, setLocalSubtextWidth, setLocalSubtextScale)}
                onTransformEnd={(e: any) => handleTextTransformEnd(e, "subtext", setLocalSubtextWidth, setLocalSubtextScale, activeSubtextScale)}""",
"""                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "subtextPos")}
                width={activeSubtextWidth}
                onTransform={(e: any) => handleTextTransform(e, setLocalSubtextWidth, setLocalSubtextScale)}
                onTransformEnd={(e: any) => handleTextTransformEnd(e, "subtext", setLocalSubtextWidth, setLocalSubtextScale, activeSubtextScale)}
              >"""
)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)
