import { uploads } from '../lib/api-client';
import { compressMediaFiles } from './media-compress';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Impossible de lire le fichier: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function prepareMediaUrl(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    const [compressedFile] = await compressMediaFiles([file]);
    const [url] = await uploads.uploadFiles([compressedFile]);
    return url;
  }

  if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
    const [url] = await uploads.uploadFiles([file]);
    return url;
  }

  return fileToBase64(file);
}

export async function prepareMediaUrls(files: File[]): Promise<string[]> {
  const results: string[] = [];
  for (const file of files) {
    results.push(await prepareMediaUrl(file));
  }
  return results;
}

export function createUploadFile(blob: Blob, fileName: string, fallbackType: string): File {
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
    lastModified: Date.now(),
  });
}

export function createOptimizedAudioRecorder(stream: MediaStream): MediaRecorder {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];

  const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  return new MediaRecorder(
    stream,
    mimeType
      ? {
          mimeType,
          audioBitsPerSecond: 24_000,
        }
      : {
          audioBitsPerSecond: 24_000,
        }
  );
}