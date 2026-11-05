// Read-only DOM geometry. Run against the archived, locally styled showcase.
() => {
 const colors=['backgroundColor','backgroundImage','backgroundSize','backgroundClip','webkitTextStrokeWidth','webkitTextStrokeColor','alignItems','justifyContent','borderTopColor','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','color','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textAlign','textTransform','textShadow','boxShadow','opacity','rotate','scale','paddingLeft','paddingRight','paddingTop','paddingBottom','transform','transformOrigin','filter','backdropFilter','mixBlendMode','clipPath','writingMode','zIndex','overflow'];
 const readStyle=e=>{const s=getComputedStyle(e);const style=Object.fromEntries(colors.map(k=>[k,s[k]]));const raw=e.getAttribute('style')??'';const stroke=raw.match(/-webkit-text-stroke:\s*([\d.]+px)\s+(#[a-f\d]{6})/i);if(stroke){style.webkitTextStrokeWidth=stroke[1];style.webkitTextStrokeColor=stroke[2];}return style;};
 const boards=[...document.querySelectorAll('#portfolio-original .ratio-4-5,#portfolio-future .ratio-4-5')];
 return boards.map((board,index)=>{
  const box=board.getBoundingClientRect(),base={x:box.x,y:box.y,width:box.width,height:box.height};
  const paint=new Map();let paintIndex=0;
  const paintTree=el=>{paint.set(el,paintIndex++);[...el.children].sort((a,b)=>((+getComputedStyle(a).zIndex)||0)-((+getComputedStyle(b).zIndex)||0)).forEach(paintTree);};paintTree(board);
  const opacity=el=>{let result=1;while(el){result*=(+getComputedStyle(el).opacity);if(el===board)break;el=el.parentElement;}return result;};
  const geometry=r=>({x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height});
  const elements=[board,...board.querySelectorAll('*')].filter(e=>!e.closest('svg')&&e.getBoundingClientRect().width&&getComputedStyle(e).display!=='none');
  const boxes=elements.map((e,i)=>({id:i,parent:elements.indexOf(e.parentElement),paint:paint.get(e),opacity:opacity(e),tag:e.tagName,classes:e.getAttribute('class'),style:readStyle(e),box:geometry(e.getBoundingClientRect()),width:e.offsetWidth,height:e.offsetHeight,src:e.tagName==='IMG'?e.getAttribute('src'):null}));
  const texts=[];
  for(const e of elements){
   const children=[...e.children];
   const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();
   if(!own)continue;
   const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')continue;
   let block=e.closest('h1,h2,h3,h4,p')??e;
   if(block===e)while(block.parentElement!==board&&getComputedStyle(block).display==='inline')block=block.parentElement;
   texts.push({text:own,element:elements.indexOf(e),block:elements.indexOf(block),blockTag:block.tagName,style:readStyle(e),box:geometry(e.getBoundingClientRect()),elementBox:geometry(e.getBoundingClientRect())});
  }
  const textBlocks=[...new Set(texts.map(t=>t.block))].filter(i=>i>=0).map(i=>{const e=elements[i],runs=[],owners=new Map(texts.map(t=>[t.element,t.block]));const visit=el=>{const owner=owners.get(elements.indexOf(el));if(owner!==undefined&&owner!==i)return;for(const n of el.childNodes){if(n.nodeType===3){if(n.textContent.trim())runs.push({text:n.textContent.replace(/\s+/g,' '),style:readStyle(el)});}else if(n.nodeType===1&&!n.closest('svg')){const childOwner=owners.get(elements.indexOf(n));if(childOwner!==undefined&&childOwner!==i){if(getComputedStyle(n).display==='block')runs.push({text:'',spacer:n.getBoundingClientRect().height,style:readStyle(n)});continue;}const block=getComputedStyle(n).display==='block';if(n.tagName==='BR'||block)runs.push({text:'\n',style:readStyle(el)});visit(n);if(block)runs.push({text:'\n',style:readStyle(el)});}}};visit(e);return {id:i,tag:e.tagName,box:geometry(e.getBoundingClientRect()),style:readStyle(e),runs};});
  const svgs=[...board.querySelectorAll('svg')].map(e=>({paint:paint.get(e),opacity:opacity(e),box:geometry(e.getBoundingClientRect()),xml:e.outerHTML,style:readStyle(e),children:[...e.querySelectorAll('*')].map(el=>({tag:el.tagName,fill:getComputedStyle(el).fill,stroke:getComputedStyle(el).stroke,strokeWidth:getComputedStyle(el).strokeWidth}))}));
  return {group:index<29?'r9':'concept',order:index<29?index+1:index-28,box:base,boxes,texts,textBlocks,svgs};
 });
}
