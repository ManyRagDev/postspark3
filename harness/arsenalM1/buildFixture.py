"""Explicit 5:6 derivation. Never modifies the approved 4:5 source or copies its photo."""
import base64, hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'artifacts/design-recreation/chat-curation/approved/postspark-admin2-cfaccad3.json'
OUT = ROOT / 'client/src/pages/CanvasLab/arsenal'
def clean(value):
    if isinstance(value, float):
        value=round(value,6)
        return int(value) if value.is_integer() else value
    if isinstance(value, list): return [clean(v) for v in value]
    if isinstance(value, dict): return {k:clean(v) for k,v in value.items()}
    return value
def canonical(value):
    return json.dumps(clean(value), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

recipe = json.loads(SOURCE.read_text())
scene = recipe['scene']; matrix = recipe['matrix']; factor = .864
assets = []; manifest = {}
for font in scene['fonts']:
    raw = base64.b64decode(font['dataUrl'].split(',')[1]); sha = hashlib.sha256(raw).hexdigest()
    assert sha == font['sha256']
    target = ROOT / 'client/public/arsenal/fonts' / (sha + '.woff2'); target.write_bytes(raw)
    entry = dict(id='font-' + sha, kind='bundled', sha256=sha, mimeType=font['mimeType'], bytes=len(raw),
                 family='Arsenal_' + sha[:16], weight=font['weight'], license=font['license'])
    assets.append(entry)
    manifest[entry['id']] = dict(**entry, path='/arsenal/fonts/' + sha + '.woff2', sourceFamily=font['family'], sourceUrl=font['sourceUrl'])

font_ids = {(f['family'], f['weight']): a for f, a in zip(scene['fonts'], assets)}
members = {m['layerId']: (g, m) for g in matrix['groups'] for m in g['members']}
pieces = {}; instances = []; groups = []
for g in matrix['groups']:
    groups.append(dict(id=g['id'], label=g['label'], parentId=None, zIndex={'titulo': 100, 'conteudo': 50, 'foto': 70}[g['id']],
                       x=g['transform']['x']*factor+21.6, y=g['transform']['y']*factor, width=700*factor,
                       height=(248 if g['id']=='titulo' else 650)*factor, rotation=g['transform']['rotationDeg'], opacity=1, scale=1))

skip = {'conteudo-item-2', 'conteudo-item-3', 'conteudo-item-4', 'janela-foto-legenda'}
bound = {'titulo-sobretitulo','titulo-principal','conteudo-cabecalho','conteudo-item-1','cta-texto','faixa-nome-texto'}
for layer in scene['layers']:
    if layer['id'] in skip: continue
    pair = members.get(layer['id']); parent = pair[0]['id'] if pair else None
    x, y, rot = (pair[1]['x'],pair[1]['y'],pair[1]['rotationDeg']) if pair else (layer['x'],layer['y'],layer['rotationDeg'])
    asset = font_ids.get((layer.get('fontFamily'),layer.get('fontWeight')))
    piece = dict(kind='media' if layer['id']=='area-foto' else layer['kind'], fill=layer['fill'], stroke=layer['strokeColor'],
                 strokeWidth=layer['strokeWidth']*factor, cornerRadius=0,
                 points=[p*factor for p in layer['points']],fontFamily=asset['family'] if asset else 'Arial',
                 fontAssetId=asset['id'] if asset else None,fontSize=layer['fontSize']*factor,fontWeight=layer['fontWeight'],
                 align=layer['align'],lineHeight=layer['lineHeight'],letterSpacing=layer['letterSpacing']*factor,
                 fixedText=layer['text'] if layer['id'] not in bound else None)
    sha=digest(piece); pieces[sha]=piece
    instances.append(dict(id=layer['id'],pieceHash=sha,parentId=parent,zIndex=layer['zIndex'],x=x*factor+(21.6 if not parent else 0),
                          y=y*factor,width=max(1,layer['width']*factor),height=max(1,layer['height']*factor),rotation=rot,opacity=layer['opacity']))

bindings=[]
for label,source,target in [('Chamada','eyebrow','titulo-sobretitulo'),('Título','headline','titulo-principal'),
                            ('Cabeçalho da lista','sectionLabel','conteudo-cabecalho'),('Itens','items','conteudo-item-1'),
                            ('Botão','callToAction','cta-texto'),('Etiqueta','label','faixa-nome-texto'),('Foto','media.primary','area-foto')]:
    bindings.append(dict(id='binding-'+source,label=label,source=source,targetIds=[target],required=source in ('headline','items','media.primary'),
                         kind='list' if source=='items' else 'media' if source=='media.primary' else 'text',
                         cardinality=dict(min=1,max=6) if source=='items' else None,prefix='',gap=12*factor))
relations=[]
def relation(id,kind,inputs,outputs,params):
    relations.append(dict(id=id,version=1,enabled=True,kind=kind,inputs=inputs,outputs=[dict(targetId=t,properties=p) for t,p in outputs],parameters=params))
for target in sorted(bound):
    instance=next(i for i in instances if i['id']==target)
    relation('fit-'+target,'textFit',[],[(target,['x','width','height','fontSize'])],dict(anchor='center' if target=='titulo-principal' else 'left',
              maxWidth=596 if target=='titulo-principal' else instance['width'],maxHeight=260 if target=='titulo-principal' else 220,minFontSize=instance['height']*.35))
relation('list-flow','verticalFlow',['conteudo-item-1'],[('conteudo-item-1',['y'])],dict(gap=12*factor,startY=next(i['y'] for i in instances if i['id']=='conteudo-item-1')))
relation('photo-slot','mediaSlot',[],[('area-foto',['width','height'])],dict(fit='cover'))
relation('title-surface','surfaceFit',['titulo-principal','titulo-sobretitulo'],[(t,['height']) for t in ['titulo-janela','titulo-janela-sombra','titulo']],
         dict(padding=dict(left=0,right=0,top=14,bottom=38),minWidth=603,minHeight=215))
relation('content-position','verticalFlow',['titulo'],[('conteudo',['y'])],dict(gap=70,startY=510))
relation('cta-position','verticalFlow',['conteudo-item-1'],[('cta-texto',['y'])],dict(gap=38,startY=375))
relation('cta-surface','surfaceFit',['cta-texto'],[('cta-fundo',['x','y','width','height'])],
         dict(padding=dict(left=18,right=18,top=12,bottom=12),minWidth=313,minHeight=54))
relation('cta-shadow','anchor',['cta-fundo'],[('cta-sombra',['y'])],dict(axis='y',referenceEdge='start',targetEdge='start',offset=10))
relation('content-surface','surfaceFit',['conteudo-cabecalho','conteudo-item-1','cta-texto'],[(t,['height']) for t in ['cartao-conteudo','cartao-conteudo-sombra','conteudo']],
         dict(padding=dict(left=0,right=0,top=43,bottom=50),minWidth=425,minHeight=460))
relation('photo-position','anchor',['conteudo'],[('foto',['y'])],dict(axis='y',referenceEdge='start',targetEdge='start',offset=-68))
relation('label-surface','surfaceFit',['faixa-nome-texto'],[('faixa-nome',['width','height'])],
         dict(padding=dict(left=20,right=20,top=20,bottom=20),minWidth=524,minHeight=72))
variant=dict(variantKey='portrait-5x6-v1',aspectRatio='5:6',compilerVersion='arsenal-v2.0.0',
             artboard=dict(width=1080,height=1296,background=scene['artboard']['background']),instances=instances,groups=groups,
             bindings=bindings,relations=relations,assetIds=[a['id'] for a in assets],
             capabilities=['text','rect','line','polygon','media','groups','relations'],intentionalOverlaps=[['conteudo','foto'],['foto','faixa-nome']],
             limitations=['Derivação 5:6 pendente de revisão visual própria.','Foto obrigatória; nenhuma foto de demonstração incorporada.'])
content=dict(schemaVersion=2,headline='SE LIGA AQUI!',body=None,eyebrow='Produto novo para você',sectionLabel='Como funciona',
             callToAction='Conheça a novidade',label='Seu próximo projeto',items=[dict(id=f'item-{i+1}',text=t) for i,t in enumerate(
                 ['Criar conteúdo','Preparar a arte','Publicar na sua mídia','Acompanhar resultados'])],metric=None,attribution=None,comparison=None,
             caption='Uma sequência para organizar seu próximo conteúdo.',hashtags=[])
version='0320b073-619c-4e6c-81c6-6eacbb15f3cc'; blueprint='61d12c17-6bdb-4e70-b9d5-5f3f963bc871'
definition=dict(schemaVersion=2,name='Janelas — piloto administrativo',variant=variant,pieceHashes=sorted(pieces))
fixture=dict(variant=variant,pieces=pieces,assets=assets,content=content,origin=dict(candidateId=version+':portrait-5x6-v1',
             blueprintId=blueprint,versionId=version,version=1,definitionHash=digest(definition),variantKey=variant['variantKey'],
             variantHash=digest(variant),compilerVersion='arsenal-v2.0.0'),provenance=dict(sourcePath=str(SOURCE.relative_to(ROOT)),
             sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),sourceArtboard=scene['source'],
             derivation='Uniform .864 scale, centered horizontally; flexible relations authored explicitly.',approval='pending'))
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'windowFixture.json').write_text(json.dumps(clean(fixture),ensure_ascii=False,indent=2)+'\n')
(ROOT/'shared/arsenalBundledAssets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Fixture:',len(instances),'instances;',len(relations),'relations;',len(assets),'verified fonts. Source unchanged.')
