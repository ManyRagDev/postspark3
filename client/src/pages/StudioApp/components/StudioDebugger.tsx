import { useEffect, useMemo, useState } from "react";
import { Bug, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";
import {
  describeDebugScene,
  type StudioDebugStep,
} from "@shared/studioDebugger";
import type { buildStudioDebugger } from "../../../../../server/studioDebugger";
import DesignFrequency from "./DesignFrequency";
import "./studioDebugger.css";

type Report = ReturnType<typeof buildStudioDebugger>;
type LocalStep = StudioDebugStep & { requestId: string; owner: string };
const tabs = ["Passos", "Seleção", "Montagem"] as const;
const statuses: Record<string, string> = {
  started: "Iniciado",
  queued: "Na fila",
  running: "Em andamento",
  completed: "Concluído",
  partial: "Entrega parcial",
  failed: "Falhou",
  cancelled: "Cancelado",
  uncertain: "Resultado incerto",
  awaiting_reconciliation: "Aguardando conferência",
  selected: "Escolhido",
  ready: "Pronta",
  planned: "Planejada",
  rejected: "Rejeitado",
  fallback: "Alternativa utilizada",
  not_reached: "Avaliação não alcançada",
  cached_technical_rejection: "Rejeição técnica já registrada",
  required_photo_unavailable: "Foto obrigatória indisponível",
  photo_forbidden: "A proposta exige uma variante sem foto",
  content_or_layout_incompatible: "Conteúdo ou layout incompatível",
  required_photo_count_unmet: "Quantidade de fotos insuficiente",
  viable_member_not_representative: "Outra variante representou a família",
  viable_family_not_selected: "Família viável fora da escolha",
  family_already_selected: "Família já escolhida",
  outside_suitability_gap: "Fora da faixa de adequação",
  lower_rank: "Outra opção teve classificação superior",
  lower_rank_after_media_coverage:
    "Classificação inferior após avaliar as imagens",
  selected_on_recovery: "Escolhido na recuperação",
  selected_then_replanned: "Substituído",
  not_selected: "Fora da escolha final",
  not_shortlisted: "Fora da pré-seleção",
  coverage_invalid: "Cobertura incompleta",
};
const phaseNames: Record<string, string> = {
  "prepare:context": "Leitura do contexto",
  "prepare:catalog": "Inventário do catálogo",
  "prepare:recent_selections": "Histórico de escolhas",
  "prepare:intent": "Interpretação do briefing",
  "prepare:selection_input": "Preparação dos candidatos",
  "prepare:selection": "Escolha das propostas",
  selection_slot_observed: "Comparação dos candidatos da proposta",
  family_retrieval: "Busca de famílias",
  review_verdict_observed: "Parecer da revisão",
  scene_inspection: "Conferência de encaixe por slide",
  recovery_candidate_observed: "Avaliação de alternativa",
  copy_started: "Início da redação",
  copy_completed: "Texto recebido",
  copy_validated: "Texto validado",
  feasibility_checked: "Viabilidade conferida",
  preflight_passed: "Encaixe aprovado",
  preflight_rejected: "Encaixe reprovado",
  technical_check_started: "Conferência técnica",
  review_check_started: "Início da revisão",
  review_check_completed: "Revisão encerrada",
  bundle_validated: "Proposta validada para entrega",
  generation_metrics: "Resumo da execução",
};
const phaseName = (s: string) => phaseNames[s] ?? s;
const label = (s: string) => statuses[s] ?? s;
function readSetting(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function saveSetting(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* Session storage is optional. */
  }
}
function Data({ value }: { value: unknown }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
function Evidence({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>{title}</summary>
      {open && <Data value={data} />}
    </details>
  );
}

function Timeline({
  steps,
  calls,
}: {
  steps: StudioDebugStep[];
  calls: Report["calls"];
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const index =
    cursor === null
      ? steps.length - 1
      : Math.max(
          0,
          steps.findIndex(s => s.id === cursor)
        );
  const current = steps[index];
  return (
    <>
      {current ? (
        <>
          <div className="sd-controls">
            <button
              aria-label="Passo anterior"
              disabled={index <= 0}
              onClick={() => setCursor(steps[index - 1].id)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Passo {index + 1} de {steps.length}
            </span>
            <button
              aria-label="Próximo passo"
              disabled={index >= steps.length - 1}
              onClick={() => setCursor(steps[index + 1].id)}
            >
              <ChevronRight size={16} />
            </button>
            <button
              aria-pressed={cursor === null}
              onClick={() => setCursor(cursor === null ? current.id : null)}
            >
              {cursor === null ? "Fixar passo" : "Seguir últimos passos"}
            </button>
          </div>
          <label>
            Ir para o passo
            <select
              value={current.id}
              onChange={e => setCursor(e.target.value)}
            >
              {steps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {phaseName(s.title)} · {label(s.status)}
                </option>
              ))}
            </select>
          </label>
          <article>
            <small>
              {current.origin} ·{" "}
              {current.at
                ? new Date(current.at).toLocaleTimeString("pt-BR")
                : "Horário indisponível"}
            </small>
            <h3>{phaseName(current.title)}</h3>
            <strong>{label(current.status)}</strong>
            <Data value={current.detail} />
          </article>
        </>
      ) : (
        <p>Aguardando o primeiro registro.</p>
      )}
      {calls.length > 0 && (
        <Evidence
          title={`Chamadas de IA registradas (${calls.length})`}
          data={calls}
        />
      )}
    </>
  );
}

function SlotDecision({
  observation,
}: {
  observation: Report["slots"][number];
}) {
  const [open, setOpen] = useState(false);
  const candidates = (observation.candidates ??
    []) as import("@shared/generationDecisionTrace").CandidateDecisionObservation[];
  const chosen = candidates.find(
    c => c.candidateId === observation.chosenCandidateId
  );
  return (
    <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>
        Proposta {Number(observation.slot) + 1} ·{" "}
        {chosen?.family ??
          observation.chosenCandidateId ??
          "sem escolha registrada"}
      </summary>
      {open && (
        <>
          <p>
            Política {observation.policy} · {candidates.length} candidatos
            registrados
          </p>
          {candidates.map(c => (
            <Evidence
              key={c.candidateId}
              title={`${c.rank != null ? c.rank + "º · " : ""}${c.family} · ${label(c.reason)}`}
              data={c}
            />
          ))}
        </>
      )}
    </details>
  );
}

function Selection({ report }: { report: Report }) {
  const [search, setSearch] = useState("");
  const candidates = report.candidates.filter(c =>
    [c.id, c.family, c.sourceId].some(s =>
      String(s ?? "")
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
  );
  return (
    <>
      {report.fixedDesign ? (
        <p>Design definido na entrada do pedido · {report.fixedDesign}</p>
      ) : (
        <p>
          {report.candidates.length} ofertas com registro ·{" "}
          {report.coverage.electionVerified
            ? "Eleição verificada"
            : "Evidência de eleição incompleta"}
        </p>
      )}
      {report.slots.map((s, i) => (
        <SlotDecision
          key={s.operationKey + ":" + s.slot + ":" + i}
          observation={s}
        />
      ))}
      {report.plans.length > 0 && (
        <Evidence
          title="Plano por proposta e distribuição do conteúdo entre slides"
          data={report.plans}
        />
      )}
      <label>
        Buscar candidato por família ou ID
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </label>
      {candidates.map(c => (
        <Evidence
          key={c.id}
          title={`${c.family} · ${label(c.outcome)}${typeof c.score === "number" ? ` · nota ${c.score}/4` : ""}`}
          data={c}
        />
      ))}
      {search && !candidates.length && (
        <p>Nenhum candidato corresponde à busca.</p>
      )}
      {report.catalog.length > 0 && (
        <Evidence
          title={`Catálogo examinado e exclusões (${report.catalog.length})`}
          data={report.catalog}
        />
      )}
      {report.families.length > 0 && (
        <Evidence
          title="Recuperação e avaliação das famílias"
          data={report.families}
        />
      )}
      {report.assessments.length > 0 && (
        <Evidence
          title="Notas, confiança e justificativas da IA"
          data={report.assessments}
        />
      )}
      {report.recoveries.length > 0 && (
        <Evidence
          title="Substituições e tentativas de recuperação"
          data={report.recoveries}
        />
      )}
      <Evidence
        title="Critérios e cobertura desta execução"
        data={{
          criteria: report.criteria,
          coverage: report.coverage,
          issues: report.issues,
        }}
      />
    </>
  );
}

function Assembly({
  report,
  posts,
}: {
  report: Report;
  posts: CanvasPostModel[];
}) {
  return (
    <>
      {report.plannedSlides.map(p => (
        <article key={p.slot}>
          <small>Entrega do servidor · {label(p.status)}</small>
          <h3>
            Proposta {p.slot + 1}
            {p.name ? ` · ${p.name}` : ""}
          </h3>
          {p.reason && <p>{p.reason}</p>}
          {p.slides.map((s, i) => (
            <Evidence
              key={s.id}
              title={`Slide ${i + 1} · ${s.role ?? "papel sem registro"}`}
              data={s}
            />
          ))}
          <Evidence
            title="Revisões e resultado da entrega"
            data={report.deliveries.find(d => d.slot === p.slot)}
          />
        </article>
      ))}
      {posts.length === 0 && (
        <p>
          A montagem no navegador aparece quando o Studio recebe a peça nesta
          sessão.
        </p>
      )}
      {posts.map(post => (
        <article key={post.id}>
          <small>Documento no CanvasLab</small>
          <h3>{post.familyName}</h3>
          {post.slides.map((slide, i) => (
            <Slide key={slide.id} slide={slide} index={i} />
          ))}
          <Evidence
            title="Relatório de compilação"
            data={
              post.componentCompilationReports ??
              post.arsenalCompilation ??
              post.catalogCompilation ??
              "Sem relatório para esta peça"
            }
          />
        </article>
      ))}
    </>
  );
}
function Slide({
  slide,
  index,
}: {
  slide: CanvasPostModel["slides"][number];
  index: number;
}) {
  const c = slide.composition;
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>
        Slide {index + 1} · {slide.headline || slide.assemblyRole || slide.id}
      </summary>
      {open && (
        <Data
          value={
            c
              ? describeDebugScene(c)
              : {
                  headline: slide.headline,
                  subtext: slide.subtext,
                  elementOrder: slide.elementOrder,
                  headlinePos: slide.headlinePos,
                  subtextPos: slide.subtextPos,
                  extraTexts: slide.extraTexts?.map(t => t.text),
                  shapes: slide.extraShapes?.map(s => s.id),
                  images: slide.extraImages?.map(i => i.id),
                }
          }
        />
      )}
    </details>
  );
}

function Run({
  requestId,
  restoredRequestId,
  owner,
  posts,
  steps,
}: {
  restoredRequestId?: string;
  requestId: string;
  owner: string;
  posts: CanvasPostModel[];
  steps: LocalStep[];
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Passos");
  const query = trpc.generation.debugger.useQuery(
    { requestId, ownerId: owner },
    {
      retry: false,
      gcTime: 0,
      refetchOnWindowFocus: false,
      refetchInterval: q => {
        const report = q.state.data;
        if (!report || q.state.error) return false;
        if (report.status === "queued" || report.status === "running")
          return 5000;
        if (report.status === "awaiting_reconciliation") return 15000;
        // The worker commits a delivery before flushing its closing trace.
        return !report.hasFinalMetrics &&
          report.updatedAt &&
          Date.now() - Date.parse(report.updatedAt) < 30000
          ? 5000
          : false;
      },
    }
  );
  const report = query.data;
  const timeline = useMemo(
    () =>
      [
        ...(report?.timeline ?? []),
        ...steps.filter(s => s.requestId === requestId && s.owner === owner),
      ].sort(
        (a, b) => (Date.parse(a.at ?? "") || 0) - (Date.parse(b.at ?? "") || 0)
      ),
    [report, steps, requestId, owner]
  );
  return (
    <>
      <small>Pedido {requestId}</small>
      <div className="sd-controls">
        <strong>{report ? label(report.status) : "Consultando pedido"}</strong>
        <button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Consultando…" : "Atualizar"}
        </button>
      </div>
      {query.error && (
        <p role="alert">
          Não foi possível consultar este pedido. {query.error.message}
        </p>
      )}
      {report && (
        <>
          <nav aria-label="Seções do debugger">
            {tabs.map(t => (
              <button
                key={t}
                aria-pressed={t === tab}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {tab === "Passos" && (
            <Timeline steps={timeline} calls={report.calls} />
          )}
          {tab === "Seleção" && <Selection report={report} />}
          {tab === "Montagem" && (
            <Assembly
              report={report}
              posts={posts.filter(
                p =>
                  (p.provenance?.journey?.requestId ??
                    p.completeDesign?.runId ??
                    restoredRequestId) === requestId
              )}
            />
          )}
        </>
      )}
    </>
  );
}

export default function StudioDebugger({
  requestId,
  restoredRequestId,
  owner,
  posts,
  steps,
}: {
  restoredRequestId?: string;
  requestId: string | null;
  owner: string;
  posts: CanvasPostModel[];
  steps: LocalStep[];
}) {
  const prefix = "postspark.debugger.v1." + owner;
  const [open, setOpen] = useState(() => readSetting(prefix + ".open") === "1");
  const [lastId, setLastId] = useState(() => readSetting(prefix + ".request"));
  useEffect(() => {
    if (requestId) {
      setLastId(requestId);
      saveSetting(prefix + ".request", requestId);
    }
  }, [requestId, prefix]);
  const [frequency, setFrequency] = useState(false);
  const id = requestId ?? lastId;
  const toggle = () => {
    saveSetting(prefix + ".open", open ? "0" : "1");
    setOpen(!open);
  };
  return (
    <aside className="studio-debugger" aria-label="Debugger de geração">
      <button
        className="sd-launch"
        aria-expanded={open}
        aria-controls="studio-debug-panel"
        onClick={toggle}
      >
        <Bug size={16} /> Debugger {open && <Minus size={16} />}
      </button>
      {open && (
        <section id="studio-debug-panel">
          <header>
            <h2>Debugger de geração</h2>
          </header>
          <nav aria-label="Visão do debugger">
            <button aria-pressed={!frequency} onClick={() => setFrequency(false)}>Pedido</button>
            <button aria-pressed={frequency} onClick={() => setFrequency(true)}>Frequência dos designs</button>
          </nav>
          {!frequency && !requestId && id && <small>Último pedido desta aba</small>}
          {frequency ? <DesignFrequency /> : id ? (
            <Run
              key={id}
              requestId={id}
              restoredRequestId={restoredRequestId}
              owner={owner}
              posts={posts}
              steps={steps}
            />
          ) : (
            <p>Inicie uma geração. Os passos deste pedido aparecerão aqui.</p>
          )}
        </section>
      )}
    </aside>
  );
}
