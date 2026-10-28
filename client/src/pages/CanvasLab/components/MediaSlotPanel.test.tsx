// @vitest-environment happy-dom
import React, {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {arsenalHash} from '@shared/arsenalContent';
import {INITIAL_POST, type CanvasPostModel} from './types';
import {createArsenalFixtureComposition} from '../lib/arsenalFixture';
import {putArsenalComposition, resolveArsenalComposition} from '../lib/arsenalComposition';
import MediaSlotPanel from './MediaSlotPanel';
const mocks = vi.hoisted(() => ({ generate:vi.fn(), upload:vi.fn() }));
vi.mock('@/lib/trpc', () => ({ trpc: { post: { generateImage: {useMutation:()=>({mutateAsync:mocks.generate})}, saveMediaAsset:{useMutation:()=>({mutateAsync:mocks.upload})} } } }));
vi.mock('sonner', ()=>({toast:{info:vi.fn(),error:vi.fn(),success:vi.fn()}}));
let root:Root, host:HTMLDivElement;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>createCanvas(20,20).getContext('2d') as never);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.clearAllMocks();
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();});
function fixture(label='Foto do produto') {
  const c=createArsenalFixtureComposition();const id=c.elements.find(e=>e.kind==='media')!.id;
  c.base={...c.base,mediaSlots:[{id,label,function:'produto',prompt:'Produto na bancada',deferred:true,policy:'cover'}]};
  c.origin={...c.origin,variantHash:arsenalHash(c.base)};
  const post=putArsenalComposition(structuredClone(INITIAL_POST),resolveArsenalComposition(c));
  return {post,id};
}
function render(post:CanvasPostModel,id:string,onUpdate:ReturnType<typeof vi.fn>) {
  act(()=>root.render(<MediaSlotPanel post={post} onUpdate={onUpdate} selectedId={id}/>));
}
it('offers named destinations and never generates an image on mount',()=>{
  const {post,id}=fixture('Fotografia — inserir no Admin2');const composition=post.slides[0].composition!;const originalHash=composition.origin.variantHash;render(post,id,vi.fn());
  expect(host.querySelector('select')?.textContent).toContain('Fundo');
  expect(host.querySelector('select')?.textContent).toContain('Fotografia · imagem pendente');
  expect(host.querySelector('select')?.textContent).not.toContain('Admin2');
  expect((host.querySelector('select') as HTMLSelectElement).value).toBe(id);
  expect(composition.base.mediaSlots?.[0].label).toBe('Fotografia — inserir no Admin2');
  expect(composition.origin.variantHash).toBe(originalHash);
  expect(arsenalHash(composition.base)).toBe(originalHash);
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Produto na bancada');
  expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
});
it('generation completion applies to the original slide and slot after a selection change', async()=>{
  const {post,id}=fixture();const onUpdate=vi.fn();let resolve!:(value:{imageUrl:string})=>void;
  mocks.generate.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(post,id,onUpdate);
  await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Gerar imagem com IA')!.click();});
  const later={...post,currentSlideIndex:1,slides:[...post.slides,{...post.slides[0],id:'second-slide'}]};
  render(later,id,onUpdate);
  await act(async()=>{resolve({imageUrl:'https://example.com/generated.png'});});
  expect(onUpdate.mock.calls.find(([,op])=>op.kind==='apply')?.[0]).toEqual({postId:post.id,slideId:post.slides[0].id,slotId:id});
});
it('removed target keeps a preview for explicit application elsewhere',async()=>{
  const {post,id}=fixture();const onUpdate=vi.fn();let resolve!:(value:{imageUrl:string})=>void;
  mocks.generate.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(post,id,onUpdate);
  await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Gerar imagem com IA')!.click();});
  render({...post,slides:post.slides.map(s=>({...s,composition:undefined}))},id,onUpdate);
  await act(async()=>{resolve({imageUrl:'https://example.com/generated.png'});});
  expect(onUpdate.mock.calls.some(([,op])=>op.kind==='apply')).toBe(false);
  expect(host.querySelector('img[alt="Imagem pronta para aplicação"]')?.getAttribute('src')).toBe('https://example.com/generated.png');
  act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Aplicar no destino atual')!.click());
  expect(onUpdate.mock.calls.at(-1)?.[0].slotId).toBe('__background__');
});
it('uses the composition background lock and keeps a late result for recovery',async()=>{
  const {post}=fixture();const slide=post.slides[0];const unlocked={...post,slides:[{...slide,imagePrompt:'Paisagem'},...post.slides.slice(1)]};const onUpdate=vi.fn();let resolve!:(value:{imageUrl:string})=>void;
  mocks.generate.mockImplementation(()=>new Promise(r=>{resolve=r;}));render(unlocked,'__canvas_background__',onUpdate);
  await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Gerar imagem com IA')!.click();});
  const locked={...unlocked,slides:[{...unlocked.slides[0],composition:{...unlocked.slides[0].composition!,elementStates:{__canvas_background__:{locked:true}}}},...unlocked.slides.slice(1)]};
  render(locked,'__canvas_background__',onUpdate);
  expect(host.textContent).toContain('Desbloqueie este destino');
  expect((Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes('Preparando imagem')) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>{resolve({imageUrl:'https://example.com/late.png'});});
  expect(onUpdate.mock.calls.some(([,op])=>op.kind==='apply')).toBe(false);
  expect(host.querySelector('img[alt="Imagem pronta para aplicação"]')?.getAttribute('src')).toBe('https://example.com/late.png');
});

it('does not report success or discard the image when the parent rejects a late apply',async()=>{
  const {post,id}=fixture();const update=vi.fn((_target,_op)=>false);mocks.generate.mockResolvedValue({imageUrl:'https://example.com/retained.png'});render(post,id,update);
  await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Gerar imagem com IA')!.click();});
  expect(host.querySelector('img[alt="Imagem pronta para aplicação"]')?.getAttribute('src')).toBe('https://example.com/retained.png');
  act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Aplicar no destino atual')!.click());
  expect(host.querySelector('img[alt="Imagem pronta para aplicação"]')).not.toBeNull();
  const {toast}=await import('sonner');expect(toast.success).not.toHaveBeenCalled();
});
