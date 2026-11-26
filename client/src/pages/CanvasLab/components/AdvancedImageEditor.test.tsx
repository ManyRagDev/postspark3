// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  capabilities: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("../lib/advancedImageEditing", () => ({
  readAdvancedImage: mocks.read,
}));
vi.mock("@/lib/imageEditorApi", () => ({
  imageEditorApi: {
    imageEditor: {
      capabilities: { query: mocks.capabilities },
      preview: { mutate: mocks.preview },
    },
  },
}));
import AdvancedImageEditor from "./AdvancedImageEditor";
const target = {
  postId: "p",
  slideId: "s",
  slotId: "image",
  label: "Foto",
  url: "data:image/png;base64,test",
  locked: false,
};
const returned = {
  requestId: "preview",
  imageData: "data:image/png;base64,preview",
  sourceSha256: "a".repeat(64),
  resultSha256: "b".repeat(64),
  sourceDimensions: { width: 600, height: 600 },
  resultDimensions: { width: 600, height: 600 },
  format: "png",
};
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.read.mockResolvedValue({
    imageData: target.url,
    width: 600,
    height: 600,
  });
  mocks.capabilities.mockResolvedValue({ available: true });
  mocks.preview.mockResolvedValue(returned);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find(
    b => b.textContent?.trim() === text
  )!;
const props = () => ({
  open: true,
  target,
  originalAvailable: false,
  onOpenChange: vi.fn(),
  isCurrent: vi.fn(() => true),
  onApply: vi.fn(async () => true),
  onRestore: vi.fn(() => true),
});
describe("advanced image preview/apply boundary", () => {
  it("explains why treatments are offline and retries the same image", async () => {
    mocks.capabilities.mockResolvedValueOnce({
      available: false, tools: [], message: "O processamento de imagens não está configurado neste ambiente.",
    });
    await act(async () => root.render(<AdvancedImageEditor {...props()} embedded />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("não está configurado");
    expect(container.querySelector('[aria-label="Brilho"]')).toBeNull();
    expect(mocks.preview).not.toHaveBeenCalled();
    await act(async () => button("Tentar novamente").click());
    expect(container.querySelector('[aria-label="Brilho"]')).not.toBeNull();
    await act(async () => moveSlider("Brilho", 30));
    expect(button("Aplicar").disabled).toBe(false);
  });
  it("reports an unreadable source independently of processor availability", async () => {
    mocks.read.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await act(async () => root.render(<AdvancedImageEditor {...props()} embedded />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ler a imagem de origem");
    expect(button("Tentar novamente")).toBeDefined();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("requires a preview, exposes only approved tools, invalidates it when controls change and hides internal engine names", async () => {
    const p = props();
    await act(async () => root.render(<AdvancedImageEditor {...p} />));
    expect(button("Aplicar").disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "Novos recursos serão adicionados"
    );
    expect(document.body.textContent).not.toMatch(
      /photocraft|remover fundo|clonagem/i
    );
    act(() => moveSlider("Brilho", 40, false));
    await act(async () => button("Gerar prévia").click());
    expect(button("Aplicar").disabled).toBe(false);
    expect(p.onApply).not.toHaveBeenCalled();
    act(() => button("Dimensões").click());
    expect(button("Aplicar").disabled).toBe(true);
  });
  it("commits only after explicit apply and closes after the confirmed document mutation", async () => {
    const p = props();
    await act(async () => root.render(<AdvancedImageEditor {...p} />));
    act(() => moveSlider("Brilho", 40, false));
    await act(async () => button("Gerar prévia").click());
    await act(async () => button("Aplicar").click());
    expect(p.onApply).toHaveBeenCalledWith(
      expect.objectContaining({ imageData: target.url }),
      returned,
      expect.any(AbortSignal)
    );
    expect(p.onOpenChange).toHaveBeenLastCalledWith(false);
  });
  it("cancels in-flight work without applying and rejects a late result for a changed document", async () => {
    let finish: (r: any) => void = () => {};
    mocks.preview.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const p = props();
    await act(async () => root.render(<AdvancedImageEditor {...p} />));
    act(() => moveSlider("Brilho", 40, false));
    await act(async () => button("Gerar prévia").click());
    const signal = mocks.preview.mock.calls[0][1].signal;
    act(() => button("Cancelar").click());
    expect(signal.aborted).toBe(true);
    await act(async () => finish(returned));
    expect(p.onApply).not.toHaveBeenCalled();
  });
  it("does not apply a response after the current document changed", async () => {
    let finish: (r: any) => void = () => {};
    mocks.preview.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const p = props();
    await act(async () => root.render(<AdvancedImageEditor {...p} />));
    act(() => moveSlider("Brilho", 40, false));
    await act(async () => button("Gerar prévia").click());
    p.isCurrent.mockReturnValue(false);
    await act(async () => finish(returned));
    expect(button("Aplicar").disabled).toBe(true);
    expect(document.body.textContent).toContain("A peça mudou");
    expect(p.onApply).not.toHaveBeenCalled();
  });
});

function moveSlider(label: string, value: number, release = true) {
  const slider = document.querySelector(
    `input[type="range"][aria-label="${label}"]`
  ) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!.call(slider, String(value));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  slider.dispatchEvent(new Event("change", { bubbles: true }));
  if (release) slider.dispatchEvent(new Event("pointerup", { bubbles: true }));
}
it("uses explicit signed sliders and processes once on release, not for each movement", async () => {
  const p = props();
  await act(async () => root.render(<AdvancedImageEditor {...p} embedded />));
  const slider = document.querySelector(
    'input[type="range"][aria-label="Brilho"]'
  )!;
  expect(slider.getAttribute("min")).toBe("-100");
  expect(slider.getAttribute("max")).toBe("100");
  await act(async () => moveSlider("Brilho", 40, false));
  await act(async () => moveSlider("Brilho", 100, false));
  expect(mocks.preview).not.toHaveBeenCalled();
  await act(async () =>
    slider.dispatchEvent(new Event("pointerup", { bubbles: true }))
  );
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(mocks.preview.mock.calls[0][0].operation).toEqual({
    kind: "adjust",
    brightness: 150,
    contrast: 0,
    saturation: 0,
  });
  expect(p.onApply).not.toHaveBeenCalled();
});
it("shows the real preview on the canvas callback and clears it for original comparison or cancel", async () => {
  const p = props(),
    onPreviewChange = vi.fn();
  await act(async () =>
    root.render(
      <AdvancedImageEditor {...p} embedded onPreviewChange={onPreviewChange} />
    )
  );
  act(() => moveSlider("Brilho", 40, false));
  await act(async () => button("Gerar prévia").click());
  expect(onPreviewChange).toHaveBeenLastCalledWith({
    result: returned,
    operation: expect.objectContaining({ kind: "adjust" }),
  });
  act(() => button("Ver original").click());
  expect(onPreviewChange).toHaveBeenLastCalledWith(null);
  act(() => button("Ver prévia").click());
  expect(onPreviewChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ result: returned })
  );
  act(() => button("Cancelar").click());
  expect(p.onApply).not.toHaveBeenCalled();
  expect(onPreviewChange).toHaveBeenLastCalledWith(null);
});
it("renders crop preview at its output aspect ratio and restores the source ratio for Before", async () => {
  mocks.preview.mockResolvedValue({
    ...returned,
    resultDimensions: { width: 300, height: 150 },
  });
  await act(async () =>
    root.render(<AdvancedImageEditor {...props()} embedded />)
  );
  act(() => button("Recortar").click());
  expect(button("Gerar prévia").disabled).toBe(true);
  act(() => button("4:5").click());
  await act(async () => button("Gerar prévia").click());
  expect(
    document.querySelector('svg[role="img"]')!.getAttribute("viewBox")
  ).toBe("0 0 300 150");
  expect(
    document.querySelector('svg[role="img"] image')!.getAttribute("width")
  ).toBe("300");
  expect(
    document.querySelector('svg[role="img"] image')!.getAttribute("height")
  ).toBe("150");
  act(() => button("Antes").click());
  expect(
    document.querySelector('svg[role="img"]')!.getAttribute("viewBox")
  ).toBe("0 0 600 600");
});
it("shows the fine grain comparison and will not prepare or apply a neutral edit", async () => {
  mocks.capabilities.mockResolvedValue({
    available: true,
    tools: [{ kind: "grain", label: "Granulação" }],
  });
  await act(async () =>
    root.render(<AdvancedImageEditor {...props()} embedded />)
  );
  await act(async () => button("Granulação").click());
  expect(mocks.preview.mock.calls[0][0].operation).toMatchObject({
    kind: "grain",
    amount: 1.5,
  });
  expect(document.body.textContent).toContain("Prévia · 100%");
  await act(async () => moveSlider("Granulação", 0));
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  expect(button("Aplicar").disabled).toBe(true);
  expect(button("Gerar prévia").disabled).toBe(true);
  expect(document.body.textContent).toContain("Sem alterações.");
});

it("previews a rectangle and returns to the marked area after clicking Editar área", async () => {
  const onPreviewChange = vi.fn();
  const p = props();
  await act(async () =>
    root.render(
      <AdvancedImageEditor {...p} embedded onPreviewChange={onPreviewChange} />
    )
  );
  act(() => button("Desfocar").click());
  act(() => button("Personalizar área").click());
  expect(button("Retângulo").getAttribute("aria-pressed")).toBe("true");
  expect(button("Gerar prévia").disabled).toBe(true);
  act(() => button("Marcar centro").click());
  await act(async () => button("Gerar prévia").click());
  const edit = mocks.preview.mock.calls[0][0].operation;
  expect(edit).toMatchObject({
    kind: "blur",
    points: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.75, 0.75],
      [0.25, 0.75],
    ],
  });
  act(() => button("Editar área").click());
  expect(onPreviewChange).toHaveBeenLastCalledWith(null);
  expect(document.querySelector("svg polygon")).not.toBeNull();
  act(() => button("Limpar área").click());
  expect(button("Gerar prévia").disabled).toBe(true);
  expect(button("Aplicar").disabled).toBe(true);
  expect(p.onApply).not.toHaveBeenCalled();
});

it("selects an existing point without adding a duplicate and removes the selected point", async () => {
  await act(async () =>
    root.render(<AdvancedImageEditor {...props()} embedded />)
  );
  act(() => button("Desfocar").click());
  act(() => button("Personalizar área").click());
  act(() => button("Por pontos").click());
  const svg = document.querySelector("svg[role='img']")! as SVGSVGElement;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 600,
    height: 600,
  } as DOMRect);
  vi.spyOn(svg, "getScreenCTM").mockReturnValue(null);
  svg.setPointerCapture = vi.fn();
  const clickImage = (target: Element, clientX: number, clientY: number) =>
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        isPrimary: true,
        pointerId: 1,
        clientX,
        clientY,
      })
    );
  for (const [x, y] of [
    [100, 100],
    [500, 100],
    [500, 500],
    [100, 500],
  ])
    act(() => clickImage(svg, x, y));
  act(() =>
    clickImage(svg.querySelector("[data-region-point='1'] circle")!, 500, 100)
  );
  expect(svg.querySelectorAll("[data-region-point]")).toHaveLength(4);
  act(() => button("Remover ponto 2").click());
  expect(svg.querySelectorAll("[data-region-point]")).toHaveLength(3);
  await act(async () => button("Gerar prévia").click());
  expect(mocks.preview.mock.calls[0][0].operation.points).toEqual([
    [1 / 6, 1 / 6],
    [5 / 6, 5 / 6],
    [1 / 6, 5 / 6],
  ]);
});

it("previews the selected blur preset automatically and leaves manual shapes in Personalizar área", async () => {
  const p = props();
  await act(async () => root.render(<AdvancedImageEditor {...p} embedded />));
  act(() => button("Desfocar").click());
  expect(button("Retângulo")).toBeUndefined();
  await act(async () => button("Foto inteira").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation).toMatchObject({
    kind: "blur",
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    feather: 0,
  });
  await act(async () => button("Faixa inferior").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation).toMatchObject({
    feather: 24,
    points: [
      [0, 0.65],
      [1, 0.65],
      [1, 1],
      [0, 1],
    ],
  });
  await act(async () => moveSlider("Suavização da borda", 8));
  expect(mocks.preview.mock.calls.at(-1)![0].operation.feather).toBe(8);
  await act(async () => button("Faixa superior").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation.feather).toBe(8);
  await act(async () => button("Foto inteira").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation.feather).toBe(0);
  expect(
    document.querySelector('input[aria-label="Suavização da borda"]')
  ).toBeNull();
  expect(p.onApply).not.toHaveBeenCalled();
  act(() => button("Personalizar área").click());
  for (const label of ["Retângulo", "Círculo", "Elipse", "Por pontos"])
    expect(button(label)).toBeDefined();
});

it.each([
  ["Círculo", 250, 250],
  ["Elipse", 800, 250],
])(
  "draws %s in original pixels on a wide image",
  async (shape, expectedWidth, expectedHeight) => {
    mocks.read.mockResolvedValue({
      imageData: target.url,
      width: 1000,
      height: 500,
    });
    mocks.preview.mockResolvedValue({
      ...returned,
      sourceDimensions: { width: 1000, height: 500 },
      resultDimensions: { width: 1000, height: 500 },
    });
    await act(async () =>
      root.render(<AdvancedImageEditor {...props()} embedded />)
    );
    act(() => button("Desfocar").click());
    act(() => button("Personalizar área").click());
    act(() => button(shape).click());
    const svg = document.querySelector("svg[role='img']")! as SVGSVGElement;
    vi.spyOn(svg, "getScreenCTM").mockReturnValue(null);
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    } as DOMRect);
    svg.setPointerCapture = vi.fn();
    svg.releasePointerCapture = vi.fn();
    svg.hasPointerCapture = vi.fn(() => true);
    act(() =>
      svg.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          isPrimary: true,
          clientX: 900,
          clientY: 375,
        })
      )
    );
    act(() =>
      svg.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          isPrimary: true,
          clientX: 100,
          clientY: 125,
        })
      )
    );
    await act(async () => button("Gerar prévia").click());
    const operation = mocks.preview.mock.calls[0][0].operation;
    expect(operation.points).toHaveLength(48);
    expect(
      (operation.points[0][0] - operation.points[24][0]) * 1000
    ).toBeCloseTo(expectedWidth);
    expect(
      (operation.points[12][1] - operation.points[36][1]) * 500
    ).toBeCloseTo(expectedHeight);
  }
);

function setField(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`
  )!;
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function dragImage(
  from: [number, number],
  to: [number, number],
  handle?: string
) {
  const svg = document.querySelector<SVGSVGElement>('svg[role="img"]')!;
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 600, height: 600 }) as DOMRect;
  svg.getScreenCTM = () => null;
  svg.setPointerCapture = vi.fn();
  svg.hasPointerCapture = vi.fn(() => true);
  svg.releasePointerCapture = vi.fn();
  const dispatch = (
    type: string,
    element: Element,
    [clientX, clientY]: [number, number]
  ) =>
    element.dispatchEvent(
      new PointerEvent(type, {
        isPrimary: true,
        pointerId: 1,
        bubbles: true,
        clientX,
        clientY,
      })
    );
  act(() =>
    dispatch(
      "pointerdown",
      handle ? svg.querySelector(`[data-area-handle="${handle}"]`)! : svg,
      from
    )
  );
  act(() => dispatch("pointermove", svg, to));
  act(() => dispatch("pointerup", svg, to));
}

it("reopens crop handles on the original, validates the edited bounds, and applies only the new preview", async () => {
  const p = props();
  mocks.preview
    .mockResolvedValueOnce({
      ...returned,
      resultDimensions: { width: 300, height: 300 },
    })
    .mockResolvedValueOnce({
      ...returned,
      resultDimensions: { width: 390, height: 380 },
    });
  await act(async () => root.render(<AdvancedImageEditor {...p} embedded />));
  act(() => button("Recortar").click());
  expect(button("Gerar prévia").disabled).toBe(true);
  dragImage([90, 70], [390, 370]);
  await act(async () => button("Gerar prévia").click());
  expect(document.body.textContent).toContain("Prévia · 300 × 300 px");
  act(() => button("Editar recorte").click());
  expect(document.body.textContent).toContain("Original · 600 × 600 px");
  dragImage([390, 370], [480, 450], "se");
  expect(button("Aplicar").disabled).toBe(true);
  expect(
    document.querySelector<HTMLInputElement>('input[aria-label="Largura (%)"]')!
      .value
  ).toBe("65");
  act(() => setField("Esquerda (%)", "50"));
  expect(
    document
      .querySelector('input[aria-label="Esquerda (%)"]')!
      .getAttribute("aria-invalid")
  ).toBe("true");
  expect(button("Gerar prévia").disabled).toBe(true);
  act(() => setField("Esquerda (%)", "15"));
  await act(async () => button("Gerar prévia").click());
  await act(async () => button("Aplicar").click());
  expect(p.onApply).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: {
        kind: "crop",
        x: 0.15,
        y: 70 / 600,
        width: 0.65,
        height: 450 / 600 - 70 / 600,
      },
    }),
    expect.objectContaining({ resultDimensions: { width: 390, height: 380 } }),
    expect.any(AbortSignal)
  );
});

it("reports unchanged trim and permits a deliberate format conversion", async () => {
  const p = props();
  await act(async () => root.render(<AdvancedImageEditor {...p} embedded />));
  await act(async () => button("Limpar bordas").click());
  expect(document.body.textContent).toContain(
    "Nenhuma margem transparente encontrada."
  );
  expect(button("Aplicar").disabled).toBe(true);
  const format = document.querySelector<HTMLSelectElement>(
    'select[aria-label="Formato do resultado"]'
  )!;
  mocks.preview.mockResolvedValue({ ...returned, format: "webp" });
  await act(async () => {
    format.value = "webp";
    format.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(mocks.preview.mock.calls.at(-1)![0].format).toBe("webp");
  expect(button("Aplicar").disabled).toBe(false);
});

it("validates resize dimensions inline and shows the proposed resolution before rendering", async () => {
  await act(async () =>
    root.render(<AdvancedImageEditor {...props()} embedded />)
  );
  act(() => button("Dimensões").click());
  act(() => setField("Largura (px)", "4000"));
  expect(
    document
      .querySelector('input[aria-label="Largura (px)"]')!
      .getAttribute("aria-invalid")
  ).toBe("true");
  expect(button("Gerar prévia").disabled).toBe(true);
  act(() => setField("Largura (px)", "320"));
  expect(document.body.textContent).toContain("Resultado · 320 × 320 px");
  expect(button("Gerar prévia").disabled).toBe(false);
});

it("applies post colors and inversion in a single gesture each, and previews both look cards", async () => {
  mocks.capabilities.mockResolvedValue({
    available: true,
    tools: [
      { kind: "duotone", label: "Duotone" },
      { kind: "look", label: "Looks" },
    ],
  });
  await act(async () =>
    root.render(
      <AdvancedImageEditor
        {...props()}
        embedded
        palette={["#efcdab", "#012345"]}
      />
    )
  );
  await act(async () => button("Duotone").click());
  await act(async () => button("Usar cores do post").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation).toEqual({
    kind: "duotone",
    dark: "#012345",
    light: "#efcdab",
  });
  await act(async () => button("Inverter cores").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation).toEqual({
    kind: "duotone",
    dark: "#efcdab",
    light: "#012345",
  });
  await act(async () => button("Looks").click());
  expect(button("Zerar ajustes")).toBeUndefined();
  expect(button("Quente").querySelector("img")).not.toBeNull();
  await act(async () => button("Cinema").click());
  expect(mocks.preview.mock.calls.at(-1)![0].operation).toEqual({
    kind: "look",
    preset: "teal-orange",
  });
});
