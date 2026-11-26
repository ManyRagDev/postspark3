export function uploadStudioAsset(file:Blob,options?:{
 kind?:"video"|"project"|"image"|"audio"; anchorId?:string|null;workspaceId?:string|null;signal?:AbortSignal;onProgress?:(progress:number)=>void;
}):Promise<{id:string;assetId:string;url:string;duration?:number;width?:number;height?:number}>;
