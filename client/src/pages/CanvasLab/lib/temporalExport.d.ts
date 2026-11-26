import type { TemporalClip } from "./temporalPlayback";
export function exportTemporalSlide(
  clips: TemporalClip[],
  drawFrame: () => HTMLCanvasElement
): Promise<Blob>;

export interface TemporalFrameReader {
  draw(time: number): Promise<void>;
  close(): Promise<void>;
}
export function openTemporalFrames(
  clips: TemporalClip[]
): Promise<TemporalFrameReader>;
