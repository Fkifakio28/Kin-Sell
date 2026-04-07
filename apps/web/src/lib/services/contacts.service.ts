import { request, mutate } from "../api-core";

export interface UserContactData {
  id: string;
  userId: string;
  source: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  matchedUserId: string | null;
  isFavorite: boolean;
  importedAt: string;
  matchedUser: {
    id: string;
    profile: {
      displayName: string;
      avatarUrl: string | null;
      city: string | null;
      username?: string | null;
    };
  } | null;
}

export const contacts = {
  list: () =>
    request<UserContactData[]>("/contacts"),

  add: (targetUserId: string) =>
    mutate<UserContactData>("/contacts/add", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    }, ["/contacts"]),

  toggleFavorite: (contactId: string, isFavorite: boolean) =>
    mutate<UserContactData>(`/contacts/${contactId}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite }),
    }, ["/contacts"]),

  remove: (contactId: string) =>
    mutate<{ ok: boolean }>(`/contacts/${contactId}`, {
      method: "DELETE",
    }, ["/contacts"]),
};
