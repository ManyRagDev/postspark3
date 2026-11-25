import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { interpretSpeechRequest, speechCommands } from "../dist/speech-commands.js";
import { applySpeechEdit, captionCues, montageSrt, planSpeechCuts, rewriteCue, TALK_DEFAULTS } from "../dist/speech-model.js";
import { decodeMask, MASK_MAGIC, MASK_PLANE } from "../dist/speech-visual.js";

const word = (text, start, end) => ({text, start, end});
const clip = {id:"prova", name:"Prova", kind:"video", assetId:"fonte", trim:4, duration:6};
const talk = {...TALK_DEFAULTS, captions:"highlight", speech:{start:4, end:10, language:"pt",
  words:[word("Café",4.5,4.8),word("ahn",5,5.3),word("abriu.",5.5,5.8),word("Olá!",8.25,8.6)],
  voices:[[4.4,5.9],[8.6,8.7]],
}};

test("as pausas respeitam fala detectada, palavras e margens no tempo da fonte", () => {
  const options = {pauses:true, minimum:1, margin:.15, fillers:["ahn"]};
  const plan = planSpeechCuts(clip, talk, options);
  assert.equal(plan.cuts.length,3);
  assert.deepEqual(plan.cuts[0], [5, 5.3]);
  assert.ok(plan.cuts[1][0] >= 6.05 && plan.cuts[1][1] <= 8.1);
  assert.equal(plan.cuts[2][1],10);
  assert.deepEqual(planSpeechCuts({...clip,trim:3},talk,options).cuts, [[5,5.3]]);
});

test("cortar trechos mantém transição, legenda e pistas extras sincronizadas", () => {
  const next = {id:"next", name:"next", kind:"video", assetId:"next", duration:2, trim:0,
    transitionIn:{from:clip.id,type:"dip_to_white",frames:10}};
  const music = {enabled:true, assetId:"music", volume:.3};
  const project = {clips:[clip,next], extraTracks:[{id:"overlay",kind:"audio",clips:[{
    id:"sound",name:"Participação",assetId:"other",start:1,trim:2,duration:5,
  }]}],sound:music};
  let id = 0;
  const result = applySpeechEdit(project,clip,talk,[[6,8]],true,() => `s${++id}`);
  assert.deepEqual(result.clips.slice(0,2).map(c=>[c.trim,c.duration]), [[4,2],[8,2]]);
  assert.equal(result.clips[2].transitionIn.from,result.clips[1].id);
  assert.deepEqual(result.extraTracks[0].clips.map(c=>[c.start,c.trim,c.duration]), [[1,2,1],[2,5,2]]);
  assert.equal(result.sound,music);
  assert.match(montageSrt(result.clips),/00:00:02,250 --> .*\nOlá!/);
  assert.equal(project.clips[1].transitionIn.from,clip.id);
  assert.deepEqual(applySpeechEdit(project,clip,talk,[[6,8]],false).extraTracks,project.extraTracks);
  assert.throws(()=>applySpeechEdit(project,clip,talk,[[4,10]],false),/pelo menos um quadro/);
});

test("corrigir legenda e interpretar o pedido produzem comandos editáveis", () => {
  const [cue] = captionCues(talk.speech,4,6);
  const corrected = rewriteCue(talk.speech,cue,"A cafeteria abriu!");
  assert.deepEqual(corrected.words.slice(0,3).map(({start,end})=>[start,end]),[[4.5,4.8],[5,5.3],[5.5,5.8]]);
  assert.equal(captionCues(corrected,4,6)[0].text,"A cafeteria abriu!");
  const commands = interpretSpeechRequest('Encurte as pausas maiores que um segundo, gere legendas e use fundo azul com título “Café 360” atrás da pessoa');
  assert.deepEqual(commands.map(op=>op.id),[speechCommands.captions,speechCommands.pauses,speechCommands.look]);
  assert.equal(commands[1].params.minimum,1);
  assert.equal(commands[2].params.title,"Café 360");
});

test("o recorte portátil limita a descompressão ao número declarado de quadros", async () => {
  const header = Uint8Array.from([...new TextEncoder().encode(MASK_MAGIC),0,1]);
  const alpha = new Uint8Array(MASK_PLANE).fill(220);
  const mask = await decodeMask(new Blob([header,gzipSync(alpha)]));
  assert.equal(mask.frames,1);
  assert.equal(mask.alpha.at(-1),220);
  await assert.rejects(decodeMask(new Blob([header,gzipSync(new Uint8Array(MASK_PLANE+1))])),/recorte de pessoa inválido/i);
});
