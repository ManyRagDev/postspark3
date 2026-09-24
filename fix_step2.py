import re

with open("client/src/pages/CanvasLab/components/CanvasSidebar.tsx", "r") as f:
    content = f.read()

content = content.replace("selectedElementId?: string | null;\n}", "selectedElementId?: string | null;\n  onSelectElement?: (id: string | null) => void;\n}")
content = content.replace("selectedElementId,\n}: CanvasSidebarProps)", "selectedElementId,\n  onSelectElement,\n}: CanvasSidebarProps)")
with open("client/src/pages/CanvasLab/components/CanvasSidebar.tsx", "w") as f:
    f.write(content)

with open("client/src/pages/CanvasLab/components/PropertyInspector.tsx", "r") as f:
    content = f.read()

content = content.replace('import { X, AlignLeft, AlignCenter, AlignRight, Copy, Trash2, ChevronsUp, ChevronsDown } from "lucide-react";', 'import { X, AlignLeft, AlignCenter, AlignRight, Copy, Trash2, ChevronsUp, ChevronsDown } from "lucide-react";\nimport { toast } from "sonner";')
content = content.replace('customFontUrl={post.customFontUrl}', '')
content = content.replace('onUpdatePost(removeExtraElement(post, selectedId).post);', 'onUpdatePost(removeExtraElement(post, selectedId));')
content = content.replace('onUpdatePost(duplicateExtraElement(post, selectedId).post);', 'onUpdatePost(duplicateExtraElement(post, selectedId));')

with open("client/src/pages/CanvasLab/components/PropertyInspector.tsx", "w") as f:
    f.write(content)
