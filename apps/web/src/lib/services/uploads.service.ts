import { API_BASE, ApiError } from "../api-core";

export const uploads = {
  uploadFiles: async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    const baseUrl = API_BASE;
    const res = await fetch(`${baseUrl}/uploads`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = typeof data === 'object' && data && 'error' in data ? (data as { error: string }).error : `Erreur upload (${res.status})`;
      throw new ApiError(res.status, msg, data);
    }
    const data = (await res.json()) as { urls: string[] };
    return data.urls;
  },
};
