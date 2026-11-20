import { useState, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { Link } from "wouter";
import { PAID_PLAN_OFFERS, STUDIO_PLANS, type StudioPlan } from "@shared/membership";
import { IMAGE_EDITOR_TOOLS } from "@shared/imageEditor";
import type { AppRouter } from "../../../server/routers";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import CanvasLabPage from "./CanvasLab/CanvasLabPage";
import StartPieceFinalization from "./CanvasLab/components/StartPieceFinalization";
import PostDownloadDialog from "./CanvasLab/components/PostDownloadDialog";
import { INITIAL_POST, type CanvasPostModel } from "./CanvasLab/components/types";

const balances = { full: "Cota cheia", low: "Saldo baixo", empty: "Saldo zerado" } as const;
const roles = { owner: "Proprietário", editor: "Editor", reviewer: "Revisor" } as const;
const statuses = { draft: "Rascunho", review: "Em revisão", approved: "Aprovado" } as const;
type Balance = keyof typeof balances;
type Role = keyof typeof roles;
type ReviewStatus = keyof typeof statuses;

const field = "ml-1 min-h-9 rounded-lg border border-white/15 bg-[#151821] px-2 text-sm text-white";
const action = "min-h-10 rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-300";
const examplePhoto = "/showcase/backgrounds/bg-editorial.jpg";
const generatedPhoto = "/showcase/backgrounds/bg-glass.jpg";
const previewImageSparks = 25;

function planName(plan: StudioPlan) {
  return plan === "START" ? "START" : PAID_PLAN_OFFERS[plan].name;
}

function examplePost(): CanvasPostModel {
  const post = structuredClone(INITIAL_POST);
  return {
    ...post,
    id: "dev-plan-preview-post",
    aspectRatio: "4:5",
    bgImage: examplePhoto,
    slides: post.slides.slice(0, 3).map(slide => ({ ...slide, bgImage: examplePhoto })),
  };
}

function previewTransport(spendImageSparks: () => boolean): TRPCLink<AppRouter> {
  return () => ({ op }) => observable(observer => {
    function respond(data: unknown) {
      observer.next({ result: { data } });
      observer.complete();
    }

    switch (op.path) {
      case "post.generateImage":
        if (spendImageSparks()) respond({ imageUrl: generatedPhoto });
        else observer.error(new TRPCClientError("Sparks insuficientes para gerar uma imagem."));
        break;
      case "post.saveMediaAsset":
        respond({ url: (op.input as { imageData: string }).imageData });
        break;
      case "imageEditor.capabilities":
        respond({ available: true, tools: IMAGE_EDITOR_TOOLS });
        break;
      default:
        observer.error(new TRPCClientError("Este processamento não está disponível na prévia local."));
    }
  });
}

function PreviewSession({ plan, balance, role }: { plan: StudioPlan; balance: Balance; role: Role }) {
  const quota = plan === "START" ? 40 : PAID_PLAN_OFFERS[plan].sparksPerMonth;
  const [sparks, setSparks] = useState(balance === "full" ? quota : balance === "low" ? Math.floor(quota / 5) : 0);
  const remaining = useRef(sparks);
  const [post, setPost] = useState(examplePost);
  const [finalized, setFinalized] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [status, setStatus] = useState<ReviewStatus>("draft");
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() => createTRPCClient<AppRouter>({
    links: [previewTransport(() => {
      if (plan === "START" || remaining.current < previewImageSparks) return false;
      remaining.current -= previewImageSparks;
      setSparks(remaining.current);
      return true;
    })],
  }));

  const agency = plan === "AGENCY";
  const canEdit = role !== "reviewer" && status === "draft";
  const showEditor = !finalized && (!agency || (canEdit && editingRole === role));

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-[#14131a] px-3 py-1.5 text-xs text-white/65">
        <span role="status">
          {sparks.toLocaleString("pt-BR")} Sparks simulados
          {sparks === 0 ? " · Saldo zerado" : sparks <= quota / 5 ? " · Saldo baixo" : ""}
        </span>
        <span>Peça de exemplo · Alterações guardadas nesta sessão</span>
      </div>
      {showEditor && plan === "START" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <StartPieceFinalization initialPost={post} onSave={async (document, finalize) => {
            if (finalize && !window.confirm("Finalizar esta peça? Você poderá baixar novamente esta versão em HD.")) return;
            setPost(document);
            if (finalize) {
              setFinalized(true);
              setShowDownload(true);
            }
          }} />
        </div>
      ) : showEditor ? (
        <div className="min-h-0 flex-1">
          <trpc.Provider client={client} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
              <CanvasLabPage
                studioPlan={plan}
                agencyWorkspaceId={agency ? "dev-plan-preview-workspace" : undefined}
                initialPost={post}
                localPreview={{ imageEditorClient: client }}
                hasSavedPost
                onSave={async document => { setPost(document); return true; }}
                onBackToGallery={agency ? document => { setPost(document); setEditingRole(null); } : undefined}
              />
            </QueryClientProvider>
          </trpc.Provider>
        </div>
      ) : (
        <section className="mx-auto w-full max-w-2xl flex-1 overflow-auto px-4 py-8">
          <h2 className="text-xl font-semibold">{agency ? "Projetos de equipe" : "Sua peça START"}</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/15 p-4">
            <div>
              <p className="font-medium">Carrossel de exemplo</p>
              {agency && <p role="status" className="text-sm text-white/65">{statuses[status]}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={action} onClick={() => agency && canEdit ? setEditingRole(role) : setShowDownload(true)}>
                {agency ? canEdit ? "Editar" : "Conferir peça" : "Baixar em HD"}
              </button>
              {agency && canEdit && <button type="button" className={action} onClick={() => setStatus("review")}>Enviar para revisão</button>}
              {agency && role !== "editor" && status === "review" && (
                <>
                  <button type="button" className={action} onClick={() => setStatus("approved")}>Aprovar</button>
                  <button type="button" className={action} onClick={() => setStatus("draft")}>Solicitar ajustes</button>
                </>
              )}
              {agency && role === "owner" && status === "approved" && <button type="button" className={action} onClick={() => setStatus("draft")}>Reabrir</button>}
            </div>
          </div>
        </section>
      )}
      {showDownload && <PostDownloadDialog post={post} exportQuality={agency ? "4k" : "hd"} onClose={() => setShowDownload(false)} />}
    </>
  );
}

export default function DevPlanPreview() {
  const { user, isAuthenticated, loading } = useAuth();
  const profile = trpc.billing.getProfile.useQuery(undefined, {
    enabled: import.meta.env.DEV && isAuthenticated && !user?.access,
    staleTime: 15_000,
  });
  const [plan, setPlan] = useState<StudioPlan>("SOLO");
  const [balance, setBalance] = useState<Balance>("full");
  const [role, setRole] = useState<Role>("owner");
  const [reset, setReset] = useState(0);

  if (loading || (isAuthenticated && profile.isLoading)) {
    return <p role="status" className="p-6">Verificando acesso DEV…</p>;
  }
  if (!import.meta.env.DEV || !isAuthenticated || user?.access || profile.data?.plan !== "DEV") {
    return <main className="space-y-4 p-6"><p>Prévia local disponível para contas DEV.</p><Link href="/thevoid" className={action}>Voltar ao Studio</Link></main>;
  }

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-[#0e0f15] text-white">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-3 py-2">
        <h1 className="mr-auto text-sm font-semibold">Testar como…</h1>
        <Link href="/thevoid" className={action}>Voltar ao DEV</Link>
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:w-auto">
          <label htmlFor="preview-plan">Plano
            <select id="preview-plan" aria-label="Plano" className={field} value={plan} onChange={event => setPlan(event.target.value as StudioPlan)}>
              {STUDIO_PLANS.map(item => <option key={item} value={item}>{planName(item)}</option>)}
            </select>
          </label>
          <label htmlFor="preview-balance">Cenário de saldo
            <select id="preview-balance" aria-label="Cenário de saldo" className={field} value={balance} onChange={event => setBalance(event.target.value as Balance)}>
              {Object.entries(balances).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          {plan === "AGENCY" && <label htmlFor="preview-role">Papel
            <select id="preview-role" aria-label="Papel" className={field} value={role} onChange={event => setRole(event.target.value as Role)}>
              {Object.entries(roles).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>}
          <button type="button" className={action} onClick={() => setReset(value => value + 1)}>Reiniciar exemplo</button>
        </div>
      </header>
      <PreviewSession key={`${plan}:${balance}:${reset}`} plan={plan} balance={balance} role={role} />
    </main>
  );
}
