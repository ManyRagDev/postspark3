import {
  imageAspectRatios,
  type ImageAspectRatio,
  type ImagePostContext,
} from "@shared/imageGeneration";
import {
  generateImage,
  type GenerateImageOptions,
} from "../../_core/imageGeneration";
import { loadOwnedMediaReference } from "../../mediaAssets";
import { verifyArsenalAsset } from "../../designCatalog/arsenalAssets";

export interface ProposalMediaSlotGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ProposalMediaReference =
  | { dataUri: string }
  | { b64Json: string; mimeType: string }
  | { url: string; mimeType?: string };

export interface ProposalMediaRequest {
  ownerId: string;
  slot: ProposalMediaSlotGeometry;
  prompt: string;
  purpose?: string;
  postContext?: ImagePostContext;
  references?: ProposalMediaReference[];
  preservedImageUrl?: string;
  /** Stable key supplied by the proposal runtime for deduplicating a slot operation. */
  operationId: string;
  signal?: AbortSignal;
}

export interface ProposalMediaDeps {
  generateImage?: typeof generateImage;
  runIdempotent?: <T>(
    operationId: string,
    work: () => Promise<T>
  ) => Promise<T>;
  /** Resolves only an already-authorized private asset belonging to ownerId. */
  resolveOwnedReference?: (
    url: string,
    ownerId: string,
    operationId?: string,
    signal?: AbortSignal
  ) => Promise<{ dataUri: string }>;
}

const PRIVATE_MEDIA_PATH = /^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/i;
const PRIVATE_RESULT_PATH = /^\/api\/post-media\/([^/]+)\/([a-f0-9]{64})$/i;
const INLINE_IMAGE =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/\r\n]+={0,2})$/i;

function ratioValue(ratio: ImageAspectRatio): number {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}

/** Map native slot geometry to the closest ratio understood by imageGeneration. */
export function aspectRatioForProposalSlot(
  width: number,
  height: number
): ImageAspectRatio {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Geometria do slot de mídia inválida");
  }

  const targetRatio = width / height;
  return [...imageAspectRatios].sort((left, right) => {
    const leftDistance = Math.abs(Math.log(targetRatio / ratioValue(left)));
    const rightDistance = Math.abs(Math.log(targetRatio / ratioValue(right)));
    return (
      leftDistance - rightDistance ||
      imageAspectRatios.indexOf(left) - imageAspectRatios.indexOf(right)
    );
  })[0];
}

async function normalizeInlineReference(dataUri: string): Promise<string> {
  const match = INLINE_IMAGE.exec(dataUri);
  if (!match || match[2].replace(/\s/g, "").length === 0) {
    throw new Error("Referência de imagem inline inválida");
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const checked = await verifyArsenalAsset(bytes, {});
  if (checked.manifest.mimeType !== match[1].toLowerCase()) {
    throw new Error(
      "Os bytes da referência não correspondem ao formato informado"
    );
  }
  return `data:${checked.manifest.mimeType};base64,${bytes.toString("base64")}`;
}

/** Unpaid preflight shared by admission and the image operation. Never fetches external URLs. */
export async function resolveProposalMediaReferences(
  references: ProposalMediaReference[] | undefined,
  ownerId: string,
  operationId: string | undefined,
  deps: ProposalMediaDeps,
  signal?: AbortSignal
): Promise<NonNullable<GenerateImageOptions["originalImages"]>> {
  signal?.throwIfAborted();
  if (!references?.length) return [];

  const resolved = await Promise.all(
    references.map(async reference => {
      signal?.throwIfAborted();
      if ("dataUri" in reference) {
        return { url: await normalizeInlineReference(reference.dataUri) };
      }
      if ("b64Json" in reference) {
        if (!/^image\/(?:png|jpeg|webp)$/i.test(reference.mimeType)) {
          throw new Error("Formato de referência de imagem não suportado");
        }
        return {
          b64Json: (
            await normalizeInlineReference(
              `data:${reference.mimeType};base64,${reference.b64Json}`
            )
          ).replace(/^data:image\/(?:png|jpeg|webp);base64,/, ""),
          mimeType: reference.mimeType.toLowerCase(),
        };
      }

      const privatePath = PRIVATE_MEDIA_PATH.exec(reference.url);
      if (!privatePath || privatePath[1] !== ownerId) {
        throw new Error(
          "Referência externa ou pertencente a outro proprietário não autorizada"
        );
      }
      const resolver =
        deps.resolveOwnedReference ??
        ((url: string, actor: string, _operation?:string, stop?:AbortSignal) => loadOwnedMediaReference(url, actor, stop));
      const authorized = await resolver(reference.url, ownerId, operationId, signal);
      signal?.throwIfAborted();
      return { url: await normalizeInlineReference(authorized.dataUri) };
    })
  );

  return resolved;
}

/** Generate required media using the slot's actual proportions and persist it privately. */
export async function generateProposalMediaForSlot(
  request: ProposalMediaRequest,
  deps: ProposalMediaDeps = {}
): Promise<{ url: string }> {
  if (!request.ownerId)
    throw new Error("Proprietário é obrigatório para mídia V5");
  if (!request.operationId)
    throw new Error("Chave idempotente é obrigatória para mídia V5");
  if (!deps.runIdempotent)
    throw new Error("Runner idempotente obrigatório para mídia V5");
  if (
    !request.slot.id ||
    !Number.isFinite(request.slot.x) ||
    !Number.isFinite(request.slot.y)
  ) {
    throw new Error("Slot de mídia inválido");
  }
  if (request.preservedImageUrl) {
    const path=PRIVATE_MEDIA_PATH.exec(request.preservedImageUrl);
    if(path?.[1]!==request.ownerId)throw new Error("A foto preservada não pertence ao proprietário");
    request.signal?.throwIfAborted();
    if(deps.resolveOwnedReference)await deps.resolveOwnedReference(request.preservedImageUrl,request.ownerId,request.operationId,request.signal);
    else await loadOwnedMediaReference(request.preservedImageUrl,request.ownerId,request.signal);
    request.signal?.throwIfAborted();
    return {url:request.preservedImageUrl};
  }
  if (!request.prompt.trim()) throw new Error("Prompt de mídia obrigatório");

  const originalImages = await resolveProposalMediaReferences(
    request.references,
    request.ownerId,
    request.operationId,
    deps,
    request.signal
  );
  const generate = () => {
    request.signal?.throwIfAborted();
    return (deps.generateImage ?? generateImage)({
      prompt: request.prompt,
      ownerId: request.ownerId,
      aspectRatio: aspectRatioForProposalSlot(
        request.slot.width,
        request.slot.height
      ),
      purpose: request.purpose,
      postContext: request.postContext,
      originalImages,
      routePolicy: "strict",
      signal: request.signal,
    });
  };
  const generated = await deps.runIdempotent!(request.operationId, generate);

  const savedPath = generated.url && PRIVATE_RESULT_PATH.exec(generated.url);
  if (!savedPath || savedPath[1] !== request.ownerId) {
    throw new Error(
      "A mídia gerada não foi persistida no storage privado do proprietário"
    );
  }
  return { url: generated.url! };
}

/** Freeze explicit preservation of one owned content image. Other source
 * photographs remain context for interpretation or a requested new image. */
export function requestedPreservedPhoto(input: Pick<import('@shared/generationRequest').OrchestratedGenerationInput,'ownerId'|'content'|'inputType'|'imageUrl'|'sources'>, brief = input.content): string | undefined {
  const text=brief.normalize('NFC').toLocaleLowerCase('pt-BR');
  const target='(?:foto(?:grafia)?|imagem)\\s+(?:enviada|fornecida|anexada|original)';
  const use='(?:us[ea]|usando|utiliz[ea]|utilizando|preserv[ea]|preservando|mantenha|inclua|reaproveite)';
  const command=new RegExp(`\\b${use}\\b[^.!?;\\n]{0,48}\\b${target}\\b`,'i');
  const negative=new RegExp(`\\b(?:não|nunca)\\s+${use}\\b[^.!?;\\n]{0,48}\\b${target}\\b`,'i');
  if(!command.test(text)||negative.test(text))return;
  const values=Array.from(new Set([
    ...(input.sources??[]).filter(s=>s.kind==='image'&&s.purpose==='content').map(s=>s.value),
    ...(input.inputType==='image'&&input.imageUrl?[input.imageUrl]:[]),
  ]));
  if(values.length!==1)return;
  const match=PRIVATE_MEDIA_PATH.exec(values[0]);
  return match?.[1]===input.ownerId?values[0]:undefined;
}
