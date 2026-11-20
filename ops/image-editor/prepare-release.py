#!/usr/bin/env python3
"""Overlay only the approved editor onto an extracted deployed-source snapshot.

The destination must already contain the source copied from the running web
image, without .env files. The workspace itself is never reset or packaged in full.
"""
import hashlib
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
destination = Path(sys.argv[1]).resolve()
if destination == root or not (destination / 'server/routers.ts').is_file():
    raise SystemExit('Provide a separate, extracted deployed-source directory')

paths = [p.relative_to(root) for p in (root / 'client/src/pages/CanvasLab').rglob('*')
         if p.is_file() and '.test.' not in p.name]
paths += [Path('client/src/lib/imageEditorApi.ts'), Path('shared/imageEditor.ts'),
          Path('shared/generationReviewWarning.ts'), Path('shared/textGradient.ts'), Path('server/routers/imageEditor.ts')]
paths += [p.relative_to(root) for p in (root / 'server/imageEditing').glob('*.ts')
          if '.test.' not in p.name]

changed = []
for relative in sorted(set(paths)):
    data = (root / relative).read_bytes()
    # The visual-identity epic is independent and is not included in this release.
    if str(relative) == 'client/src/pages/CanvasLab/components/types.ts':
        data = data.replace(b'  /** Frozen identity plus choices completed for this piece; never updates the project. */\n  visualIdentityUsage?: import("zod").infer<typeof import("@shared/identityComposition").visualIdentityUsageSchema>;\n', b'')
    if str(relative) == 'client/src/pages/CanvasLab/lib/saveAdapter.ts':
        data = data.replace(b'import { visualIdentityUsageSchema } from "@shared/identityComposition";\n', b'')
        data = data.replace(b'    visualIdentityUsage: visualIdentityUsageSchema.safeParse(raw.visualIdentityUsage).success ? visualIdentityUsageSchema.parse(raw.visualIdentityUsage) : undefined,\n', b'')
    if str(relative) == 'client/src/pages/CanvasLab/CanvasLabPage.tsx':
        start = data.find(b'      {post.visualIdentityUsage')
        if start >= 0:
            end = data.index(b'      ) : null}\n', start) + len(b'      ) : null}\n')
            data = data[:start] + data[end:]
    target = destination / relative
    if not target.exists() or target.read_bytes() != data:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        changed.append(str(relative))

arsenal = destination / 'shared/designArsenal.ts'
text = arsenal.read_text()
if 'gradient: textGradientSchema.nullable().optional()' not in text:
    text = 'import { textGradientSchema } from "./textGradient";\n' + text
    text = text.replace('export const arsenalElementEffectSchema = z\n  .object({', 'export const arsenalElementEffectSchema = z\n  .object({\n    gradient: textGradientSchema.nullable().optional(),')
    arsenal.write_text(text)
    changed.append('shared/designArsenal.ts')

router = destination / 'server/routers.ts' 
text = router.read_text()
if 'imageEditor: imageEditorRouter' not in text:
    marker = 'export const appRouter = router({'
    if marker not in text:
        raise SystemExit('Deployed router entry point changed; inspect before proceeding')
    text = 'import { imageEditorRouter } from "./routers/imageEditor";\n' + text
    text = text.replace(marker, marker + '\n  imageEditor: imageEditorRouter,', 1)
    router.write_text(text)
    changed.append('server/routers.ts')
media = destination / 'server/mediaAssets.ts'
text = media.read_text()
old = 'new Set(["url", "imageUrl", "bgImage", "logoUrl"])'
new = 'new Set(["url", "imageUrl", "bgImage", "logoUrl", "originalUrl", "inputUrl", "resultUrl"])'
if old in text:
    media.write_text(text.replace(old, new, 1))
    changed.append('server/mediaAssets.ts')
elif new not in text:
    raise SystemExit('Deployed media ownership normalizer changed; inspect before proceeding')

manifest = {'base': 'running-web-source', 'scope': 'CanvasLab stabilization and approved advanced image editing',
            'excluded': ['generation workflow changes', 'visual identity epic', 'database migrations', 'worker deployment'],
            'files': [{'path': name, 'sha256': hashlib.sha256((destination / name).read_bytes()).hexdigest()}
                      for name in sorted(set(map(str, paths)) | {'server/routers.ts', 'server/mediaAssets.ts', 'shared/designArsenal.ts'})]}
(destination / 'editor-release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'changedFiles': len(changed), 'manifestFiles': len(manifest['files']), 'destination': str(destination)}))
