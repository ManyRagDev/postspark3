import {describe,it,expect} from "vitest";
import {restoreVisualAssets} from "../../harness/completeDesigns/restoreVisualAssets";
import {componentAssemblyFixture} from "../../shared/componentAssembly.fixture";
import {createComponentDefinition,componentDefinitionV1Schema,compactComponentCard} from "../../shared/componentAssembly";
import {arsenalHash} from "../../shared/arsenalContent";
import type {AssetFile,ComponentPackage} from "../../harness/componentArsenal/extract";

const family="481adc75c3b7da8d267aeef293da71a6";
function fixture(){
 const definition=createComponentDefinition({...componentAssemblyFixture()[0],completeDesign:{family}});
 const snapshot={recipe:{unchanged:"historical source"},previewPath:"historical.png"};
 const p={source:{referenceId:family},sourceSnapshot:snapshot,components:[definition],assetFiles:[],authorship:{units:[],limitations:[]}} as unknown as ComponentPackage;
 return {package:p,assetFiles:[] as AssetFile[]};
}
describe("visual restoration as an immutable executable asset",()=>{
 it("keeps editable text and the historical recipe while restoring a verified photographic layer",async()=>{
  const result=fixture(),before=arsenalHash(result.package.sourceSnapshot),old=result.package.components[0];
  const texts=old.fragment.instances.filter(i=>old.pieces[i.pieceHash].kind==="text");
  await restoreVisualAssets(result);
  const revised=result.package.components[0];
  expect(arsenalHash(result.package.sourceSnapshot)).toBe(before);
  expect(revised.id).not.toBe(old.id);
  expect(revised.completeDesign?.baselineVerified).toBe(false);
  expect(componentDefinitionV1Schema.safeParse(revised).success).toBe(true);
  for(const text of texts)expect(revised.fragment.instances).toContainEqual(text);
  const layer=revised.fragment.instances.find(i=>i.id==="restored-background")!;
  const asset=revised.assets.find(a=>a.id===revised.pieces[layer.pieceHash].imageAssetId)!;
  expect(asset.mimeType).toBe("image/png");
  expect(result.assetFiles.find(f=>f.manifest.id===asset.id)?.bytes.length).toBe(asset.bytes);
  expect(revised.fragment.mediaSlots).toEqual([]);
  expect(compactComponentCard(revised).completeDesign?.designGuidance?.motifs).toContain("photographic-object");
  const tampered=structuredClone(revised);tampered.assets=tampered.assets.filter(a=>a.id!==asset.id);
  expect(()=>createComponentDefinition(tampered)).toThrow("component_image_manifest_mismatch");
 });
});
