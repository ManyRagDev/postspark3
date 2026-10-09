import {
  RECREATION_RENDERER_VERSION,
  recreationRecipeSchema,
  type RecreationRecipe,
} from "@shared/designRecreation";
import {
  catalogBlueprintSchema,
  type CatalogBlueprint,
} from "@shared/designCatalog";
import { layoutRichText } from "@/pages/CanvasLab/lib/richTextLayout";
import {
  ensureReferenceFontsLoaded,
  referenceFontFamily,
} from "@/pages/CanvasLab/lib/referenceFonts";
import { captureReferenceFonts } from "../Admin/referenceFontAssets";

export async function prepareReference(file: File): Promise<{
  dataUrl: string;
  originalHash: string;
  width: number;
  height: number;
}> {
  if (
    !/^image\/(png|jpeg|webp)$/.test(file.type) ||
    file.size > 12 * 1024 * 1024
  ) {
    throw new Error("Use PNG, JPEG ou WebP de até 12 MB.");
  }
  const originalHash = await digest(new Uint8Array(await file.arrayBuffer()));
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width < 64 ||
      bitmap.height < 64 ||
      bitmap.width * bitmap.height > 32_000_000
    )
      throw new Error("Imagem muito pequena ou acima de 32 megapixels.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível neste navegador.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.95),
      originalHash,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** Ajusta a fonte uma única vez e salva o resultado; reabrir nunca recompila a receita. */
export function fitRecipeText(recipe: RecreationRecipe): RecreationRecipe {
  if (recipe.matrix)
    throw new Error(
      "Use os campos vinculados da matriz para preservar suas regras de encaixe."
    );
  const next = structuredClone(recipe);
  next.notes = next.notes.filter(note => !note.startsWith("[Encaixe]"));
  for (const layer of next.scene.layers) {
    if (layer.kind !== "text" || !layer.text) continue;
    if (
      !next.scene.fonts.some(
        font =>
          font.family === layer.fontFamily &&
          font.weight === layer.fontWeight &&
          font.dataUrl
      )
    ) {
      next.notes.push(
        `[Encaixe] ${layer.id}: aguardando a fonte incorporada; tamanho preservado.`
      );
      continue;
    }
    const initial = layer.fontSize;
    const fill =
      next.adaptation?.layerStyles.find(style => style.layerId === layer.id)
        ?.fit === "fill";
    let fits = false;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const layout = layoutRichText({
        text: layer.text,
        width: layer.width,
        fontSize: layer.fontSize,
        fontFamily: referenceFontFamily(
          next.scene,
          layer.fontFamily,
          layer.fontWeight
        ),
        fontStyle: String(layer.fontWeight),
        fill: layer.fill,
        align: layer.align,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        wrap: false,
      });
      const width = Math.max(1, ...layout.lines.map(line => line.width));
      const available = Math.min(
        layer.width / width,
        layer.height / Math.max(1, layout.height)
      );
      if (attempt === 0 && fill && available > 1.02) {
        layer.fontSize = Math.min(
          2000,
          initial * Math.min(1.3, available * 0.99)
        );
        continue;
      }
      const ratio = Math.min(1, available);
      if (ratio >= 0.999) {
        fits = true;
        break;
      }
      if (attempt === 6) break;
      layer.fontSize = Math.max(
        1,
        Math.floor(layer.fontSize * ratio * 0.995 * 100) / 100
      );
    }
    if (Math.abs(layer.fontSize - initial) > 0.1) {
      next.notes.push(
        `[Encaixe] ${layer.id}: fonte de ${initial.toFixed(1)} para ${layer.fontSize.toFixed(1)} px, preservando as linhas.`
      );
    }
    if (fill && layer.fontSize < initial * 0.8)
      next.notes.push(
        `[Encaixe] ${layer.id}: redução superior a 20%. Experimente uma fonte mais estreita ou um texto menor para manter o destaque.`
      );
    if (!fits)
      next.notes.push(
        `[Encaixe] ${layer.id}: o texto ainda excede a caixa proposta; revise a adaptação.`
      );
  }
  next.notes = next.notes.slice(-200);
  return recreationRecipeSchema.parse(next);
}

export async function finalizeRecipe(
  recipe: RecreationRecipe
): Promise<RecreationRecipe> {
  const requested = new Set(
    recipe.scene.layers
      .filter(layer => layer.fontFamily)
      .map(layer => `${layer.fontFamily}:${layer.fontWeight}`)
  );
  if (requested.size > 16)
    throw new Error("Use no máximo 16 combinações de fonte e peso.");
  const captured = await captureReferenceFonts(recipe.scene, 3);
  const next = {
    ...recipe,
    scene: captured.scene,
    notes: recipe.notes.filter(note => !note.startsWith("[Fontes]")),
  };
  const loaded = await Promise.allSettled(
    next.scene.fonts.map(font =>
      ensureReferenceFontsLoaded({ ...next.scene, fonts: [font] })
    )
  );
  loaded.forEach((result, index) => {
    if (result.status !== "rejected") return;
    const font = next.scene.fonts[index];
    captured.failures.push(
      `${font.family} ${font.weight}: arquivo não carregou; tente preparar as fontes novamente.`
    );
    next.scene.fonts[index] = { ...font, dataUrl: null, sha256: null };
  });
  next.notes.push(...captured.failures.map(message => `[Fontes] ${message}`));
  return fitRecipeText(next);
}

export type TextAdaptation = Record<
  string,
  { text: string; family: string; weight: number }
>;

/** Cria uma receita derivada explícita; a receita de origem e seu arquivo ficam intactos. */
export function createTextAdaptation(
  recipe: RecreationRecipe,
  edits: TextAdaptation
): RecreationRecipe {
  if (recipe.matrix)
    throw new Error(
      "Use Experimentar conteúdo da matriz para criar esta adaptação."
    );
  const next = structuredClone(recipe);
  next.id = crypto.randomUUID();
  next.createdAt = new Date().toISOString();
  next.version = 2;
  next.title = `${recipe.title.replace(/ · adaptação$/, "")} · adaptação`.slice(
    0,
    120
  );
  next.scene.rendererVersion = RECREATION_RENDERER_VERSION;
  next.adaptation = {
    parentRecipeId: recipe.id,
    layerStyles: next.scene.layers.map(
      layer =>
        next.adaptation?.layerStyles.find(
          style => style.layerId === layer.id
        ) ?? {
          layerId: layer.id,
          cornerRadiusPx: 0,
          fit:
            /título|titulo|headline/i.test(layer.role) &&
            !/sub/i.test(layer.role)
              ? "fill"
              : "preserve",
        }
    ),
  };
  for (const layer of next.scene.layers) {
    const edit = edits[layer.id];
    if (!edit || (layer.kind !== "text" && layer.kind !== "arcText")) continue;
    if (!edit.text.trim() || !edit.family.trim())
      throw new Error(`${layer.role}: preencha o texto e a fonte.`);
    layer.text = edit.text;
    layer.fontFamily = edit.family.trim();
    layer.fontWeight = edit.weight;
  }
  next.notes = next.notes.filter(
    note => !note.startsWith("[Encaixe]") && !note.startsWith("[Adaptação]")
  );
  next.notes.push(
    `[Adaptação] Derivada da receita ${recipe.id}, sem nova chamada de IA. Modelo e tokens descrevem a análise de origem.`
  );
  return recreationRecipeSchema.parse(next);
}

export type Admin2Import =
  | { kind: "recipe"; recipe: RecreationRecipe }
  | { kind: "blueprint"; blueprint: CatalogBlueprint };

/** Both entry points identify the file before choosing its strict validator. */
export async function readAdmin2File(file: File): Promise<Admin2Import> {
  if (file.size > 24 * 1024 * 1024)
    throw new Error("Arquivo acima do limite de 24 MB.");
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(
      "Não foi possível ler o JSON. Escolha um arquivo exportado pelo Admin2."
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("O arquivo não contém uma receita ou blueprint do Admin2.");
  if ("compilerVersion" in data || "pieces" in data) {
    if (file.size > 100000) throw new Error("Blueprint deve ter até 100 KB.");
    const parsed = catalogBlueprintSchema.safeParse(data);
    if (!parsed.success)
      throw new Error(
        `Blueprint incompatível: confira ${parsed.error.issues
          .slice(0, 3)
          .map(i => i.path.join(".") || "estrutura")
          .join(", ")}.`
      );
    return { kind: "blueprint", blueprint: parsed.data };
  }
  if (!("format" in data) || data.format !== "postspark.admin2.recipe")
    throw new Error(
      "Formato desconhecido. Importe uma receita ou blueprint exportado pelo Admin2."
    );
  const parsed = recreationRecipeSchema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      `Receita incompatível: confira ${parsed.error.issues
        .slice(0, 3)
        .map(i => i.path.join(".") || "estrutura")
        .join(", ")}.`
    );
  const recipe = parsed.data;
  for (const font of recipe.scene.fonts) {
    if (!font.dataUrl) continue;
    const bytes = Uint8Array.from(atob(font.dataUrl.split(",")[1]), char =>
      char.charCodeAt(0)
    );
    if (bytes.length > 3_000_000 || (await digest(bytes)) !== font.sha256)
      throw new Error(
        `O arquivo da fonte ${font.family} não corresponde ao hash salvo.`
      );
  }
  for (const slot of recipe.matrix?.media ?? []) {
    if (!slot.asset) continue;
    const bytes = Uint8Array.from(
      atob(slot.asset.dataUrl.split(",")[1]),
      char => char.charCodeAt(0)
    );
    if ((await digest(bytes)) !== slot.asset.sha256)
      throw new Error(`${slot.label}: a foto não corresponde ao hash salvo.`);
  }
  return { kind: "recipe", recipe };
}

export async function readRecipeFile(file: File): Promise<RecreationRecipe> {
  const imported = await readAdmin2File(file);
  if (imported.kind !== "recipe")
    throw new Error(
      "Este arquivo é um blueprint. Abra-o na seção Catálogo para geração."
    );
  return imported.recipe;
}

export function downloadRecipe(recipe: RecreationRecipe): void {
  const blob = new Blob([JSON.stringify(recipe, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, `postspark-admin2-${recipe.id.slice(0, 8)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadUrl(url: string, name: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}
