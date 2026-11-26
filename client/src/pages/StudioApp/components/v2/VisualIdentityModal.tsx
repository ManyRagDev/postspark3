import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { BrandProjectRecord } from "@shared/brandProjects";
import { toast } from "sonner";
import { capturedProjectPalette } from "@shared/projectIdentityExtraction";
import { ExtractProjectIdentity } from "./ExtractProjectIdentity";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function VisualIdentityModal({
  project,
  onClose,
  onSaved,
}: {
  project?: Partial<BrandProjectRecord> | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(
    project?.visualIdentity?.description ?? ""
  );
  const [logoUrl, setLogoUrl] = useState(
    project?.visualIdentity?.logoUrl ?? ""
  );
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState(
    project?.visualIdentity?.warnings ?? []
  );
  const [savedId, setSavedId] = useState(project?.id);
  const [creationId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState(false);
  const [edited, setEdited] = useState(false);
  const [identity, setIdentity] = useState(project?.visualIdentity);
  const kit = capturedProjectPalette(project?.visualPreferences);
  const save = trpc.brandProjects.saveIdentity.useMutation();
  const upload = trpc.post.saveMediaAsset.useMutation();
  const utils = trpc.useUtils();
  const busy = save.isPending || upload.isPending;
  const changed = () => {
    setEdited(true);
    setSaved(false);
    setError("");
    setWarnings([]);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result = await save.mutateAsync({
        id: savedId,
        creationId,
        name,
        description,
        logoUrl: logoUrl || undefined,
      });
      setSavedId(result.id);
      setWarnings(result.visualIdentity.warnings);
      setIdentity(result.visualIdentity);
      setEdited(false);
      setSaved(true);
      await utils.brandProjects.list.invalidate().catch(() => undefined);
      onSaved(result.id);
      toast.success("Identidade visual salva no projeto.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a identidade."
      );
    }
  };
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="z-[110] max-h-[92dvh] w-[92vw] max-w-2xl overflow-y-auto border-white/15 bg-[#181818] p-5 text-white md:p-7"
      >
        <form onSubmit={submit}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Identidade visual
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-white/60">
                Informe o que já estiver definido. O PostSpark completa o que
                faltar para criar suas artes.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-11 px-2 text-sm text-white/70"
            >
              Fechar
            </button>
          </div>
          {kit && project?.id && <div className="mt-4">
            <ExtractProjectIdentity projectId={project.id} postIds={kit.postIds} disabled={busy || edited}
              onExtracted={result => {
                setIdentity(result);
                setDescription(result.description);
                setWarnings(result.warnings);
                setSaved(true);
              }} />
          </div>}
          {identity?.rules.colors.length ? <ul aria-label="Cores da identidade visual" className="mt-3 flex flex-wrap gap-2">
            {Array.from(new Set(identity.rules.colors)).map(color => <li key={color} className="flex items-center gap-1 text-xs text-white/70">
              <span aria-hidden className="size-4 rounded border border-white/25" style={{ backgroundColor: color }} />{color}
            </li>)}
          </ul> : null}
          <label className="mt-5 block text-sm">
            Nome do projeto
            <input
              required
              maxLength={120}
              value={name}
              onChange={e => {
                setName(e.target.value);
                changed();
              }}
              disabled={busy}
              className="mt-2 block min-h-11 w-full rounded-lg border border-white/15 bg-white/5 p-3"
            />
          </label>
          <label className="mt-4 block text-sm" htmlFor="identity-description">
            Como é a identidade visual da sua marca?
          </label>
          <textarea
            id="identity-description"
            value={description}
            onChange={e => {
              setDescription(e.target.value);
              changed();
            }}
            disabled={busy}
            maxLength={24000}
            rows={7}
            placeholder="Ex.: fundo creme, texto escuro e laranja nos destaques. Títulos com Montserrat em negrito. Bastante espaço entre os elementos."
            className="mt-2 block w-full rounded-lg border border-white/15 bg-white/5 p-3 text-base md:text-sm"
          />
          <p className="mt-2 text-xs text-white/50">
            Pode informar só uma cor ou colar uma descrição completa. As
            escolhas que fizermos para cada arte não alteram sua identidade
            cadastrada.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-3 text-sm">
              {upload.isPending
                ? "Enviando logo…"
                : "Adicionar logo (opcional)"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 8 * 1024 * 1024) {
                    setError("Envie um logo de até 8 MiB.");
                    return;
                  }
                  try {
                    const data = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result));
                        reader.onerror = () =>
                          reject(new Error("Não foi possível ler o logo."));
                        reader.readAsDataURL(file);
                      }
                    );
                    const result = await upload.mutateAsync({
                      imageData: data,
                    });
                    setLogoUrl(result.url);
                    changed();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Não foi possível enviar o logo."
                    );
                  }
                }}
              />
            </label>
            {logoUrl && (
              <>
                <img
                  src={logoUrl}
                  alt="Logo da identidade"
                  className="h-12 max-w-32 object-contain"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setLogoUrl("");
                    changed();
                  }}
                  className="min-h-11 text-sm text-white/60"
                >
                  Remover logo
                </button>
              </>
            )}
          </div>
          {warnings.map(w => (
            <p key={w} role="status" className="mt-3 text-sm text-amber-200">
              {w}
            </p>
          ))}
          {error && (
            <p role="alert" className="mt-4 text-sm text-rose-300">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="mt-4 text-sm text-emerald-300">
              Identidade salva. Ela será usada nas próximas criações deste
              projeto.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-11 rounded-lg border border-white/15 px-4"
            >
              {saved ? "Concluir" : "Cancelar"}
            </button>
            <button
              type="submit"
              disabled={
                busy ||
                !name.trim() ||
                !(description.trim() || logoUrl) ||
                saved
              }
              className="min-h-11 rounded-lg bg-violet-600 px-4 font-medium disabled:opacity-40"
            >
              {busy ? "Salvando identidade…" : "Salvar identidade"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
