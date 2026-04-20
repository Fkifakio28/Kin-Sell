import { API_BASE, ApiError } from "../api-core";

const UPLOAD_TIMEOUT_MS = 300_000; // 5 min (encode + network on slow links)
const UPLOAD_MAX_RETRIES = 1;

function isRetryableUploadError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError");
}

function buildFormData(files: File[]): FormData {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);
  return formData;
}

export const uploads = {
  uploadFiles: async (files: File[]): Promise<string[]> => {
    const baseUrl = API_BASE;
    let lastErr: unknown;

    for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }

      try {
        const res = await fetch(`${baseUrl}/uploads`, {
          method: "POST",
          credentials: "include",
          body: buildFormData(files),
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = typeof data === "object" && data && "error" in data
            ? (data as { error: string }).error
            : `Erreur upload (${res.status})`;
          const apiErr = new ApiError(res.status, msg, data);
          lastErr = apiErr;
          if (res.status >= 500 && attempt < UPLOAD_MAX_RETRIES) continue;
          throw apiErr;
        }

        const data = (await res.json()) as { urls: string[] };
        return data.urls;
      } catch (err) {
        lastErr = err;
        if (attempt < UPLOAD_MAX_RETRIES && isRetryableUploadError(err)) continue;
        throw err;
      }
    }

    throw lastErr;
  },
};
