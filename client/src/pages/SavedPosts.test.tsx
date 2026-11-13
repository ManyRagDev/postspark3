// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {INITIAL_POST} from './CanvasLab/components/types';
import {savedPostToCanvasModel} from './CanvasLab/lib/saveAdapter';
const h=vi.hoisted(()=>({fetch:vi.fn(),navigate:vi.fn(),pages:[] as any[],previews:[] as any[],empty:false}));
vi.mock('@/lib/trpc',()=>({trpc:{useUtils:()=>({post:{get:{fetch:h.fetch}}}),post:{listSummary:{useQuery:(input:any)=>{h.pages.push(input);return {data:{items:h.empty?[]:[{id:5,headline:'Capa',platform:'instagram',postMode:'static',createdAt:'2026-10-22'}],total:h.empty?0:25}};}},get:{useQuery:(_id:any,options:any)=>{h.previews.push(options);return {};}}}}}));
vi.mock('wouter',()=>({useLocation:()=>['/saved-posts',h.navigate]}));
vi.mock('@/pages/CanvasLab/components/CanvasPostStage',()=>({CanvasPostStage:()=>null}));
vi.mock('@/components/PostRenderer',()=>({default:()=>null}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
vi.mock('@/components/UserTopMenu',()=>({default:()=>null}));
import SavedPosts from './SavedPosts';
beforeEach(()=>{sessionStorage.clear();h.pages=[];h.previews=[];h.empty=false;h.fetch.mockClear();h.navigate.mockClear();});
afterEach(()=>sessionStorage.clear());
it('lists summaries by page and loads the authoritative document only on user action',async()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div'),root=createRoot(el);document.body.append(el);const saved={id:5,inputType:'text',inputContent:'Brief',canvas_model:{...INITIAL_POST,id:'example',headline:'Texto preservado'}};h.fetch.mockResolvedValue(saved);try{await act(async()=>root.render(<SavedPosts/>));expect(h.pages[0]).toEqual({limit:20,offset:0});expect(h.previews.every(p=>p.enabled===false)).toBe(true);expect(h.fetch).not.toHaveBeenCalled();await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent?.includes('Próxima'))!.click());expect(h.pages.at(-1)).toEqual({limit:20,offset:20});await act(async()=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent?.includes('Abrir'))!.click());expect(h.fetch).toHaveBeenCalledTimes(1);expect(h.fetch).toHaveBeenCalledWith({id:5});expect(JSON.parse(sessionStorage.getItem('postspark.open_canvas_post')!).model).toEqual(savedPostToCanvasModel(saved));expect(h.navigate).toHaveBeenCalledWith('/thevoid');}finally{await act(async()=>root.unmount());el.remove();sessionStorage.clear();}});

it('requests a preview on intersection without opening the post',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 let intersect: ((entries:any[])=>void)|undefined;
 const disconnect=vi.fn();
 vi.stubGlobal('IntersectionObserver',class { constructor(callback:any){intersect=callback;} observe(){} disconnect=disconnect; });
 h.previews=[];h.fetch.mockClear();
 const el=document.createElement('div'),root=createRoot(el);document.body.append(el);
 try {
  await act(async()=>root.render(<SavedPosts/>));
  expect(h.previews.at(-1).enabled).toBe(false);
  await act(async()=>intersect?.([{isIntersecting:true}]));
  expect(h.previews.at(-1).enabled).toBe(true);
  expect(h.fetch).not.toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalled();
  expect(el.textContent).toContain('Preparando prévia');
 } finally {await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();}
});

it('restores the previous search and page when returning to the library',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 sessionStorage.setItem('postspark.saved-posts.view.v1',JSON.stringify({page:1,search:'Capa',draft:'Capa',scrollY:320}));
 const el=document.createElement('div'),root=createRoot(el);document.body.append(el);
 try {
  await act(async()=>root.render(<SavedPosts/>));
  expect(h.pages.at(-1)).toEqual({limit:20,offset:20,search:'Capa'});
  expect(el.querySelector<HTMLInputElement>('[aria-label="Buscar posts por título, design ou código"]')!.value).toBe('Capa');
  h.fetch.mockResolvedValue({id:5,canvas_model:INITIAL_POST});
  await act(async()=>Array.from(el.querySelectorAll('button')).find(button=>button.textContent?.includes('Abrir'))!.click());
  expect(JSON.parse(sessionStorage.getItem('postspark.saved-posts.view.v1')!)).toMatchObject({page:1,search:'Capa',draft:'Capa'});
 } finally {await act(async()=>root.unmount());el.remove();}
});

it('distinguishes an empty search from an empty library and offers clearing the query',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;h.empty=true;
 sessionStorage.setItem('postspark.saved-posts.view.v1',JSON.stringify({page:0,search:'Inexistente',draft:'Inexistente',scrollY:0}));
 const el=document.createElement('div'),root=createRoot(el);document.body.append(el);
 try {
  await act(async()=>root.render(<SavedPosts/>));
  expect(el.textContent).toContain('Nenhum resultado para esta busca');
  expect(el.textContent).not.toContain('Nenhum post salvo ainda');
  await act(async()=>Array.from(el.querySelectorAll('button')).find(button=>button.textContent==='Mostrar todos os posts')!.click());
  expect(h.pages.at(-1)).toEqual({limit:20,offset:0});
  expect(el.textContent).toContain('Nenhum post salvo ainda');
 } finally {await act(async()=>root.unmount());el.remove();}
});
