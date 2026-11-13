import { useId, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowRight, ChevronDown, Expand, Loader2, Minimize, Sparkles, Trash2 } from "lucide-react";
import SparkLogo from "@/components/SparkLogo";
import { GENERATION_MODEL_LABELS, type GenerationModel } from "@shared/generationModel";
import type { CreationInputOptions } from "./StudioCreateViewV2B";
import "./studioMobileCreation.css";

export const MOBILE_PROMPT_COMPACT_HEIGHT = 72;

interface StudioMobileCreationFormProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  expanded: boolean;
  canExpand: boolean;
  onExpandedChange: (value: boolean) => void;
  onFocusChange: (value: boolean) => void;
  onPromptKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  canSubmit: boolean;
  isUrl: boolean;
  urlAsContent: boolean;
  onUrlAsContentChange: (value: boolean) => void;
  scriptSlideCount: number | null;
  preserveScript: boolean;
  onScriptModeChange: (mode: "preserve" | "rewrite") => void;
  options: CreationInputOptions;
  onOptionsChange: (value: CreationInputOptions) => void;
  postMode: "static" | "carousel";
  onPostModeChange: (value: "static" | "carousel") => void;
  aspectRatio?: "1:1" | "4:5" | "9:16";
  onAspectRatioChange?: (value: "1:1" | "4:5" | "9:16") => void;
  projectControl: ReactNode;
  projectStyleControl?: ReactNode;
  hasSavedDraft: boolean;
  onDiscardDraft?: () => void;
  onSubmit: () => void;
  onOpenShowcase: () => void;
}

/** Mobile presentation only; the parent remains the owner of the briefing and submission. */
export default function StudioMobileCreationForm(props: StudioMobileCreationFormProps) {
  const id = useId();
  const captureBrand = props.isUrl && !props.urlAsContent;
  return (
    <main className="studio-mobile-create" aria-label="Criação de posts">
      <section className="mobile-creation-brand" aria-label="PostSpark">
        <div className="mobile-creation-wordmark"><SparkLogo size={32} /><span>Post<span className="mobile-brand-orange">Spark</span></span></div>
        <h1>O que vamos <em>dirigir</em> hoje?</h1>
      </section>

      <section className={`mobile-creation-prompt${props.expanded ? " is-expanded" : ""}`} aria-label="Ideia do post">
        <div className="mobile-prompt-heading">
          <div>
            <label htmlFor={`${id}-idea`}>Sua ideia ou roteiro</label>
            {props.hasSavedDraft && <span className="mobile-draft-status">Rascunho salvo neste navegador</span>}
          </div>
          <button type="button" className="mobile-expand" disabled={!props.canExpand && !props.expanded} aria-expanded={props.expanded} aria-controls={`${id}-idea`} onClick={() => props.onExpandedChange(!props.expanded)}>
            {props.expanded ? "Recolher texto" : "Expandir texto"}
            {props.expanded ? <Minimize size={14} aria-hidden="true" /> : <Expand size={14} aria-hidden="true" />}
          </button>
        </div>
        <textarea
          id={`${id}-idea`} ref={props.textareaRef} value={props.prompt} rows={3}
          onChange={event => props.onPromptChange(event.target.value)}
          onFocus={() => props.onFocusChange(true)} onBlur={() => props.onFocusChange(false)}
          onKeyDown={props.onPromptKeyDown} disabled={props.isLoading}
          aria-label="Tema ou ideia do post" placeholder="Conte a ideia…"
          className="studio-mobile-prompt"
        />
        <div className="mobile-prompt-actions">
          {props.scriptSlideCount ? (
            <label className="mobile-script-mode">
              <span>Roteiro de {props.scriptSlideCount} slides detectado</span>
              <select aria-label="Tratamento do roteiro" value={props.preserveScript ? "preserve" : "rewrite"} disabled={props.isLoading} onChange={event => props.onScriptModeChange(event.target.value as "preserve" | "rewrite")}>
                <option value="preserve">Preservar texto</option><option value="rewrite">Reescrever com IA</option>
              </select>
            </label>
          ) : props.isUrl ? (
            <label className="mobile-url-content"><input type="checkbox" checked={props.urlAsContent} disabled={props.isLoading} onChange={event => props.onUrlAsContentChange(event.target.checked)} /><span>Usar página como conteúdo</span></label>
          ) : <span className="mobile-source-label">Uma ideia, muitas possibilidades</span>}
          <button type="button" className="mobile-generate" onClick={props.onSubmit} disabled={!props.canSubmit} aria-label={captureBrand ? "Capturar marca gratuitamente" : "Gerar posts"} title={captureBrand ? "Capturar marca gratuitamente" : "Gerar posts"}>
            {props.isLoading ? <Loader2 size={21} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={21} aria-hidden="true" />}
          </button>
        </div>
        {props.isLoading && <span role="status" className="mobile-generation-status">Preparando…</span>}
      </section>

      <section className="mobile-creation-options" aria-label="Opções de criação">
        <div className={props.aspectRatio && props.onAspectRatioChange ? "mobile-options-pair" : "mobile-option-single"}>
          <label>Plataforma<select aria-label="Plataforma" value={props.options.platform} disabled={props.isLoading} onChange={event => props.onOptionsChange({ ...props.options, platform: event.target.value as CreationInputOptions["platform"] })}>
            <option value="instagram">Instagram</option><option value="twitter">Twitter / X</option><option value="linkedin">LinkedIn</option><option value="facebook">Facebook</option>
          </select></label>
          {props.aspectRatio && props.onAspectRatioChange && <label>Proporção<select aria-label="Formato das propostas" value={props.aspectRatio} disabled={props.isLoading} onChange={event => props.onAspectRatioChange?.(event.target.value as "1:1" | "4:5" | "9:16")}>
            <option value="4:5">Retrato 4:5</option><option value="1:1">Quadrado 1:1</option><option value="9:16">Vertical 9:16</option>
          </select></label>}
        </div>
        <div className="mobile-post-modes" role="group" aria-label="Tipo de post">
          <button type="button" aria-pressed={props.postMode === "static"} disabled={props.isLoading} onClick={() => props.onPostModeChange("static")}>Post único</button>
          <button type="button" aria-pressed={props.postMode === "carousel"} disabled={props.isLoading} onClick={() => props.onPostModeChange("carousel")}>Carrossel</button>
        </div>
        <div className="mobile-project-row"><span>Projeto</span>{props.projectControl}</div>
        <details className="mobile-more-options">
          <summary>Mais ajustes<ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="mobile-more-content">
            <label>Modelo<select aria-label="Modelo de geração" value={props.options.generationModel ?? "auto"} disabled={props.isLoading} onChange={event => props.onOptionsChange({ ...props.options, generationModel: event.target.value as GenerationModel })}>
              {Object.entries(GENERATION_MODEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              <option value="gpt" hidden>GPT (Descontinuado)</option>
            </select></label>
            <button type="button" className="mobile-image-toggle" role="switch" aria-label="Gerar imagens com IA" aria-checked={Boolean(props.options.allowAiImages)} disabled={props.isLoading} onClick={() => props.onOptionsChange({ ...props.options, allowAiImages: !props.options.allowAiImages })}>
              <Sparkles size={16} aria-hidden="true" /><span>Gerar imagens com IA</span><span className="mobile-toggle-state">{props.options.allowAiImages ? "Ativado" : "Desativado"}</span>
            </button>
            {props.projectStyleControl}
            {props.hasSavedDraft && props.onDiscardDraft && <button type="button" className="mobile-discard-draft" aria-label="Apagar rascunho salvo e limpar o prompt" disabled={props.isLoading} onClick={props.onDiscardDraft}><Trash2 size={15} aria-hidden="true" />Apagar rascunho</button>}
          </div>
        </details>
      </section>
      <button type="button" className="mobile-showcase" onClick={props.onOpenShowcase}><Sparkles size={15} aria-hidden="true" />O que dá pra fazer com o PostSpark?</button>
    </main>
  );
}
