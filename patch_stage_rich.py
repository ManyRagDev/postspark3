import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

# 1. Imports
if "RichTextRenderer" not in content:
    content = content.replace('import { CanvasRichTextChunk } from "./types";', 
        'import { CanvasRichTextChunk } from "./types";\nimport RichTextRenderer from "./RichTextRenderer";\nimport { applyRichTextFormat } from "../lib/richText";')

# 2. Props
old_prop = 'onUpdateText?: (field: "headline" | "subtext" | "badgeText" | "step", text: string) => void;'
new_prop = 'onUpdateText?: (field: "headline" | "subtext" | "badgeText" | "step", text: string) => void;\n  onUpdateRichText?: (field: "headline" | "subtext", chunks: CanvasRichTextChunk[]) => void;'
if old_prop in content and "onUpdateRichText?:" not in content:
    content = content.replace(old_prop, new_prop)

# 3. Prop Destructuring
old_destruct = 'onUpdateText,\n      onUpdateElementVisibility,'
new_destruct = 'onUpdateText,\n      onUpdateRichText,\n      onUpdateElementVisibility,'
if 'onUpdateText,\n      onUpdateElementVisibility,' in content:
    content = content.replace(old_destruct, new_destruct)

# 4. Variables chunks
old_vars = """    const activeHeadline = currentSlide ? currentSlide.headline : post.headline;
    const activeSubtext = currentSlide ? currentSlide.subtext : post.subtext;"""
new_vars = """    const activeHeadline = currentSlide ? currentSlide.headline : post.headline;
    const activeSubtext = currentSlide ? currentSlide.subtext : post.subtext;
    const activeHeadlineChunks = currentSlide ? currentSlide.headlineRich : post.headlineRich;
    const activeSubtextChunks = currentSlide ? currentSlide.subtextRich : post.subtextRich;"""
if "activeHeadlineChunks" not in content:
    content = content.replace(old_vars, new_vars)

# 5. RichTextFloatingToolbar callback
old_cb = """                  onApplyFormat={(format, start, end) => {
                     // Intercepta e salva mutações no modelo JSON
                     // (Por enquanto loga no console para o MVP da Etapa 3)
                     console.log("Mutações cirúrgicas aplicadas:", format, start, end);
                     // Implementação base seria disparar para a store.
                     console.log("Rich Text Mutation saved to root");
                  }}"""
new_cb = """                  onApplyFormat={(format, start, end) => {
                     if (!onUpdateRichText) return;
                     const target = editingTargetRef.current;
                     if (target === "headline") {
                         const newChunks = applyRichTextFormat(editingText, activeHeadlineChunks, format, start, end);
                         onUpdateRichText("headline", newChunks);
                     } else if (target === "subtext") {
                         const newChunks = applyRichTextFormat(editingText, activeSubtextChunks, format, start, end);
                         onUpdateRichText("subtext", newChunks);
                     }
                  }}"""
if "console.log(\"Mutações cirúrgicas aplicadas:" in content:
    content = content.replace(old_cb, new_cb)

# 6. Render Headline
# old: <Text \n text={activeHeadline} ...
old_headline_render = """                <Text
                  text={activeHeadline}
                  x={0}
                  y={0}
                  width={activeHeadlineWidth}
                  fontSize={headlineFontSize}"""
new_headline_render = """                <RichTextRenderer
                  text={activeHeadline}
                  richText={activeHeadlineChunks}
                  x={0}
                  y={0}
                  width={activeHeadlineWidth}
                  fontSize={headlineFontSize}"""
if old_headline_render in content:
    content = content.replace(old_headline_render, new_headline_render)
    # Tem que arrumar o fechamento da tag!
    content = content.replace("                />\n              </Group>\n\n              {/* 5.B SUBTEXTO */}", 
                              "                />\n              </Group>\n\n              {/* 5.B SUBTEXTO */}", 1)

# 7. Render Subtext
old_subtext_render = """                <Text
                  text={activeSubtext}
                  x={0}
                  y={0}
                  width={activeSubtextWidth}
                  fontSize={subtextFontSize}"""
new_subtext_render = """                <RichTextRenderer
                  text={activeSubtext}
                  richText={activeSubtextChunks}
                  x={0}
                  y={0}
                  width={activeSubtextWidth}
                  fontSize={subtextFontSize}"""
if old_subtext_render in content:
    content = content.replace(old_subtext_render, new_subtext_render)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)
print("CanvasPostStage patch finalizado.")
