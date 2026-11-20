import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function VisualBriefControl({
  value,
  onChange,
  disabled,
  tone,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  tone: "text" | "script" | "url";
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const fieldId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (next) setDraft(value);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-creation-outline
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-white/65 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:opacity-45 md:min-h-9"
        >
          <SlidersHorizontal
            size={14}
            aria-hidden="true"
            className="shrink-0"
          />
          <span>
            Orientações para esta arte{value.trim() ? " · Editar" : ""}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        data-creation-tone={tone}
        data-creation-outline
        className="studio-creation-dialog max-h-[90dvh] overflow-y-auto rounded-2xl border-white/15 bg-[#181818] text-white"
      >
        <DialogTitle className="pr-6 text-xl leading-snug">
          Orientações para esta arte
        </DialogTitle>
        <DialogDescription className="text-white/60">
          Opcional. Conte como você imagina o visual desta criação.
        </DialogDescription>
        <div>
          <label htmlFor={fieldId} className="mb-2 block text-xs text-white/60">
            Suas orientações
          </label>
          <textarea
            id={fieldId}
            rows={5}
            maxLength={4000}
            value={draft}
            disabled={disabled}
            data-creation-outline
            onChange={event => setDraft(event.target.value)}
            placeholder="Ex.: mais respiro, títulos em destaque, sem fotografias…"
            className="block w-full resize-y rounded-xl border border-white/15 bg-white/5 p-3 text-base text-white placeholder:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm text-white/60 hover:text-white"
            >
              Cancelar
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={disabled}
            data-creation-highlight="true"
            onClick={() => {
              onChange(draft);
              setOpen(false);
            }}
            className="min-h-11 rounded-lg border border-violet-300/25 bg-violet-300/10 px-4 text-sm text-violet-200 hover:bg-violet-300/20 disabled:opacity-45"
          >
            Aplicar orientações
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
