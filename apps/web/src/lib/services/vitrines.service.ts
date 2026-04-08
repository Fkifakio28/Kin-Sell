import { request, mutate } from "../api-core";

export type VitrineItem = {
  id: string;
  title: string;
  description: string | null;
  mediaUrl: string;
  displayOrder: number;
  createdAt?: string;
};

export const vitrines = {
  mine: () => request<VitrineItem[]>("/vitrines/me"),
  forUser: (userId: string) =>
    request<VitrineItem[]>(`/vitrines/user/${encodeURIComponent(userId)}`),
  create: (body: { title: string; description?: string; mediaUrl: string }) =>
    mutate<VitrineItem>("/vitrines", { method: "POST", body }, ["/vitrines/me"]),
  update: (id: string, body: { title?: string; description?: string; mediaUrl?: string }) =>
    mutate<VitrineItem>(`/vitrines/${encodeURIComponent(id)}`, { method: "PATCH", body }, ["/vitrines/me"]),
  remove: (id: string) =>
    mutate<{ ok: boolean }>(`/vitrines/${encodeURIComponent(id)}`, { method: "DELETE" }, ["/vitrines/me"]),
  reorder: (orderedIds: string[]) =>
    mutate<{ ok: boolean }>("/vitrines/reorder", { method: "PUT", body: { orderedIds } }, ["/vitrines/me"]),
};
