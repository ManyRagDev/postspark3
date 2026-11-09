import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import { arsenalHash } from "@shared/arsenalContent";
import { SHOWCASE_ITEMS } from "../../../client/src/pages/StudioApp/components/v2/showcaseData";
import type { CanvasPostModel } from "../../../client/src/pages/CanvasLab/components/types";
import { authorizeArsenalSaveModel } from "../../designCatalog/arsenalSave";
import { getBrandProjectById, getDb, getPostById } from "../../db";

export type PinnedDesign = {
  sourceId: string;
  revision: string;
  canvas: CanvasPostModel;
};
const kitMetadata = z.object({
  source: z.literal("design-extraction"),
  postIds: z.array(z.number().int().positive()).max(5).optional(),
});
const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

export function matchesHistoricalKit(
  canvas: CanvasPostModel,
  name: string,
  style: string,
  colors: string[]
) {
  return (
    canvas.id?.startsWith("extracted-") &&
    canvas.familyName === style &&
    colors.length >= 4 &&
    [
      canvas.palette.background,
      canvas.palette.surface,
      canvas.palette.text,
      canvas.palette.accent,
    ].every((color, i) => color && normalize(color) === normalize(colors[i])) &&
    canvas.slides[0]?.extraTexts?.some(
      text => text.id === "text-0" && normalize(text.text) === normalize(name)
    )
  );
}

export async function pinFixedDesign(
  input: OrchestratedGenerationInput,
  owner: string
): Promise<PinnedDesign> {
  const selected = input.fixedDesign!;
  let sourceId: string;
  let canvas: CanvasPostModel | undefined;
  if (selected.kind === "showcase") {
    const item = SHOWCASE_ITEMS.find(candidate => candidate.id === selected.id);
    if (!item)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Este exemplo não está disponível.",
      });
    canvas = (await item.loadModel()).default as CanvasPostModel;
    sourceId = `showcase:${item.id}`;
  } else {
    const project =
      input.projectId === selected.id &&
      (await getBrandProjectById(selected.id, owner));
    if (!project)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Kit de marca não encontrado neste projeto.",
      });
    const visual = project.visual_preferences;
    let metadata: z.infer<typeof kitMetadata> | undefined;
    try {
      metadata = kitMetadata.safeParse(
        JSON.parse(visual?.composition ?? "")
      ).data;
    } catch {
      /* projects created without a design extraction */
    }
    if (!metadata || !visual)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Salve uma composição editável neste kit antes de gerar.",
      });
    let rows: Array<{ id: number; canvas_model: unknown }>;
    if (metadata.postIds) {
      rows = (
        await Promise.all(metadata.postIds.map(id => getPostById(id, owner)))
      ).flatMap(row => (row ? [row] : []));
    } else {
      const historical = await getDb()
        .from("posts")
        .select("id,canvas_model")
        .eq("user_uuid", owner)
        .like("inputContent", "Template Ingerido:%")
        .order("id", { ascending: false })
        .limit(100);
      if (historical.error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível consultar as peças salvas do kit.",
        });
      rows = (historical.data ?? []).filter(
        (row: { id: number; canvas_model: any }) =>
          row.canvas_model?.palette &&
          row.canvas_model?.slides &&
          matchesHistoricalKit(
            row.canvas_model as CanvasPostModel,
            project.name,
            visual.personality[0],
            visual.colors
          )
      );
    }
    // Choose the most spacious compatible saved piece. This keeps selection inside the kit.
    const matching = rows
      .flatMap(row => {
        const model = row.canvas_model as CanvasPostModel | null;
        return model && compatible(model, input) ? [{ id: row.id, model }] : [];
      })
      .sort((a, b) => capacity(b.model) - capacity(a.model) || b.id - a.id);
    const piece = matching[0];
    canvas = piece?.model;
    sourceId = `project:${selected.id}:${piece?.id}`;
  }
  if (!canvas || !compatible(canvas, input))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "O design escolhido não está disponível nesse formato. Escolha a proporção e o número de páginas da peça salva.",
    });
  await authorizeArsenalSaveModel(canvas, owner);
  return { sourceId, revision: arsenalHash(canvas), canvas };
}

function compatible(
  canvas: CanvasPostModel,
  input: OrchestratedGenerationInput
) {
  return (
    canvas.aspectRatio === input.aspectRatio &&
    canvas.slides?.length ===
      (input.postMode === "static" ? 1 : input.slideCount)
  );
}

function capacity(model: CanvasPostModel) {
  return model.slides.reduce(
    (total, page) =>
      total +
      (page.extraTexts ?? [])
        .filter(text => text.fontSize && text.width)
        .reduce((sum, text) => sum + text.width! / text.fontSize!, 0),
    0
  );
}
