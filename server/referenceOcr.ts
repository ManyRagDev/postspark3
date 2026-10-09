import { createWorker } from "tesseract.js";

export type ReferenceOcrLine = {
  text: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
};

export type ReferenceOcrResult = {
  status: "completed" | "unavailable";
  engine: "tesseract.js";
  languages: string[];
  lines: ReferenceOcrLine[];
  warning: string | null;
};

export async function readReferenceText(imageBytes: Buffer): Promise<ReferenceOcrResult> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let languages = ["eng", "por"];
  const localLanguagePath = process.env.DESIGN_DNA_OCR_LANG_PATH?.trim();
  const workerOptions = localLanguagePath ? { langPath: localLanguagePath } : undefined;
  try {
    try {
      worker = await createWorker(languages, 1, workerOptions);
    } catch {
      languages = ["eng"];
      worker = await createWorker(languages, 1, workerOptions);
    }
    const recognized = await worker.recognize(imageBytes, { rotateAuto: true }, { text: true, blocks: true });
    const lines = (recognized.data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({
      text: line.text.trim(),
      confidence: Math.max(0, Math.min(1, line.confidence / 100)),
      box: {
        x: line.bbox.x0,
        y: line.bbox.y0,
        width: Math.max(0, line.bbox.x1 - line.bbox.x0),
        height: Math.max(0, line.bbox.y1 - line.bbox.y0),
      },
    })))).filter(line => line.text.length > 0);
    return { status: "completed", engine: "tesseract.js", languages, lines, warning: null };
  } catch (error) {
    return {
      status: "unavailable", engine: "tesseract.js", languages, lines: [],
      warning: error instanceof Error ? `OCR indisponível: ${error.message}` : "OCR indisponível.",
    };
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
