// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import type { ArsenalAsset } from '@shared/designArsenal';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/arsenalApi',()=>({arsenalApi:{designCatalog:{resolveArsenalAssets:{query}}}}));
import { loadArsenalImage } from './arsenalAssets';
const bytes=createCanvas(2,2).toBuffer('image/png');
function asset(id:string):ArsenalAsset {return {id,kind:'catalog',sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'image/png',bytes:bytes.length} as ArsenalAsset;}
beforeEach(()=>{
 query.mockReset();
 vi.stubGlobal('crypto',webcrypto);
 vi.stubGlobal('Image',class {src='';naturalWidth=2;naturalHeight=2;decode(){return Promise.resolve();}});
});
afterEach(()=>vi.unstubAllGlobals());
it('loads a pinned image once and reuses verified bytes without keeping an expiring signed URL',async()=>{
 const a=asset('verified-image');query.mockResolvedValue([{id:a.id,sha256:a.sha256,url:'https://storage.example/authorized'}]);
 const fetcher=vi.fn().mockResolvedValue(new Response(bytes));vi.stubGlobal('fetch',fetcher);
 const [first,second]=await Promise.all([loadArsenalImage(a),loadArsenalImage(a)]);
 expect(first).toBe(`data:image/png;base64,${bytes.toString('base64')}`);expect(second).toBe(first);
 expect(query).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('refuses an authorization with another digest before fetching pixels',async()=>{
 const a=asset('unauthorized-image');query.mockResolvedValue([{id:a.id,sha256:'0'.repeat(64),url:'https://storage.example/wrong'}]);
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(loadArsenalImage(a)).rejects.toThrow('Imagem não autorizada');expect(fetcher).not.toHaveBeenCalled();
});
it('rejects corrupted bytes and evicts the failed promise so the correct asset can load',async()=>{
 const a=asset('corrupted-image');query.mockResolvedValue([{id:a.id,sha256:a.sha256,url:'https://storage.example/image'}]);
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(corrupt)).mockResolvedValueOnce(new Response(bytes));vi.stubGlobal('fetch',fetcher);
 await expect(loadArsenalImage(a)).rejects.toThrow('Bytes da imagem divergentes');
 await expect(loadArsenalImage(a)).resolves.toMatch(/^data:image\/png;base64,/);expect(fetcher).toHaveBeenCalledTimes(2);
});
