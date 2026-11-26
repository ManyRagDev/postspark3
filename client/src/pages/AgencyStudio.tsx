import { useSupabaseUserId } from "@/hooks/useSupabaseUserId";
import { useIsMobile } from "@/hooks/useMobile";
import { MareRetargetDialog, type MareRetargetState } from "@/components/MareRetargetDialog";
import { acceptMareReturn, clearMareReturn, mareReturnId, sendToMare, useMareCapabilities } from "@/lib/mareIntegration";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { requestIdentityApi } from "@/lib/membershipApi";
import { resyncSupabaseSession } from "@/lib/authBridge";
import { supabase } from "@/lib/supabaseClient";
import StudioAuthModal from "./StudioHome/components/StudioAuthModal";
import CanvasLabPage from "./CanvasLab/CanvasLabPage";
import PostDownloadDialog from "./CanvasLab/components/PostDownloadDialog";
import { INITIAL_POST, type CanvasPostModel } from "./CanvasLab/components/types";
import { normalizeCanvasModel } from "./CanvasLab/lib/saveAdapter";

type Workspace = { id: string; name: string; role: "owner" | "editor" | "reviewer" };
type Status = "draft" | "review" | "approved";
type ProjectSummary = { id: string; name: string; status: Status; revision: number };
type Project = ProjectSummary & { workspace_id: string; canvas_model: Partial<CanvasPostModel> };
const statusLabel: Record<Status, string> = { draft: "Rascunho", review: "Em revisão", approved: "Aprovado" };
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50";
const field = "min-h-11 min-w-0 max-w-full rounded-lg border border-white/15 bg-[#141720] px-3 py-2 text-sm";
const request = <T,>(path: string, input?: object) => requestIdentityApi<T>(`/api/agency${path}`, input);

export default function AgencyStudio() {
  const mobile = useIsMobile();
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite") ?? "";
  const [auth, setAuth] = useState(false);
  const actor = useSupabaseUserId();
  if (actor === undefined) return <p role="status" className="p-6">Verificando sessão…</p>;
  if (!actor) return <main className="mx-auto max-w-lg space-y-4 px-5 py-12">
    <h1 className="text-2xl font-semibold">{invite ? "Convite para equipe" : "Acesso à equipe"}</h1>
    <button className={button} onClick={() => setAuth(true)}>Entrar na conta</button>
    <StudioAuthModal isOpen={auth} isMobile={mobile} onClose={() => setAuth(false)} agencyInvite={invite || undefined} />
  </main>;
  return <AgencyWorkspace key={actor} actor={actor} invite={invite} />;
}

function AgencyWorkspace({ actor, invite }: { actor: string; invite: string }) {
  const params = new URLSearchParams(window.location.search);
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "reviewer">("editor");
  const [inviteLink, setInviteLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Project>();
  const [preview, setPreview] = useState<Project>();
  const revision = useRef(0);
  const [mareConflict,setMareConflict]=useState<MareRetargetState>();
  const mare = useMareCapabilities(actor);

  const overview = useQuery({
    queryKey: ["agency-overview", actor], retry: false,
    queryFn: () => request<{ userId: string; canCreate: boolean; workspaces: Workspace[] }>(""),
  });
  const shareKey = params.has("share") && overview.data ? `postspark.agency_share.${overview.data.userId}` : undefined;
  const shared = shareKey ? sessionStorage.getItem(shareKey) : null;
  const workspace = overview.data?.workspaces.find(w => w.id === workspaceId) ?? overview.data?.workspaces[0];
  const canEdit = workspace?.role === "owner" || workspace?.role === "editor";
  const projects = useQuery({
    queryKey: ["agency-projects", actor, workspace?.id],
    queryFn: () => request<ProjectSummary[]>(`/projects/${workspace!.id}`), enabled: Boolean(workspace), retry: false,
  });

  useEffect(() => {
    const id=mareReturnId();
    if (!id || !overview.data) return;
    let current=true;
    void (async () => {
      const anchor=await acceptMareReturn(id,"agency");
      const project=await request<Project>(`/project/${anchor.agencyProjectId}`);
      if (!current) return;
      const model=normalizeCanvasModel(project.canvas_model);
      model.currentSlideIndex=Math.max(0,model.slides.findIndex(slide=>slide.id===anchor.slideId));
      const restored={...project,canvas_model:model};
      const role=overview.data.workspaces.find(w=>w.id===project.workspace_id)?.role;
      setWorkspaceId(project.workspace_id);
      if ((role==="owner"||role==="editor") && project.status==="draft") {
        revision.current=project.revision;
        setEditor(restored);
      } else setPreview(restored);
      if (anchor.conflict) setMareConflict({model,anchor,revision:project.revision});
      else {clearMareReturn(); if(anchor.pending && anchor.canApply===false) toast.info("A edição do Maré aguarda a liberação do design para alterações.");}
    })().catch(error=>{if(current)toast.error(error.message);});
    return ()=>{current=false;};
  }, [overview.data]);

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await work(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação."); }
    finally { setBusy(false); }
  }
  async function accept() {
    if (!/^[0-9a-f-]{36}$/i.test(invite)) return;
    const accepted = await request<{ id: string }>("/accept", { id: invite });
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (token) await resyncSupabaseSession(token);
    setWorkspaceId(accepted.id);
    await overview.refetch();
    window.history.replaceState({}, "", "/agency");
  }
  async function editProject(row: ProjectSummary) {
    const project = await request<Project>(`/project/${row.id}`);
    if (!canEdit || row.status !== "draft") { setPreview(project); return; }
    revision.current = project.revision;
    setEditor(project);
  }
  async function review(row: ProjectSummary, status: Status) {
    await request<Project>("/review", { id: row.id, revision: row.revision, status });
    await projects.refetch();
  }

  if (mareConflict) return <MareRetargetDialog state={mareConflict} onCancel={()=>{clearMareReturn();setMareConflict(undefined);}} />;
  if (editor) return <CanvasLabPage key={editor.id} studioPlan="AGENCY" agencyWorkspaceId={editor.workspace_id}
    mareRecordId={editor.id} initialPost={normalizeCanvasModel(editor.canvas_model)} hasSavedPost
    onBackToGallery={() => { setEditor(undefined); void projects.refetch(); }}
    allowVideoUpload={mare?.video}
          onSendToMare={mare?.editor ? async(post,target) => {
      const saved=await request<Project>("/project",{id:editor.id,workspaceId:editor.workspace_id,revision:revision.current,name:editor.name,model:post});
      revision.current=saved.revision;
      await sendToMare({agencyProjectId:editor.id,workspaceId:editor.workspace_id,documentId:post.id,slideId:target.slideId,slotId:target.slotId,expectedRevision:saved.revision});
    } : undefined}
    onSave={async post => {
      const result = await request<Project>("/project", {
        id: editor.id, workspaceId: editor.workspace_id, revision: revision.current,
        name: editor.name, model: post,
      });
      revision.current = result.revision;
      return true;
    }} />;

  return <main className="mx-auto min-h-screen max-w-4xl space-y-6 px-5 py-12">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">Projetos de equipe</h1>
      <a href="/thevoid" className="text-sm underline">Voltar ao Studio</a>
    </header>
    {overview.isPending && <p role="status">Carregando equipe…</p>}
    {overview.isError && <p role="alert">Não foi possível abrir sua equipe.{" "}
      <button className="underline" onClick={() => void overview.refetch()}>Tentar novamente</button></p>}
    {invite && overview.data && <button className={button} disabled={busy} onClick={() => void act(accept)}>Aceitar convite</button>}
    {overview.data?.canCreate && !workspace && <form className="flex flex-wrap gap-3" onSubmit={event => {
      event.preventDefault();
      void act(async () => { await request("/workspace", { name }); await overview.refetch(); });
    }}>
      <input className={field} aria-label="Nome da equipe" required maxLength={120} value={name} onChange={e => setName(e.target.value)} />
      <button className={button} disabled={busy}>Criar equipe</button>
    </form>}
    {overview.data && !overview.data.canCreate && !workspace && !invite && <p>Abra um convite da sua equipe para começar.</p>}
    {workspace && <section className="space-y-4">
      <select className={field} aria-label="Equipe" value={workspace.id} onChange={event => {
        setWorkspaceId(event.target.value);
        setInviteLink("");
      }}>
        {overview.data?.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      {mare?.publicEntry && canEdit && <a className={button} target="_blank" rel="noopener" href={"/mare/?workspace="+encodeURIComponent(workspace.id)} aria-label="Abrir Maré Studio da equipe em nova aba">Vídeo ↗</a>}
      {workspace.role === "owner" && overview.data?.canCreate && <form className="flex flex-wrap gap-3" onSubmit={event => {
        event.preventDefault();
        void act(async () => {
          const result = await request<{ id: string }>("/invite", { workspaceId: workspace.id, email, role });
          setInviteLink(`${window.location.origin}/agency?invite=${result.id}`);
        });
      }}>
        <input className={field} type="email" aria-label="E-mail do convidado" required value={email} onChange={e => setEmail(e.target.value)} />
        <select className={field} aria-label="Permissão do convidado" value={role} onChange={e => setRole(e.target.value as typeof role)}>
          <option value="editor">Editor</option>
          <option value="reviewer">Revisor</option>
        </select>
        <button className={button} disabled={busy}>Gerar convite</button>
      </form>}
      {inviteLink && <input className={field + " w-full"} aria-label="Link do convite" readOnly value={inviteLink} onFocus={e => e.target.select()} />}
      {canEdit && <form className="flex flex-wrap gap-3" onSubmit={event => {
        event.preventDefault();
        void act(async () => {
          const model = shared
            ? { ...normalizeCanvasModel(JSON.parse(shared)), id: crypto.randomUUID() }
            : { ...INITIAL_POST, id: crypto.randomUUID() };
          const result = await request<Project>("/project", { workspaceId: workspace.id, name: projectName, model });
          setProjectName("");
          if (shareKey) {
            sessionStorage.removeItem(shareKey);
            window.history.replaceState({}, "", "/agency");
          }
          await editProject(result);
        });
      }}>
        <input className={field} aria-label="Nome do projeto" required maxLength={120} value={projectName} onChange={e => setProjectName(e.target.value)} />
        <button className={button} disabled={busy}>{shared ? "Compartilhar peça com a equipe" : "Novo projeto"}</button>
      </form>}
      {projects.isError && <p role="alert">Não foi possível carregar os projetos.</p>}
      <ul className="space-y-3">
        {projects.data?.map(project => <li key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
          <div><p className="break-words font-medium">{project.name}</p><p className="text-xs text-muted-foreground">{statusLabel[project.status]} · Revisão {project.revision}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={busy} onClick={() => void act(() => editProject(project))}>
              {canEdit && project.status === "draft" ? "Editar" : "Conferir"}
            </button>
            {canEdit && project.status === "draft" && <button className={button} disabled={busy} onClick={() => void act(() => review(project,"review"))}>Enviar para revisão</button>}
            {workspace.role !== "editor" && project.status === "review" && <>
              <button className={button} disabled={busy} onClick={() => void act(() => review(project,"approved"))}>Aprovar</button>
              <button className={button} disabled={busy} onClick={() => void act(() => review(project,"draft"))}>Solicitar ajustes</button>
            </>}
            {workspace.role === "owner" && project.status === "approved" && <button className={button} disabled={busy} onClick={() => void act(() => review(project,"draft"))}>Reabrir</button>}
          </div>
        </li>)}
      </ul>
    </section>}
    {preview && <PostDownloadDialog workspaceId={preview.workspace_id} post={normalizeCanvasModel(preview.canvas_model)} onClose={() => setPreview(undefined)} />}

  </main>;
}
