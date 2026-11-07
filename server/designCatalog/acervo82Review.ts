import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';
import { z } from 'zod';
import { ENV } from '../_core/env';
import { createContext } from '../_core/context';
import { acervo82Code } from '@shared/acervo82Identity';
import { getDb } from '../db';
import { readCatalogDefinition } from './versionedCatalog';
import { localCatalogRevisionOverride } from './localCatalogOverride';
import { componentDefinitionV1Schema } from '@shared/componentAssembly';
import { readArsenalComposition } from '@shared/designArsenal';
import { TRPCError } from '@trpc/server';

const buildPath = /^artifacts\/acervo82\/full\/[a-z0-9][a-z0-9-]*$/;
const auraId = 'acervo82-concept-17';
const auraPreviewReceipt = z.object({directory:z.string().regex(buildPath),revision:z.string().regex(/^[1-9]\d*$/)});
const previewEntry = z.object({
  id: z.string(), code: z.string(), name: z.string(), aliases: z.array(z.string()),
  status: z.enum(['ready_for_local_review','needs_adjustment']),
  capabilities: z.object({single:z.boolean(),carousel:z.boolean(),photo:z.boolean(),list:z.boolean(),comparison:z.boolean(),metric:z.boolean()}),
  differences: z.array(z.string()), reference: z.string(), render: z.string().nullable(),
  definitionHash: z.string().nullable(),
});
const reviewDocument = z.object({version:z.literal(1), entries:z.array(previewEntry).length(82)});
export function acervo82ReviewEnabled() {
  if (process.env.POSTSPARK_ACERVO82_LOCAL !== 'true' || process.env.NODE_ENV !== 'development') return false;
  try { const u=new URL(ENV.supabaseUrl);return u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname); }
  catch { return false; }
}
async function readReview() {
  if (!acervo82ReviewEnabled()) return null;
  try {
    const {directory} = JSON.parse(await readFile('.acervo82-local/full-review.json','utf8'));
    if(typeof directory !== 'string' || !buildPath.test(directory)) throw new Error('acervo82_invalid_review_directory');
    const {entries} = reviewDocument.parse(JSON.parse(await readFile(path.join(directory,'review.json'),'utf8')));
    if(new Set(entries.map(e=>e.id)).size!==82 || entries.some(e=>acervo82Code(e.id)!==e.code)) throw new Error('acervo82_invalid_review_identities');
    return {directory,entries};
  } catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e; }
}
const reviewUrl = (id:string,kind:'reference'|'render') => `/api/acervo82/review/${id}/${kind}`;
async function readAuraPreview() {
  if (!acervo82ReviewEnabled() || process.env.POSTSPARK_AURA_PREVIEW !== 'true') return null;
  try {
    return auraPreviewReceipt.parse(JSON.parse(await readFile('.acervo82-local/aura-preview.json','utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
export async function listAcervo82Review() {
  const [review,aura]=await Promise.all([readReview(),readAuraPreview()]);
  return review?.entries.map(({reference,render,...entry})=>({...entry,referenceUrl:reviewUrl(entry.id,'reference'),renderUrl:render?reviewUrl(entry.id,'render'):null,pilotAvailable:entry.id===auraId&&Boolean(aura)})) ?? null;
}
export async function openAcervo82Review(id:string,actor:string,mode:'static'|'compose'|'literal'|'pilot'='static') {
  const review=await readReview(),entry=review?.entries.find(e=>e.id===id);
  const source=mode==='pilot'
    ? (id===auraId?await readAuraPreview():null)
    : {directory:review?.directory,revision:localCatalogRevisionOverride()};
  if(!source?.directory||!source.revision||!entry||!acervo82Code(id)||!entry.render)throw new TRPCError({code:'NOT_FOUND'});
  // Opening a controlled fixture grants only its exact, staged components to
  // this authenticated admin. Ordinary save and asset authorization are unchanged.
  const fixture=mode==='static'||mode==='pilot'?id:`${id}-${mode}`;
  const model=JSON.parse(await readFile(path.join(source.directory,'fixtures',`${fixture}.json`),'utf8')) as import('../../client/src/pages/CanvasLab/components/types').CanvasPostModel;
  const grants=new Map<string,{user_uuid:string;asset_id:string;component_id:string}>();
  for(const slide of model.slides){
    const composition=readArsenalComposition(slide.composition);
    const origin=composition.origin.componentAssembly;
    if(origin?.componentIds.length!==1)throw new Error('acervo82_review_origin_invalid');
    const definition=componentDefinitionV1Schema.parse(await readCatalogDefinition(source.revision,origin.componentIds[0],origin.componentHashes[0]));
    if(definition.completeDesign?.family!==id)throw new Error('acervo82_review_origin_invalid');
    for(const asset of definition.assets.filter(a=>a.kind==='catalog'))grants.set(`${definition.id}:${asset.id}`,{user_uuid:actor,asset_id:asset.id,component_id:definition.id});
  }
  if(grants.size){const result=await getDb().from('design_component_asset_grants').upsert(Array.from(grants.values()),{onConflict:'user_uuid,asset_id,component_id',ignoreDuplicates:true});if(result.error)throw result.error;}
  return model;
}
export function registerAcervo82ReviewRoutes(app:Express) {
  if(!acervo82ReviewEnabled())return;
  app.get('/api/acervo82/review/:id/:kind',async(req,res)=>{
    const {id,kind}=req.params;
    if(!acervo82Code(id)||!['reference','render'].includes(kind)){res.sendStatus(404);return;}
    const {user}=await createContext({req,res});
    if(user?.role!=='admin'){res.sendStatus(user?403:401);return;}
    try {
      const review=await readReview(),entry=review?.entries.find(e=>e.id===id), file=kind==='reference'?entry?.reference:entry?.render;
      if(!review||!file||!/^(references|thumbnails)\/[a-z0-9_.-]+\.(png|jpe?g|webp)$/i.test(file)){res.sendStatus(404);return;}
      res.type(path.extname(file)).set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'}).send(await readFile(path.join(review.directory,file)));
    }catch{res.sendStatus(404);}
  });
}
