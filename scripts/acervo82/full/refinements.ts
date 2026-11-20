import { arsenalHash } from '../../../shared/arsenalContent';
import { arsenalPieceSchema } from '../../../shared/designArsenal';
import { assemblyIdentity, createComponentDefinition, type ComponentDefinitionV1 } from '../../../shared/componentAssembly';

type Bounds = { x?: number; y?: number; width?: number; height?: number; opacity?: number };
type TextStyle = { fontSize?: number; fill?: string; align?: 'left' | 'center' | 'right'; stroke?: string; strokeWidth?: number };
type Edit = Bounds & TextStyle;
type Layout = Record<string, Edit>;

// Native coordinates measured in the 1080 × 1350 authoring artboard.
const covers: Record<string, Layout> = {
  'REF-01': {
    titulo: {fontSize:111,height:123},
    'titulo-line-2': {fontSize:111,height:123},
    apoio: {y:489,height:53,fontSize:39},
  },
  'REF-04': {
    'titulo-brutal': {fontSize:163,height:190},
    'titulo-ism': {x:224,width:770,fontSize:146,height:172},
    subtitulo: {y:807,width:590,height:73,fontSize:39,fill:'#A81826'},
  },
  'REF-06': {'titulo-principal': {height:85,fontSize:57}},
  'REF-09': {
    'titulo-line-4': {height:112,fontSize:77},
    conversao: {height:81,fontSize:71},
    'conversao-line-2': {height:81,fontSize:71},
  },
  'REF-13': {support: {height:88,fontSize:46}},
  'REF-15': {
    solution: {y:701,width:486,height:75,fontSize:67},
    'solution-line-2': {y:779,width:486,height:75,fontSize:67},
    'solution-line-3': {y:857,width:486,height:75,fontSize:67},
  },
  'REF-17': {
    'optional-caption': {opacity:1,stroke:'#111A1E',strokeWidth:4,fill:'#FFFFFF',height:60},
  },
  'REF-18': {
    marketing: {x:227,width:626,fontSize:109,height:129,align:'center'},
    tagline: {x:242,width:596,align:'center'},
    'paper-brand': {fill:'#435800'},
  },
  'REF-19': {'reveal-text': {y:690,height:124,fontSize:48}},
  'REF-21': {
    intro: {x:160,width:760,align:'center',fontSize:52},
    title: {x:102,width:876,fontSize:152,height:165,align:'center'},
    left: {x:121,y:481,width:366,height:61,fontSize:37,align:'right'},
    right: {x:610,y:481,width:365,height:61,fontSize:37,align:'left'},
  },
  'REF-23': {
    ele: {x:498,y:903,width:430,height:65,fontSize:43},
    parece: {x:183,y:982,width:748,height:171,fontSize:131},
  },
  'REF-24': {title: {x:106,y:51,width:868,height:145,fontSize:110,align:'center'}},
  'CON-04': {
    'text-12-0': {x:131,y:431,width:818,height:86,fontSize:44},
    'text-12-1': {x:131,y:535,width:818,height:369,fontSize:40},
  },
  'CON-05': {'text-1-0': {x:177,width:726,height:55,align:'center'}},
  'CON-07': {
    'text-5-0': {x:126,y:421,width:828,height:111,fontSize:90,align:'center'},
    'text-5-1': {x:126,y:531,width:828,height:111,fontSize:90,align:'center'},
    'text-6-0': {x:116,y:665,width:848,height:86,fontSize:55,align:'center'},
    'text-8-0': {x:120,y:816,width:840,height:176,align:'center'},
  },
  'CON-11': {'text-22-0': {width:630,height:86,fontSize:36}},
  'CON-13': {
    'text-20-0': {fontSize:57,height:94},
    'text-21-0': {x:119,y:791,width:840,height:145,fontSize:48,align:'center'},
  },
  'CON-14': {
    'text-10-0': {x:208,width:664,align:'center'},
    'text-10-1': {x:208,width:664,align:'center'},
    'text-10-2': {x:208,width:664,align:'center'},
    'text-16-0': {x:178,width:724,height:150,align:'center'},
    'text-19-0': {x:690,width:257,height:50,align:'right'},
  },
  'CON-22': {'text-11-0': {x:109,y:763,width:854,height:146,fontSize:35}},
  'CON-24': {'text-10-0': {x:175,y:812,width:730,height:168,align:'center'}},
  'CON-25': {'text-11-0': {x:86,y:844,width:920,height:145}},
  'CON-26': {'text-5-0': {x:72,width:936,height:121,fontSize:67,align:'center'}},
};

const carouselSlides: Record<string, Layout> = {
  'REF-02': {
    'realce-roxo': {x:480,y:463,width:133,height:74},
    'realce-laranja': {x:363,y:612,width:354,height:84},
    'titulo-linha-2': {x:279,y:460,width:522,height:123,fontSize:107},
    'titulo-linha-3': {x:279,y:586,width:522,height:181,fontSize:109},
    apoio: {x:277,y:788,width:526,height:101,fontSize:31,align:'center'},
  },
  'REF-07': {
    apoio: {y:1109,height:42},
    'apoio-line-2': {y:1153,height:39},
    'apoio-line-3': {y:1194,height:39},
  },
  'REF-15': {
    'blue-tear': {y:574,height:514},
    solution: {y:701,width:486,height:75,fontSize:67},
    'solution-line-2': {y:779,width:486,height:75,fontSize:67},
    'solution-line-3': {y:857,width:486,height:75,fontSize:67},
  },
  'REF-18': {
    'paper-bullet-0': {y:798,height:35},
    'paper-bullet-1': {y:837,height:35},
    'paper-bullet-2': {y:876,height:35},
    'paper-support': {y:922,height:30},
  },
  'R9-09': {
    'text-3-0': {x:71,width:896},
    'text-3-1': {x:71,width:896},
    'surface-4': {y:711},
    'text-5-0': {x:71,y:752,width:880,height:180},
  },
  'CON-02': {'surface-7': {y:723}},
  'CON-14': {'text-16-0': {y:872,height:150}},
  'CON-23': {
    'text-7-0': {x:125,width:829},
    'text-9-0': {x:174,y:943,width:796,height:112,fontSize:34},
  },
};

const closingSlides: Record<string, Layout> = {
  'CON-01': {'text-17-0': {y:737},'text-17-1': {y:804}},
};

export function refineCover(code: string, definition: ComponentDefinitionV1): Layout {
  const edits = {...covers[code]};
  if (code === 'REF-24') {
    for (const layer of definition.fragment.instances.filter(layer=>layer.id.startsWith('column-'))) {
      edits[layer.id] = {height:53,fontSize:47};
    }
  }
  applyLayerEdits(definition, edits);
  return edits;
}

function applyLayerEdits(definition: ComponentDefinitionV1, edits: Layout) {
  for (const [id, edit] of Object.entries(edits)) {
    const layer = definition.fragment.instances.find(instance => instance.id === id);
    if (!layer) throw Error(`refinement_target_missing:${definition.label}:${id}`);
    const {x,y,width,height,opacity,...style} = edit;
    Object.assign(layer, Object.fromEntries(Object.entries({x,y,width,height,opacity}).filter(([,value])=>value!==undefined)));
    const previous = definition.pieces[layer.pieceHash];
    if (Object.keys(style).length) {
      const piece = arsenalPieceSchema.parse({...previous,...style});
      const hash = arsenalHash(piece);
      definition.pieces[hash] = piece;
      layer.pieceHash = hash;
    }
    for (const relation of definition.fragment.relations) {
      if (relation.kind !== 'textFit' || !relation.outputs.some(output=>output.targetId===id)) continue;
      if (width !== undefined) relation.parameters.maxWidth = width;
      if (height !== undefined) relation.parameters.maxHeight = height;
      if (style.fontSize !== undefined) {
        relation.parameters.minFontSize = style.fontSize * Math.min(1, relation.parameters.minFontSize / previous.fontSize);
      }
      if (style.align !== undefined) relation.parameters.anchor = style.align;
    }
  }
}

export function refineCarouselSlide(code: string, source: ComponentDefinitionV1, cover: ComponentDefinitionV1): ComponentDefinitionV1 {
  const role = source.completeDesign?.designGuidance?.carouselVariant?.role;
  const edits = {...carouselSlides[code],...(role === 'closing' ? closingSlides[code] : {})};
  if (!Object.keys(edits).length) return source;
  const draft = structuredClone(source);
  applyLayerEdits(draft, edits);
  if (code === 'CON-23') {
    // The cyan panel, its outline and its shadow always move as a single shape.
    const supportPanel = /^(surface-8|comic-shadow-8|border-8-.+)$/;
    for (const panel of cover.fragment.instances.filter(layer=>supportPanel.test(layer.id))) {
      const target = draft.fragment.instances.find(layer=>layer.id===panel.id)!;
      Object.assign(target,panel);
      draft.pieces[panel.pieceHash] = cover.pieces[panel.pieceHash];
    }
  }
  if (code === 'REF-02') {
    const title = draft.fragment.bindings.find(binding=>binding.source==='block:headline:0:text');
    if (!title) throw Error('REF-02: missing headline binding');
    const kept = ['titulo-linha-2','titulo-linha-3'];
    const removed = new Set(title.targetIds.filter(id=>!kept.includes(id)));
    title.targetIds = kept;
    draft.fragment.instances = draft.fragment.instances.filter(layer=>!removed.has(layer.id));
    draft.fragment.relations = draft.fragment.relations.filter(relation=>!relation.outputs.some(output=>removed.has(output.targetId)));
    draft.fragment.intentionalOverlaps = draft.fragment.intentionalOverlaps.filter(pair=>pair.every(id=>!removed.has(id)));
    if(draft.fragment.lineBoxOverlaps) {
      const formerRows = new Set([...kept,...removed]);
      draft.fragment.lineBoxOverlaps = draft.fragment.lineBoxOverlaps.filter(pair=>!formerRows.has(pair.a)&&!formerRows.has(pair.b));
    }
    if(draft.colorRoles) for(const id of removed) delete draft.colorRoles[id];
    if(draft.removableElementIds) draft.removableElementIds = draft.removableElementIds.filter(id=>!removed.has(id));
    const guidance = draft.completeDesign?.designGuidance;
    if(guidance?.requiredTextTargets) guidance.requiredTextTargets = guidance.requiredTextTargets.filter(id=>!removed.has(id));
    for (const [index,id] of kept.entries()) {
      const layer = draft.fragment.instances.find(candidate=>candidate.id===id)!;
      const next = arsenalPieceSchema.parse({...draft.pieces[layer.pieceHash],contentFragment:{
        index,count:kept.length,unit:'words',weights:[1,1],allocation:{mode:'preserve_occupancy',priority:[1,0]},
      }});
      layer.pieceHash = arsenalHash(next);
      draft.pieces[layer.pieceHash] = next;
    }
  }
  const {hash: _hash,...definition} = draft;
  const variantKey = `${definition.source.variantKey}-refined`;
  return createComponentDefinition({
    ...definition,
    id: assemblyIdentity(['refined-authored-slide', source.id, arsenalHash(definition)]),
    source: {...definition.source,variantKey},
    fragment: {...definition.fragment,variantKey},
  });
}
