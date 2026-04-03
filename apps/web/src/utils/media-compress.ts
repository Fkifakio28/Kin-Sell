/**
 * Compression d'images côté client (style WhatsApp).
 * - Utilise un Web Worker + OffscreenCanvas si supporté (off-main-thread)
 * - Fallback sur Canvas principal sinon
 * - Redimensionne si la plus grande dimension dépasse MAX_DIMENSION
 * - Convertit en JPEG (meilleur rapport taille/qualité pour photos)
 * - Qualité progressive : essaie 0.82 puis réduit si le fichier reste trop gros
 * - Les vidéos passent telles quelles (pas de transcodage navigateur)
 */

const MAX_DIMENSION = 1920; // px – côté le plus long
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 Mo cible
const INITIAL_QUALITY = 0.82;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.08;

/* ── Web Worker singleton ── */
let _worker: Worker | null = null;
let _workerSupported: boolean | null = null;
let _msgId = 0;

function getCompressWorker(): Worker | null {
  if (_workerSupported === false) return null;
  if (_worker) return _worker;

  try {
    // OffscreenCanvas check
    if (typeof OffscreenCanvas === "undefined") {
      _workerSupported = false;
      return null;
    }
    _worker = new Worker(
      new URL("../workers/compress.worker.ts", import.meta.url),
      { type: "module" },
    );
    _workerSupported = true;
    _worker.addEventListener("error", () => {
      _workerSupported = false;
      _worker?.terminate();
      _worker = null;
    });
    return _worker;
  } catch {
    _workerSupported = false;
    return null;
  }
}

function compressViaWorker(file: File): Promise<File> {
  const worker = getCompressWorker();
  if (!worker) return compressImageFallback(file);

  return new Promise((resolve, reject) => {
    const id = ++_msgId;
    const timeout = setTimeout(() => {
      reject(new Error("Worker timeout"));
    }, 30_000);

    function handler(e: MessageEvent) {
      if (e.data.id !== id) return;
      worker!.removeEventListener("message", handler);
      clearTimeout(timeout);

      if (e.data.error) {
        // Fallback to main thread
        compressImageFallback(file).then(resolve, reject);
        return;
      }

      const { buffer, name, type } = e.data.result;
      resolve(new File([buffer], name, { type, lastModified: Date.now() }));
    }

    worker.addEventListener("message", handler);

    // Read file and transfer to worker
    file.arrayBuffer().then((buf) => {
      worker.postMessage(
        { id, imageData: buf, fileName: file.name, mimeType: file.type },
        [buf], // transfer (zero-copy)
      );
    }).catch(reject);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossible de charger l'image: ${file.name}`));
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Échec de la compression de l'image."));
      },
      type,
      quality
    );
  });
}

/**
 * Compresse une image sur le main thread (fallback).
 */
async function compressImageFallback(file: File): Promise<File> {
  // GIF animés : on ne compresse pas (perte d'animation)
  if (file.type === "image/gif") return file;

  // Si le fichier fait déjà moins de 200 Ko et est JPEG/WebP, pas besoin de compresser
  if (file.size < 200 * 1024 && (file.type === "image/jpeg" || file.type === "image/webp")) {
    return file;
  }

  const img = await loadImage(file);
  const srcUrl = img.src;

  try {
    let { width, height } = img;

    // Redimensionnement proportionnel
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non supporté.");

    // Lissage haute qualité
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    // Compression progressive : on baisse la qualité jusqu'à atteindre la cible
    const outputType = "image/jpeg";
    let quality = INITIAL_QUALITY;
    let blob = await canvasToBlob(canvas, outputType, quality);

    while (blob.size > TARGET_MAX_BYTES && quality > MIN_QUALITY) {
      quality -= QUALITY_STEP;
      blob = await canvasToBlob(canvas, outputType, Math.max(quality, MIN_QUALITY));
    }

    // Nom de fichier avec extension .jpg
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const compressedFile = new File([blob], `${baseName}.jpg`, {
      type: outputType,
      lastModified: Date.now(),
    });

    return compressedFile;
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

/**
 * Compresse une image : Web Worker (off-thread) avec fallback Canvas principal.
 * Retourne un nouveau File prêt à être uploadé.
 */
export async function compressImage(file: File): Promise<File> {
  // GIF: skip
  if (file.type === "image/gif") return file;
  // Small JPEG/WebP: skip
  if (file.size < 200 * 1024 && (file.type === "image/jpeg" || file.type === "image/webp")) return file;

  try {
    return await compressViaWorker(file);
  } catch {
    return compressImageFallback(file);
  }
}

/**
 * Convertit un File en data URI base64.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Impossible de lire le fichier: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresse un tableau de fichiers (images + vidéos).
 * Les images sont compressées, les vidéos passent telles quelles.
 */
export async function compressMediaFiles(files: File[]): Promise<File[]> {
  // Compression parallèle : toutes les images en même temps
  return Promise.all(
    files.map((file) =>
      file.type.startsWith("image/") ? compressImage(file) : Promise.resolve(file)
    )
  );
}

/**
 * Compresse et convertit des fichiers en data URIs base64.
 * Les images sont compressées puis encodées.
 * Les vidéos sont encodées directement (pas de compression navigateur).
 */
export async function compressAndEncodeMedia(files: File[]): Promise<string[]> {
  // Compression + encodage parallèle
  return Promise.all(
    files.map(async (file) => {
      const compressed = file.type.startsWith("image/") ? await compressImage(file) : file;
      return fileToBase64(compressed);
    })
  );
}
