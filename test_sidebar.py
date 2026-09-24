with open("client/src/pages/CanvasLab/components/CanvasSidebar.tsx", "r") as f:
    content = f.read()

if "selectedElementId" in content:
    lines = content.splitlines()
    for i, line in enumerate(lines):
        if "selectedElementId" in line:
            print(f"{i+1}: {line}")
