/** VPS-only read verification; persist/print hashes and metadata, never a private document. */
import assert from 'node:assert/strict';import{createRequire}from'node:module';const {createClient}=createRequire(process.cwd()+'/package.json')('@supabase/supabase-js');import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const phase=process.argv[2];assert(['preview','final'].includes(phase));
const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},db:{schema:'postspark'}});
const test=await s.from('posts').select('id,revision,canvas_model,user_uuid').eq('id',139).single();assert.ifError(test.error);
const all=await s.from('posts').select('id,revision,canvas_model').eq('user_uuid',test.data.user_uuid);assert.ifError(all.error);
const baseline=JSON.parse(readFileSync('/tmp/unified-hosted-baseline.json','utf8')),slides=JSON.parse(readFileSync('/tmp/unified-test-hashes.json','utf8'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const originalPosts=baseline.filter(p=>p.id!==139);assert(originalPosts.every(before=>all.data.some(p=>p.id===before.id&&p.revision===before.revision&&hash(p.canvas_model)===before.sha256)));
const changedSlides=test.data.canvas_model.slides.flatMap((slide,i)=>hash(slide)===slides.slideHashes[i]?[]:[i]);
if(phase==='preview'){assert.equal(test.data.revision,slides.revision);assert.deepEqual(changedSlides,[]);console.log(JSON.stringify({phase,success:true,revision:test.data.revision,previewDidNotSave:true,otherPostsUnchanged:originalPosts.length}));process.exit(0);}
assert.deepEqual(changedSlides,[4]);assert(test.data.revision>slides.revision);
const model=test.data.canvas_model;const receipts=Object.values(model.advancedImageAssets??{});assert(receipts.some(r=>r.operation.kind==='black-white'));
const slide=model.slides[4],c=slide.composition;
const hasGradient=Boolean(slide.visualStyle?.headlineGradient||slide.visualStyle?.subtextGradient||slide.extraTexts?.some(t=>t.textGradient)||(c?.version===3&&Object.values(c.effects).some(e=>e.gradient)));
assert(hasGradient,'An editable text gradient must be persisted');
const bucket=await s.storage.getBucket('postspark-media');assert.ifError(bucket.error);assert.equal(bucket.data.public,false);
let verifiedAssets=0;for(const receipt of receipts){for(const url of new Set([receipt.originalUrl,receipt.inputUrl,receipt.resultUrl])){
 const m=/^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/.exec(url);assert(m&&m[1]===test.data.user_uuid);const response=await s.storage.from('postspark-media').download(m[1]+'/'+m[2]);assert.ifError(response.error);const bytes=Buffer.from(await response.data.arrayBuffer());assert.equal(hashBytes(bytes),m[2]);assert.equal((await fetch('http://127.0.0.1:3000'+url)).status,401);verifiedAssets++;
}}
function hashBytes(b){return createHash('sha256').update(b).digest('hex');}
const report={phase,checkedAt:new Date().toISOString(),success:true,testPostId:139,revision:test.data.revision,otherPostsUnchanged:originalPosts.length,changedSlides,editableGradientPersisted:hasGradient,privateAssetsVerified:verifiedAssets};writeFileSync('/tmp/unified-hosted-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
