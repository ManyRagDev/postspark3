/** Stable public codes are derived from the preserved source ID, never list order. */
export function acervo82Code(family:unknown):string|null {
 if(typeof family!=='string')return null;
 const m=/^acervo82-(reference|r9|concept)-(\d{2})$/.exec(family);
 if(!m)return null;
 const n=Number(m[2]);if(n<1||n>(m[1]==='reference'?24:29))return null;
 return `${m[1]==='reference'?'REF':m[1]==='concept'?'CON':'R9'}-${m[2]}`;
}
export function savedDesignIdentity(post:{completeDesign?:{family:string;name:string};familyName?:string}) {
 const family=post.completeDesign?.family;
 const code=acervo82Code(family),raw=post.completeDesign?.name??post.familyName??'';
 return {code,name:code&&raw.startsWith(code+' · ')?raw.slice(code.length+3):raw,family:family??null};
}

export function acervo82FamilyFromCode(value:string):string|null {
 const m=/^(REF|R9|CON)[-\s]?0?(\d{1,2})$/i.exec(value.trim());if(!m)return null;
 const group=m[1].toUpperCase()==='REF'?'reference':m[1].toUpperCase()==='CON'?'concept':'r9';
 const id=`acervo82-${group}-${String(Number(m[2])).padStart(2,'0')}`;return acervo82Code(id)?id:null;
}
export function designLabel(post:Parameters<typeof savedDesignIdentity>[0]):string {const i=savedDesignIdentity(post);return [i.code,i.name].filter(Boolean).join(' · ');}
