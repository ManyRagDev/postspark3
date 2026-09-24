import re

# 1. Atualizar CanvasLabPage
with open("client/src/pages/CanvasLab/CanvasLabPage.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'selectedElementId=\{selectedElementId\}\n\s+/>\n\s+</div>',
    r'selectedElementId={selectedElementId}\n              onSelectElement={setSelectedElementId}\n            />\n          </div>',
    content
)
content = re.sub(
    r'onRemoveExtraImage=\{handleRemoveExtraImage\}\n\s+/>\n\s+</AnimatePresence>',
    r'onRemoveExtraImage={handleRemoveExtraImage}\n            selectedElementId={selectedElementId}\n            onSelectElement={setSelectedElementId}\n          />\n        </AnimatePresence>',
    content
)

with open("client/src/pages/CanvasLab/CanvasLabPage.tsx", "w") as f:
    f.write(content)


# 2. Atualizar CanvasSidebar
with open("client/src/pages/CanvasLab/components/CanvasSidebar.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'selectedElementId:\s+string \| null;\n}',
    r'selectedElementId?: string | null;\n  onSelectElement?: (id: string | null) => void;\n}',
    content
)
content = re.sub(
    r'selectedElementId,\n}: CanvasSidebarProps\)',
    r'selectedElementId,\n  onSelectElement,\n}: CanvasSidebarProps)',
    content
)

content = re.sub(r'import TypographyColorControls from "\./TypographyColorControls";\n', r'import TypographyColorControls from "./TypographyColorControls";\nimport PropertyInspector from "./PropertyInspector";\n', content)

content = re.sub(
    r'return \(\n\s+<div className="w-\[340px\] bg-\[#121215\]',
    r'''
  const isTextSelected = selectedElementId && (selectedElementId === "headline" || selectedElementId === "subtext" || selectedElementId === "badge" || extraTextsList.find((t: any) => t.id === selectedElementId) || post.extraTexts?.find((t: any) => t.id === selectedElementId));

  if (isTextSelected) {
    return (
      <div className="w-[340px] bg-[#121215] border-l border-white/10 flex flex-col shrink-0 h-full overflow-hidden">
        <PropertyInspector post={post} selectedId={selectedElementId!} onUpdatePost={onUpdatePost} onClose={() => onSelectElement?.(null)} />
      </div>
    );
  }

  return (
    <div className="w-[340px] bg-[#121215]''',
    content
)

# Limpar TypographyColorControls que ficam na Aba 4 de CanvasSidebar
content = re.sub(
    r'<div className="pt-3 border-t border-white/8 space-y-3">\n\s+<TypographyColorControls post=\{post\} onUpdatePost=\{onUpdatePost\} />\n\s+</div>',
    r'',
    content
)

with open("client/src/pages/CanvasLab/components/CanvasSidebar.tsx", "w") as f:
    f.write(content)


# 3. Atualizar CanvasMobileDrawer
with open("client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'selectedElementId\?:\s+string \| null;\n}',
    r'selectedElementId?: string | null;\n  onSelectElement?: (id: string | null) => void;\n}',
    content
)
content = re.sub(
    r'selectedElementId,\n}: CanvasMobileDrawerProps\)',
    r'selectedElementId,\n  onSelectElement,\n}: CanvasMobileDrawerProps)',
    content
)

content = re.sub(r'import TypographyColorControls from "\./TypographyColorControls";\n', r'import TypographyColorControls from "./TypographyColorControls";\nimport PropertyInspector from "./PropertyInspector";\n', content)

content = re.sub(
    r'\{/\* ABA: TEXTO E CÓPIA \*/\}',
    r'''
                {(() => {
                  const currentSlide = post.slides[post.currentSlideIndex];
                  const extraTextsList = currentSlide?.extraTexts || post.extraTexts || [];
                  const isTextSelected = selectedElementId && (selectedElementId === "headline" || selectedElementId === "subtext" || selectedElementId === "badge" || extraTextsList.find((t: any) => t.id === selectedElementId) || post.extraTexts?.find((t: any) => t.id === selectedElementId));

                  if (isTextSelected) {
                    return (
                      <div className="h-full overflow-hidden bg-[#121215]">
                        <PropertyInspector post={post} selectedId={selectedElementId!} onUpdatePost={onUpdatePost} onClose={() => onSelectElement?.(null)} isMobile={true} />
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* ABA: TEXTO E CÓPIA */}''',
    content
)
# fechar o if (isTextSelected) com </>)
content = re.sub(
    r'\{/\* ── Drawer Embutido: Studio de Texturas ── \*/\}',
    r'''
                    </>
                  );
                })()}

                {/* ── Drawer Embutido: Studio de Texturas ── */}''',
    content
)

# Limpar TypographyColorControls da Aba Brand mobile
content = re.sub(
    r'<div className="pt-4 border-t border-white/8 space-y-3">\n\s+<TypographyColorControls post=\{post\} onUpdatePost=\{onUpdatePost\} />\n\s+</div>',
    r'',
    content
)

with open("client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx", "w") as f:
    f.write(content)

print("Etapa 2 patch done!")
