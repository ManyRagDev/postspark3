import re

with open("client/src/pages/CanvasLab/components/types.ts", "r") as f:
    content = f.read()

rich_text_interface = """export interface CanvasRichTextChunk {
  text: string;
  color?: string;
  sizeScale?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface CanvasCustomText {"""

content = content.replace("export interface CanvasCustomText {", rich_text_interface)

content = re.sub(
    r'(text: string;\n\s+x\?: number;)',
    r'text: string;\n  textRich?: CanvasRichTextChunk[];\n  x?: number;',
    content
)

content = re.sub(
    r'(headline: string;\n\s+subtext: string;)',
    r'headline: string;\n  subtext: string;\n  headlineRich?: CanvasRichTextChunk[];\n  subtextRich?: CanvasRichTextChunk[];',
    content
)

with open("client/src/pages/CanvasLab/components/types.ts", "w") as f:
    f.write(content)

print("Patch Etapa 3 types.ts aplicado.")
