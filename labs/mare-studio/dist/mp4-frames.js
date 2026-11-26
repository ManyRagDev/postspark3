import { VideoSample, VideoSampleSource } from "./vendor/mediabunny-1.66.4.js";

export const hdAvcProfile = "avc1.42E028";

// Canvas capture can produce full-range JPEG YUV. Encode limited-range BT.709
// samples explicitly so mobile decoders see the same levels as the preview.
export function createHdFrameSource(canvas, bitrate) {
  const source = new VideoSampleSource({codec: "avc", fullCodecString: hdAvcProfile, bitrate});
  const ctx = canvas.getContext("2d", {willReadFrequently: true});
  const {width, height} = canvas;
  const size = width * height;
  const pixels = new Uint8Array(size * 1.5);
  async function add(time, duration) {
    const rgb = ctx.getImageData(0, 0, width, height).data;
    let chroma = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        let red = 0, green = 0, blue = 0;
        for (let row = 0; row < 2; row++) {
          let index = (y + row) * width + x;
          for (let col = 0; col < 2; col++, index++) {
            const r = rgb[index * 4], g = rgb[index * 4 + 1], b = rgb[index * 4 + 2];
            pixels[index] = Math.round(16 + 0.182586 * r + 0.614231 * g + 0.062007 * b);
            red += r;
            green += g;
            blue += b;
          }
        }
        pixels[size + chroma] = Math.round(128 + (-0.100644 * red - 0.338572 * green + 0.439216 * blue) / 4);
        pixels[size + size / 4 + chroma] = Math.round(128 + (0.439216 * red - 0.398942 * green - 0.040274 * blue) / 4);
        chroma++;
      }
    }
    const frame = new VideoFrame(pixels, {
      format: "I420", codedWidth: width, codedHeight: height,
      timestamp: Math.round(time * 1e6), duration: Math.round(duration * 1e6),
      colorSpace: {primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false},
    });
    try {
      const sample = new VideoSample(frame);
      try { await source.add(sample); } finally { sample.close(); }
    } finally {
      frame.close();
    }
  }
  return {source, add};
}
