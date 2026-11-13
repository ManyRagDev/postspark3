import type { ComponentDefinitionV1 } from "./componentAssembly";
import { authoredTextFitLimits } from "./arsenalPhysicalContract";

/** The optional authored block declares the complete interval, avoiding ambiguous partial bounds. */
export type AuthoredTextFlexibility = { version: 1; minFontSize: number; preferredFontSize: number; maxFontSize: number };
export type TextFontRange = { min: number; preferred: number; max: number };

/** Local units, with the readability floor evaluated in artboard/world space.
 * Small authored type keeps its existing minimum. Larger display type may use
 * half its authored size, never exceeding the authored preferred size by default. */
export function textFontFlexibility(input: {
  preferredFontSize: number; authoredMinFontSize: number;
  artboardWidth: number; worldScale?: number; authored?: AuthoredTextFlexibility;
}): TextFontRange {
  const scale = input.worldScale ?? 1;
  if (![input.preferredFontSize,input.authoredMinFontSize,input.artboardWidth,scale].every(value=>Number.isFinite(value)&&value>0))
    throw new Error("invalid_text_flexibility_geometry");
  const preferred = input.authored?.preferredFontSize ?? input.preferredFontSize;
  const previousMin = Math.min(input.authoredMinFontSize,input.preferredFontSize);
  const floor = Math.min(previousMin,24*input.artboardWidth/1080/scale);
  const min = input.authored?.minFontSize ?? Math.min(previousMin,Math.max(input.preferredFontSize/2,floor));
  const max = input.authored?.maxFontSize ?? preferred;
  if (min>preferred || preferred>max || ![min,preferred,max].every(value=>Number.isFinite(value)&&value>0))
    throw new Error("invalid_authored_text_flexibility_range");
  return {min,preferred,max};
}

/** Returns the largest measured fit. Failure retains the minimum and its defect;
 * it never truncates content or relaxes the declared interval. */
export function largestFittingTextFont(range: TextFontRange, fits: (size:number)=>boolean) {
  if (fits(range.max)) return {fontSize:range.max,fits:true};
  if (!fits(range.min)) return {fontSize:range.min,fits:false};
  let low=range.min,high=range.max;
  for(let iteration=0;iteration<28;iteration++) {
    const candidate=(low+high)/2;
    if(fits(candidate))low=candidate;else high=candidate;
  }
  return {fontSize:low,fits:true};
}

/** Advisory writing range from the same font interval used by the local solver.
 * Independent list slots describe one item; fragments describe the one canonical
 * string and retain their authored word partition. No catalogue payload is copied. */
export function compactTextFieldFlexibility(definition: ComponentDefinitionV1, field: {source:string;required:boolean;kind:string}) {
  const bindings=definition.fragment.bindings.filter(binding=>binding.source===field.source&&binding.kind!=="media");
  const targets=bindings.flatMap(binding=>binding.targetIds).map(id=>{
    const instance=definition.fragment.instances.find(instance=>instance.id===id);
    const piece=instance&&definition.pieces[instance.pieceHash];
    if(!instance||!piece||piece.kind!=="text")return;
    const relation=definition.fragment.relations.find(relation=>relation.enabled&&relation.kind==="textFit"&&relation.outputs.some(output=>output.targetId===id));
    let scale=1,parent=instance.parentId;const seen=new Set<string>();
    while(parent){if(seen.has(parent))return;seen.add(parent);const group=definition.fragment.groups.find(group=>group.id===parent);if(!group)return;scale*=group.scale;parent=group.parentId;}
    const range=textFontFlexibility({preferredFontSize:piece.fontSize,authoredMinFontSize:relation?.kind==="textFit"?relation.parameters.minFontSize:piece.fontSize,artboardWidth:definition.fragment.artboard.width,worldScale:scale,
      authored:relation?.kind==="textFit"?relation.parameters.flexibility:undefined});
    // Without an authored fontSize output, the actual solver cannot resize it.
    const scalable=relation?.kind==="textFit"&&relation.outputs.some(output=>output.targetId===id&&output.properties.includes("fontSize"));
    const sizes=scalable?range:{min:piece.fontSize,preferred:piece.fontSize,max:piece.fontSize};
    const limits=authoredTextFitLimits(instance,relation?.kind==="textFit"?relation:undefined);
    const rows=(size:number)=>Math.max(1,Math.floor((limits.height+1e-8)/(size*(piece.lineHeight??1.2))));
    const characters=(size:number)=>Math.max(1,Math.floor(limits.width/Math.max(1,size*.55+(piece.letterSpacing??0))))*rows(size);
    return {min:characters(sizes.max),max:characters(sizes.min),minLines:rows(sizes.max),maxLines:rows(sizes.min),fragment:piece.contentFragment};
  }).filter((target):target is NonNullable<typeof target>=>Boolean(target));
  if(!targets.length)return;
  const partitioned=field.kind!=="list"&&targets.length>1&&targets.every(target=>target.fragment?.unit==="words"&&target.fragment.count===targets.length);
  const combine=(key:"min"|"max")=>{
    if(!partitioned)return Math.min(...targets.map(target=>target[key]));
    const weights=targets.map(target=>target.fragment!.weights?.[target.fragment!.index]??1),total=weights.reduce((sum,weight)=>sum+weight,0);
    return Math.floor(Math.min(...targets.map((target,index)=>target[key]*total/weights[index])));
  };
  return {characters:{min:field.required?combine("min"):0,max:combine("max")},
    lines:{min:field.required?(partitioned?targets.reduce((sum,target)=>sum+target.minLines,0):Math.min(...targets.map(target=>target.minLines))):0,
      max:partitioned?targets.reduce((sum,target)=>sum+target.maxLines,0):Math.min(...targets.map(target=>target.maxLines))},
    advisory:true as const,optional:!field.required,scope:field.kind==="list"?"item" as const:"field" as const};
}
