import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  OFFICIAL_FAMILIES_META,
  type CanvasPostModel,
  type VisualFamilyId,
} from "./types";
import type { MediaUpdate } from "../lib/mediaSlots";
import { BACKGROUND_SLOT } from "../lib/mediaSlots";
import { registerUserFont, validateFontFile } from "../lib/fontResources";
import { preflightSavePayload } from "../lib/savePreflight";
import FontPickerDropdown from "./FontPickerDropdown";
import MediaSlotPanel from "./MediaSlotPanel";
import BackgroundsDrawer from "./BackgroundsDrawer";

const button =
  "min-h-11 rounded-xl border border-white/15 bg-white/5 px-3 text-xs text-white hover:bg-white/10";
const label = "block space-y-1 text-xs text-white/70";
type TypographyRole = "headline" | "body" | "content";
type UpdatePost = (patch: Partial<CanvasPostModel>) => void;

export function CanvasAppearancePanel({
  post,
  onUpdatePost,
  onApplyTypography,
  onApplyFamily,
  onReorganize,
  onRestore,
}: {
  post: CanvasPostModel;
  onUpdatePost: UpdatePost;
  onApplyTypography: (
    role: TypographyRole,
    font: string,
    slideIds: string[]
  ) => void;
  onApplyFamily?: (familyId: VisualFamilyId) => void;
  onReorganize?: () => void;
  onRestore?: () => void;
}) {
  const [role, setRole] = useState<TypographyRole>("content");
  const [otherSlides, setOtherSlides] = useState<string[]>([]);
  const currentId = post.slides[post.currentSlideIndex]?.id;
  const destinations = currentId
    ? [
        currentId,
        ...otherSlides.filter(
          id => id !== currentId && post.slides.some(slide => slide.id === id)
        ),
      ]
    : [];
  return (
    <div className="space-y-5">
      {!post.slides[post.currentSlideIndex]?.composition && onApplyFamily && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Estilos visuais</h3>
          <p className="text-xs text-white/50">
            Mude a organização e a tipografia preservando as cores escolhidas.
          </p>
          {[
            "Tendências & Instagram",
            "Editorial & Clássico",
            "Métricas & Conversão",
          ].map(category => (
            <details key={category}>
              <summary className="min-h-11 cursor-pointer text-xs text-white/80">
                {category}
              </summary>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(OFFICIAL_FAMILIES_META)
                  .filter(family => family.category === category)
                  .map(family => (
                    <button
                      type="button"
                      key={family.id}
                      aria-pressed={post.familyId === family.id}
                      className={`${button} text-left aria-pressed:border-orange-400`}
                      onClick={() => onApplyFamily(family.id)}
                    >
                      {family.name}
                    </button>
                  ))}
              </div>
            </details>
          ))}
        </section>
      )}
      {!post.slides[post.currentSlideIndex]?.composition && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Marcações</h3>
          <label className="flex min-h-11 items-center gap-2 text-xs text-white/80">
            <input
              type="checkbox"
              checked={Boolean(post.showBadge)}
              onChange={event =>
                onUpdatePost({ showBadge: event.target.checked })
              }
            />{" "}
            Mostrar selo
          </label>
          {post.showBadge && (
            <label className={label}>
              Texto do selo
              <input
                type="text"
                value={post.badgeText || ""}
                onChange={event =>
                  onUpdatePost({ badgeText: event.target.value })
                }
                className="block min-h-11 w-full rounded-lg border border-white/15 bg-white/5 px-2 text-white"
              />
            </label>
          )}
          {post.slides.length > 1 && (
            <>
              <label className="flex min-h-11 items-center gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={Boolean(post.showStep)}
                  onChange={event =>
                    onUpdatePost({ showStep: event.target.checked })
                  }
                />{" "}
                Mostrar número do slide
              </label>
              {post.showStep && (
                <label className={label}>
                  Texto do número neste slide
                  <input
                    type="text"
                    value={post.slides[post.currentSlideIndex]?.step || ""}
                    onChange={event =>
                      onUpdatePost({
                        slides: post.slides.map((slide, index) =>
                          index === post.currentSlideIndex
                            ? { ...slide, step: event.target.value }
                            : slide
                        ),
                      })
                    }
                    className="block min-h-11 w-full rounded-lg border border-white/15 bg-white/5 px-2 text-white"
                  />
                </label>
              )}
              {post.showBadge && post.showStep && (
                <p className="text-xs text-white/50">
                  O selo aparece no mesmo espaço e tem prioridade sobre o
                  número.
                </p>
              )}
            </>
          )}
        </section>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Tipografia</h3>
        <label className={label}>
          Aplicar aos textos
          <select
            value={role}
            onChange={event => setRole(event.target.value as TypographyRole)}
            className="w-full rounded-lg bg-neutral-800 p-3 text-white"
          >
            <option value="content">Conteúdo reconhecido</option>
            <option value="headline">Títulos</option>
            <option value="body">Corpo</option>
          </select>
        </label>
        <FontPickerDropdown
          value={post.fontFamily}
          userFonts={post.userFonts}
          onChange={font => onApplyTypography(role, font, destinations)}
        />
        <p className="text-xs text-white/50">
          A fonte é aplicada ao slide atual e aos slides escolhidos abaixo.
        </p>
        {post.slides.length > 1 && (
          <details>
            <summary className="min-h-11 cursor-pointer text-xs">
              Aplicar também a outros slides
            </summary>
            <div className="space-y-2">
              {post.slides
                .filter(slide => slide.id !== currentId)
                .map((slide, index) => (
                  <label
                    key={slide.id}
                    className="flex min-h-11 items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={otherSlides.includes(slide.id)}
                      onChange={event =>
                        setOtherSlides(
                          event.target.checked
                            ? [...otherSlides, slide.id]
                            : otherSlides.filter(id => id !== slide.id)
                        )
                      }
                    />{" "}
                    Slide {post.slides.indexOf(slide) + 1}
                  </label>
                ))}
            </div>
          </details>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Cores</h3>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["background", "Fundo"],
              ["accent", "Destaque"],
            ] as const
          ).map(([key, name]) => (
            <label className={label} key={key}>
              {name}
              <input
                type="color"
                value={post.palette[key]}
                onChange={event =>
                  onUpdatePost({
                    palette: { ...post.palette, [key]: event.target.value },
                  })
                }
                className="block h-11 w-full rounded-lg bg-transparent"
              />
            </label>
          ))}
        </div>
      </section>
      {(onReorganize || onRestore) && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Composição</h3>
          <div className="flex flex-wrap gap-2">
            {onReorganize && (
              <button type="button" className={button} onClick={onReorganize}>
                Reorganizar visual
              </button>
            )}
            {onRestore && (
              <button type="button" className={button} onClick={onRestore}>
                Restaurar visual
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function CanvasBrandPanel({
  post,
  onUpdatePost,
  onReplicate,
  onSetLogo,
}: {
  post: CanvasPostModel;
  onUpdatePost: UpdatePost;
  onReplicate?: () => void;
  onSetLogo?: (
    slideId: string,
    patch: {
      url?: string;
      position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    }
  ) => void;
}) {
  const slide = post.slides[post.currentSlideIndex];
  const logo =
    slide?.composition?.version === 3 ? slide.composition.logo : undefined;
  const logoUrl = slide?.composition
    ? logo?.url
    : slide?.logo
      ? slide.logo.url
      : post.logoUrl;
  const logoPosition = slide?.composition
    ? logo?.position
    : slide?.logo
      ? slide.logo.position
      : post.logoPosition;
  const updateLogo = (
    slideId: string,
    patch: {
      url?: string;
      position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    }
  ) => {
    if (onSetLogo) onSetLogo(slideId, patch);
    else if (
      !latest.current.slides.find(item => item.id === slideId)?.composition
    )
      onUpdatePost({
        ...(Object.hasOwn(patch, "url") ? { logoUrl: patch.url } : {}),
        ...(patch.position ? { logoPosition: patch.position } : {}),
      });
    else toast.error("O ajuste do logo não está disponível neste slide.");
  };
  const latest = useRef(post);
  latest.current = post;
  const [fontUrl, setFontUrl] = useState(post.customFontUrl || "");
  const uploadFont = async (file?: File) => {
    if (!file) return;
    const postId = latest.current.id;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const validation = validateFontFile(bytes, file.name);
      if (!validation.valid || !validation.format)
        throw new Error(validation.error || "Fonte inválida.");
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      const font = {
        family: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        url: `data:font/${validation.format};base64,${btoa(binary)}`,
        format: validation.format,
      };
      if (latest.current.id !== postId) return;
      const userFonts = [
        ...(latest.current.userFonts || []).filter(
          item => item.family !== font.family
        ),
        font,
      ];
      if (!(await preflightSavePayload({ ...latest.current, userFonts })).ok)
        throw new Error(
          "O documento com essa fonte excede o limite permitido."
        );
      if (!(await registerUserFont(font)))
        throw new Error("Não foi possível carregar a fonte.");
      if (latest.current.id !== postId) return;
      const latestFonts = [
        ...(latest.current.userFonts || []).filter(
          item => item.family !== font.family
        ),
        font,
      ];
      if (
        !(
          await preflightSavePayload({
            ...latest.current,
            userFonts: latestFonts,
          })
        ).ok
      )
        throw new Error(
          "O documento com essa fonte excede o limite permitido."
        );
      if (latest.current.id !== postId) return;
      onUpdatePost({ userFonts: latestFonts });
      toast.success("Fonte pessoal adicionada ao seletor.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Logo</h3>
        <label className={`${button} flex items-center justify-center`}>
          Enviar logo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0];
              if (!file) return;
              const postId = post.id;
              const slideId = slide?.id;
              const reader = new FileReader();
              reader.onload = () => {
                if (latest.current.id === postId && slideId)
                  updateLogo(slideId, { url: String(reader.result) });
              };
              reader.readAsDataURL(file);
              event.target.value = "";
            }}
          />
        </label>
        {logoUrl && (
          <>
            <img
              src={logoUrl}
              alt="Logo atual"
              className="max-h-24 max-w-full object-contain"
            />
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["top-left", "Superior esquerdo"],
                  ["top-right", "Superior direito"],
                  ["bottom-left", "Inferior esquerdo"],
                  ["bottom-right", "Inferior direito"],
                ] as const
              ).map(([position, name]) => (
                <button
                  key={position}
                  type="button"
                  className={button}
                  aria-pressed={logoPosition === position}
                  onClick={() => slide && updateLogo(slide.id, { position })}
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={button}
              onClick={() => slide && updateLogo(slide.id, { url: undefined })}
            >
              Remover logo
            </button>
          </>
        )}
        {onReplicate && (
          <button type="button" className={button} onClick={onReplicate}>
            Aplicar a outros slides
          </button>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Fontes pessoais</h3>
        <label className={`${button} flex items-center justify-center`}>
          Enviar fonte (até 1 MiB)
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="sr-only"
            onChange={event => {
              void uploadFont(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-white/50">
          Fontes enviadas aparecem no seletor de tipografia.
        </p>
        {!slide?.composition && (
          <div className="space-y-2">
            <label className={label}>
              Link do Google Fonts
              <input
                type="url"
                value={fontUrl}
                onChange={event => setFontUrl(event.target.value)}
                placeholder="https://fonts.googleapis.com/..."
                className="block min-h-11 w-full rounded-lg border border-white/15 bg-white/5 px-2 text-white"
              />
            </label>
            <button
              type="button"
              className={button}
              disabled={!fontUrl.trim()}
              onClick={() => onUpdatePost({ customFontUrl: fontUrl.trim() })}
            >
              Aplicar link da fonte
            </button>
          </div>
        )}
        {post.userFonts?.map(font => (
          <p key={font.family} className="text-xs">
            {font.family}
          </p>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Cores da marca</h3>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["background", "Fundo"],
              ["accent", "Destaque"],
            ] as const
          ).map(([key, name]) => (
            <label className={label} key={key}>
              {name}
              <input
                type="color"
                value={post.palette[key]}
                onChange={event =>
                  onUpdatePost({
                    palette: { ...post.palette, [key]: event.target.value },
                  })
                }
                className="block h-11 w-full bg-transparent"
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CanvasMediaPanel({
  post,
  onMediaUpdate,
  selectedId,
  mediaPreview,
  onMediaPreview,
  onAddExtraImage,
}: {
  post: CanvasPostModel;
  onMediaUpdate: MediaUpdate;
  selectedId?: string | null;
  mediaPreview?: string;
  onMediaPreview?: (url: string | undefined) => void;
  onAddExtraImage?: (
    url: string,
    width?: number,
    height?: number,
    slideId?: string
  ) => void;
}) {
  const [manifest, setManifest] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("/images/backgrounds/manifest.json")
      .then(result => result.json())
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);
  return (
    <div className="space-y-3">
      <MediaSlotPanel
        post={post}
        onUpdate={onMediaUpdate}
        selectedId={selectedId}
        retainedPreview={mediaPreview}
        onRetainPreview={onMediaPreview}
      />
      {onAddExtraImage && (
        <label className={`${button} flex items-center justify-center`}>
          Adicionar imagem sobre a arte
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0];
              const slideId = post.slides[post.currentSlideIndex]?.id;
              if (!file || !slideId) return;
              const reader = new FileReader();
              reader.onload = () => {
                const url = String(reader.result);
                const image = new Image();
                image.onload = () =>
                  onAddExtraImage(
                    url,
                    image.naturalWidth,
                    image.naturalHeight,
                    slideId
                  );
                image.src = url;
              };
              reader.readAsDataURL(file);
              event.target.value = "";
            }}
          />
        </label>
      )}
      <button type="button" className={button} onClick={() => setOpen(true)}>
        Explorar texturas de fundo
      </button>
      <BackgroundsDrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        post={post}
        manifestData={manifest}
        onApplyBackground={url => {
          const slideId = post.slides[post.currentSlideIndex]?.id;
          if (slideId)
            onMediaUpdate(
              { postId: post.id, slideId, slotId: BACKGROUND_SLOT },
              url ? { kind: "apply", url } : { kind: "remove" }
            );
        }}
      />
    </div>
  );
}
