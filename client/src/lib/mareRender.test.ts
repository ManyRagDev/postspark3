import { afterEach, expect, it, vi } from "vitest";
import { renderSlideOnServer } from "./mareRender";
import { INITIAL_POST } from "@/pages/CanvasLab/components/types";
afterEach(() => vi.unstubAllGlobals());
it("reabre uma exportação entregue sem consumir outra unidade", async () => {
  const download = new Blob(["vídeo"], { type: "video/mp4" });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ id: "ready", remaining: 0, limit: 10 })
    )
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(new Response(download));
  vi.stubGlobal("fetch", fetch);
  expect(await (await renderSlideOnServer(INITIAL_POST, 0)).text()).toBe(
    "vídeo"
  );
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "/api/mare/processor/render?quote=1",
    "/api/mare/processor/jobs/ready",
    "/api/mare/processor/jobs/ready/result",
  ]);
});
it("preserva a franquia se a pessoa cancelar antes de entrar na fila", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ remaining: 4, limit: 10 }));
  vi.stubGlobal("fetch", fetch);
  const confirm = vi.fn(() => false);
  vi.stubGlobal("window", { confirm });
  await expect(renderSlideOnServer(INITIAL_POST, 0)).rejects.toThrow(
    "cancelada"
  );
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("4 exportações")
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
