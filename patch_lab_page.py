import re

with open("client/src/pages/CanvasLab/CanvasLabPage.tsx", "r") as f:
    content = f.read()

# 1. Adicionar handleUpdateRichText antes de handleUpdateTextTransform
old_handler = "  const handleUpdateTextTransform ="
new_handler = """  const handleUpdateRichText = (field: "headline" | "subtext", chunks: any[]) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      const updatedSlides = [...prev.slides];
      if (currentSlide) {
        updatedSlides[curIdx] = { ...currentSlide, [`${field}Rich`]: chunks };
      }
      return {
        ...prev,
        [`${field}Rich`]: chunks,
        slides: updatedSlides,
      };
    });
  };

  const handleUpdateTextTransform ="""
if old_handler in content:
    content = content.replace(old_handler, new_handler)

# 2. Passar a prop para o CanvasPostStage
old_prop = "onUpdateText={handleUpdateText}"
new_prop = "onUpdateText={handleUpdateText}\n            onUpdateRichText={handleUpdateRichText}"
if old_prop in content:
    content = content.replace(old_prop, new_prop)

with open("client/src/pages/CanvasLab/CanvasLabPage.tsx", "w") as f:
    f.write(content)
print("CanvasLabPage patch aplicado.")
