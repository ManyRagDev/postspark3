import re

# 1. RichTextRendererProps
with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "r") as f:
    rcontent = f.read()

rcontent = rcontent.replace("interface RichTextRendererProps {\n  text: string;", "interface RichTextRendererProps {\n  text: string;\n  x?: number;\n  y?: number;")
with open("client/src/pages/CanvasLab/components/RichTextRenderer.tsx", "w") as f:
    f.write(rcontent)

# 2. CanvasPostStageProps
with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    scontent = f.read()

# Ache interface CanvasPostStageProps {
scontent = scontent.replace("interface CanvasPostStageProps {\n  post: CanvasPostModel;", 
                            "interface CanvasPostStageProps {\n  post: CanvasPostModel;\n  onUpdateRichText?: (field: \"headline\" | \"subtext\", chunks: CanvasRichTextChunk[]) => void;")

# Desconstrução: 
# onUpdateText,
# onUpdateElementVisibility,
if 'onUpdateText,\n      onUpdateElementVisibility,' in scontent:
    scontent = scontent.replace('onUpdateText,\n      onUpdateElementVisibility,', 'onUpdateText,\n      onUpdateRichText,\n      onUpdateElementVisibility,')

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(scontent)

