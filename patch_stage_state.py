import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

content = content.replace(
    'console.log("Mutações cirúrgicas aplicadas:", format, start, end);',
    '''console.log("Mutações cirúrgicas aplicadas:", format, start, end);
                     // Implementação base: salvar o chunk no JSON root (apenas 1 target por vez)
                     if (onUpdatePost) {
                       const slide = post.slides[post.currentSlideIndex];
                       const chunks = editingTarget === "headline" ? (slide.headlineRich || []) : (slide.subtextRich || []);
                       onUpdatePost({
                         slides: post.slides.map((s, i) => i === post.currentSlideIndex ? {
                            ...s,
                            [editingTarget === "headline" ? "headlineRich" : "subtextRich"]: [
                               ...chunks,
                               { text: editingText.substring(start, end), ...format }
                            ]
                         } : s)
                       });
                     }'''
)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)
