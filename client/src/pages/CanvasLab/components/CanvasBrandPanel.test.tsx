// @vitest-environment happy-dom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {INITIAL_POST} from './types';
import {CanvasAppearancePanel, CanvasBrandPanel} from './CanvasEditorContent';
vi.mock('@/lib/trpc',()=>({trpc:{post:{generateImage:{useMutation:()=>({})},saveMediaAsset:{useMutation:()=>({})}}}}));
vi.mock('./FontPickerDropdown',()=>({default:()=>null}));
it('shows the active slide logo and its explicit removal instead of an inherited root logo',()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const post={...structuredClone(INITIAL_POST),logoUrl:'root.png',slides:[{...INITIAL_POST.slides[0],id:'s',logo:{url:'slide.png',position:'top-left' as const}}]};
  const setLogo=vi.fn();
  act(()=>root.render(<CanvasBrandPanel post={post} onUpdatePost={vi.fn()} onSetLogo={setLogo}/>));
  expect(host.querySelector('img[alt="Logo atual"]')?.getAttribute('src')).toBe('slide.png');
  act(()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Remover logo')?.click());
  expect(setLogo).toHaveBeenCalledWith('s',{url:undefined});
  act(()=>root.render(<CanvasBrandPanel post={{...post,slides:[{...post.slides[0],logo:{...post.slides[0].logo,url:''}}]}} onUpdatePost={vi.fn()} onSetLogo={setLogo}/>));
  expect(host.querySelector('img[alt="Logo atual"]')).toBeNull();
  act(()=>root.unmount());host.remove();delete (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;
});

it('restores badge and slide markers with edits scoped to the selected slide',()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const post={...structuredClone(INITIAL_POST),showBadge:true,badgeText:'Destaque',showStep:true,currentSlideIndex:1,slides:[{...INITIAL_POST.slides[0],id:'s1',step:'01'},{...INITIAL_POST.slides[0],id:'s2',step:'02'}]};
  const update=vi.fn();
  act(()=>root.render(<CanvasAppearancePanel post={post} onUpdatePost={update} onApplyTypography={vi.fn()}/>));
  const badge=Array.from(host.querySelectorAll('input')).find(input=>input.type==='checkbox' && input.parentElement?.textContent?.includes('Mostrar selo'))!;
  act(()=>badge.click());expect(update).toHaveBeenCalledWith({showBadge:false});
  const step=Array.from(host.querySelectorAll('input')).find(input=>input.value==='02')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(step,'03');step.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(update.mock.calls.at(-1)?.[0].slides.map((slide:{step:string})=>slide.step)).toEqual(['01','03']);
  expect(host.textContent).toContain('prioridade sobre o número');
  act(()=>root.unmount());host.remove();delete (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;
});
