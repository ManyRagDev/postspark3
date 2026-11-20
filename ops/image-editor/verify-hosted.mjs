/** Run with docker exec inside the released web. Prints no tokens or private pixels. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

const baseline = JSON.parse(readFileSync('/tmp/image-editor-original-posts.json', 'utf8'));
const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  {auth:{persistSession:false}});
const db = storage.schema('postspark');
const source = await db.from('posts').select('user_uuid,canvas_model').eq('id',135).single();
assert.ifError(source.error);
const {data:posts,error} = await db.from('posts').select('id,revision,canvas_model')
  .eq('user_uuid',source.data.user_uuid);
assert.ifError(error);
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert(baseline.every(before => posts.some(post => post.id === before.id &&
  post.revision === before.revision && fingerprint(post.canvas_model) === before.sha256)),
  'An original post changed during the hosted check');
const edited = posts.find(post => post.id === 139);
assert(edited?.canvas_model?.advancedImageAssets);
const changedSlides = edited.canvas_model.slides.flatMap((slide,index) =>
  JSON.stringify(slide) === JSON.stringify(source.data.canvas_model.slides[index]) ? [] : [index]);
assert.deepEqual(changedSlides,[4], 'Only the selected fifth slide may change');
assert.equal(edited.revision,6,'Cancelling the resize preview must not save another revision');
const receipts = Object.values(edited.canvas_model.advancedImageAssets);
assert(receipts.length);
const bucket = await storage.storage.getBucket('postspark-media');
assert.ifError(bucket.error);
assert.equal(bucket.data.public,false);
const assets = [];
for(const receipt of receipts) {
  for(const url of new Set([receipt.originalUrl,receipt.inputUrl,receipt.resultUrl])) {
    const match = /^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/.exec(url);
    assert(match && match[1] === source.data.user_uuid);
    const download = await storage.storage.from('postspark-media').download(`${match[1]}/${match[2]}`);
    assert.ifError(download.error);
    const bytes = Buffer.from(await download.data.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), match[2]);
    const anonymous = await fetch('http://127.0.0.1:3000'+url);
    assert.equal(anonymous.status,401);
    assets.push({hash:match[2],bytes:bytes.length,anonymousStatus:anonymous.status});
  }
}
const capabilities = await fetch('http://127.0.0.1:3000/api/trpc/imageEditor.capabilities');
assert.equal(capabilities.status,401);
const report = {checkedAt:new Date().toISOString(),success:true,originalPostsUnchanged:baseline.length,
  testPostId:edited.id,testPostRevision:edited.revision,slides:edited.canvas_model.slides.length,
  receiptCount:receipts.length,changedSlideIndexes:changedSlides,cancelPreservedRevision:true,
  privateBucket:true,assets,anonymousCapabilities:capabilities.status};
writeFileSync('/tmp/image-editor-hosted-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
