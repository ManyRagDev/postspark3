import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

# 1. Injete useMemo pra liveChunks e update opacity / classes do textarea
live_chunks_code = """
  const liveHeadlineChunks = useMemo(() => {
    if (editingTarget !== "headline") return activeHeadlineChunks;
    return applyRichTextFormat(editingText, activeHeadlineChunks, {}, 0, 0);
  }, [editingTarget, editingText, activeHeadlineChunks]);

  const liveSubtextChunks = useMemo(() => {
    if (editingTarget !== "subtext") return activeSubtextChunks;
    return applyRichTextFormat(editingText, activeSubtextChunks, {}, 0, 0);
  }, [editingTarget, editingText, activeSubtextChunks]);
"""

# Procurando onde injetar, logo depois das declarações de chunks ativos
target_hook_area = """    const activeHeadlineChunks = currentSlide ? currentSlide.headlineRich : post.headlineRich;
    const activeSubtextChunks = currentSlide ? currentSlide.subtextRich : post.subtextRich;"""
content = content.replace(target_hook_area, target_hook_area + "\n" + live_chunks_code)


# 2. Modificar propriedades do RichTextRenderer para usar as live vars e opacidade 1
old_headline_rich = """                  text={activeHeadline}
                  richText={activeHeadlineChunks}
                  x={0}
                  y={0}
                  width={activeHeadlineWidth}
                  fontSize={headlineFontSize}
                  fontFamily={post.fontFamily}
                  fontStyle="bold"
                  fill={headlineColor}
                  align={defaultAlign}
                  lineHeight={isBrutalBlock ? 1.1 : 1.25}
                  letterSpacing={isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4}
                  opacity={editingTarget === "headline" ? 0 : 1}"""
new_headline_rich = """                  text={editingTarget === "headline" ? editingText : activeHeadline}
                  richText={liveHeadlineChunks}
                  x={0}
                  y={0}
                  width={activeHeadlineWidth}
                  fontSize={headlineFontSize}
                  fontFamily={post.fontFamily}
                  fontStyle="bold"
                  fill={headlineColor}
                  align={defaultAlign}
                  lineHeight={isBrutalBlock ? 1.1 : 1.25}
                  letterSpacing={isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4}
                  opacity={1}"""
content = content.replace(old_headline_rich, new_headline_rich)

old_subtext_rich = """                  text={activeSubtext}
                  richText={activeSubtextChunks}
                  x={0}
                  y={0}
                  width={activeSubtextWidth}
                  fontSize={subtextFontSize}
                  fontFamily={isCyber ? "Space Mono, monospace" : "Inter, sans-serif"}
                  fill={subtextColor}
                  opacity={editingTarget === "subtext" ? 0 : isBrutalSplit ? 0.95 : 0.85}"""
new_subtext_rich = """                  text={editingTarget === "subtext" ? editingText : activeSubtext}
                  richText={liveSubtextChunks}
                  x={0}
                  y={0}
                  width={activeSubtextWidth}
                  fontSize={subtextFontSize}
                  fontFamily={isCyber ? "Space Mono, monospace" : "Inter, sans-serif"}
                  fill={subtextColor}
                  opacity={isBrutalSplit ? 0.95 : 0.85}"""
content = content.replace(old_subtext_rich, new_subtext_rich)

# 3. Adicionar classe no textarea e CSS global no root do componente 
# Localizando o <textarea>
old_textarea = """                <textarea
                  ref={textareaRef}
                  value={editingText}
                  onChange={(e) => {
                    setEditingText(e.target.value);
                  }}
                  onBlur={handleCommitText}
                  onKeyDown={handleKeyDown}
                  style={{
                    position: "absolute",
                    top: "0px",
                    left: "0px",
                    width: `${targetWidth}px`,
                    height: `${targetHeight}px`,
                    fontSize: `${targetFontSize}px`,
                    fontFamily: post.fontFamily,
                    fontWeight: "bold",
                    color: isHeadline
                      ? headlineColor
                      : isSubtext
                      ? subtextColor
                      : post.palette.accent,
                    textAlign: defaultAlign,
                    lineHeight: isHeadline && isBrutalBlock ? 1.1 : 1.25,
                    letterSpacing: isHeadline ? (isBrutalBlock ? "0.5px" : isEditorial ? "-0.2px" : "-0.4px") : "normal",
                    background: "transparent",
                    border: "none",
                    outline: "2px dashed rgba(56, 189, 248, 0.9)",
                    caretColor: "#38bdf8",
                    resize: "none",
                    overflow: "hidden",
                    padding: 0,
                    margin: 0,
                  }}
                />"""

new_textarea = """                <style>
                  {`
                    .rich-textarea-overlay {
                      color: transparent !important;
                      -webkit-text-fill-color: transparent !important;
                      background: transparent !important;
                      caret-color: #38bdf8 !important;
                    }
                    .rich-textarea-overlay::selection {
                      background: rgba(56, 189, 248, 0.4);
                      color: transparent !important;
                      -webkit-text-fill-color: transparent !important;
                    }
                  `}
                </style>
                <textarea
                  className="rich-textarea-overlay"
                  ref={textareaRef}
                  value={editingText}
                  onChange={(e) => {
                    setEditingText(e.target.value);
                  }}
                  onBlur={handleCommitText}
                  onKeyDown={handleKeyDown}
                  style={{
                    position: "absolute",
                    top: "0px",
                    left: "0px",
                    width: `${targetWidth}px`,
                    height: `${targetHeight}px`,
                    fontSize: `${targetFontSize}px`,
                    fontFamily: post.fontFamily,
                    fontWeight: "bold",
                    textAlign: defaultAlign,
                    lineHeight: isHeadline && isBrutalBlock ? 1.1 : 1.25,
                    letterSpacing: isHeadline ? (isBrutalBlock ? "0.5px" : isEditorial ? "-0.2px" : "-0.4px") : "normal",
                    border: "none",
                    outline: "2px dashed rgba(56, 189, 248, 0.9)",
                    resize: "none",
                    overflow: "hidden",
                    padding: 0,
                    margin: 0,
                  }}
                />"""

content = content.replace(old_textarea, new_textarea)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)

