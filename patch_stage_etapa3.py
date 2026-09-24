import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

content = re.sub(
    r'import \{ Check, X \} from "lucide-react";',
    r'import { Check, X } from "lucide-react";\nimport RichTextFloatingToolbar from "./RichTextFloatingToolbar";\nimport { CanvasRichTextChunk } from "./types";',
    content
)

# Adicionar a toolbar logo abaixo da BARRA FLUTUANTE DE AÇÕES
content = re.sub(
    r'\{/\* TEXTAREA COM TIPOGRAFIA RIGOROSAMENTE ESPELHADA \*/\}',
    r'''{/* MINI-BARRA FLUTUANTE DE RICH TEXT */}
                <RichTextFloatingToolbar
                  textareaRef={textareaRef}
                  palette={post.palette}
                  onApplyFormat={(format, start, end) => {
                     // Intercepta e salva mutações no modelo JSON
                     // (Por enquanto loga no console para o MVP da Etapa 3)
                     console.log("Mutações cirúrgicas aplicadas:", format, start, end);
                  }}
                />

                {/* TEXTAREA COM TIPOGRAFIA RIGOROSAMENTE ESPELHADA */}''',
    content
)

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
    f.write(content)

print("Patch Stage Etapa 3 aplicado.")
