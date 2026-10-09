/** Inventory references for assisted authoring. No API call, upload or guessed design. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadImage } from '@napi-rs/canvas';

const source=path.resolve(process.argv[2]??'designs/inbox');
const output=path.resolve(process.argv[3]??`artifacts/complete-designs/intake-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const files=await fs.readdir(source,{withFileTypes:true});
const images=[];
for(const entry of files.filter(e=>e.isFile()&&/\.(png|jpe?g|webp)$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name))){
  const sourcePath=path.join(source,entry.name),bytes=await fs.readFile(sourcePath),image=await loadImage(bytes);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  images.push({id:`ref-${sha256.slice(0,16)}`,name:entry.name,sourcePath,sha256,width:image.width,height:image.height,status:'awaiting-assisted-authoring'});
}
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.mkdir(output,{recursive:false});
await fs.mkdir(path.join(output,'specs'));await fs.mkdir(path.join(output,'authoring'));
await fs.writeFile(path.join(output,'inventory.json'),JSON.stringify({format:'postspark.complete-designs.intake',schemaVersion:1,images},null,2)+'\n');
await fs.writeFile(path.join(output,'README.md'),'# Lote de referências\n\nInspecione cada imagem. Escreva specs/<id>.json com o CompactSpec do builder e authoring/<id>.json com {family, units:[{role, fields:[IDs]}], roles:[static, cover, development, example, closing]}. Declare apenas papéis realmente revisados. Não omita efeitos difíceis nem substitua a arte pela imagem original.\n\nExecute `pnpm designs:build --input '+output+'` para produzir um pacote novo, com JSONs, renders e relatório. Esta etapa não chama IA externa nem publica.\n');
console.log(JSON.stringify({source,output,images:images.length,externalCalls:0}));
