import { expect, it } from "vitest";
import { bindAssemblyContent, bindCompleteDesignClosingContent, completeDesignClosingBodySource } from "./assemblyContentBindings";
import { contentCoverageIssues, readContentSource, setContentSource, type DesignContent } from "./arsenalContent";
import { arsenalBindingSchema } from "./designArsenal";

it("flows repeated canonical paragraphs into the last compatible region, preserving IDs and editing/reopen", () => {
 const content: DesignContent = {schemaVersion:3,blocks:[
  {id:"h",type:"text",role:"headline",text:"Título"},
  {id:"b1",type:"text",role:"body",text:"Primeiro parágrafo."},
  {id:"b2",type:"text",role:"body",text:"Segundo, literal e completo."},
  {id:"b3",type:"text",role:"body",text:"Terceiro parágrafo."},
 ],caption:"",hashtags:[]};
 const binding=(source:string)=>arsenalBindingSchema.parse({id:source.replaceAll(":","-"),label:source,kind:"text",source,required:true,targetIds:["text"],cardinality:null,prefix:"",gap:0});
 const original=[binding("headline"),binding("body"),binding("callToAction")], before=structuredClone(content);
 const bound=bindAssemblyContent(content,original);
 expect(original[1].source).toBe("body");
 expect(content).toEqual(before);
 expect(bound[1].source).toBe("textGroup:b1,b2,b3");
 expect(bound[2].required).toBe(false);
 expect(contentCoverageIssues(content,bound)).toEqual([]);
 expect(readContentSource(content,bound[1].source)).toBe("Primeiro parágrafo.\n\nSegundo, literal e completo.\n\nTerceiro parágrafo.");
 bound.forEach(b=>expect(arsenalBindingSchema.safeParse(b).success).toBe(true));
 const edited=structuredClone(content);
 setContentSource(edited,bound[1].source,"Primeiro editado.\n\nSegundo preservado.\n\nTerceiro.\n\nQuarto.");
 expect(edited.blocks.map(b=>b.id)).toEqual(before.blocks.map(b=>b.id));
 const reopened=JSON.parse(JSON.stringify({content:edited,bound}));
 expect(readContentSource(reopened.content,reopened.bound[1].source)).toBe("Primeiro editado.\n\nSegundo preservado.\n\nTerceiro.\n\nQuarto.");
 expect(contentCoverageIssues(content,[binding("headline")])).toHaveLength(3);
 // Explicitly repeated body regions keep the first paragraph and aggregate only the surplus.
 const multiple=bindAssemblyContent(content,[binding("headline"),binding("block:body:0:text"),binding("block:body:1:text")]);
 expect(multiple[1].source).toBe("block:body:0:text");expect(multiple[2].source).toBe("textGroup:b2,b3");
 // Mixed roles and duplicate IDs cannot fabricate coverage.
 expect(contentCoverageIssues(content,[{source:"textGroup:h,b1"}])).toHaveLength(4);
 expect(readContentSource(content,"textGroup:b1,b1")).toBe("");
});

it("binds a closing CTA to an empty optional native body slot without changing copy or targets", () => {
 const content: DesignContent={schemaVersion:3,blocks:[
  {id:"h",type:"text",role:"headline",text:"Café da Tarde"},
  {id:"cta",type:"text",role:"callToAction",text:"Venha conhecer nosso espaço."},
 ],caption:"",hashtags:[]};
 const bindings=[{kind:"text" as const,source:"headline",required:true,targetIds:["title"]},
  {kind:"text" as const,source:"block:body:0:text",required:false,targetIds:["body-line-one"]},
  {kind:"text" as const,source:"block:body:0:text",required:false,targetIds:["body-line-two"]}];
 const before=structuredClone({content,bindings});
 const bound=bindCompleteDesignClosingContent(content,bindings);
 expect(bound.slice(1).map(b=>b.source)).toEqual(["block:callToAction:0:text","block:callToAction:0:text"]);
 expect(bound.map(b=>b.targetIds)).toEqual(bindings.map(b=>b.targetIds));
 expect(contentCoverageIssues(content,bound)).toEqual([]);
 expect({content,bindings}).toEqual(before);
 const reopened=JSON.parse(JSON.stringify({content,bound}));
 expect(readContentSource(reopened.content,reopened.bound[1].source)).toBe("Venha conhecer nosso espaço.");
 expect(contentCoverageIssues(content,bindAssemblyContent(content,bindings))).not.toEqual([]);
});

it("keeps occupied or required body slots and native CTA bindings intact", () => {
 const content: DesignContent={schemaVersion:3,blocks:[
  {id:"body",type:"text",role:"body",text:"Apoio que não pode ser perdido."},
  {id:"cta",type:"text",role:"callToAction",text:"Venha nos visitar."},
 ],caption:"",hashtags:[]};
 const body={kind:"text" as const,source:"body",required:false};
 expect(completeDesignClosingBodySource([body])).toBe("body");
 expect(completeDesignClosingBodySource([body],content)).toBeUndefined();
 expect(bindCompleteDesignClosingContent(content,[body])[0].source).toBe("body");
 expect(contentCoverageIssues(content,bindCompleteDesignClosingContent(content,[body]))).not.toEqual([]);
 expect(completeDesignClosingBodySource([{...body,required:true}])).toBeUndefined();
 const cta={kind:"text" as const,source:"callToAction",required:false};
 expect(completeDesignClosingBodySource([body,cta])).toBeUndefined();
 expect(bindCompleteDesignClosingContent(content,[body,cta])).toEqual([body,cta]);
 const explicitCta={...cta,source:"content:cta:text"};
 const onlyCta={...content,blocks:content.blocks.filter(b=>b.id==="cta")};
 expect(completeDesignClosingBodySource([body,explicitCta],onlyCta)).toBeUndefined();
 expect(bindCompleteDesignClosingContent(onlyCta,[body,explicitCta])).toEqual([body,explicitCta]);
});
