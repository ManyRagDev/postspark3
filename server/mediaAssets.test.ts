import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
const mocks=vi.hoisted(()=>({getBucket:vi.fn(),createBucket:vi.fn(),upload:vi.fn(),download:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({storage:{getBucket:mocks.getBucket,createBucket:mocks.createBucket,from:()=>({upload:mocks.upload,download:mocks.download})}})}));
import { loadOwnedMediaReference, normalizeCanvasMediaPayload, saveUserMediaAsset } from "./mediaAssets";
const owner="25c1b164-6829-4b88-9f34-052ea8f7b13a";
const picture=()=>createCanvas(1200,700).toDataURL("image/png");
beforeEach(()=>{vi.clearAllMocks();mocks.getBucket.mockResolvedValue({data:{public:false},error:null});mocks.upload.mockResolvedValue({error:null});});
describe("durable owner-private media",()=>{
 it("stores full-resolution verified bytes and a stable owned path",async()=>{
  const saved=await saveUserMediaAsset(picture(),owner);
  expect(saved.url).toMatch(new RegExp(`^/api/post-media/${owner}/[a-f0-9]{64}$`));
  expect(mocks.upload.mock.calls[0][1]).toBeInstanceOf(Buffer);
  expect(mocks.upload.mock.calls[0][2]).toMatchObject({contentType:"image/png",upsert:false});
 });
 it("deduplicates canonical and projection data URLs together without mutating the caller",async()=>{
  const data=picture(),input={imageUrl:data,canvasModel:{slides:[{bgImage:data,composition:{media:{slot:{url:data}}}}]}};
  const saved=await normalizeCanvasMediaPayload(input,owner);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(saved.imageUrl).toBe(saved.canvasModel.slides[0].composition.media.slot.url);
  expect(input.imageUrl).toBe(data);
 });
 it("loads same-owner private media bytes only from its private bucket",async()=>{
  const bytes=Buffer.from(picture().split(",")[1],"base64"),hash=createHash("sha256").update(bytes).digest("hex");
  mocks.download.mockResolvedValue({data:new Blob([bytes],{type:"image/png"}),error:null});
  const result=await loadOwnedMediaReference(`/api/post-media/${owner}/${hash}`,owner);
  expect(result.dataUri).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
  expect(mocks.download).toHaveBeenCalledWith(`${owner}/${hash}`);
 });
 it("rejects arbitrary, cross-owner and missing references before reading storage",async()=>{
  await expect(loadOwnedMediaReference("https://example.com/image.png",owner)).rejects.toThrow("não pertence");
  await expect(loadOwnedMediaReference(`/api/post-media/${"00000000-0000-0000-0000-000000000001"}/${"a".repeat(64)}`,owner)).rejects.toThrow("não pertence");
  expect(mocks.getBucket).not.toHaveBeenCalled();
  mocks.download.mockResolvedValue({data:null,error:new Error("not found")});
  await expect(loadOwnedMediaReference(`/api/post-media/${owner}/${"a".repeat(64)}`,owner)).rejects.toThrow("not found");
 });
 it("rejects forged image signatures, other owners and a public bucket",async()=>{
  await expect(saveUserMediaAsset("data:image/png;base64,bm90IGltYWdl",owner)).rejects.toThrow("Assinatura");
  await expect(normalizeCanvasMediaPayload({canvasModel:{bgImage:"/api/post-media/00000000-0000-0000-0000-000000000001/"+"a".repeat(64)}},owner)).rejects.toThrow("outro proprietário");
  mocks.getBucket.mockResolvedValue({data:{public:true},error:null});
  await expect(saveUserMediaAsset(picture(),owner)).rejects.toThrow("privado");
 });
 it("keeps legacy payloads untouched",async()=>{
  const input={imageUrl:picture()};expect(await normalizeCanvasMediaPayload(input,owner)).toBe(input);expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("immediately rejects and aborts storage operations when signal is aborted", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Upload cancelado pelo usuário"));
  await expect(saveUserMediaAsset(picture(), owner, controller.signal)).rejects.toThrow("Upload cancelado pelo usuário");
  await expect(loadOwnedMediaReference(`/api/post-media/${owner}/${"a".repeat(64)}`, owner, controller.signal)).rejects.toThrow("Upload cancelado pelo usuário");
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
 });
});
