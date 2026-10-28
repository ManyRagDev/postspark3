// @vitest-environment happy-dom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { INITIAL_POST, type CanvasPostModel } from './types';
import CanvasEditorChrome, { type CanvasEditorTool } from './CanvasEditorChrome';
import { CanvasEditorLayers } from './CanvasEditorPanel';
import { CanvasSelectionPanel } from './CanvasSelectionPanel';
import { executeEditorCommand, projectEditorLayers, resolveEditorSelection, type EditorTarget } from '../lib/editorController';
import { canvasModelToSavePayload, savedPostToCanvasModel } from '../lib/saveAdapter';
vi.mock('./FontPickerDropdown',()=>({default:()=>null}));
it('selects a layer, edits its text through the real controller and reopens that document',()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const initial:CanvasPostModel={...structuredClone(INITIAL_POST),slides:[{...INITIAL_POST.slides[0],id:'s',headline:'Título inicial'}],currentSlideIndex:0};
  let current=initial;
  function Harness(){
    const [post,setPost]=useState(initial);const [target,setTarget]=useState<EditorTarget|null>(null);const [tool,setTool]=useState<CanvasEditorTool|null>(null);
    current=post;const selected=resolveEditorSelection(post,target);
    return <CanvasEditorChrome activeTool={tool} onToolChange={setTool} selectionLabel={selected?.label} contents={{
      layers:<CanvasEditorLayers layers={projectEditorLayers(post,'s')} selectedId={target?.elementId} onSelect={setTarget} onAction={()=>{}} />,
      selection:selected&&<CanvasSelectionPanel post={post} layer={selected} onEditOnCanvas={()=>{}} onCommand={command=>{const result=executeEditorCommand(post,selected.target,command);if(result.ok)setPost(result.post);}} />,
    }}/>;
  }
  act(()=>root.render(<Harness/>));
  act(()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('Camadas'))?.click());
  act(()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('Título'))?.click());
  act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Fechar painel"]')?.click());
  act(()=>Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('Ajustar'))?.click());
  const textarea=host.querySelector('textarea')!;expect(textarea.value).toBe('Título inicial');
  act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea,'Título corrigido');textarea.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(current.slides[0].headline).toBe('Título corrigido');
  const payload=canvasModelToSavePayload(current,{inputType:'text',inputContent:'teste'});
  expect(savedPostToCanvasModel({id:1,canvas_model:payload.canvasModel}).slides[0].headline).toBe('Título corrigido');
  act(()=>root.unmount());host.remove();delete (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;
});
