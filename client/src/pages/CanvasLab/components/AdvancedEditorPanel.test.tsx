// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST, type CanvasPostModel } from "./types";
vi.mock("./AdvancedImageEditor",()=>({default:(p:any)=><div><button onClick={()=>p.onPendingChange(true)}>Prévia de teste</button><span>{p.target.label}</span></div>}));
import AdvancedEditorPanel, { type AdvancedTransitionGuard } from "./AdvancedEditorPanel";
let root:Root, container:HTMLDivElement;
beforeEach(()=>{ (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement("div");document.body.append(container);root=createRoot(container); });
afterEach(()=>{act(()=>root.unmount());container.remove();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;});
const fixture=():CanvasPostModel=>({...structuredClone(INITIAL_POST),slides:[{id:"s",step:"1",headline:"Título",subtext:"Corpo",extraImages:[{id:"photo",url:"/fixture.png",x:10,y:20,width:100,height:100}]}]});
const button=(text:string)=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent===text)!;
describe("unified editor selection and transition boundary",()=>{
 it("follows a single selection, keeps a pending image until discard and guards panel close",async()=>{
  const post=fixture(), guard={current:null as AdvancedTransitionGuard|null};
  const props={post,selectionIds:["photo"],transitionGuard:guard,onSelect:vi.fn(),onCommand:vi.fn(),onCommit:vi.fn()};
  await act(async()=>root.render(<AdvancedEditorPanel {...props}/>));
  act(()=>button("Prévia de teste").click());
  await act(async()=>root.render(<AdvancedEditorPanel {...props} selectionIds={["headline"]}/>));
  expect(container.textContent).toContain("Há uma prévia pendente");
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Imagem");
  act(()=>button("Descartar prévia e continuar").click());
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Texto");
  expect(container.textContent).toContain("Edição direta do texto");
 });
 it("does not silently apply to multiple selected elements",async()=>{
  await act(async()=>root.render(<AdvancedEditorPanel post={fixture()} selectionIds={["headline","subtext"]} transitionGuard={{current:null}} onSelect={vi.fn()} onCommand={vi.fn()} onCommit={vi.fn()}/>));
  expect(container.textContent).toContain("Escolha um único elemento");
  expect(container.querySelector('select[aria-label="Acabamento do texto"]')).toBeNull();
 });
});
