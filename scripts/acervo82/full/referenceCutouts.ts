import {createHash} from 'node:crypto';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {arsenalHash} from '../../../shared/arsenalContent';
import {arsenalPieceSchema} from '../../../shared/designArsenal';
import type {ComponentDefinitionV1} from '../../../shared/componentAssembly';
import type {AssetFile} from '../../../harness/componentArsenal/extract';
import {verifyArsenalAsset} from '../../../server/designCatalog/arsenalAssets';

type Cutout = {
  id: string;
  box: [left: number, top: number, width: number, height: number];
  outline: number[];
  maskText?: boolean;
  zIndex?: number;
};

// Hand-traced contours on the original REF-15 and REF-18 artboards.
const portrait: Cutout = {
  id:'person-right-slot',box:[304,0,432,920],zIndex:3,
  outline:[334,0,736,0,736,920,318,920,315,870,312,831,309,790,305,768,306,743,315,719,334,703,
    364,691,385,684,396,685,412,699,433,714,468,741,466,696,476,648,478,594,484,555,
    475,521,475,493,461,508,447,514,434,509,407,499,392,487,382,467,377,451,370,436,
    373,419,383,404,396,391,409,378,427,375,440,357,434,315,423,277,409,238,398,203,
    390,169,377,135,367,102,359,75,348,51,343,23],
};
const press: Cutout[] = [
  {
    id:'central-person-slot', box:[145,278,447,641], maskText:true,
    outline:[304,435,308,364,315,323,325,298,343,283,371,278,394,284,415,304,426,331,437,434,
      473,442,547,436,555,454,555,541,573,550,586,573,590,596,577,617,556,625,556,698,
      549,708,482,708,488,756,501,849,478,855,488,919,384,919,365,875,346,827,334,826,323,875,313,919,
      220,919,220,839,198,832,220,706,190,704,181,690,179,613,151,606,146,585,148,564,179,540,
      181,461,186,443,198,435,224,441,263,447],
  },
  {
    id:'camera-top-slot', box:[0,274,163,287],
    outline:[0,372,33,368,54,346,85,335,90,323,103,281,110,274,153,287,157,294,137,337,
      112,334,119,344,125,364,147,374,158,386,160,400,155,413,132,420,102,417,107,437,
      111,448,111,489,101,538,87,551,73,560,60,560,48,550,35,527,33,506,41,465,47,420,
      39,408,0,406],
  },
  {
    id:'right-media-slot', box:[554,341,181,468],
    outline:[604,365,605,352,628,346,646,344,654,351,662,367,678,388,690,412,734,433,
      735,474,734,732,702,748,674,760,665,773,704,772,714,783,714,805,593,809,582,800,
      554,767,561,763,632,765,633,748,648,730,659,736,688,723,734,714,734,478,683,455,
      661,446,640,440,621,436,611,425,603,403,607,388],
  },
  {
    id:'camera-bottom-slot', box:[0,655,130,264],
    outline:[0,672,15,668,27,659,45,657,57,661,60,674,74,678,77,728,83,738,80,748,93,768,
      109,792,102,795,80,766,88,792,95,829,99,919,85,919,75,878,67,808,69,782,66,755,
      43,752,24,765,0,774],
  },
];

export async function restoreReferenceCutouts(code: 'REF-15' | 'REF-18', definition: ComponentDefinitionV1, original: Buffer): Promise<AssetFile[]> {
  const image = await loadImage(original);
  const isPress = code === 'REF-18';
  if (image.width !== (isPress?735:736) || image.height !== (isPress?919:920)) throw Error(`${code}: unexpected source artboard`);
  const scaleX = definition.fragment.artboard.width / image.width;
  const scaleY = definition.fragment.artboard.height / image.height;
  const sourceHash = createHash('sha256').update(original).digest('hex');
  const assets: AssetFile[] = [];
  for (const {id,box:[left,top,width,height],outline,maskText,zIndex} of isPress?press:[portrait]) {
    const layer = definition.fragment.instances.find(item=>item.id===id);
    const slot = definition.fragment.mediaSlots?.find(item=>item.id===id);
    const group = definition.fragment.groups.find(item=>item.id===layer?.parentId);
    if (!layer || !slot || !group) throw Error(`${code}: missing media layer ${id}`);

    const canvas = createCanvas(width,height);
    const context = canvas.getContext('2d');
    const points = outline.map((value,index)=>value-(index%2?top:left));
    context.beginPath();
    context.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2)context.lineTo(points[i],points[i+1]);
    context.closePath();
    context.clip();
    context.drawImage(image,-left,-top);
    if (maskText) {
      // The live newspaper is laid out above the photo. Remove the printed copy
      // and cover the tiny footer lettering with a nearby patch of the suit.
      context.clearRect(190-left,448-top,358,247);
      context.drawImage(image,396,828,72,14,316-left,883-top,104,22);
    }
    const bytes = canvas.toBuffer('image/png');
    const {manifest} = await verifyArsenalAsset(bytes,{license:'curator-provided'});
    assets.push({manifest,bytes,relativePath:`assets/${manifest.sha256}`,sourceHash,
      sourceFamily:'',sourceWeight:400,resolvedWeight:400,sourceUrl:null,
      adjustment:'Original photographic cutout with independent native text and replaceable media.'});
    const piece = arsenalPieceSchema.parse({...definition.pieces[layer.pieceHash],imageAssetId:manifest.id,
      points:points.map((value,index)=>value*(index%2?scaleY:scaleX)),
      imageReplacement:{label:slot.label,scrimOpacity:0},
    });
    layer.pieceHash = arsenalHash(piece);
    definition.pieces[layer.pieceHash] = piece;
    Object.assign(layer,{x:left*scaleX-group.x,y:top*scaleY-group.y,width:width*scaleX,height:height*scaleY});
    if (zIndex !== undefined) {
      for (const other of definition.fragment.instances) if(other.zIndex>=zIndex)other.zIndex++;
      layer.zIndex=zIndex;
      group.zIndex=zIndex;
    }
    slot.deferred = false;
    definition.assets.push(manifest);
    definition.fragment.assetIds.push(manifest.id);
  }
  return assets;
}
