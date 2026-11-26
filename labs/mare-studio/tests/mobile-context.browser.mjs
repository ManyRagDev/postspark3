import test from "node:test";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
import {openCheckout} from "./lab-browser.mjs";

test("editar por toque, alternar a interface e reabrir a animação no desktop", {timeout:90000},async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const page=await openCheckout(browser,{hasTouch:true});
  await page.locator("#start-blank").click();
  await page.locator("#project-menu").click();
  await page.locator("#reset").click();
  await page.locator("#confirm-reset").click();
  const baseline=await page.evaluate(async()=>{
    const editor=window.editor;
    const changes=await editor.prepareWithAssets(editor.inspect().revision,[
      {id:"composition.create",compositionId:"dialog",template:"dialogue",name:"Cena de diálogo",duration:4},
    ]);
    await changes.apply();
    await editor.invoke("project.save",{},editor.inspect().revision);
    return (await import("./engine.js")).loadProject();
  });
  assert.ok(baseline.sound.assetId);
  await page.setViewportSize({width:390,height:844});
  await page.locator("#context-view").tap();
  await page.getByRole("button",{name:/Costa ao sol.*3 s/}).first().tap();
  assert.ok(await page.locator("#trim").isVisible());
  assert.ok(await page.locator("#clip-volume").isVisible());
  await page.locator("#clip-volume").fill("0.25");
  await page.locator("#clip-volume").dispatchEvent("change");
  assert.equal(await page.evaluate(()=>editor.inspect({clipId:"shot1"}).clip.volume),.25);
  await page.locator("#undo").tap();
  assert.equal(await page.evaluate(()=>editor.inspect({clipId:"shot1"}).clip.volume),undefined);
  await page.evaluate(()=>editor.invoke("view.animation",{compositionId:"dialog"},editor.inspect().revision));
  await page.getByRole("button",{name:"Camadas",exact:true}).tap();
  await page.locator('[data-cp-select="speech"]').tap();
  const field=page.locator('[data-cp-prop="text"]');
  assert.ok(await field.isVisible());
  assert.ok(await page.locator('[data-quick="fade"]').isVisible());
  await field.fill("Vimos a mesma estrela.");
  await field.blur();
  await page.locator("#mobile-fine").tap();
  assert.equal(await page.locator("#advanced-view").getAttribute("aria-pressed"),"true");
  await page.locator("#undo").tap();
  assert.equal(await field.inputValue(),"Você ouviu isso? O céu está chamando.");
  await page.locator("#redo").tap();
  await page.locator("#context-view").tap();
  await field.scrollIntoViewIfNeeded();
  const geometry=await page.evaluate(()=>{
    const box=document.querySelector("#screen").getBoundingClientRect();
    return {visible:box.height>0&&box.bottom>0&&box.top<innerHeight,overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.ok(geometry.visible);assert.ok(geometry.overflow<=1);
  await page.locator("#save").tap();
  await page.waitForFunction(()=>document.querySelector("#save-status").textContent.includes("Salvo"));
  await page.setViewportSize({width:1440,height:1000});
  await page.reload();
  await page.locator("#studio-editor").waitFor();
  const restored=await page.evaluate(async()=>(await import("./engine.js")).loadProject());
  const speech=baseline.compositions.find(c=>c.id==="dialog").document.layers.find(l=>l.id==="speech");
  assert.ok(speech.keys.reveal.length>0);
  speech.text="Vimos a mesma estrela.";
  assert.deepEqual(restored,baseline);
  assert.equal(await page.locator("#context-view").isVisible(),false);
});

test("o volume pertence à ocorrência do clipe e acompanha o áudio exportado",{timeout:90000},async t=>{
  const {execFileSync}=await import("node:child_process");
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(()=>browser.close());
  const page=await openCheckout(browser);
  const tone=execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","color=c=red:s=128x128:r=30:d=2","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=2","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac","-movflags","frag_keyframe+empty_moov","-f","mp4","pipe:1"]);
  const result=await page.evaluate(async b64=>{
    const editor=window.editor;
    const file=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],"Tom.mp4",{type:"video/mp4"});
    await editor.invoke("project.fromVideo",{file},editor.inspect().revision);
    const id=editor.inspect().clips[0].id;
    await editor.prepare(editor.inspect().revision,[{id:"clip.split",clipId:id,newId:"segundo",offset:1},
      {id:"clip.set",clipId:"segundo",fields:{volume:0.25}}]).apply();
    await editor.invoke("project.save",{},editor.inspect().revision);
    const project=await (await import("./engine.js")).loadProject();
    const blob=await (await import("./precise-export.js")).exportTransparentWebM(project,{width:128,height:128,signal:new AbortController().signal});
    const bytes=new Uint8Array(await blob.arrayBuffer());
    return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""));
  },tone.toString("base64"));
  const pcm=execFileSync("ffmpeg",["-v","error","-i","pipe:0","-map","0:a:0","-ac","1","-ar","48000","-f","f32le","pipe:1"],{input:Buffer.from(result,"base64")});
  const rms=offset=>{
    let sum=0;
    for(let i=0;i<12000;i++)sum+=pcm.readFloatLE((48000*offset+i)*4)**2;
    return Math.sqrt(sum/12000);
  };
  const ratio=rms(1.25)/rms(.25);
  assert.ok(Math.abs(ratio-.25)<.02,"Ganho relativo no WebM: "+ratio);
});
