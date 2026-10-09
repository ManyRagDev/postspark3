import { assemblySlideRoles, materializeAssemblySlide, type ComponentDefinitionV1, type AssemblyPlanV1 } from '@shared/componentAssembly';
import { contentCoverageIssues, type DesignContent } from '@shared/arsenalContent';
import { variableContentDocumentSchema, type ContentBlock, type VariableContent } from '@shared/variableContent';
import { compositionFromAssemblyBundle } from '@shared/componentAssembly';
import { readArsenalComposition } from '@shared/designArsenal';
import { putArsenalComposition, resolveArsenalComposition } from '../CanvasLab/lib/arsenalComposition';
import { ensureArsenalFont } from '../CanvasLab/lib/arsenalAssets';
import { INITIAL_POST, type CanvasPostModel } from '../CanvasLab/components/types';

export const reviewSamples = ['curto', 'médio', 'longo', 'literal', 'lista', 'comparação'] as const;
export type ReviewSample = typeof reviewSamples[number];
const samples = {
  curto: { headline:'Sua ideia merece uma boa forma', body:'Crie com clareza.' },
  médio: { headline:'Design com espaço para a mensagem', body:'Uma composição funciona quando organiza a leitura. Escolha uma ideia, dê espaço ao texto e use a imagem para reforçar o significado.' },
  longo: { headline:'Como construir uma composição que acompanha conteúdo maior', body:'A hierarquia organiza a informação e orienta a leitura. O título abre a conversa, o desenvolvimento explica o raciocínio e o encerramento convida a uma ação. Uma composição precisa acompanhar mudanças reais no tamanho do conteúdo, preservando o texto integral. Esta amostra longa testa os limites de espaço, legibilidade, superfícies e alinhamentos do componente. Quando há excesso, a revisão deve mostrar o problema para que ele seja corrigido sem cortar o conteúdo.' },
  literal: { headline:'O texto literal precisa ser mantido exatamente como foi escrito.', body:'Não troque palavras, não omita esta frase e preserve também os acentos: criação, composição e edição.' },
  lista: { headline:'Três cuidados para compor melhor', body:'Use a estrutura de lista para conferir a capacidade do componente.' },
  comparação: { headline:'Compare duas formas de organizar', body:'Confira a estrutura da comparação.' },
};
const sequenceRoles = ['cover','development','closing'] as const;
const interiorRoles = ['list','comparison','example'] as const;
type ReviewRole = typeof assemblySlideRoles[number];

/** Map only fields owned by the component; richer samples reveal unsupported structures. */
export function componentReviewContent(component: ComponentDefinitionV1, mode: ReviewSample, slideRole?: ReviewRole): VariableContent {
  const blocks: ContentBlock[] = [];
  const roles = new Map<string, number>();
  for (const binding of component.fragment.bindings) {
    if (binding.kind === 'media') continue;
    const selector = binding.source.match(/^block:(headline|body|eyebrow|sectionLabel|callToAction|label):(\d+):text$/);
    const role = selector?.[1] ?? (/^(headline|body|eyebrow|sectionLabel|callToAction|label)$/.test(binding.source) ? binding.source : null);
    if (role) roles.set(role, Math.max(roles.get(role) ?? -1, selector ? Number(selector[2]) : 0));
  }
  const ctaBySample:Record<ReviewSample,string>={
    curto:'Conheça a proposta',
    médio:'Uma hierarquia organiza a leitura e orienta o próximo passo.',
    longo:samples.longo.body,
    literal:samples.literal.body,
    lista:'Confira os três cuidados para compor melhor.',
    comparação:'Compare as duas formas de organizar.',
  };
  const roleCopy: Record<string, string> = {
    headline: samples[mode].headline,
    body: samples[mode].body,
    callToAction: ctaBySample[mode],
    eyebrow: slideRole === 'cover' ? 'IDEIA PRINCIPAL' : 'DESIGN EDITORIAL',
    sectionLabel: slideRole === 'development' ? 'DESENVOLVIMENTO' : slideRole === 'closing' ? 'ENCERRAMENTO' : 'COMPOSIÇÃO',
    label: 'EXEMPLO',
  };
  for (const [role, maxIndex] of Array.from(roles.entries())) for (let index = 0; index <= maxIndex; index++) {
    const text = roleCopy[role] ?? 'Exemplo de conteúdo';
    blocks.push({ id:`${role}-${index}`, type:'text', role:role as Extract<ContentBlock,{type:'text'}>['role'], text });
  }
  if (mode === 'lista' || component.fragment.bindings.some(b => b.kind === 'list')) blocks.push({ id:'review-list',type:'list',items:[{id:'item-1',text:'Defina a ideia principal.'},{id:'item-2',text:'Organize a hierarquia.'},{id:'item-3',text:'Verifique o espaço e o contraste.'}] });
  if (mode === 'comparação' || component.fragment.bindings.some(b => b.source.startsWith('comparison.'))) blocks.push({ id:'review-comparison',type:'comparison',left:{label:'Antes',text:'Elementos disputam a atenção.'},right:{label:'Depois',text:'Uma hierarquia orienta a leitura.'} });
  return variableContentDocumentSchema.parse({schemaVersion:3,blocks,caption:'Prévia administrativa de capacidade; sem geração de IA.',hashtags:[]});
}

function promptForMedia(component: ComponentDefinitionV1) {
  return (component.fragment.mediaSlots ?? []).map(slot => {
    if (!slot.prompt.trim()) throw new Error(`O slot de mídia “${slot.label}” não tem um prompt editorial para revisão.`);
    return { componentId:component.id, slotId:slot.id, prompt:slot.prompt };
  });
}

/** Build a concrete target preview from its role-compatible catalog context, independent of the visible page. */
export async function previewComponentDefinition(target: ComponentDefinitionV1, context: ComponentDefinitionV1[], mode: ReviewSample) {
  const available = Array.from(new Map([target,...context].map(c=>[c.id,c])).values());
  const aspectRatio=target.aspectRatios[0];
  const targetRole: ReviewRole = target.roles.includes('static') ? 'static' : sequenceRoles.find(role=>target.roles.includes(role)) ?? (target.kind==='content'?interiorRoles.find(role=>target.roles.includes(role)):undefined) ?? (()=>{ throw new Error('Este componente não aceita o papel estático nem um papel compatível com a sequência de revisão.'); })();
  const roles: ReviewRole[] = targetRole === 'static' ? ['static'] : interiorRoles.includes(targetRole as typeof interiorRoles[number]) ? ['cover',targetRole,'closing'] : [...sequenceRoles];
  const targetSlideIndex = roles.indexOf(targetRole);
  const slides = roles.map((role,index) => {
    const targetIsContent = target.kind === 'content' && role === targetRole;
    const contentComponent = targetIsContent ? target : available.find(c=>c.id!==target.id && c.kind==='content' && !c.completeDesign && c.aspectRatios.includes(aspectRatio) && c.roles.includes(role));
    if (!contentComponent) throw new Error(`Não há contexto de conteúdo com o mesmo formato para o papel “${role}”. A prévia não foi montada.`);
    const restrictToTargetDensity=role===targetRole&&(target.kind==='content'||target.kind==='ornament');
    const density = (restrictToTargetDensity?target.densities:contentComponent.densities).find(d=>contentComponent.densities.includes(d));
    if (!density) throw new Error(`Não há densidade compatível entre o alvo e o conteúdo do papel “${role}”.`);
    const content=componentReviewContent(contentComponent,mode,role);
    const selected = [contentComponent];
    if (role === targetRole && !targetIsContent) selected.push(target);
    const refs=selected.map(c=>({id:c.id,hash:c.hash}));
    const roleLabels:Record<ReviewRole,string>={static:'',cover:'CAPA',development:'DESENVOLVIMENTO',list:'LISTA',comparison:'COMPARAÇÃO',example:'EXEMPLO',closing:'ENCERRAMENTO'};
    const step = role==='static' ? '' : `SLIDE ${String(index+1).padStart(2,'0')} // ${roleLabels[role]}`;
    return {id:`review-slide-${role}`,role,density,content,refs,selected,mediaPrompts:selected.flatMap(promptForMedia),step,target:role===targetRole,contentComponent,coverage:contentCoverageIssues(content,contentComponent.fragment.bindings)};
  });
  const typography = target.kind === 'typography' ? target.id : null;
  const plan:AssemblyPlanV1={schemaVersion:1,postMode:roles.length===1?'static':'carousel',aspectRatio,variations:Array.from({length:3},(_,slot)=>({
    id:`review-${slot}`,direction:{label:target.label,palette:{background:target.fragment.artboard.background,text:'#111111',accent:'#E5A93C'},typographyComponentId:typography},caption:'Prévia de revisão administrativa.',hashtags:[],
    slides:slides.map(s=>({id:s.id,role:s.role,density:s.density,content:s.content,components:s.refs,mediaPrompts:s.mediaPrompts})),
  }))};
  const runId=crypto.randomUUID();
  const postSlides=slides.map(s=>({id:s.id,step:s.step,headline:'',subtext:'',assemblyRole:s.role,assemblyDensity:s.density}));
  let post:CanvasPostModel={...structuredClone(INITIAL_POST),id:crypto.randomUUID(),aspectRatio,slides:postSlides,currentSlideIndex:0};
  const issues:string[]=[];
  const targetContent = slides[targetSlideIndex].content;
  for (const [index,slide] of Array.from(slides.entries())) {
    const bundle=materializeAssemblySlide(plan,0,index,available,{traceId:runId,runId,experimental:true});
    await Promise.all(bundle.assets.filter(a=>a.family).map(ensureArsenalFont));
    const composition=readArsenalComposition(resolveArsenalComposition(compositionFromAssemblyBundle(bundle)));
    post={...post,currentSlideIndex:index};
    post=putArsenalComposition(post,composition);
    issues.push(...slide.coverage.map(issue=>`${slide.role}:${issue}`),...composition.issues.map(issue=>`${slide.role}:${issue}`));
  }
  post={...post,currentSlideIndex:targetSlideIndex};
  const contextLabels=Array.from(new Set(slides.map(s=>s.contentComponent).filter(c=>c.id!==target.id).map(c=>c.label)));
  return {post,content:targetContent as DesignContent,component:target,targetRole,contextLabel:contextLabels.length?contextLabels.join(', '):null,issues:Array.from(new Set(issues)),sample:mode,targetSlideIndex,slideRoles:roles,mediaPrompts:slides.map(s=>({role:s.role,prompts:s.mediaPrompts.map(p=>({componentId:p.componentId,slotId:p.slotId,prompt:p.prompt}))}))};
}
