import { TRPCError } from "@trpc/server";
import { assemblyVariationBundleV1Schema } from "../../shared/componentAssembly";
import { completeDesignVariationV1Schema } from "../../shared/completeDesignGeneration";
import { defaultStudioPreferences,studioPreferencesSchema,type StudioPreferences } from "../../shared/studioPreferences";
import { getDb,getGenerationRunById } from "../db";
export async function readStudioPreferences(owner:string):Promise<StudioPreferences>{
 const r=await getDb().from("studio_preferences").select("preferences").eq("owner_id",owner).maybeSingle();
 if(r.error)throw r.error;
 return r.data?studioPreferencesSchema.parse(r.data.preferences):{...defaultStudioPreferences};
}
export async function writeStudioPreferences(owner:string,value:StudioPreferences){
 const preferences=studioPreferencesSchema.parse(value);
 const r=await getDb().from("studio_preferences").upsert({owner_id:owner,preferences,updated_at:new Date().toISOString()},{onConflict:"owner_id"});
 if(r.error)throw r.error;return preferences;
}
export async function forgetStudioPreferences(owner:string){
 const r=await getDb().from("studio_preferences").delete().eq("owner_id",owner);
 if(r.error)throw r.error;return {...defaultStudioPreferences};
}
export async function preferDeliveredDirection(owner:string,runId:string,slot:number){
 const run=await getGenerationRunById(runId,owner),snapshot=run?.output_snapshot;
 const variation=Array.isArray(snapshot)?snapshot.find((v:any)=>v?.completeDesignV1?.slot===slot)??snapshot[slot]:undefined;
 const complete=completeDesignVariationV1Schema.safeParse(variation&&typeof variation==='object'&&!Array.isArray(variation)?variation.completeDesignV1:undefined);
 if(run&&['completed','partial','running'].includes(run.status)&&complete.success&&complete.data.runId===runId&&complete.data.slot===slot)
  return writeStudioPreferences(owner,complete.data.visualPreference);
 const bundle=assemblyVariationBundleV1Schema.safeParse(variation&&typeof variation==='object'&&!Array.isArray(variation)?variation.componentAssemblyV1:undefined);
 if(run?.status!=="completed"||!bundle.success||bundle.data.runId!==runId||bundle.data.slot!==slot||!bundle.data.direction.intent)throw new TRPCError({code:"NOT_FOUND",message:"Direção entregue não disponível para este usuário."});
 const adapted=bundle.data.slides.some(s=>s.bundle.candidates.some(c=>c.componentAssembly?.resolution&&c.componentAssembly.resolution.kind!=="layout-adaptation"));
 return writeStudioPreferences(owner,{enabled:true,language:adapted?null:bundle.data.direction.intent.language,intensity:bundle.data.slides[0]?.density??"auto"});
}
