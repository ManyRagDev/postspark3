"""Package an explicit pilot subset from preserved recipes; never mutate source recipes."""
import base64, hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
LIB = ROOT / 'artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z'
assets_path = ROOT / 'shared/arsenalBundledAssets.json'
assets = json.loads(assets_path.read_text())
sources = {}
def read(name, file):
    path = LIB / file
    sources[name] = {'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    return json.loads(path.read_text())

paper = read('paper', 'recipes/references/0623fb1c14937cd1e67e980b566710ba.json')
window = read('window', 'recipes/references/1c2fb00a82a764bab2f4374d03f67886.json')
ribbons = read('ribbons', 'recipes/references/94e0a100310160059384fb4c6ca5b2c4.json')
typography = {}
for name, family, weight in [('minimal-air', 'Inter', 700), ('editorial-poster', 'Playfair Display', 700), ('kinetic-type', 'Anton', 400)]:
    recipe = read(name, f'recipes/native/{name}-1x1.json')
    font = next(f for f in recipe['scene']['fonts'] if f['family'] == family and f['weight'] == weight)
    raw = base64.b64decode(font['dataUrl'].split(',', 1)[1])
    digest = hashlib.sha256(raw).hexdigest()
    if digest != font['sha256']: raise ValueError('Source font hash mismatch')
    ext = 'woff2' if font['mimeType'] == 'font/woff2' else 'ttf'
    path = f'/arsenal/fonts/{digest}.{ext}'
    (ROOT / 'client/public' / path.lstrip('/')).write_bytes(raw)
    aid = 'font-' + digest
    assets[aid] = dict(id=aid, kind='bundled', sha256=digest, mimeType=font['mimeType'], bytes=len(raw), family='Arsenal_' + digest[:16], weight=weight, license=font['license'], path=path, sourceFamily=family)
    typography[name] = {'assetId': aid, 'label': family, 'sourceId': name}

def background(recipe, ornaments):
    ids = set(ornaments)
    layers = [l for l in recipe['scene']['layers'] if l['id'].startswith('grade-') or l['id'] in ids]
    keys = ['id','kind','x','y','width','height','rotationDeg','opacity','fill','strokeColor','strokeWidth','points','cornerRadiusPx']
    return {'width': recipe['scene']['source']['widthPx'], 'height': recipe['scene']['source']['heightPx'], 'fill': recipe['scene']['artboard']['background'], 'layers': [{k:l[k] for k in keys if k in l} for l in layers]}

kit = {'version':1, 'sources':sources, 'backgrounds': {'grid':background(paper, []), 'playful':background(window, ['forma-verde-topo','forma-laranja-base','asterisco-base'])}, 'typography':typography,
       'modules': {'paper':{'sourceId':'paper','fill':next(l['fill'] for l in paper['scene']['layers'] if l['id']=='papel-principal')}, 'window':{'sourceId':'window','fill':'#F3F3F1'}, 'ribbons':{'sourceId':'ribbons','fill':'#244FDA'}}}
(ROOT / 'shared/assemblyPilotKit.json').write_text(json.dumps(kit, ensure_ascii=False, indent=2)+'\n')
assets_path.write_text(json.dumps(assets, ensure_ascii=False, indent=2)+'\n')
print('Packaged 3 modules, 2 extracted backgrounds and 3 typography donors; source files unchanged.')
