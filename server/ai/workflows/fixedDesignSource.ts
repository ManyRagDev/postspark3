import { extractedPalette } from "@shared/projectPalette";
import { applyProjectArtColors } from "./projectArtColors";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { visualIdentitySchema, type VisualIdentity } from "@shared/visualIdentity";
import { INITIAL_POST } from "../../../client/src/pages/CanvasLab/components/types";
import { arsenalBundledManifest } from "@shared/arsenalBundledManifest";
import { loadOwnedMediaReference } from "../../mediaAssets";
import type { OrchestratedGenerationInput } from "@shared/generationRequest";
import { arsenalHash } from "@shared/arsenalContent";
import { SHOWCASE_ITEMS } from "../../../client/src/pages/StudioApp/components/v2/showcaseData";
import type { CanvasPostModel } from "../../../client/src/pages/CanvasLab/components/types";
import { authorizeArsenalSaveModel } from "../../designCatalog/arsenalSave";
import { getBrandProjectById, getDb, getPostById } from "../../db";

export type PinnedDesign = {
  identity?: VisualIdentity;
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
  if (selected.kind === "identity") {
    const project = input.projectId === selected.id ? await getBrandProjectById(selected.id, owner) : undefined;
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado nesta conta." });
    const identity = visualIdentitySchema.parse(input.projectSnapshot?.version === 3 ? input.projectSnapshot.visualIdentity : project.visual_identity);
    const { revision, ...identityBody } = identity;
    if (arsenalHash(identityBody) !== revision) throw new TRPCError({ code: "BAD_REQUEST", message: "A identidade visual mudou. Reabra o projeto para criar." });
    for (const font of Object.values(identity.fonts)) {
      const asset = arsenalBundledManifest[font.assetId];
      if (!asset || asset.sourceFamily !== font.applied || !(asset.weight === font.weight || asset.weightRange && font.weight >= asset.weightRange.min && font.weight <= asset.weightRange.max))
        throw new TRPCError({ code: "BAD_REQUEST", message: "A fonte aplicada à identidade não está disponível. Salve novamente a identidade." });
    }
    if (identity.logoUrl) await loadOwnedMediaReference(identity.logoUrl, owner);
    const canvas: CanvasPostModel = {
      ...structuredClone(INITIAL_POST), id: `identity-${identity.revision}`, headline: "", subtext: "", caption: "", imagePrompt: "", badgeText: "", showBadge: false, showStep: false,
      aspectRatio: input.aspectRatio, currentSlideIndex: 0,
      slides: Array.from({ length: input.postMode === "static" ? 1 : input.slideCount ?? 5 }, (_, i) => ({ id: `identity-${i}`, step: "", headline: "", subtext: "" })),
    };
    return { sourceId: `identity:${selected.id}:${identity.revision}`, revision: arsenalHash(canvas), canvas, identity };
  }
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
    if (selected.postId !== undefined) {
      const artwork = metadata.postIds?.includes(selected.postId)
        ? await getPostById(selected.postId, owner)
        : undefined;
      if (!artwork)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A arte escolhida não está mais disponível neste projeto.",
        });
      rows = [artwork];
    } else if (metadata.postIds) {
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
    // For a kit without an explicit selection, choose its most spacious compatible piece.
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
  const identity = input.projectSnapshot?.version === 3 ? input.projectSnapshot.visualIdentity : undefined;
  const rules = extractedPalette(input.projectSnapshot);
  const ownKit = identity?.extractedFrom?.postIds.some(id => sourceId === `project:${input.projectId}:${id}`);
  if (rules && !ownKit) canvas = applyProjectArtColors(canvas, rules);
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
      (input.artworkCarousel || input.postMode === "static" ? 1 : input.slideCount)
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
