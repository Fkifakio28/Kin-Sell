/**
 * Web Worker — Compression d'images off-main-thread
 * Utilise OffscreenCanvas pour ne pas bloquer l'UI.
 */

const MAX_DIMENSION = 1920;
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024;
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.08;

async function compressImageInWorker(
  imageData: ArrayBuffer,
  fileName: string,
  mimeType: string,
): Promise<{ buffer: ArrayBuffer; name: string; type: string }> {
  // GIF: skip compression
  if (mimeType === "image/gif") {
    return { buffer: imageData, name: fileName, type: mimeType };
  }

  // Small JPEG/WebP: skip
  if (imageData.byteLength < 200 * 1024 && (mimeType === "image/jpeg" || mimeType === "image/webp")) {
    return { buffer: imageData, name: fileName, type: mimeType };
  }

  const blob = new Blob([imageData], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  let { width, height } = bitmap;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D non supporté");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType = "image/jpeg";
  let quality = INITIAL_QUALITY;
  let resultBlob = await canvas.convertToBlob({ type: outputType, quality });

  while (resultBlob.size > TARGET_MAX_BYTES && quality > MIN_QUALITY) {
    quality -= QUALITY_STEP;
    resultBlob = await canvas.convertToBlob({ type: outputType, quality: Math.max(quality, MIN_QUALITY) });
  }

  const baseName = fileName.replace(/\.[^.]+$/, "");
  const buffer = await resultBlob.arrayBuffer();

  return { buffer, name: `${baseName}.jpg`, type: outputType };
}

// ── Message handler ──
self.addEventListener("message", async (e) => {
  const { id, imageData, fileName, mimeType } = e.data;

  try {
    const result = await compressImageInWorker(imageData, fileName, mimeType);
    // Transfer the ArrayBuffer back (zero-copy)
    (self as unknown as Worker).postMessage({ id, result }, [result.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : "Compression échouée" });
  }
});
