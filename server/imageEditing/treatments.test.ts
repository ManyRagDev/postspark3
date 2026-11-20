import { describe, expect, it } from "vitest";
import { imageEditOperationSchema, imageEditorToolsForGroups } from "../../shared/imageEditor";
import { operationCommands, ImageProcessor } from "./processor";
const operations = [
 {kind:"black-white"}, {kind:"duotone",dark:"#11253a",light:"#59d4c2"},
 {kind:"shadows-highlights",shadows:25,highlights:10}, {kind:"look",preset:"teal-orange"},
 {kind:"iris"}, {kind:"grain",amount:1.5},
];
describe("curated social image treatments", () => {
 it("only accepts bounded typed intents and server-owned presets", () => {
  for (const raw of operations) expect(imageEditOperationSchema.safeParse(raw).success).toBe(true);
  for (const raw of [{kind:"look",preset:"/tmp/custom.cube"},{kind:"look",preset:"warm",intensity:50},{kind:"grain",amount:8},{kind:"shadows-highlights",shadows:100,highlights:10},{kind:"duotone",dark:"red",light:"#ffffff"},{kind:"iris",command:"evil"}]) expect(imageEditOperationSchema.safeParse(raw).success).toBe(false);
 });
 it("separates core and optional rollout groups", () => {
  expect(imageEditorToolsForGroups(false,false)).toHaveLength(6);
  expect(imageEditorToolsForGroups(true,false).map(t=>t.kind)).toContain("duotone");
  expect(imageEditorToolsForGroups(true,false).map(t=>t.kind)).not.toContain("look");
  expect(imageEditorToolsForGroups(false,true).map(t=>t.kind)).toContain("grain");
 });
 it("maps each intent to an allowlisted command and deterministic recipe", () => {
  const commands=operations.map(raw=>operationCommands(imageEditOperationSchema.parse(raw),3840,3840));
  expect(commands.map(c=>c[0][0])).toEqual(["image.adjustments.blackWhite","image.adjustments.gradientMap","image.adjustments.shadowsHighlights","image.adjustments.colorLookup","filter.blurGallery.irisBlur","filter.noise.addNoise"]);
  expect(commands[3][0][1]).toEqual({lut:"tealOrange"});
  expect(commands[5][0][1]).toMatchObject({amount:1.5,monochromatic:true,seed:42});
 });
 it("refuses disabled recipes before decoding or spawning", async () => {
  const processor=new ImageProcessor({binary:"/nonexistent",coreTreatments:false,finishingTreatments:false});
  await expect(processor.process({requestId:crypto.randomUUID(),imageData:"invalid",format:"png",operation:{kind:"black-white"}},"test")).rejects.toMatchObject({code:"UNAVAILABLE"});
 });
});
