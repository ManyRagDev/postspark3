import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openLocalApi} from './localApi';
import {savedPostToCanvasModel} from '../../../client/src/pages/CanvasLab/lib/saveAdapter';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(root+'/package.json');
const {chromium}=require('playwright-core');
const JSZip=require('jszip');
const out='/tmp/postspark-adaptive-verification';
const originalFetch=globalThis.fetch;
globalThis.fetch=(input:any,init:any)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);assert(['127.0.0.1','localhost'].includes(url.hostname),'only_local_application_and_supabase');return originalFetch(input,init);};
const local=await openLocalApi({port:3187});
const browser=await chromium.launch({executablePath:'/home/emanuel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1500,height:1100}});
const split=local.cookie.indexOf('=');
await context.addCookies([{name:local.cookie.slice(0,split),value:local.cookie.slice(split+1),url:local.app,httpOnly:true,sameSite:'Lax'}]);
await context.addInitScript(()=>localStorage.setItem('postspark.canvasAutoSaveEnabled','false'));
const blocked:string[]=[];
await context.route('**/*',async(route:any)=>{
 const request=route.request(),url=new URL(request.url());
 if(!['127.0.0.1','localhost'].includes(url.hostname))return route.abort();
 const procedures=url.pathname.split('/api/trpc/')[1]?.split(',')??[];
 if(request.method()==='POST'&&procedures.some((name:string)=>name!=='post.update')){blocked.push(procedures.join(','));return route.abort();}
 return route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(30000);
const errors:string[]=[];page.on('pageerror',(e:any)=>errors.push(e.message));
const proof:any[]=[];
const hash=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const checkpoint=async()=>fs.writeFile(`${out}/browser.json`,JSON.stringify({version:1,paidCalls:0,cases:proof,blocked,errors},null,2));
function png(buffer:Buffer){assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);assert.equal(height,3840);assert.equal(width/height,4/5);return{width,height};}
try{
 for(const kind of ['static','carousel']){
  const receiptFile=`${out}/${kind}-local-save.json`;
  let receipt=await fs.readFile(receiptFile,'utf8').then(JSON.parse).catch((e:any)=>{if(e.code!=='ENOENT')throw e;return null;});
  const payload=JSON.parse(await fs.readFile(`${out}/${kind}-save-payload.json`,'utf8'));
  if(!receipt){receipt=await local.api.post.save.mutate(payload);await fs.writeFile(receiptFile,JSON.stringify(receipt));}
  const postId=receipt.id;assert.equal(typeof postId,'number');
  const before:any=(await local.api.post.get.query({id:postId}))!.canvas_model;
  const expected=payload.canvasModel.slides.map((s:any)=>s.composition?.overrides);
  assert.deepEqual(before.slides.map((s:any)=>s.composition?.overrides),expected);
  await page.goto(local.app+'/saved-posts');
  await page.getByRole('article').first().waitFor();
  const consent=page.getByRole('button',{name:'Aceitar e Continuar',exact:true});
  const modal=await consent.waitFor({state:'visible',timeout:3000}).then(()=>true).catch(()=>false);
  if(modal)await consent.click();
  const search=payload.headline.slice(0,100);
  await page.getByRole('textbox',{name:'Buscar posts por título, design ou código'}).fill(search);
  await page.getByRole('button',{name:'Buscar',exact:true}).click();
  const rows=await local.api.post.listSummary.query({limit:20,offset:0,search});
  await page.getByRole('article').filter({hasText:search}).first().waitFor();
  const index=rows.items.findIndex((row:any)=>row.id===postId);assert(index>=0);
  await page.getByRole('article').nth(index).getByRole('button',{name:'Abrir',exact:true}).click();
  await page.getByRole('button',{name:'Salvar post',exact:true}).waitFor();
  for(let i=0;i<before.slides.length;i++){
   if(before.slides.length>1)await page.getByRole('button',{name:new RegExp(`^Selecionar slide ${i+1}:`)}).click();
   await page.evaluate(async()=>{await document.fonts.ready;});
   await page.screenshot({path:`${out}/${kind}-editor-${i}.png`,fullPage:true});
  }
  if(before.slides.length>1)await page.getByRole('button',{name:/^Selecionar slide 1:/}).click();
  const updating=page.waitForResponse((r:any)=>r.request().method()==='POST'&&r.url().includes('post.update'));
  await page.getByRole('button',{name:'Salvar post',exact:true}).click();
  await page.getByRole('button',{name:'Atualizar o post salvo',exact:true}).click();
  assert((await updating).ok());
  const after:any=(await local.api.post.get.query({id:postId}))!.canvas_model;
  assert.deepEqual(after.slides.map((s:any)=>s.composition),before.slides.map((s:any)=>s.composition),'authoritative composition changed through UI save');
  assert.deepEqual(savedPostToCanvasModel({id:postId,canvas_model:after}),savedPostToCanvasModel({id:postId,canvas_model:before}));
  await fs.writeFile(`${out}/${kind}-before-ui-save.json`,JSON.stringify(before,null,2));
  await fs.writeFile(`${out}/${kind}-after-ui-save.json`,JSON.stringify(after,null,2));
  await page.getByRole('button',{name:'Baixar post',exact:true}).click();
  const downloading=page.waitForEvent('download',{timeout:90000});
  const carousel=before.slides.length>1;
  await page.getByRole('menuitem',{name:carousel?'Todos os slides · ZIP':'Imagem do slide atual · PNG 4K',exact:true}).click();
  const download=await downloading;assert.equal(await download.failure(),null);
  const filename=`${out}/${kind}-export.${carousel?'zip':'png'}`;await download.saveAs(filename);
  const bytes=await fs.readFile(filename);let dimensions:any[]=[];
  if(carousel){const zip=await JSZip.loadAsync(bytes);const files=Object.values(zip.files).filter((f:any)=>!f.dir&&/\.png$/i.test(f.name)) as any[];assert.equal(files.length,3);for(const file of files)dimensions.push(png(await file.async('nodebuffer')));}else dimensions.push(png(bytes));
  proof.push({kind,postId,savedThroughLocalApi:true,reopenedAndResavedThroughUI:true,authoritativeCompositionEqual:true,normalizedModelEqual:true,overridesPreserved:true,compositionHash:hash(after.slides.map((s:any)=>s.composition)),export:{filename,dimensions},paidCalls:0});
  await checkpoint();console.log(JSON.stringify(proof.at(-1)));
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);await checkpoint();
}catch(error){await fs.writeFile(`${out}/browser-error.txt`,String(error)+'\n'+await page.locator('body').innerText());await page.screenshot({path:`${out}/browser-error.png`,fullPage:true});throw error;}finally{await checkpoint();await browser.close();await local.close();}
