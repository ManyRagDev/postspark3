const bundled=new Set(["Archivo","Archivo Black","Anton","Bricolage Grotesque","Fraunces","Inter","Lora","Playfair Display","Space Grotesk","Space Mono"]);
const loaded=new Map();
export function loadCompositionFont(family) {
  if(!family || ["Arial","Georgia","Times New Roman","Verdana","Helvetica","sans-serif","serif","monospace"].includes(family))return Promise.resolve(true);
  if(!loaded.has(family)){
    const file=bundled.has(family)?new URL("./fonts/"+family.toLowerCase().replaceAll(" ","-")+".ttf",import.meta.url).href:null;
    const face=new FontFace(family,file?'url("'+file+'")':'local("'+family+'")',{weight:"100 900"});
    loaded.set(family,face.load().then(font=>{document.fonts.add(font);return true;},()=>false));
  }
  return loaded.get(family);
}
