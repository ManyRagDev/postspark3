/** Node diagnostic surface; faithfully ports ReferenceSceneContents primitives, not React Stage. */
import { createCanvas, GlobalFonts, Image, DOMMatrix, Path2D, loadImage, type Canvas } from "@napi-rs/canvas";
import Konva from "konva";
import { sha256 } from "./builder";
import type { RecreationRecipe } from "../../shared/designRecreation";
import type { ReferenceSceneLayer } from "../../shared/referenceReconstruction";
import { layoutRichText } from "../../client/src/pages/CanvasLab/lib/richTextLayout";
import { referenceFontFamily } from "../../client/src/pages/CanvasLab/lib/referenceFonts";

let installed = false;
const mediaImages = new Map<string, Image>();
export async function prepareRecipeMedia(recipe: RecreationRecipe): Promise<void> {
  for (const slot of recipe.matrix?.media ?? []) {
    if(!slot.asset || mediaImages.has(slot.asset.sha256)) continue;
    const bytes=Buffer.from(slot.asset.dataUrl.split(",")[1],"base64");
    if(sha256(bytes)!==slot.asset.sha256) throw new Error(`Media integrity failed: ${slot.id}`);
    mediaImages.set(slot.asset.sha256,await loadImage(bytes));
  }
}
export async function renderRecipeAsync(recipe: RecreationRecipe): Promise<Buffer> {
  await prepareRecipeMedia(recipe); return renderRecipe(recipe);
}
export function installNativeSurface(): void {
  if (installed) return;
  installed = true;
  const canvas = () => {
    const c = createCanvas(300, 300) as Canvas & {style:Record<string,string>};
    c.style = {};
    return c;
  };
  Object.assign(globalThis, { DOMMatrix, Path2D });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: (tag: string) => { if (tag !== "canvas") throw new Error(`Unexpected element ${tag}`); return canvas(); },
    fonts: { add: () => {}, ready: Promise.resolve() },
  } });
  Object.defineProperty(globalThis, "FontFace", { configurable: true, value: class {
    constructor(private family: string, private source: string) {}
    async load() {
      const data = this.source.match(/^url\((data:font\/[^)]+)\)$/)?.[1];
      if (!data) throw new Error("Offline FontFace requires embedded data");
      if (!GlobalFonts.register(Buffer.from(data.split(",")[1], "base64"), this.family)) throw new Error(`Cannot register ${this.family}`);
      return this;
    }
  } });
  // Reject every external request. Original references are read directly from disk only.
  globalThis.fetch = async () => { throw new Error("Network disabled in designBatch"); };
  Konva.Util.createCanvasElement = canvas as unknown as typeof Konva.Util.createCanvasElement;
  Konva.Util.createImageElement = (() => new Image()) as unknown as typeof Konva.Util.createImageElement;
  Konva.pixelRatio = 1;
}

export function registerRecipeFonts(recipe: RecreationRecipe) {
  installNativeSurface();
  return recipe.scene.fonts.map(font => {
    if (!font.dataUrl || !font.sha256) throw new Error(`Font missing: ${font.family}:${font.weight}`);
    const bytes = Buffer.from(font.dataUrl.split(",")[1], "base64");
    if (bytes.length > 3_000_000 || sha256(bytes) !== font.sha256) throw new Error(`Font integrity failed: ${font.family}`);
    const alias = referenceFontFamily(recipe.scene, font.family, font.weight);
    if (!GlobalFonts.register(bytes, alias)) throw new Error(`Native font rejected: ${font.family}`);
    return { family: font.family, weight: font.weight, sha256: font.sha256, bytes: bytes.length, alias };
  });
}

export function measureLayer(recipe: RecreationRecipe, l: ReferenceSceneLayer, wrap = false) {
  return layoutRichText({ text: l.text ?? "", width: Math.max(20, l.width), fontSize: l.fontSize,
    fontFamily: referenceFontFamily(recipe.scene, l.fontFamily, l.fontWeight), fontStyle: String(l.fontWeight),
    fill: l.fill, align: l.align, lineHeight: l.lineHeight, letterSpacing: l.letterSpacing, wrap });
}

export function layerMeasurements(recipe: RecreationRecipe) {
  registerRecipeFonts(recipe);
  return recipe.scene.layers.filter(l => l.kind === "text").map(l => {
    const layout = measureLayer(recipe, l), width = Math.max(...layout.lines.map(line => line.width));
    return { id: l.id, width, height: layout.height, boxWidth: l.width, boxHeight: l.height,
      fontSize: l.fontSize, lines: layout.lines.length, opacity: l.opacity,
      fits: l.opacity === 0 || (width <= l.width + 0.01 && layout.height <= l.height + 0.01) };
  });
}

export function renderRecipe(recipe: RecreationRecipe, options: {wrap?:boolean} = {}): Buffer {
  registerRecipeFonts(recipe);
  if (recipe.scene.layers.some(l => l.kind === "arcText")) throw new Error("Native batch renderer intentionally rejects arcText");
  const width = recipe.scene.source.widthPx, height = recipe.scene.source.heightPx;
  const stage = new Konva.Stage({ width, height });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(new Konva.Rect({ width, height, fill: recipe.scene.artboard.background, listening: false }));
  for (const l of [...recipe.scene.layers].sort((a,b) => a.zIndex-b.zIndex || a.id.localeCompare(b.id))) {
    const style = recipe.adaptation?.layerStyles.find(s => s.layerId === l.id);
    if (l.kind === "text") {
      const layout = measureLayer(recipe, l, options.wrap ?? false), family = referenceFontFamily(recipe.scene, l.fontFamily, l.fontWeight);
      const group = new Konva.Group({ x:l.x, y:l.y, rotation:l.rotationDeg, opacity:l.opacity, listening:false });
      const drawRuns = (fill: string, dx: number, dy: number, face: boolean) => {
        for (const run of layout.runs) group.add(new Konva.Text({
          text:run.text, x:run.x+dx, y:run.y+dy, width:Math.max(run.width+2,l.width-run.x), height:run.height,
          fontSize:run.fontSize, fontFamily:family, fontStyle:run.fontStyle, fill,
          stroke:face ? l.strokeColor ?? undefined : undefined, strokeWidth:face ? l.strokeWidth : 0,
          fillAfterStrokeEnabled:true, wrap:"none", letterSpacing:l.letterSpacing, listening:false,
        }));
      };
      if (l.extrusion) for(let i=l.extrusion.steps;i>=1;i--) drawRuns(l.extrusion.color,l.extrusion.offsetX*i/l.extrusion.steps,l.extrusion.offsetY*i/l.extrusion.steps,false);
      drawRuns(l.fill,0,0,true); layer.add(group);
    } else if (l.kind === "rect" && recipe.matrix?.media.find(m=>m.layerId===l.id)?.asset) {
      const slot=recipe.matrix.media.find(m=>m.layerId===l.id)!,asset=slot.asset!;
      const bytes=Buffer.from(asset.dataUrl.split(",")[1],"base64");
      if(sha256(bytes)!==asset.sha256) throw new Error(`Media integrity failed: ${slot.id}`);
      const image=mediaImages.get(asset.sha256);
      if(!image) throw new Error("Call prepareRecipeMedia before synchronously rendering embedded media");
      if(image.width!==asset.width || image.height!==asset.height) throw new Error(`Media dimensions differ: ${slot.id}`);
      const scale=Math.max(l.width/image.width,l.height/image.height),cropWidth=l.width/scale,cropHeight=l.height/scale;
      const group=new Konva.Group({x:l.x,y:l.y,rotation:l.rotationDeg,opacity:l.opacity,listening:false});
      group.add(new Konva.Image({image:image as unknown as HTMLImageElement,width:l.width,height:l.height,
        cornerRadius:Math.min(style?.cornerRadiusPx ?? 0,l.width/2,l.height/2),
        crop:{x:(image.width-cropWidth)*slot.positionX,y:(image.height-cropHeight)*slot.positionY,width:cropWidth,height:cropHeight},listening:false}));
      if(l.strokeWidth>0) group.add(new Konva.Rect({width:l.width,height:l.height,stroke:l.strokeColor ?? undefined,strokeWidth:l.strokeWidth,cornerRadius:style?.cornerRadiusPx ?? 0,listening:false}));
      layer.add(group);
    } else if (l.kind === "rect") layer.add(new Konva.Rect({ x:l.x,y:l.y,width:l.width,height:l.height,
      rotation:l.rotationDeg,fill:l.fill,stroke:l.strokeColor ?? undefined,strokeWidth:l.strokeWidth,
      cornerRadius:Math.min(style?.cornerRadiusPx ?? 0,l.width/2,l.height/2),opacity:l.opacity,listening:false }));
    else layer.add(new Konva.Line({ x:l.x,y:l.y,points:l.points,closed:l.kind === "polygon",fill:l.kind === "polygon" ? l.fill : undefined,
      stroke:style && l.strokeWidth === 0 ? undefined : l.strokeColor ?? l.fill,strokeWidth:style ? l.strokeWidth : Math.max(0.5,l.strokeWidth),
      rotation:l.rotationDeg,opacity:l.opacity,lineCap:"round",lineJoin:"round",listening:false }));
  }
  stage.draw();
  const result = Buffer.from(stage.toDataURL({ pixelRatio:1 }).split(",")[1], "base64");
  stage.destroy();
  return result;
}
