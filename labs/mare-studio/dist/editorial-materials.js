// The provider sees reduced JPEGs. The session keeps the original files for editing.
function thumbnail(source, width, height) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 512 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#303030";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78).split(",")[1];
}

function mediaEvent(video, event, action, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const listeners = new AbortController();
    const finish = err => {
      clearTimeout(timer);
      listeners.abort();
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(Error("Tempo esgotado ao ler o vídeo.")), 20000);
    const options = { once: true, signal: listeners.signal };
    signal.addEventListener("abort", () => finish(signal.reason), options);
    video.addEventListener(event, () => finish(), options);
    video.addEventListener("error", () => finish(Error("Não foi possível ler a gravação.")), options);
    try {
      action();
    } catch (error) {
      finish(error);
    }
  });
}

export async function collectMaterials(files, signal, check) {
  const assets = [],
    previews = [],
    originals = new Map();
  if (files.length > 16) throw Error("Escolha até 16 materiais.");
  for (const [i, file] of Array.from(files).entries()) {
    check();
    const kind = file.type.split("/")[0],
      id = "a" + (i + 1);
    if (!["audio", "image", "video"].includes(kind))
      throw Error("Formato de material inválido: " + file.name);
    originals.set(id, file);
    const asset = { id, kind, name: file.name };
    if (kind === "image") {
      const bitmap = await createImageBitmap(file);
      try {
        Object.assign(asset, { width: bitmap.width, height: bitmap.height });
        previews.push({
          id,
          jpeg: thumbnail(bitmap, asset.width, asset.height),
        });
      } finally {
        bitmap.close();
      }
    } else {
      const video = document.createElement(kind),
        url = URL.createObjectURL(file);
      try {
        video.muted = true;
        await mediaEvent(
          video,
          "loadeddata",
          () => {
            video.src = url;
          },
          signal
        );
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) throw Error("Duração inválida: " + file.name);
        asset.duration = duration;
        if (kind === "audio") {
          assets.push(asset);
          continue;
        }
        Object.assign(asset, {
          width: video.videoWidth,
          height: video.videoHeight,
          samples: [],
        });
        for (const fraction of [0.1, 0.5, 0.9]) {
          const time = duration * fraction;
          await mediaEvent(
            video,
            "seeked",
            () => {
              video.currentTime = time;
            },
            signal
          );
          asset.samples.push(time);
          previews.push({
            id,
            time,
            jpeg: thumbnail(video, asset.width, asset.height),
          });
        }
      } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
      }
    }
    assets.push(asset);
  }
  return { assets, previews, originals };
}
