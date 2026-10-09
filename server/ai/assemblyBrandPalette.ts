import { contrastRatio } from '../../shared/creative/color';
type Palette={background:string;text:string;accent:string};
/** Matches the existing brand guardian: brand surfaces/accents, legible neutral text if needed. */
export function assemblyBrandPalette(brand:{brandColors?:string[];adaptationMode:string}|undefined,site?:Palette):Palette|undefined{
 const colors=Array.from(new Set((brand?.brandColors??[]).flatMap(value=>{
  const hex=value.trim();
  if(/^#[0-9a-f]{6}$/i.test(hex))return[hex.toUpperCase()];
  if(/^#[0-9a-f]{3}$/i.test(hex))return['#'+hex.slice(1).split('').map(c=>c+c).join('').toUpperCase()];
  return[];
 })));
 if(!colors.length)return site;
 const background=brand?.adaptationMode==='adaptive'?(site?.background??'#FFFFFF'):colors[0];
 const choices=[...colors,'#111111','#FFFFFF','#000000'].sort((a,b)=>contrastRatio(background,b)-contrastRatio(background,a));
 return {background,text:choices[0],accent:brand?.adaptationMode==='adaptive'?colors[0]:(colors[1]??colors[0])};
}
