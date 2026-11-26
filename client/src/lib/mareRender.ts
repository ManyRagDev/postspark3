import { toast } from "sonner";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";

export async function renderSlideOnServer(
  post: CanvasPostModel,
  slideIndex: number,
  workspaceId?: string
): Promise<Blob> {
  const slide = post.slides[slideIndex];
  if (!slide) throw new Error("Slide indisponível para exportação.");
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      post: { ...post, currentSlideIndex: slideIndex },
      workspaceId,
    }),
  };
  const endpoint = "/api/mare/processor/render";
  const quote = await fetch(endpoint + "?quote=1", options);
  const offer = await quote.json().catch(() => null);
  if (!quote.ok || !offer)
    throw new Error(offer?.error || "Franquia de exportação indisponível.");
  let id = offer.id;
  if (!id) {
    if (!offer.remaining)
      throw new Error(
        "A franquia de exportações no servidor deste mês se esgotou."
      );
    if (
      !window.confirm(
        "Este navegador precisa do servidor para exportar o slide " +
          (slideIndex + 1) +
          ". Usar 1 das " +
          offer.remaining +
          " exportações restantes do mês? Custo de 0 Sparks."
      )
    )
      throw new Error("Exportação cancelada.");
    const response = await fetch(endpoint, options);
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.id)
      throw new Error(result?.error || "Renderização na VPS indisponível.");
    id = result.id;
  }
  const path = "/api/mare/processor/jobs/" + encodeURIComponent(id);
  let notice: string | number | undefined;
  try {
    for (let n = 0; n < 900; n++) {
      const reply = await fetch(path, { cache: "no-store" });
      if (!reply.ok)
        throw new Error("Não foi possível recuperar o trabalho de vídeo.");
      const status = await reply.json();
      if (status.status === "ready") {
        const result = await fetch(path + "/result");
        if (!result.ok) throw new Error("Arquivo de vídeo indisponível.");
        return result.blob();
      }
      if (status.status === "cancelled")
        throw new Error("Exportação cancelada.");
      if (status.status === "failed")
        throw new Error(status.error || "Falha ao renderizar o slide.");
      const message =
        status.status === "reconciling"
          ? "Conferindo a entrega"
          : status.status === "queued"
            ? "Aguardando exportação"
            : "Exportando " + Number(status.progress || 0) + "%";
      notice = toast.loading("Slide " + (slideIndex + 1) + " · " + message, {
        id: notice,
        duration: Infinity,
        action: {
          label: "Cancelar",
          onClick: () => {
            void fetch(path, { method: "DELETE" }).catch(() =>
              toast.error("Não foi possível confirmar o cancelamento.")
            );
          },
        },
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new Error(
      "O vídeo segue na fila. Repita a exportação para consultar o mesmo trabalho."
    );
  } finally {
    if (notice !== undefined) toast.dismiss(notice);
  }
}
