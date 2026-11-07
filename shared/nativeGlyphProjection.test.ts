import { describe, expect, it } from "vitest";
import definitionJson from "./nativeGlyph.r9-14.fixture.json";
import { componentDefinitionV1Schema, createComponentDefinition } from "./componentAssembly";
import { completeDesignFields, instantiateCompleteDesign } from "./completeDesignGeneration";
import { arsenalHash } from "./arsenalContent";
import { readArsenalComposition } from "./designArsenal";
import { resolveArsenalGeometry, type ArsenalTextMeasurer } from "./arsenalGeometry";
import { isStandaloneDirectionalGlyph, nativeGlyphProjection, NATIVE_GLYPH_MANIFEST_HASH } from "./nativeGlyphProjection";
import { authorRecipe } from "../harness/componentArsenal/authoring";
const definition = componentDefinitionV1Schema.parse(definitionJson);
const values = ["Uma pausa para você", "Café artesanal, bolo caseiro e um espaço que acolhe no meio do seu dia.", "Cafeteria Lume"].map((value,index)=>({fieldId:`field-${index}`,value}));
const input = { definition, values, mediaPrompts:[], runId:"11111111-1111-4111-8111-111111111111", slot:0, slide:0, planHash:"a".repeat(64), experimental:true };
const measure: ArsenalTextMeasurer = input => ({height: input.fontSize*(input.lineHeight??1), lines:[{text:input.text,width:input.text==='➔'?input.fontSize*.6:Math.min(input.width,input.text.length*input.fontSize*.4)}]});

describe("verified directional glyph projection", () => {
  it.each(["➔","➔➔","→"," ↗ "])("recognizes standalone direction %s", text => expect(isStandaloneDirectionalGlyph(text)).toBe(true));
  it.each(["Venha ➔","Conheça","R$ 10","2026","+","@seuperfil",""])("preserves real editorial text %s", text => expect(isStandaloneDirectionalGlyph(text)).toBe(false));
  it("keeps historical fields and exposes only actual text regions for the new marker", () => {
    expect(completeDesignFields(definition).map(field=>field.id)).toEqual(["field-0","field-1","field-2","field-3"]);
    expect(completeDesignFields(definition,1).map(field=>field.id)).toEqual(["field-0","field-1","field-2"]);
    expect(nativeGlyphProjection(definition,1)?.bindings[0].targets[0].text).toBe("➔");
    expect(nativeGlyphProjection(definition)).toBeUndefined();
    expect(()=>instantiateCompleteDesign({...input,nativeGlyphProjection:1,values:[...values,{fieldId:"field-3",value:"A real requested CTA"}]})).toThrow("Campos da composição divergentes");
  });
  it("does not infer ornaments from unknown, modified or stale definitions", () => {
    const modified=structuredClone(definition);
    modified.fragment.instances.find(instance=>instance.id==='text-11-0')!.width=300;
    expect(nativeGlyphProjection(modified,1)).toBeUndefined();
    const revised=createComponentDefinition(modified);
    expect(completeDesignFields(revised,1)).toHaveLength(4);
    expect(completeDesignFields({...definition,hash:'f'.repeat(64)},1)).toHaveLength(4);
    const source=structuredClone(definition); if(source.source.kind==='recipe')source.source.recipeHash='f'.repeat(64);
    expect(nativeGlyphProjection(source,1)).toBeUndefined();
  });
  it("preserves all authored geometry and source provenance while compiling a fixed ornament", () => {
    const before=arsenalHash(definition), scene=instantiateCompleteDesign({...input,nativeGlyphProjection:1});
    expect(arsenalHash(definition)).toBe(before);
    expect(scene.origin.definitionHash).toBe(definition.hash);
    expect(scene.origin.componentAssembly?.componentHashes).toEqual([definition.hash]);
    expect(scene.origin.componentAssembly?.nativeGlyphProjection).toEqual({version:1,manifestHash:NATIVE_GLYPH_MANIFEST_HASH});
    expect(scene.origin.variantHash).toBe(arsenalHash(scene.base));
    expect(scene.base.instances.map(({pieceHash,...instance})=>instance)).toEqual(definition.fragment.instances.map(({pieceHash,...instance})=>instance));
    const instance=scene.base.instances.find(instance=>instance.id==='text-11-0')!;
    expect(scene.pieces[instance.pieceHash]).toMatchObject({fixedText:'➔',fixedTextRole:'ornament'});
    expect(scene.base.bindings.some(binding=>binding.targetIds.includes(instance.id))).toBe(false);
    expect(scene.relations.some(relation=>relation.outputs.some(output=>output.targetId===instance.id))).toBe(false);
    const resolved=resolveArsenalGeometry(scene,{measureText:measure});
    expect(readArsenalComposition(JSON.parse(JSON.stringify(resolved)))).toEqual(resolved);
    expect(resolved.elements.find(element=>element.id===instance.id)).toMatchObject({text:'➔',fixedTextRole:'ornament',bindingId:null});
  });
  it("preserves the fixed glyph through CanvasPostModel persistence and repeated reopening", async () => {
    const { INITIAL_POST }=await import('../client/src/pages/CanvasLab/components/types');
    const { putArsenalComposition }=await import('../client/src/pages/CanvasLab/lib/arsenalComposition');
    const { canvasModelToSavePayload, normalizeCanvasModel }=await import('../client/src/pages/CanvasLab/lib/saveAdapter');
    const scene=resolveArsenalGeometry(instantiateCompleteDesign({...input,nativeGlyphProjection:1}),{measureText:measure});
    const post=putArsenalComposition({...structuredClone(INITIAL_POST),currentSlideIndex:0},scene);
    const payload=canvasModelToSavePayload(post,{inputType:'text',inputContent:'Cafeteria Lume'});
    const reopened=normalizeCanvasModel(JSON.parse(JSON.stringify(payload.canvasModel)));
    const stored=readArsenalComposition(reopened.slides[0].composition);
    expect(stored.origin).toEqual(scene.origin);
    expect(resolveArsenalGeometry(stored,{measureText:measure}).elements).toEqual(scene.elements);
  });
  it("does not turn an unbound original arrow into an editable catch-all label", () => {
    const recipe:any={matrix:{fields:[{id:'heading',layerIds:['heading'],kind:'text',prefix:'',minScale:.65}]},scene:{layers:[{id:'heading',kind:'text',text:'Welcome'},{id:'arrow',kind:'text',text:'➔'}]}};
    const record:any={referenceId:'new-original'};
    expect(authorRecipe(record,recipe,[{role:'headline',fields:['heading']}]).map(unit=>unit.layerIds)).toEqual([['heading']]);
    recipe.scene.layers[1].text='Conheça ➔';
    expect(authorRecipe(record,recipe,[{role:'headline',fields:['heading']}]).at(-1)?.sampleText).toBe('Conheça ➔');
  });
});
