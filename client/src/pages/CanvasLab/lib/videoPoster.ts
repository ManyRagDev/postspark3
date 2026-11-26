export async function videoPoster(file: File) {
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("O aparelho não conseguiu ler o vídeo.")),
        15000
      );
      video.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(Error("Formato de vídeo incompatível."));
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
    });
    const canvas = document.createElement("canvas");
    const ratio = Math.min(
      1,
      480 / Math.max(video.videoWidth, video.videoHeight)
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    canvas
      .getContext("2d")!
      .drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      url: canvas.toDataURL("image/jpeg", 0.85),
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
