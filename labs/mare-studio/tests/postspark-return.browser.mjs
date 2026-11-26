import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const root = fileURLToPath(new URL("../dist/",import.meta.url));
const actorId=randomUUID(), anchorId=randomUUID(), projectId=randomUUID();
const mime = {".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",
  ".json":"application/json",".wav":"audio/wav",".mp4":"video/mp4",".woff2":"font/woff2"};

test("editar no Maré, enviar uma composição e reabrir a fonte em sessão limpa", {timeout:120000},async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const uploads=new Map(), projects=new Map();
  let mobileContextual = true;
  let anchor={id:anchorId,projectId,expectedRevision:1,scope:"montage",revisionId:null};
  async function pageAt(url) {
    const page=await browser.newPage();
    await page.route("**/*",async route=>{
      const u=new URL(route.request().url()), p=u.pathname;
      if (u.origin!=="http://localhost") return route.abort();
      if (p==="/api/mare/capabilities") return route.fulfill({json:{editor:true,paid:false,mobileContextual}});
      if (p==="/api/mare/projects") {
        if (route.request().method()==="POST") {
          const data=route.request().postDataJSON();
          projects.set(data.id,data);
          return route.fulfill({json:data});
        }
        return route.fulfill({json:{actorId,projects:[...projects.values()]}});
      }
      if (p==="/api/mare/anchors/"+anchorId) return route.fulfill({json:anchor});
      if(p==="/api/mare/uploads")return route.fulfill({json:{uploadId:randomUUID(),partBytes:3*1024*1024,received:[]}});
      if(p.includes("/parts/")){
        const id=p.split("/")[4];
        uploads.set(id,Buffer.concat([uploads.get(id)||Buffer.alloc(0),route.request().postDataBuffer()]));
        return route.fulfill({json:{}});
      }
      if(p.endsWith("/complete"))return route.fulfill({json:{assetId:p.split("/")[4]}});
      if (p.startsWith("/api/mare/assets/")) return route.fulfill({body:uploads.get(p.split("/").at(-1))});
      if (p==="/api/mare/anchors/"+anchorId+"/return") {
        anchor={...anchor,...route.request().postDataJSON()};
        return route.fulfill({json:anchor});
      }
      if (p==="/thevoid") return route.fulfill({body:"Design salvo"});
      if (!p.startsWith("/mare/")) return route.fulfill({status:404,body:""});
      const f=p.startsWith("/mare/fonts/") ? path.resolve("shared/typography/fonts/files",path.basename(p)) : path.join(root,p.slice(6)||"index.html");
      try {return await route.fulfill({body:await readFile(f),contentType:mime[path.extname(f)]||"application/octet-stream"});}
      catch {return route.fulfill({status:404,body:""});}
    });
    await page.goto("http://localhost/mare/"+url);
    await page.evaluate(()=>import("./app.js").then(()=>true));
    return page;
  }
  const standalone=await pageAt("");
  assert.equal(await standalone.locator("#send-postspark").count(),1);
  assert.equal(await standalone.locator("#send-postspark").isVisible(),false);
  await standalone.locator("#start-blank").click();
  await standalone.locator("#save").click();
  await standalone.waitForURL(/project=/);
  const standaloneId=new URL(standalone.url()).searchParams.get("project");
  assert.ok(projects.get(standaloneId));
  await standalone.setViewportSize({width:390,height:844});
  await standalone.locator("#context-view").click();
  assert.equal(await standalone.locator("body").getAttribute("data-mobile-view"), "contextual");
  mobileContextual = false;
  await standalone.reload();
  await standalone.evaluate(()=>import("./app.js").then(()=>true));
  assert.equal(await standalone.locator("#context-view").isVisible(), false);
  assert.equal(await standalone.locator("body").getAttribute("data-mobile-view"), "advanced");
  await standalone.context().close();
  const fresh=await pageAt("");
  await fresh.getByRole("button",{name:"Abrir projeto existente"}).click();
  const picker=fresh.locator("#project-file");
  assert.equal(await picker.getAttribute("accept"),".mare");
  const packageBytes=uploads.get(projects.get(standaloneId).revisionId);
  await picker.setInputFiles({name:"errado.zip",mimeType:"application/octet-stream",buffer:packageBytes});
  await fresh.getByText("Selecione um arquivo .mare.").waitFor();
  await picker.setInputFiles({name:"errado.mare",mimeType:"application/octet-stream",buffer:Buffer.from("inválido")});
  await fresh.getByText("Escolha um arquivo de projeto exportado pelo Maré Studio.").waitFor();
  await fresh.locator("#account-projects").selectOption(standaloneId);
  await fresh.waitForURL("**/?project="+standaloneId);
  assert.equal(await fresh.locator("#send-postspark").isVisible(),false);
  await fresh.waitForFunction(expected => document.querySelector("#project-name").textContent === expected && !document.querySelector("#studio-start").open, projects.get(standaloneId).name);
  await fresh.context().close();
  const cancelled=await pageAt("?anchor="+anchorId);
  await cancelled.getByRole("button",{name:"Voltar ao design no PostSpark"}).click();
  await cancelled.waitForURL("http://localhost/thevoid?mareReturn="+anchorId);
  await cancelled.context().close();
  const linked=await pageAt("?anchor="+anchorId);
  await linked.locator("#start-blank").click();
  await linked.evaluate(async()=>{
    const {projectEditor:editor}=await import("./app.js");
    const state=editor.inspect(),source=state.compositions[0];
    await editor.prepare(state.revision,[{id:"composition.background",compositionId:source.id,color:"transparent"},
      {id:"layer.add",compositionId:source.id,layerId:"badge",type:"square",fields:{color:"#ff0000"}}]).apply();
  });
  await linked.locator("#send-postspark").click();
  await linked.waitForURL("http://localhost/thevoid?mareReturn="+anchorId,{timeout:60000});
  assert.equal(anchor.scope,"composition");
  assert.ok(anchor.compositionId);
  const stream=JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","v","-show_streams","-of","json","pipe:0"],{input:uploads.get(anchor.videoAssetId)})).streams[0];
  assert.equal(stream.codec_name,"vp9");
  assert.equal(stream.tags.alpha_mode ?? stream.tags.ALPHA_MODE,"1");
  if(process.env.MARE_ALPHA_FIXTURE) {
    await writeFile(process.env.MARE_ALPHA_FIXTURE,uploads.get(anchor.videoAssetId));
    await writeFile(process.env.MARE_ALPHA_FIXTURE+".mare",uploads.get(anchor.revisionId));
  }
  const composited=await linked.evaluate(async bytes=>{
    const video=document.createElement("video");
    video.muted=true;video.src="data:video/webm;base64,"+bytes;
    await new Promise((ok,fail)=>{video.onloadeddata=ok;video.onerror=fail;});
    await new Promise((ok,fail)=>{video.onseeked=ok;video.onerror=fail;video.currentTime=0.5;});
    const canvas=document.createElement("canvas");canvas.width=54;canvas.height=96;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#22aa66";ctx.fillRect(0,0,54,96);
    ctx.fillStyle="#5566ee";ctx.fillRect(0,0,27,96);
    ctx.drawImage(video,0,0,54,96);
    const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
    return [pixel(1,1),pixel(52,94),pixel(27,48)];
  },uploads.get(anchor.videoAssetId).toString("base64"));
  assert.deepEqual(composited[0],[85,102,238,255]);
  assert.deepEqual(composited[1],[34,170,102,255]);
  assert.ok(composited[2][0]>235&&composited[2][1]<15&&composited[2][2]<15,JSON.stringify(composited));
  assert.equal(stream.width,1080);
  assert.equal(stream.height,1920);
  await linked.context().close();
  const resumed=await pageAt("?anchor="+anchorId);
  await resumed.waitForFunction(()=>document.querySelector("#motion-mode").getAttribute("aria-pressed")==="true");
  assert.equal(await resumed.locator("#send-postspark").isVisible(),true);
  const image=await resumed.evaluate(()=>{
    const canvas=document.createElement("canvas");canvas.width=64;canvas.height=96;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#22aa66";ctx.fillRect(0,0,64,96);
    return canvas.toDataURL("image/png");
  });
  await resumed.context().close();
  anchor={id:anchorId,projectId:randomUUID(),revisionId:null,sourceImageUrl:image,scope:"montage"};
  const fromImage=await pageAt("?anchor="+anchorId);
  await fromImage.waitForFunction(()=>document.querySelector("#motion-mode").getAttribute("aria-pressed")==="true");
  const layer=await fromImage.evaluate(async()=>{
    const {projectEditor:editor}=await import("./app.js");
    return editor.inspect().compositions[0].layers[0];
  });
  assert.equal(layer.type,"image");
  await fromImage.context().close();

  anchor={id:anchorId,projectId:randomUUID(),revisionId:null,sourceComposition:{name:"Seleção 4:5",width:360,height:450,layers:[
    {kind:"rect",name:"Fundo do título",color:"#fa2b18",x:180,y:225,width:100,height:80},
    {kind:"text",name:"Chamada",text:"Texto editável",color:"#fff",x:180,y:120,width:210,height:36,fontFamily:"Inter",fontWeight:700,fontSize:22,align:"left",italic:true}
  ]}};
  const selection=await pageAt("?anchor="+anchorId);
  await selection.locator("#use-canvas-selection").waitFor();
  assert.equal(anchor.revisionId,null);
  assert.equal(await selection.locator("#canvas-selection-preview").getAttribute("height"),"450");
  await selection.locator("#use-canvas-selection").click();
  const selectionLayer=await selection.evaluate(async()=>{
    const {projectEditor:editor}=await import("./app.js");
    const state=editor.inspect(),id=state.compositions[0].id;
    const text=editor.inspect({compositionId:id}).layers.find(l=>l.type==="text");
    await editor.prepare(state.revision,[{id:"layer.set",compositionId:id,layerId:text.id,fields:{text:"Texto animado"}},
      {id:"key.set",compositionId:id,layerId:text.id,channel:"rotation",time:1,value:14,ease:"linear"}]).apply();
    return {fontFamily:text.fontFamily,align:text.align,fontWeight:text.fontWeight,fontSize:text.fontSize,x:text.props.x};
  });
  assert.deepEqual(selectionLayer,{fontFamily:"Inter",align:"left",fontWeight:700,fontSize:33,x:270});
  await selection.locator("#send-postspark").click();
  await selection.waitForURL("http://localhost/thevoid?mareReturn="+anchorId,{timeout:60000});
  const bytes=uploads.get(anchor.videoAssetId);
  const directory=await mkdtemp(path.join(tmpdir(),"mare-selection-"));
  t.after(()=>rm(directory,{force:true,recursive:true}));
  const filename=path.join(directory,"selection.webm");
  await writeFile(filename,bytes);
  const scene=JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","v","-show_streams","-of","json",filename])).streams[0];
  assert.equal(scene.width,1080);assert.equal(scene.height,1350);
  const center=execFileSync("ffmpeg",["-v","error","-c:v","libvpx-vp9","-i",filename,"-vf","crop=2:2:540:674,format=rgba","-frames:v","1","-f","rawvideo","pipe:1"]);
  assert.ok(center[0]>220 && center[1]<70 && center[2]<60 && center[3]===255);
  await selection.context().close();
  const reedit=await pageAt("?anchor="+anchorId);
  await reedit.waitForFunction(()=>document.querySelector("#motion-mode").getAttribute("aria-pressed")==="true");
  const reopenedText=await reedit.evaluate(async()=>{
    const {projectEditor:editor}=await import("./app.js"),state=editor.inspect();
    return editor.inspect({compositionId:state.compositions[0].id}).layers.find(l=>l.type==="text");
  });
  assert.equal(reopenedText.text,"Texto animado");
  assert.equal(reopenedText.keys.rotation[0].value,14);
  assert.equal(reopenedText.fontFamily,"Inter");assert.equal(reopenedText.italic,true);
  await reedit.context().close();
});
