/** Run inside the web container against the private processor. Synthetic pixels only. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
const endpoint=process.env.ADVANCED_IMAGE_PROCESSOR_URL,token=process.env.ADVANCED_IMAGE_PROCESSOR_TOKEN;
assert(endpoint&&token);
const headers={'content-type':'application/json',Authorization:`Bearer ${token}`};
const caps=await fetch(new URL('/capabilities',endpoint),{headers}).then(r=>r.json());
assert(!caps.tools.some(t=>t.kind==='iris'));assert.equal(caps.tools.find(t=>t.kind==='grain').maxDimension,2048);
const operations=[{kind:'black-white'},{kind:'duotone',dark:'#11253a',light:'#59d4c2'},{kind:'shadows-highlights',shadows:25,highlights:10},{kind:'look',preset:'warm'},{kind:'look',preset:'teal-orange'},{kind:'grain',amount:1.5}];
const results=[];
async function run(operation,size,actor='00000000-0000-4000-8000-000000000001'){
 const bytes=readFileSync('/tmp/unified-synthetic-'+size+'.png'),requestId=randomUUID(),start=performance.now();
 const response=await fetch(new URL('/process',endpoint),{method:'POST',headers,body:JSON.stringify({requestId,actor,operation,format:'png',imageData:'data:image/png;base64,'+bytes.toString('base64')}),signal:AbortSignal.timeout(95000)});
 assert.equal(response.status,200,`${operation.kind}: ${response.status}`);
 const output=await response.json(),pixels=Buffer.from(output.imageData.split(',')[1],'base64');
 assert.equal(output.requestId,requestId);assert.equal(output.sourceSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(output.resultSha256,createHash('sha256').update(pixels).digest('hex'));
 assert.deepEqual(output.resultDimensions,{width:size,height:size});assert.equal(pixels.readUInt32BE(16),size);assert.equal(pixels.readUInt32BE(20),size);
 results.push({operation,size,ms:Math.round(performance.now()-start),bytes:pixels.length});
}
for(const op of operations)await run(op,64);
for(const op of [operations[1],operations[5]])await run(op,2048);
const start=performance.now();await Promise.all(['00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'].map(actor=>run(operations[2],3840,actor)));
const report={checkedAt:new Date().toISOString(),success:true,irisDisabled:true,privateTools:caps.tools,results,concurrent3840ms:Math.round(performance.now()-start)};
writeFileSync('/tmp/unified-processor-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
