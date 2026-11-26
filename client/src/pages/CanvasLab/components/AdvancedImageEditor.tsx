import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { imageEditorApi } from "@/lib/imageEditorApi";
import {
  IMAGE_EDITOR_TOOLS,
  IMAGE_EDITOR_MAX_DIMENSION,
  imageEditOperationSchema,
  type ImageEditInput,
  type ImageEditOperation,
  type ImageEditResult,
} from "@shared/imageEditor";
import {
  readAdvancedImage,
  type AdvancedImageTarget,
} from "../lib/advancedImageEditing";
import {
  changeSelectionFrame,
  fitSelectionRatio,
  frameCorner,
  fullImageFrame,
  isFullImageFrame,
  pointBounds,
  selectionCorners,
  type ImagePoint as Point,
  type ImageSelectionFrame,
  type SelectionHandle,
} from "../lib/imageSelectionFrame";
import { contrastRatio } from "../lib/contrast";

type ManualRegionMode = "rectangle" | "circle" | "ellipse" | "polygon";
type RegionMode = "preset" | ManualRegionMode;
const REGION_SHAPES: { mode: ManualRegionMode; label: string }[] = [
  { mode: "rectangle", label: "Retângulo" },
  { mode: "circle", label: "Círculo" },
  { mode: "ellipse", label: "Elipse" },
  { mode: "polygon", label: "Por pontos" },
];
const BLUR_PRESETS = [
  { id: "full", label: "Foto inteira", start: [0, 0], end: [1, 1] },
  { id: "center", label: "Centro", start: [0.25, 0.25], end: [0.75, 0.75] },
  { id: "top", label: "Faixa superior", start: [0, 0], end: [1, 0.35] },
  { id: "bottom", label: "Faixa inferior", start: [0, 0.65], end: [1, 1] },
  { id: "left", label: "Lado esquerdo", start: [0, 0], end: [0.35, 1] },
  { id: "right", label: "Lado direito", start: [0.65, 0], end: [1, 1] },
] as const;
type BlurPreset = (typeof BLUR_PRESETS)[number];
type RegionGesture = { start: Point; index?: number };
type AreaGesture = {
  start: Point;
  frame: ImageSelectionFrame;
  handle: SelectionHandle | "draw";
};
const CROP_RATIOS = [
  { label: "Livre", value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
] as const;
const LOOKS = [
  { id: "warm", label: "Quente", filter: "sepia(.24) saturate(1.18)" },
  {
    id: "teal-orange",
    label: "Cinema",
    filter: "contrast(1.14) saturate(.85)",
  },
] as const;
const NEUTRAL_ADJUST = {
  kind: "adjust",
  brightness: 0,
  contrast: 0,
  saturation: 0,
} as const;
const MIN_REGION_SIDE = 0.01;
const MIN_CROP_SIDE = 0.001;
const MAX_REGION_FEATHER = 32;
const centralRectangle: Point[] = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];

function rectanglePoints(
  start: readonly [number, number],
  end: readonly [number, number]
): Point[] {
  const left = Math.min(start[0], end[0]),
    right = Math.max(start[0], end[0]);
  const top = Math.min(start[1], end[1]),
    bottom = Math.max(start[1], end[1]);
  if (right - left < MIN_REGION_SIDE || bottom - top < MIN_REGION_SIDE)
    return [];
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

function dragRegionPoints(
  mode: RegionMode,
  start: Point,
  end: Point,
  source: Source
): Point[] {
  const rectangle = rectanglePoints(start, end);
  if (!rectangle.length || (mode !== "circle" && mode !== "ellipse"))
    return rectangle;
  const [left, top] = rectangle[0],
    [right, bottom] = rectangle[2];
  const centerX = (left + right) / 2,
    centerY = (top + bottom) / 2;
  let radiusX = (right - left) / 2,
    radiusY = (bottom - top) / 2;
  if (mode === "circle") {
    const radius = Math.min(radiusX * source.width, radiusY * source.height);
    radiusX = radius / source.width;
    radiusY = radius / source.height;
  }
  // Use the same outline for display and processing, within the polygon point limit.
  return Array.from({ length: 48 }, (_, index): Point => {
    const angle = (index * 2 * Math.PI) / 48;
    return [
      clamp(centerX + Math.cos(angle) * radiusX),
      clamp(centerY + Math.sin(angle) * radiusY),
    ];
  });
}

function hasCrossedEdges(points: Point[]) {
  if (points.length < 3) return false;
  const orientation = (a: Point, b: Point, c: Point) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const onSegment = (a: Point, b: Point, point: Point) =>
    point.every(
      (value, axis) =>
        value >= Math.min(a[axis], b[axis]) &&
        value <= Math.max(a[axis], b[axis])
    );

  for (let index = 0; index < points.length; index++) {
    const a = points[index],
      b = points[(index + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) return true;
    for (let next = index + 2; next < points.length; next++) {
      if (index === 0 && next === points.length - 1) continue;
      const c = points[next],
        d = points[(next + 1) % points.length];
      const abc = orientation(a, b, c),
        abd = orientation(a, b, d);
      const cda = orientation(c, d, a),
        cdb = orientation(c, d, b);
      if (
        (abc * abd < 0 && cda * cdb < 0) ||
        (abc === 0 && onSegment(a, b, c)) ||
        (abd === 0 && onSegment(a, b, d)) ||
        (cda === 0 && onSegment(c, d, a)) ||
        (cdb === 0 && onSegment(c, d, b))
      )
        return true;
    }
  }
  return false;
}
type Source = { imageData: string; width: number; height: number };
type Preview = { key: string; input: ImageEditInput; result: ImageEditResult };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const fieldClass =
  "min-h-11 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-sm";
const percent = (value: number) => Number((value * 100).toFixed(1));
const dimensionsLabel = ({ width, height }: Pick<Source, "width" | "height">) =>
  `${width} × ${height} px`;

export default function AdvancedImageEditor({
  open,
  target,
  originalAvailable,
  onOpenChange,
  isCurrent,
  onApply,
  onRestore,
  embedded = false,
  onPendingChange,
  palette,
  onPreviewChange,
  imageEditorClient = imageEditorApi,
}: {
  imageEditorClient?: typeof imageEditorApi;
  onPreviewChange?: (
    preview: { result: ImageEditResult; operation: ImageEditOperation } | null
  ) => void;
  palette?: readonly string[];
  embedded?: boolean;
  onPendingChange?: (pending: boolean) => void;
  open: boolean;
  target: AdvancedImageTarget | null;
  originalAvailable: boolean;
  onOpenChange: (open: boolean) => void;
  isCurrent: () => boolean;
  onApply: (
    input: ImageEditInput,
    result: ImageEditResult,
    signal: AbortSignal
  ) => Promise<boolean>;
  onRestore: () => boolean;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [tools, setTools] = useState<
    readonly {
      kind: ImageEditOperation["kind"];
      label: string;
      maxDimension?: number;
    }[]
  >(IMAGE_EDITOR_TOOLS.slice(0, 6));
  const [dark, setDark] = useState("#11253a"),
    [light, setLight] = useState("#59d4c2"),
    [shadows, setShadows] = useState(25),
    [highlights, setHighlights] = useState(15),
    [look, setLook] = useState<"warm" | "teal-orange">("warm"),
    [grain, setGrain] = useState(40);
  const [available, setAvailable] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [kind, setKind] = useState<ImageEditOperation["kind"]>("adjust");
  const [brightness, setBrightness] = useState(0),
    [contrast, setContrast] = useState(0),
    [saturation, setSaturation] = useState(0);
  const [crop, setCrop] = useState(fullImageFrame);
  const [cropRatio, setCropRatio] = useState(0);
  const normalizedCropRatio =
    cropRatio && source
      ? (cropRatio * source.height) / source.width
      : undefined;
  const [width, setWidth] = useState(800),
    [height, setHeight] = useState(800),
    [keepRatio, setKeepRatio] = useState(true);
  const [points, setPoints] = useState<Point[]>([]),
    [feather, setFeather] = useState(1),
    [radius, setRadius] = useState(10);
  const [regionMode, setRegionMode] = useState<RegionMode>("rectangle");
  const [blurPreset, setBlurPreset] = useState<BlurPreset["id"] | null>(null);
  const [presetFeatherOverride, setPresetFeatherOverride] = useState<number>();
  const defaultPresetFeather = source
    ? Math.min(
        MAX_REGION_FEATHER,
        Math.max(1, Math.round(Math.min(source.width, source.height) * 0.04))
      )
    : 1;
  const presetFeather = presetFeatherOverride ?? defaultPresetFeather;
  const blurFeather =
    blurPreset === "full" ? 0 : blurPreset ? presetFeather : feather;
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const regionGesture = useRef<RegionGesture | null>(null);
  const regionInstructions = useRef<HTMLDivElement>(null);
  const hasRegionTool = kind === "mask" || kind === "blur";
  const crossedEdges = useMemo(
    () => hasRegionTool && regionMode === "polygon" && hasCrossedEdges(points),
    [hasRegionTool, regionMode, points]
  );
  const [formatChoice, setFormatChoice] = useState<"auto" | "png" | "webp">(
    "auto"
  );
  const format = formatChoice === "webp" ? "webp" : "png";
  const [autoPreviewRevision, requestAutoPreview] = useState(0);
  const [detail, setDetail] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null),
    [showBefore, setShowBefore] = useState(false);
  const [busy, setBusy] = useState<"load" | "preview" | "apply" | null>(null),
    [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null),
    sequence = useRef(0),
    areaGesture = useRef<AreaGesture | null>(null);

  const operation = useMemo(() => {
    const candidate =
      kind === "black-white" || kind === "iris"
        ? { kind }
        : kind === "duotone"
          ? { kind, dark, light }
          : kind === "shadows-highlights"
            ? {
                kind,
                shadows: Math.round(shadows * 0.5),
                highlights: Math.round(highlights * 0.4),
              }
            : kind === "look"
              ? { kind, preset: look }
              : kind === "grain"
                ? grain === 0
                  ? NEUTRAL_ADJUST
                  : { kind, amount: 0.5 + grain * 0.025 }
                : kind === "adjust"
                  ? {
                      kind,
                      brightness: Math.round(brightness * 1.5),
                      contrast: Math.round(
                        contrast < 0 ? contrast * 0.5 : contrast
                      ),
                      saturation,
                    }
                  : kind === "crop"
                    ? { kind, ...crop }
                    : kind === "resize"
                      ? { kind, width, height }
                      : kind === "trim"
                        ? { kind }
                        : kind === "mask"
                          ? { kind, points, feather }
                          : {
                              kind,
                              points,
                              feather: blurFeather,
                              radius,
                            };
    return imageEditOperationSchema.safeParse(candidate);
  }, [
    kind,
    dark,
    light,
    shadows,
    highlights,
    look,
    grain,
    brightness,
    contrast,
    saturation,
    crop,
    width,
    height,
    points,
    blurFeather,
    feather,
    radius,
  ]);
  const key = JSON.stringify({
    operation: operation.success ? operation.data : null,
    format,
  });
  const currentPreview = preview?.key === key ? preview : null;
  const isConversion = Boolean(
    source &&
      formatChoice !== "auto" &&
      !source.imageData.startsWith(`data:image/${format};`)
  );
  const neutral =
    operation.success &&
    ((operation.data.kind === "adjust" &&
      !operation.data.brightness &&
      !operation.data.contrast &&
      !operation.data.saturation) ||
      (operation.data.kind === "shadows-highlights" &&
        !operation.data.shadows &&
        !operation.data.highlights) ||
      (kind === "crop" && isFullImageFrame(crop)) ||
      (kind === "resize" &&
        source?.width === width &&
        source.height === height));
  const trimsNothing =
    kind === "trim" &&
    currentPreview &&
    currentPreview.result.resultDimensions.width === source?.width &&
    currentPreview.result.resultDimensions.height === source.height;
  const noChange = !isConversion && (neutral || trimsNothing);
  const cropTooSmall =
    kind === "crop" &&
    (crop.width < MIN_CROP_SIDE || crop.height < MIN_CROP_SIDE);
  useEffect(() => {
    if (!open || !target) return;
    const controller = new AbortController();
    setSource(null);
    setPreview(null);
    setAvailable(false);
    setBusy("load");
    setError("");
    setKind("adjust");
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setPoints([]);
    setSelectedPoint(null);
    setRegionMode("rectangle");
    setBlurPreset(null);
    setPresetFeatherOverride(undefined);
    setFeather(1);
    setRadius(10);
    setFormatChoice("auto");
    setCrop(fullImageFrame);
    setCropRatio(0);
    setKeepRatio(true);
    setShowBefore(false);
    setDetail(false);
    areaGesture.current = null;
    void Promise.all([
      readAdvancedImage(target.url, controller.signal).catch(error => {
        if (error instanceof TypeError)
          throw new Error("Não foi possível ler a imagem de origem. Verifique a conexão ou reenvie a imagem.");
        throw error;
      }),
      imageEditorClient.imageEditor.capabilities.query(undefined, {
        signal: controller.signal,
      }).catch(error => {
        if (error.data?.code === "UNAUTHORIZED")
          throw new Error("Sua sessão expirou. Entre novamente para editar a imagem.");
        if (error.data?.code === "FORBIDDEN" || error.data?.code === "PRECONDITION_FAILED") throw error;
        throw new Error("Não foi possível consultar as ferramentas de imagem. Verifique a conexão e tente novamente.");
      }),
    ])
      .then(([image, capability]) => {
        if (controller.signal.aborted) return;
        setSource(image);
        setWidth(image.width);
        setHeight(image.height);
        const supported = capability.tools ?? IMAGE_EDITOR_TOOLS.slice(0, 6);
        if (!capability.available || !supported.length) {
          setError(("message" in capability && capability.message) || "Nenhuma ferramenta de imagem está disponível neste ambiente.");
          return;
        }
        setTools(supported);
        setKind(supported[0].kind);
        setAvailable(true);
      })
      .catch(error => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Não foi possível abrir a imagem."
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(null);
      });
    return () => {
      controller.abort();
      pending.current?.abort();
      sequence.current++;
    };
  }, [imageEditorClient, open, target?.url, loadAttempt]);
  useEffect(() => {
    setPreview(null);
    pending.current?.abort();
    sequence.current++;
    setBusy(previous => (previous === "preview" ? null : previous));
  }, [key]);

  const close = (next: boolean) => {
    if (!next) {
      onPreviewChange?.(null);
      setPreview(null);
      pending.current?.abort();
      sequence.current++;
    }
    onOpenChange(next);
  };
  const limit = tools.find(tool => tool.kind === kind)?.maxDimension;
  const overLimit = Boolean(
    limit && source && Math.max(source.width, source.height) > limit
  );
  const generatePreview = async () => {
    if (
      !source ||
      !operation.success ||
      cropTooSmall ||
      (neutral && !isConversion) ||
      !available ||
      busy ||
      overLimit ||
      crossedEdges
    )
      return;
    if (!isCurrent()) {
      setError(
        "A peça mudou durante a edição. Feche e abra novamente a imagem."
      );
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const revision = ++sequence.current;
    const input: ImageEditInput = {
      requestId: crypto.randomUUID(),
      imageData: source.imageData,
      operation: operation.data,
      format,
    };
    setBusy("preview");
    setError("");
    setPreview(null);
    try {
      const result = await imageEditorClient.imageEditor.preview.mutate(input, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || revision !== sequence.current) return;
      if (!isCurrent())
        throw new Error(
          "A peça mudou durante a edição. Feche e abra novamente a imagem."
        );
      if (
        result.sourceDimensions.width !== source.width ||
        result.sourceDimensions.height !== source.height
      )
        throw new Error(
          "Reenvie esta imagem em PNG para editar com a orientação correta."
        );
      setShowBefore(false);
      setPreview({ key, input, result });
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível gerar a prévia."
        );
    } finally {
      if (revision === sequence.current) setBusy(null);
    }
  };
  useEffect(() => {
    if (autoPreviewRevision && preview?.key !== key) void generatePreview();
    // One request at gesture completion, never per slider movement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPreviewRevision]);
  const apply = async () => {
    if (!currentPreview || noChange || busy) return;
    if (!isCurrent()) {
      setError("A peça mudou. Gere uma nova edição antes de aplicar.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy("apply");
    setError("");
    try {
      if (
        await onApply(
          currentPreview.input,
          currentPreview.result,
          controller.signal
        )
      )
        close(false);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Não foi possível aplicar a edição."
        );
    } finally {
      if (!controller.signal.aborted) setBusy(null);
    }
  };
  const pointAt = (
    event: React.PointerEvent<SVGSVGElement>,
    bounded = true
  ): Point => {
    const normalize = bounded ? clamp : (value: number) => value;
    // The viewBox can be letterboxed by max-height or a mobile viewport. Map through
    // the SVG transform rather than treating the entire CSS box as image pixels.
    const matrix = event.currentTarget.getScreenCTM();
    if (matrix && source) {
      const point = event.currentTarget.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      return [
        normalize(local.x / source.width),
        normalize(local.y / source.height),
      ];
    }
    const box = event.currentTarget.getBoundingClientRect();
    return [
      normalize((event.clientX - box.left) / box.width),
      normalize((event.clientY - box.top) / box.height),
    ];
  };
  const updateArea = (end: Point) => {
    const gesture = areaGesture.current;
    if (!gesture || !source) return false;
    const ratio =
      kind === "crop"
        ? normalizedCropRatio
        : regionMode === "circle"
          ? source.height / source.width
          : undefined;
    const frame = changeSelectionFrame(
      gesture.frame,
      gesture.handle,
      gesture.start,
      end,
      ratio
    );
    const minimum = kind === "crop" ? MIN_CROP_SIDE : MIN_REGION_SIDE;
    if (frame.width < minimum || frame.height < minimum) return true;
    if (kind === "crop") setCrop(frame);
    else
      setPoints(
        dragRegionPoints(
          regionMode,
          [frame.x, frame.y],
          frameCorner(frame, "se"),
          source
        )
      );
    return true;
  };
  const clearRegion = () => {
    setPoints([]);
    setSelectedPoint(null);
    setBlurPreset(null);
    setError("");
  };
  const selectRegionMode = (mode: RegionMode) => {
    if (mode === regionMode) return;
    setRegionMode(mode);
    clearRegion();
    setShowBefore(true);
  };
  const customizeBlurArea = () => {
    setRegionMode("rectangle");
    setBlurPreset(null);
    setShowBefore(true);
  };
  const chooseBlurPreset = (preset: BlurPreset) => {
    setBlurPreset(preset.id);
    setPoints(rectanglePoints(preset.start, preset.end));
    setShowBefore(false);
    requestAutoPreview(value => value + 1);
  };
  const removeSelectedPoint = () => {
    if (selectedPoint === null) return;
    setPoints(points.filter((_, index) => index !== selectedPoint));
    setSelectedPoint(
      points.length > 1 ? Math.min(selectedPoint, points.length - 2) : null
    );
  };
  const movePoint = (index: number, point: Point) => {
    setPoints(previous =>
      previous.map((existing, i) => (i === index ? point : existing))
    );
  };
  const addPointFromKeyboard = () => {
    if (points.length >= 128) return;
    if (points.length < 2) {
      const next: Point = points.length === 0 ? [0.25, 0.25] : [0.75, 0.25];
      setPoints([...points, next]);
      setSelectedPoint(points.length);
      return;
    }
    if (points.length === 2) {
      setPoints([...points, [0.5, 0.75]]);
      setSelectedPoint(2);
      return;
    }
    const index = selectedPoint ?? points.length - 1;
    const a = points[index],
      b = points[(index + 1) % points.length];
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    setPoints([
      ...points.slice(0, index + 1),
      midpoint,
      ...points.slice(index + 1),
    ]);
    setSelectedPoint(index + 1);
  };
  const numeric = (
    label: string,
    value: number,
    change: (value: number) => void,
    min: number,
    max: number,
    step = 1,
    issue?: string
  ) => (
    <label className="block text-xs">
      <span className="mb-1 block">{label}</span>
      <span className="mb-1 block text-white/50">
        De {min} a {max}
      </span>
      <input
        type="number"
        aria-label={label}
        className={`${fieldClass} ${issue ? "border-orange-300/70" : ""}`}
        aria-invalid={Boolean(issue)}
        aria-describedby={
          issue ? `image-editor-${label.split(" ")[0]}-issue` : undefined
        }
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) change(next);
        }}
      />
      {issue && (
        <span
          id={`image-editor-${label.split(" ")[0]}-issue`}
          className="mt-1 block text-orange-200"
        >
          {issue}
        </span>
      )}
    </label>
  );
  const intensity = (
    label: string,
    value: number,
    change: (value: number) => void,
    min = 0,
    max = 100,
    step = 1,
    unit = "",
    hint?: string
  ) => (
    <label className="block space-y-1 text-xs">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <output className="font-mono text-orange-200">
          {value.toLocaleString("pt-BR")}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={`${value.toLocaleString("pt-BR")}${unit}`}
        min={min}
        max={max}
        step={step}
        value={value}
        className="min-h-11 w-full accent-orange-400"
        onChange={e => change(Number(e.target.value))}
        onPointerUp={() => requestAutoPreview(v => v + 1)}
        onKeyUp={e => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            requestAutoPreview(v => v + 1);
        }}
      />
      <span className="flex justify-between text-[10px] text-white/55">
        <span>
          {min}
          {unit}
          {min < 0 ? " · Menos" : min === 0 ? " · Sem efeito" : " · Suave"}
        </span>
        {min < 0 && <span>0 · Original</span>}
        <span>
          {max}
          {unit} · Mais
        </span>
      </span>
      {hint && <span className="block text-xs text-white/60">{hint}</span>}
    </label>
  );
  useEffect(() => {
    onPreviewChange?.(
      currentPreview && !noChange && !showBefore
        ? {
            result: currentPreview.result,
            operation: currentPreview.input.operation,
          }
        : null
    );
  }, [currentPreview, noChange, showBefore, onPreviewChange]);
  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange]);
  useEffect(() => {
    onPendingChange?.(
      (Boolean(currentPreview) && !noChange) ||
        busy === "preview" ||
        busy === "apply"
    );
  }, [currentPreview, noChange, busy, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  const viewingResult = Boolean(currentPreview && !noChange && !showBefore);
  const editingRegion = hasRegionTool && !viewingResult;
  const showsPresets = kind === "blur" && regionMode === "preset";
  const drawn =
    source &&
    !busy &&
    ((editingRegion && !showsPresets) || (kind === "crop" && !viewingResult));
  const areaFrame =
    kind === "crop"
      ? operation.success && !isFullImageFrame(crop)
        ? crop
        : null
      : kind === "mask" && regionMode !== "polygon"
        ? pointBounds(points)
        : null;
  const regionVertices = source
    ? points
        .map(([x, y]) => [x * source.width, y * source.height].join(","))
        .join(" ")
    : "";
  const regionHelp =
    regionMode === "polygon"
      ? "Contorne a área em sequência. Clique em um ponto para selecionar ou arraste para mover."
      : kind === "mask"
        ? "Arraste para desenhar. Use o centro para mover ou as alças para redimensionar."
        : "Arraste sobre a foto para desenhar a forma. Arraste de novo para redesenhar.";
  const regionControlsDisabled = Boolean(busy) || !source || !available;
  useEffect(() => {
    if (hasRegionTool)
      regionInstructions.current?.scrollIntoView({ block: "start" });
  }, [hasRegionTool, kind]);
  const shownDimensions = viewingResult
    ? currentPreview!.result.resultDimensions
    : source;
  const shownImage = viewingResult
    ? currentPreview!.result.imageData
    : source?.imageData;
  const postColors = palette
    ?.filter(color => /^#[0-9a-f]{6}$/i.test(color))
    .slice(0, 2);
  const resizeIssue = (value: number) =>
    Number.isInteger(value) && value >= 1 && value <= IMAGE_EDITOR_MAX_DIMENSION
      ? undefined
      : `Informe um inteiro de 1 a ${IMAGE_EDITOR_MAX_DIMENSION} px.`;
  const cropIssue = (value: number, minimum: number, remaining = 1) =>
    value < minimum || value > 1
      ? `Use de ${percent(minimum)}% a 100%.`
      : value > remaining + 0.000001
        ? "A área ultrapassa a borda da imagem."
        : undefined;
  const maskFeathers = [
    { label: "Leve", scale: 0.01 },
    { label: "Média", scale: 0.025 },
    { label: "Forte", scale: 0.04 },
  ] as const;
  const maskFeatherValues = source
    ? maskFeathers.map(({ label, scale }, index) => ({
        label,
        value:
          Math.min(
            30,
            Math.max(
              (index + 1) * 2,
              Math.round(Math.min(source.width, source.height) * scale)
            )
          ) + index,
      }))
    : [];
  const restoreButton = originalAvailable && (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={() => {
        if (onRestore()) close(false);
        else setError("A imagem mudou. Feche e abra novamente para restaurar.");
      }}
      className="min-h-11 w-full rounded-lg border border-white/15 px-3 text-xs"
    >
      Restaurar imagem original
    </button>
  );
  const content = !available || !source ? (
    <div aria-label="Tratamentos de imagem" className="space-y-3 text-sm text-white">
      {error ? (
        <>
          <p role="alert" className="text-amber-200">{error}</p>
          <button type="button" className={fieldClass} onClick={() => setLoadAttempt(attempt => attempt + 1)}>
            Tentar novamente
          </button>
        </>
      ) : <p role="status">Abrindo imagem e consultando as ferramentas…</p>}
      {source && <img src={source.imageData} alt="Imagem original" className="max-h-48 max-w-full object-contain" />}
      {restoreButton}
      <button type="button" className={fieldClass} onClick={() => close(false)}>Cancelar</button>
    </div>
  ) : (
    <div className="min-w-0 text-white" aria-label="Tratamentos de imagem">
      <div className="min-h-0 p-0">
        <p className="mb-4 rounded-lg border border-orange-400/20 bg-orange-400/5 p-3 text-xs text-orange-200">
          Solte a barra para ver a prévia na prancheta. A imagem só é salva ao
          clicar em Aplicar. Novos recursos serão adicionados.
        </p>
        <div className="grid gap-4 grid-cols-1">
          <div className="min-w-0">
            <div className="sticky top-0 z-10 mb-2 flex flex-wrap gap-2 bg-[#151515] py-2">
              <button
                type="button"
                disabled={!source}
                aria-pressed={showBefore}
                onClick={() => setShowBefore(true)}
                className="min-h-11 rounded-lg border border-white/15 px-3 text-xs aria-pressed:bg-white/15"
              >
                Antes
              </button>
              <button
                type="button"
                disabled={!currentPreview || Boolean(noChange)}
                aria-pressed={viewingResult}
                onClick={() => setShowBefore(false)}
                className="min-h-11 rounded-lg border border-white/15 px-3 text-xs aria-pressed:bg-white/15"
              >
                Prévia
              </button>
              <button
                type="button"
                disabled={!source}
                aria-pressed={detail}
                className="min-h-11 rounded-lg border border-white/15 px-2 text-xs"
                onClick={() => setDetail(v => !v)}
              >
                {detail ? "Ajustar prévia" : "Detalhe 100%"}
              </button>
              {shownDimensions && (
                <span className="self-center text-xs text-white/60">
                  {viewingResult ? "Prévia" : "Original"} ·{" "}
                  {dimensionsLabel(shownDimensions)}
                </span>
              )}
            </div>
            {kind === "crop" && source && (
              <div className="mb-2 space-y-2">
                <div
                  role="group"
                  aria-label="Proporção do recorte"
                  className="grid grid-cols-4 gap-1"
                >
                  {CROP_RATIOS.map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={regionControlsDisabled}
                      aria-pressed={cropRatio === value}
                      className="min-h-11 rounded-lg border border-white/15 text-xs aria-pressed:border-orange-400 aria-pressed:bg-orange-400/10"
                      onClick={() => {
                        setCropRatio(value);
                        if (value)
                          setCrop(
                            fitSelectionRatio(
                              fullImageFrame,
                              (value * source.height) / source.width
                            )
                          );
                        setShowBefore(true);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {viewingResult && (
                  <button
                    type="button"
                    className={fieldClass}
                    onClick={() => setShowBefore(true)}
                  >
                    Editar recorte
                  </button>
                )}
              </div>
            )}
            {hasRegionTool && (
              <div
                ref={regionInstructions}
                className="mb-2 scroll-mt-16 space-y-2 rounded-lg border border-white/15 p-2"
              >
                <p className="text-xs font-semibold">
                  {kind === "blur" ? "Área a desfocar" : "Área a manter"}
                </p>
                {showsPresets && (
                  <>
                    <p className="text-xs text-white/75">
                      Escolha uma área para ver o desfoque na prancheta.
                    </p>
                    <div
                      role="group"
                      aria-label="Presets de desfoque"
                      className="grid grid-cols-2 gap-2"
                    >
                      {BLUR_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 px-2 text-left text-xs aria-pressed:border-orange-400 aria-pressed:bg-orange-400/15"
                          aria-pressed={blurPreset === preset.id}
                          disabled={regionControlsDisabled}
                          onClick={() => chooseBlurPreset(preset)}
                        >
                          <span
                            aria-hidden="true"
                            className="relative h-3.5 w-5 shrink-0 overflow-hidden rounded-sm border border-white/45"
                          >
                            <span
                              className="absolute bg-orange-300/85"
                              style={{
                                left: `${preset.start[0] * 100}%`,
                                top: `${preset.start[1] * 100}%`,
                                width: `${(preset.end[0] - preset.start[0]) * 100}%`,
                                height: `${(preset.end[1] - preset.start[1]) * 100}%`,
                              }}
                            />
                          </span>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={fieldClass}
                      disabled={regionControlsDisabled}
                      onClick={customizeBlurArea}
                    >
                      Personalizar área
                    </button>
                  </>
                )}
                {editingRegion && !showsPresets && (
                  <>
                    <div
                      role="group"
                      aria-label="Como marcar a área"
                      className="grid grid-cols-2 gap-2"
                    >
                      {REGION_SHAPES.map(shape => (
                        <button
                          key={shape.mode}
                          type="button"
                          className="min-h-11 rounded-lg border border-white/20 px-2 text-xs aria-pressed:border-orange-400 aria-pressed:bg-orange-400/15"
                          aria-pressed={regionMode === shape.mode}
                          disabled={regionControlsDisabled}
                          onClick={() => selectRegionMode(shape.mode)}
                        >
                          {shape.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs leading-relaxed text-white/75">
                      {regionHelp}
                    </p>
                  </>
                )}
                {!editingRegion && !showsPresets && (
                  <button
                    type="button"
                    className={fieldClass}
                    disabled={regionControlsDisabled}
                    onClick={() => setShowBefore(true)}
                  >
                    Editar área
                  </button>
                )}
                {kind === "blur" && !showsPresets && (
                  <button
                    type="button"
                    className="min-h-11 w-full rounded-lg border border-white/20 px-2 text-xs"
                    disabled={regionControlsDisabled}
                    onClick={() => selectRegionMode("preset")}
                  >
                    Voltar aos presets
                  </button>
                )}
              </div>
            )}
            <div
              className={`${detail ? "block max-h-80 overflow-auto" : "flex min-h-40 items-center justify-center overflow-hidden"} rounded-xl border border-white/10 bg-[repeating-conic-gradient(#263040_0%_25%,#374151_0%_50%)] bg-[length:20px_20px]`}
            >
              {source ? (
                <svg
                  role="img"
                  aria-label="Prévia da imagem e área de seleção"
                  viewBox={`0 0 ${shownDimensions!.width} ${shownDimensions!.height}`}
                  className={`${detail ? "max-w-none" : "max-h-[36dvh] w-full"} ${drawn ? "touch-none cursor-crosshair" : ""}`}
                  style={{
                    aspectRatio: `${shownDimensions!.width}/${shownDimensions!.height}`,
                    ...(detail
                      ? {
                          width: shownDimensions!.width,
                          height: shownDimensions!.height,
                        }
                      : {}),
                  }}
                  onPointerDown={event => {
                    if (!drawn || event.button !== 0 || !event.isPrimary)
                      return;
                    const point = pointAt(event, false);
                    if (point.some(value => value < 0 || value > 1)) return;
                    const handle = (event.target as Element).closest(
                      "[data-region-point]"
                    );
                    if (
                      kind === "crop" ||
                      (kind === "mask" && regionMode !== "polygon")
                    ) {
                      const areaHandle = (event.target as Element).closest(
                        "[data-area-handle]"
                      );
                      areaGesture.current = {
                        start: point,
                        frame: areaFrame ?? fullImageFrame,
                        handle:
                          (areaHandle?.getAttribute(
                            "data-area-handle"
                          ) as SelectionHandle | null) ?? "draw",
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    } else if (regionMode !== "polygon") {
                      regionGesture.current = { start: point };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    } else if (handle) {
                      const index = Number(
                        handle.getAttribute("data-region-point")
                      );
                      setSelectedPoint(index);
                      regionGesture.current = { start: point, index };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    } else if (points.length < 128) {
                      setPoints([...points, point]);
                      setSelectedPoint(points.length);
                    }
                  }}
                  onPointerMove={event => {
                    if (
                      !drawn ||
                      !event.currentTarget.hasPointerCapture(event.pointerId)
                    )
                      return;
                    const point = pointAt(event);
                    if (updateArea(point)) return;
                    const gesture = regionGesture.current;
                    if (!gesture) return;
                    if (gesture.index !== undefined)
                      movePoint(gesture.index, point);
                    else {
                      const region = dragRegionPoints(
                        regionMode,
                        gesture.start,
                        point,
                        source
                      );
                      if (region.length) setPoints(region);
                    }
                  }}
                  onPointerUp={event => {
                    if (areaGesture.current) updateArea(pointAt(event));
                    const gesture = regionGesture.current;
                    if (gesture && gesture.index === undefined) {
                      const region = dragRegionPoints(
                        regionMode,
                        gesture.start,
                        pointAt(event),
                        source
                      );
                      if (region.length) setPoints(region);
                    }
                    areaGesture.current = null;
                    regionGesture.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId
                      );
                  }}
                  onPointerCancel={() => {
                    areaGesture.current = null;
                    regionGesture.current = null;
                  }}
                  onLostPointerCapture={() => {
                    areaGesture.current = null;
                    regionGesture.current = null;
                  }}
                >
                  <image
                    href={shownImage}
                    width={shownDimensions!.width}
                    height={shownDimensions!.height}
                    preserveAspectRatio="xMidYMid meet"
                  />
                  {drawn && kind === "crop" && areaFrame && (
                    <rect
                      x={crop.x * source.width}
                      y={crop.y * source.height}
                      width={crop.width * source.width}
                      height={crop.height * source.height}
                      fill="rgba(251,146,60,.16)"
                      stroke="#fb923c"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  )}
                  {editingRegion && points.length > 0 && (
                    <>
                      {points.length >= 3 && (
                        <polygon
                          points={regionVertices}
                          fill="rgba(251,146,60,.24)"
                          stroke={crossedEdges ? "#fb7185" : "#fb923c"}
                          strokeDasharray="5 3"
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      )}
                      <polyline
                        points={regionVertices}
                        fill="none"
                        stroke={crossedEdges ? "#fb7185" : "#fdba74"}
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                      />
                      {regionMode === "polygon" &&
                        points.map(([x, y], index) => {
                          const active = selectedPoint === index;
                          return (
                            <g
                              key={index}
                              data-region-point={index}
                              transform={`translate(${x * source.width} ${y * source.height})`}
                              className={drawn ? "cursor-grab" : undefined}
                            >
                              <circle
                                r={source.width / 16}
                                fill="transparent"
                              />
                              <circle
                                r={source.width / 36}
                                fill={active ? "#fff7ed" : "#fb923c"}
                                stroke="#111827"
                                strokeWidth={2}
                                vectorEffect="non-scaling-stroke"
                              />
                              <text
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={source.width / 30}
                                fontWeight="700"
                                fill="#111827"
                                pointerEvents="none"
                              >
                                {index + 1}
                              </text>
                            </g>
                          );
                        })}
                    </>
                  )}
                  {drawn && areaFrame && (
                    <>
                      <circle
                        data-area-handle="move"
                        className="cursor-move"
                        cx={(areaFrame.x + areaFrame.width / 2) * source.width}
                        cy={
                          (areaFrame.y + areaFrame.height / 2) * source.height
                        }
                        r={Math.min(
                          source.width / 24,
                          (areaFrame.width * source.width) / 4,
                          (areaFrame.height * source.height) / 4
                        )}
                        fill="#fb923c"
                        fillOpacity=".7"
                        stroke="#111827"
                        vectorEffect="non-scaling-stroke"
                      />
                      {selectionCorners.map(corner => {
                        const [x, y] = frameCorner(areaFrame, corner);
                        return (
                          <circle
                            key={corner}
                            data-area-handle={corner}
                            style={{ cursor: `${corner}-resize` }}
                            cx={x * source.width}
                            cy={y * source.height}
                            r={Math.min(
                              source.width / 38,
                              (areaFrame.width * source.width) / 5,
                              (areaFrame.height * source.height) / 5
                            )}
                            fill="#fff7ed"
                            stroke="#fb923c"
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })}
                    </>
                  )}
                </svg>
              ) : (
                <p className="p-5 text-sm text-white/70">
                  {busy === "load" ? "Abrindo imagem…" : "Prévia indisponível"}
                </p>
              )}
            </div>
            {editingRegion && !showsPresets && (
              <fieldset
                disabled={regionControlsDisabled}
                className="mt-2 space-y-2"
              >
                <legend className="sr-only">Ajustar seleção</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {(regionMode === "rectangle" ||
                    (kind === "mask" && regionMode !== "polygon")) && (
                    <button
                      type="button"
                      className="min-h-11 rounded-lg border border-white/15 px-2 text-xs"
                      onClick={() => {
                        if (source)
                          setPoints(
                            dragRegionPoints(
                              regionMode,
                              centralRectangle[0],
                              centralRectangle[2],
                              source
                            )
                          );
                      }}
                    >
                      Marcar centro
                    </button>
                  )}
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-white/15 px-2 text-xs disabled:opacity-40"
                    disabled={!points.length}
                    onClick={clearRegion}
                  >
                    Limpar área
                  </button>
                </div>
                {regionMode === "polygon" && (
                  <div className="space-y-2">
                    <label className="block text-xs">
                      Ponto selecionado
                      <select
                        className={fieldClass}
                        value={selectedPoint ?? ""}
                        onChange={e =>
                          setSelectedPoint(
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
                          )
                        }
                      >
                        <option value="">Selecione um ponto</option>
                        {points.map((_, index) => (
                          <option key={index} value={index}>
                            {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedPoint !== null && (
                      <button
                        type="button"
                        className={fieldClass}
                        onClick={removeSelectedPoint}
                      >
                        Remover ponto {selectedPoint + 1}
                      </button>
                    )}
                    <details>
                      <summary className="cursor-pointer py-2 text-xs">
                        Ajuste por coordenadas
                      </summary>
                      <button
                        type="button"
                        disabled={points.length >= 128}
                        className={fieldClass}
                        onClick={addPointFromKeyboard}
                      >
                        Adicionar ponto
                      </button>
                      {selectedPoint !== null && points[selectedPoint] && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {numeric(
                            "Horizontal (%)",
                            Number((points[selectedPoint][0] * 100).toFixed(1)),
                            value =>
                              movePoint(selectedPoint, [
                                clamp(value / 100),
                                points[selectedPoint][1],
                              ]),
                            0,
                            100,
                            0.1
                          )}
                          {numeric(
                            "Vertical (%)",
                            Number((points[selectedPoint][1] * 100).toFixed(1)),
                            value =>
                              movePoint(selectedPoint, [
                                points[selectedPoint][0],
                                clamp(value / 100),
                              ]),
                            0,
                            100,
                            0.1
                          )}
                        </div>
                      )}
                    </details>
                  </div>
                )}
                <p role="status" className="text-xs text-orange-200">
                  {crossedEdges
                    ? "A borda se cruza. Reposicione ou remova um ponto."
                    : regionMode === "polygon" && points.length < 3
                      ? `${points.length} de 3 pontos para formar uma área.`
                      : !operation.success
                        ? "Marque uma área com largura e altura."
                        : "Área marcada. Gere a prévia para conferir."}
                </p>
              </fieldset>
            )}
            {showsPresets && blurPreset && blurPreset !== "full" && (
              <fieldset
                disabled={regionControlsDisabled}
                className="mt-2 rounded-lg border border-white/15 p-2"
              >
                {intensity(
                  "Suavização da borda",
                  presetFeather,
                  setPresetFeatherOverride,
                  0,
                  MAX_REGION_FEATHER,
                  0.5,
                  " px",
                  "Aumente para suavizar a passagem entre a área nítida e a desfocada."
                )}
              </fieldset>
            )}
            <p className="mt-2 text-xs text-white/60">
              A posição e o espaço da imagem no post serão mantidos. Recortar ou
              limpar bordas altera o enquadramento nesse espaço.
            </p>
          </div>
          <div className="min-w-0 space-y-4">
            <fieldset
              disabled={Boolean(busy) || !source || !available}
              className="space-y-4 disabled:opacity-60"
            >
              <legend className="sr-only">Ferramentas da imagem</legend>
              <div className="grid grid-cols-2 gap-2">
                {tools.map(tool => (
                  <button
                    key={tool.kind}
                    type="button"
                    aria-pressed={kind === tool.kind}
                    onClick={() => {
                      if (
                        tool.kind !== kind &&
                        (tool.kind === "blur" || tool.kind === "mask")
                      ) {
                        setRegionMode(
                          tool.kind === "blur" ? "preset" : "rectangle"
                        );
                        clearRegion();
                      }
                      setKind(tool.kind);
                      setError("");
                      if (
                        !["crop", "mask", "blur", "resize"].includes(tool.kind)
                      )
                        requestAutoPreview(v => v + 1);
                    }}
                    className="min-h-11 rounded-lg border border-white/15 px-2 text-xs aria-pressed:border-orange-400 aria-pressed:bg-orange-400/10"
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              {kind === "black-white" && (
                <p className="text-xs">
                  Conversão clássica, preservando as dimensões da imagem.
                </p>
              )}
              {kind === "duotone" && (
                <div className="space-y-2">
                  <p className="text-xs text-white/60">
                    As sombras recebem a primeira cor e os realces recebem a
                    segunda.
                  </p>
                  <div
                    aria-hidden="true"
                    className="h-6 rounded-lg border border-white/20"
                    style={{
                      background: `linear-gradient(to right, ${dark}, ${light})`,
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["Cor das sombras", dark, setDark],
                        ["Cor dos realces", light, setLight],
                      ] as const
                    ).map(([label, value, setter]) => (
                      <label key={label} className="block text-xs">
                        {label}
                        <input
                          type="color"
                          aria-label={label}
                          className="h-11 w-full"
                          value={value}
                          onChange={e => setter(e.target.value)}
                          onBlur={() => requestAutoPreview(v => v + 1)}
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      className={fieldClass}
                      onClick={() => {
                        setDark(light);
                        setLight(dark);
                        requestAutoPreview(v => v + 1);
                      }}
                    >
                      Inverter cores
                    </button>
                    {postColors?.length === 2 && (
                      <button
                        type="button"
                        className={fieldClass}
                        onClick={() => {
                          const [darkest, lightest] = [...postColors].sort(
                            (a, b) =>
                              contrastRatio(b, "#ffffff") -
                              contrastRatio(a, "#ffffff")
                          );
                          setDark(darkest);
                          setLight(lightest);
                          requestAutoPreview(v => v + 1);
                        }}
                      >
                        Usar cores do post
                      </button>
                    )}
                  </div>
                </div>
              )}
              {kind === "shadows-highlights" && (
                <div className="space-y-2">
                  {intensity(
                    "Abrir sombras",
                    shadows,
                    setShadows,
                    0,
                    100,
                    1,
                    "%",
                    "Clareia regiões escuras para mostrar mais detalhes."
                  )}
                  {intensity(
                    "Abaixar realces",
                    highlights,
                    setHighlights,
                    0,
                    100,
                    1,
                    "%",
                    "Atenua áreas claras. O resultado depende do detalhe presente na foto."
                  )}
                </div>
              )}
              {kind === "look" && (
                <div className="space-y-2 text-xs">
                  <div
                    role="group"
                    aria-label="Looks"
                    className="grid grid-cols-2 gap-2"
                  >
                    {LOOKS.map(({ id, label, filter }) => {
                      const rendered =
                        currentPreview?.input.operation.kind === "look" &&
                        currentPreview.input.operation.preset === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={look === id}
                          className="min-h-11 overflow-hidden rounded-lg border border-white/20 text-left aria-pressed:border-orange-400 aria-pressed:bg-orange-400/10"
                          onClick={() => {
                            setLook(id);
                            setShowBefore(false);
                            requestAutoPreview(v => v + 1);
                          }}
                        >
                          {source && (
                            <img
                              className="h-20 w-full object-cover"
                              alt=""
                              src={
                                rendered
                                  ? currentPreview.result.imageData
                                  : source.imageData
                              }
                              style={rendered ? undefined : { filter }}
                            />
                          )}
                          <span className="block px-2 py-2">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-white/60">
                    As miniaturas são uma referência. Confira as cores finais na
                    prancheta.
                  </p>
                </div>
              )}
              {kind === "iris" && (
                <p className="text-xs">
                  Centro nítido com bordas desfocadas. Não reconhece o assunto
                  da foto.
                </p>
              )}
              {kind === "grain" && (
                <div className="space-y-2">
                  {intensity(
                    "Granulação",
                    grain,
                    setGrain,
                    0,
                    100,
                    1,
                    "%",
                    "Grão fino, mesmo no máximo."
                  )}
                  {source && (
                    <div
                      className="grid grid-cols-2 gap-2"
                      aria-label="Comparação de granulação em tamanho real"
                    >
                      {[
                        { label: "Original", image: source.imageData },
                        {
                          label: "Prévia",
                          image: currentPreview?.result.imageData,
                        },
                      ].map(({ label, image }) => (
                        <div key={label} className="min-w-0 space-y-1 text-xs">
                          <p>{label} · 100%</p>
                          <div className="relative h-20 overflow-hidden rounded-lg border border-white/15 bg-[#242a35]">
                            {image ? (
                              <img
                                alt=""
                                src={image}
                                className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
                                style={{
                                  width: source.width,
                                  height: source.height,
                                }}
                              />
                            ) : (
                              <p className="p-2 text-white/60">
                                {busy === "preview"
                                  ? "Atualizando…"
                                  : "Sem prévia"}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {kind === "adjust" && (
                <div className="space-y-3">
                  {intensity("Brilho", brightness, setBrightness, -100, 100)}
                  {intensity("Contraste", contrast, setContrast, -100, 100)}
                  {intensity(
                    "Saturação",
                    saturation,
                    setSaturation,
                    -100,
                    100,
                    1,
                    "",
                    "−100 remove as cores; 0 mantém a cor original."
                  )}
                  <button
                    type="button"
                    disabled={!brightness && !contrast && !saturation}
                    className="min-h-11 rounded-lg border border-white/15 px-2 text-xs disabled:opacity-40"
                    onClick={() => {
                      setBrightness(0);
                      setContrast(0);
                      setSaturation(0);
                      requestAutoPreview(v => v + 1);
                    }}
                  >
                    Zerar ajustes
                  </button>
                </div>
              )}
              {kind === "crop" && (
                <>
                  <p className="text-xs text-white/70">
                    Arraste para desenhar. Use o centro para mover ou as alças
                    para redimensionar. Os campos abaixo permitem ajuste fino.
                  </p>
                  <button
                    type="button"
                    className={fieldClass}
                    onClick={() => {
                      setCrop(fullImageFrame);
                      setCropRatio(0);
                      setShowBefore(true);
                    }}
                  >
                    Voltar à imagem inteira
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    {numeric(
                      "Esquerda (%)",
                      percent(crop.x),
                      v => {
                        setShowBefore(true);
                        setCrop(c => ({ ...c, x: v / 100 }));
                      },
                      0,
                      100,
                      0.1,
                      cropIssue(crop.x, 0, 1 - crop.width)
                    )}
                    {numeric(
                      "Topo (%)",
                      percent(crop.y),
                      v => {
                        setShowBefore(true);
                        setCrop(c => ({ ...c, y: v / 100 }));
                      },
                      0,
                      100,
                      0.1,
                      cropIssue(crop.y, 0, 1 - crop.height)
                    )}
                    {numeric(
                      "Largura (%)",
                      percent(crop.width),
                      v => {
                        setShowBefore(true);
                        setCrop(c => ({
                          ...c,
                          width: v / 100,
                          height: normalizedCropRatio
                            ? v / 100 / normalizedCropRatio
                            : c.height,
                        }));
                      },
                      0.1,
                      100,
                      0.1,
                      cropIssue(crop.width, MIN_CROP_SIDE, 1 - crop.x)
                    )}
                    {numeric(
                      "Altura (%)",
                      percent(crop.height),
                      v => {
                        setShowBefore(true);
                        setCrop(c => ({
                          ...c,
                          height: v / 100,
                          width: normalizedCropRatio
                            ? (v / 100) * normalizedCropRatio
                            : c.width,
                        }));
                      },
                      0.1,
                      100,
                      0.1,
                      cropIssue(crop.height, MIN_CROP_SIDE, 1 - crop.y)
                    )}
                  </div>
                </>
              )}
              {kind === "resize" && (
                <>
                  <p className="text-xs text-white/70">
                    Altera a resolução do arquivo. O espaço da foto no post
                    permanece igual.
                  </p>
                  {source && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-white/5 p-2 text-xs">
                      <span>Original · {dimensionsLabel(source)}</span>
                      <span>
                        Resultado ·{" "}
                        {resizeIssue(width) || resizeIssue(height)
                          ? "—"
                          : dimensionsLabel({ width, height })}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {numeric(
                      "Largura (px)",
                      width,
                      v => {
                        setWidth(v);
                        if (keepRatio && source)
                          setHeight(
                            Math.max(
                              1,
                              Math.round((v * source.height) / source.width)
                            )
                          );
                      },
                      1,
                      IMAGE_EDITOR_MAX_DIMENSION,
                      1,
                      resizeIssue(width)
                    )}
                    {numeric(
                      "Altura (px)",
                      height,
                      v => {
                        setHeight(v);
                        if (keepRatio && source)
                          setWidth(
                            Math.max(
                              1,
                              Math.round((v * source.width) / source.height)
                            )
                          );
                      },
                      1,
                      IMAGE_EDITOR_MAX_DIMENSION,
                      1,
                      resizeIssue(height)
                    )}
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={keepRatio}
                      onChange={e => setKeepRatio(e.target.checked)}
                    />
                    Manter proporção
                  </label>
                </>
              )}
              {(kind === "mask" || kind === "blur") && (
                <>
                  {kind === "mask" && (
                    <div
                      role="group"
                      aria-label="Bordas da máscara"
                      className="grid grid-cols-3 gap-2"
                    >
                      {maskFeatherValues.map(({ label, value }) => (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={feather === value}
                          className="min-h-11 rounded-lg border border-white/15 text-xs aria-pressed:border-orange-400 aria-pressed:bg-orange-400/10"
                          onClick={() => {
                            setFeather(value);
                            requestAutoPreview(v => v + 1);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!showsPresets &&
                    intensity(
                      "Suavização da borda",
                      feather,
                      setFeather,
                      0,
                      MAX_REGION_FEATHER,
                      0.5,
                      " px"
                    )}
                  {kind === "blur" &&
                    intensity(
                      "Desfoque da região",
                      radius,
                      setRadius,
                      0.5,
                      30,
                      0.5,
                      " px"
                    )}
                </>
              )}
              {kind === "trim" && (
                <div className="space-y-2 text-xs text-white/70">
                  <p>Remove margens totalmente transparentes.</p>
                  {currentPreview && source && !trimsNothing && (
                    <p>
                      {source.width -
                        currentPreview.result.resultDimensions.width}{" "}
                      px removidos na largura e{" "}
                      {source.height -
                        currentPreview.result.resultDimensions.height}{" "}
                      px na altura.
                    </p>
                  )}
                </div>
              )}
              <label className="block text-xs">
                <span className="mb-1 block">Formato do resultado</span>
                <select
                  aria-label="Formato do resultado"
                  className={fieldClass}
                  value={formatChoice}
                  onChange={e => {
                    setFormatChoice(e.target.value as typeof formatChoice);
                    if (currentPreview) requestAutoPreview(v => v + 1);
                  }}
                >
                  <option className="bg-[#10131c]" value="auto">
                    Padrão (PNG)
                  </option>
                  <option className="bg-[#10131c]" value="png">
                    PNG
                  </option>
                  <option className="bg-[#10131c]" value="webp">
                    WebP
                  </option>
                </select>
              </label>
            </fieldset>
            {restoreButton}
            <button
              type="button"
              disabled={!currentPreview || Boolean(noChange) || Boolean(busy)}
              onClick={() => {
                if (!currentPreview || noChange) return;
                const a = document.createElement("a");
                a.href = currentPreview.result.imageData;
                a.download = `imagem-editada.${currentPreview.result.format}`;
                a.click();
              }}
              className="min-h-11 w-full rounded-lg border border-white/15 px-3 text-xs disabled:opacity-40"
            >
              Baixar prévia
            </button>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        {overLimit && (
          <p role="alert" className="text-xs text-amber-200">
            Este tratamento aceita até {limit} px por eixo. Use Dimensões para
            reduzir a imagem primeiro.
          </p>
        )}
        {source &&
          !operation.success &&
          !busy &&
          !hasRegionTool &&
          kind !== "crop" &&
          kind !== "resize" && (
            <p className="mt-3 text-xs text-orange-200">
              Confira os valores e os limites da imagem.
            </p>
          )}
      </div>
      <footer className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-white/10 bg-[#151515] p-2">
        <p role="status" className="col-span-2 text-xs text-orange-200">
          {busy === "preview"
            ? "Preparando prévia…"
            : busy === "apply"
              ? "Aplicando edição…"
              : trimsNothing
                ? isConversion
                  ? "Nenhuma margem transparente encontrada. A prévia está pronta para converter o formato."
                  : "Nenhuma margem transparente encontrada."
                : source && neutral && !isConversion
                  ? kind === "crop"
                    ? "Imagem inteira selecionada. Arraste para recortar ou escolha uma proporção."
                    : "Sem alterações."
                  : currentPreview
                    ? showBefore
                      ? "Mostrando o original."
                      : "Prévia na prancheta · ainda não aplicada."
                    : showsPresets && !blurPreset
                      ? "Escolha um preset ou personalize a área."
                      : "Ajuste os controles. Aplicar confirma a edição."}
        </p>
        <button
          type="button"
          disabled={!currentPreview || Boolean(noChange) || Boolean(busy)}
          aria-pressed={showBefore}
          onClick={() => setShowBefore(v => !v)}
          className="min-h-11 rounded-lg border border-white/15 px-2 text-xs"
        >
          {showBefore ? "Ver prévia" : "Ver original"}
        </button>
        <button
          type="button"
          onClick={() => close(false)}
          className="min-h-11 rounded-lg border border-white/15 px-2 text-xs"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void generatePreview()}
          disabled={
            Boolean(busy) ||
            !available ||
            !source ||
            !operation.success ||
            cropTooSmall ||
            (neutral && !isConversion) ||
            crossedEdges ||
            overLimit
          }
          className="min-h-11 rounded-lg border border-orange-400/40 px-4 text-sm text-orange-200 disabled:opacity-40"
        >
          Gerar prévia
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={Boolean(busy) || !currentPreview || Boolean(noChange)}
          className="min-h-11 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black disabled:opacity-40"
        >
          Aplicar
        </button>
      </footer>
    </div>
  );
  if (embedded) return content;
  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/80" />
        <Dialog.Content className="fixed inset-4 z-[91] overflow-y-auto rounded-2xl bg-[#10131c] p-4 text-white">
          <Dialog.Title>Editor avançado</Dialog.Title>
          <Dialog.Description>
            {target?.label} · Confira a prévia antes de aplicar.
          </Dialog.Description>
          <Dialog.Close aria-label="Fechar editor avançado">
            <X size={20} />
          </Dialog.Close>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
