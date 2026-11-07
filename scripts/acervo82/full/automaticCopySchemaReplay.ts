/** Inspect the actual rejected native grammar and replay stored canonical copies locally. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { z } from "zod";
import { compactCopyTransportSchema, compactCopyValidationSchema } from "../../../server/ai/workflows/compactProposalCopy";
import { completeDesignFields } from "../../../shared/completeDesignGeneration";
const base="artifacts/acervo82/full/sessions/automatic-stack-20261106";
const json=async(file:string)=>JSON.parse(await fs.readFile(file,"utf8"));
const rejected=await json(`${base}/wire/ac5bd1f2-12cf-421e-8656-82912daceaa4.json`);
assert.equal(rejected.httpStatus,400);assert(rejected.response.error.metadata.raw.includes("compiled grammar is too large"));
const ops=await json(`${base}/carousel/operations.json`);
const definitions=ops.find((op:any)=>op.operation_key==="prepare:definitions").result;
const slots=ops.find((op:any)=>op.operation_key==="prepare:selection").result.slots;
const selected=(slot:number)=>slots[slot].pages.map((page:any)=>definitions.find((definition:any)=>definition.id===page.componentId));
const selectedDefinitions=selected(0);
const schema=z.toJSONSchema(compactCopyTransportSchema(selectedDefinitions));delete schema.$schema;
const oldSchema=rejected.request.response_format.json_schema.schema;
const alternatives=(value:any):number=>!value||typeof value!=="object"?0:(value.anyOf?.length??0)+(value.oneOf?.length??0)+Object.values(value).reduce<number>((total,item)=>total+alternatives(item),0);
const sample={caption:"Leitura diária",hashtags:[],slides:selectedDefinitions.map((definition:any)=>({values:completeDesignFields(definition).map(field=>({fieldId:field.id,value:field.kind==="list"?Array.from({length:field.cardinality?.min??1},()=>"Leitura"):"Leitura"})),mediaPrompts:[]}))};
assert(compactCopyValidationSchema(selectedDefinitions).safeParse(sample).success);
const newBytes=Buffer.byteLength(JSON.stringify(schema)),oldBytes=Buffer.byteLength(JSON.stringify(oldSchema));
assert(newBytes<oldBytes/2);assert(alternatives(schema)<=2);assert(alternatives(oldSchema)>alternatives(schema));
let replays=0;
for(const slot of [1,2]) {
 const receipt=ops.find((op:any)=>op.operation_key===`p-6f4f72bb-5bd5-44d7-904a-4ace605de803-${slot}:copy`);
 assert(receipt?.result?.choices?.length);
 const canonical=JSON.parse(receipt.result.choices[0].message.content);
 assert.deepEqual(compactCopyValidationSchema(selected(slot)).parse(canonical),canonical);replays++;
}
const proof={version:1,paidCalls:0,rejectedRequestId:rejected.requestId,rejectedDesigns:selectedDefinitions.map((definition:any)=>definition.label),oldSchemaBytes:oldBytes,newSchemaBytes:newBytes,oldUnionAlternatives:alternatives(oldSchema),newUnionAlternatives:alternatives(schema),storedCanonicalReceiptsReplayed:replays,canonicalMappingUnchanged:true,oldReceiptsWritten:false,limitation:"Provider compilation itself was not invoked again; this verifies the smaller native grammar and exact local contract offline."};
await fs.writeFile("/tmp/automatic-copy-schema-replay.json",JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
