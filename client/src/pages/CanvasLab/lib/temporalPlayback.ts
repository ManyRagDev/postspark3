import { useCallback, useEffect, useRef, useState } from "react";
import {
  temporalInterval,
  type CanvasTemporalMedia,
  type CanvasTemporalSource,
} from "@shared/canvasTemporalMedia";

export type TemporalClip = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  source: CanvasTemporalSource;
};
const sources = new WeakMap<HTMLCanvasElement, TemporalClip>();
export function temporalClipFromImage(image: HTMLCanvasElement) {
  return sources.get(image);
}
export function mediaWidth(element: HTMLImageElement | HTMLCanvasElement) {
  return "naturalWidth" in element ? element.naturalWidth : element.width;
}
export function mediaHeight(element: HTMLImageElement | HTMLCanvasElement) {
  return "naturalHeight" in element ? element.naturalHeight : element.height;
}
function paint(clip: TemporalClip, visible: boolean) {
  const { canvas, video } = clip;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("A superfície de vídeo não está disponível.");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (visible && video.readyState >= 2)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}
const positioned = new WeakSet<HTMLVideoElement>();

function seek(video: HTMLVideoElement, target: number) {
  // A loaded video can report zero before its decoder has presented the first frame.
  if (!positioned.has(video) && target === 0)
    target = Math.min(0.001, video.duration / 2);
  if (Math.abs(video.currentTime - target) < 0.0001 && !video.seeking)
    return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
      error ? reject(error) : resolve();
    };
    const done = () => {
      if (Math.abs(video.currentTime - target) > 0.1) {
        finish(Error("O arquivo não permite buscar o quadro selecionado."));
        return;
      }
      positioned.add(video);
      finish();
    };
    const failed = () =>
      finish(Error("Não foi possível ler o quadro do vídeo."));
    const timer = setTimeout(failed, 10000);
    video.addEventListener("seeked", done);
    video.addEventListener("error", failed);
    video.currentTime = target;
  });
}
export async function drawTemporalFrame(clips: TemporalClip[], time: number) {
  await Promise.all(
    clips.map(async clip => {
      const { video, source } = clip;
      const { start, end, from } = temporalInterval(source, video.duration);
      video.pause();
      const visible = time >= start && time < end;
      if (visible)
        await seek(
          video,
          Math.min(Math.max(0, video.duration - 0.001), time - start + from)
        );
      paint(clip, visible);
    })
  );
}

export function useSlideVideos(
  media: CanvasTemporalMedia | undefined,
  slideId: string,
  redraw: () => void
) {
  const [frames, setFrames] = useState<Record<string, HTMLCanvasElement>>({});
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const clock = useRef(0);
  const animation = useRef(0);
  const clips = useRef<TemporalClip[]>([]);
  const stop = useCallback(() => {
    cancelAnimationFrame(animation.current);
    animation.current = 0;
    clips.current.forEach(c => c.video.pause());
    setPlaying(false);
  }, []);
  const sourceKey = JSON.stringify(media ?? {});
  useEffect(() => {
    let active = true;
    stop();
    clock.current = 0;
    setTime(0);
    setFrames({});
    setError("");
    const all: HTMLVideoElement[] = [];
    for (const [slot, source] of Object.entries(media ?? {})) {
      const video = document.createElement("video");
      const assetUrl = "/api/studio-media/" + encodeURIComponent(source.assetId);
      let retried = false;
      video.crossOrigin = "anonymous";
      video.playsInline = true;
      video.preload = "auto";
      video.muted = Boolean(source.muted);
      video.volume = source.volume ?? 1;
      video.onloadeddata = async () => {
        if (!active) return;
        video.onloadeddata = null;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const clip = { video, canvas, source };
        sources.set(canvas, clip);
        clips.current.push(clip);
        try {
          await drawTemporalFrame([clip], 0);
          if (active) setFrames(prev => ({ ...prev, [slot]: canvas }));
        } catch (e) {
          if (active) setError((e as Error).message);
        }
      };
      video.onerror = () => {
        if (!active) return;
        if (!retried && video.error?.code === 2) {
          retried = true;
          video.src = assetUrl + "?refresh=" + Date.now();
          return;
        }
        setError("Vídeo indisponível. Confira o arquivo e o acesso.");
      };
      video.src = assetUrl;
      all.push(video);
    }
    return () => {
      active = false;
      cancelAnimationFrame(animation.current);
      animation.current = 0;
      clips.current = [];
      all.forEach(v => {
        v.onloadeddata = v.onerror = null;
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
    };
  }, [sourceKey, slideId, stop]);
  const duration = Math.max(
    0,
    ...clips.current.map(c => temporalInterval(c.source, c.video.duration).end)
  );
  const scrub = async (position: number) => {
    stop();
    clock.current = position;
    setTime(position);
    try {
      await drawTemporalFrame(clips.current, position);
      redraw();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = () => {
    if (animation.current) {
      stop();
      return;
    }
    if (!duration) return;
    const initial = clock.current >= duration ? 0 : clock.current;
    const started = performance.now();
    setPlaying(true);
    const tick = () => {
      const position = Math.min(
        duration,
        initial + (performance.now() - started) / 1000
      );
      clock.current = position;
      setTime(previous =>
        Math.abs(previous - position) > 0.1 || position >= duration
          ? position
          : previous
      );
      for (const clip of clips.current) {
        const { video, source } = clip;
        const { from, start, end } = temporalInterval(source, video.duration);
        const visible = position >= start && position < end;
        if (visible) {
          const expected = position - start + from;
          if (!video.seeking && Math.abs(expected - video.currentTime) > 0.18)
            video.currentTime = expected;
          if (video.paused && !video.seeking)
            void video.play().catch(e => {
              if (e.name !== "AbortError") {
                stop();
                setError("A reprodução foi interrompida pelo navegador.");
              }
            });
        } else video.pause();
        paint(clip, visible);
      }
      redraw();
      if (position >= duration) {
        stop();
        return;
      }
      animation.current = requestAnimationFrame(tick);
    };
    tick();
  };
  return { frames, error, playing, duration, time, scrub, toggle, stop };
}
