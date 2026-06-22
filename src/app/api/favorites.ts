import { apiRequest } from "./client";

export type FavoriteType = "station" | "sounding";

export interface FavoriteItem {
  id: string;
  userId: string;
  type: FavoriteType | string;
  refId: string;
  label: string;
  createdAt: string;
}

export function createFavoriteApi(
  token: string,
  payload: {
    type: FavoriteType;
    refId: string;
    label?: string;
  },
) {
  return apiRequest<{ success: boolean; id: string }>("/favorites", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getFavoritesApi(token: string, limit = 100) {
  return apiRequest<{ success: boolean; items: FavoriteItem[] }>(
    `/favorites?limit=${limit}`,
    {
      method: "GET",
      token,
    },
  );
}

export function deleteFavoriteApi(token: string, favoriteId: string) {
  return apiRequest<{ success: boolean }>(`/favorites/${favoriteId}`, {
    method: "DELETE",
    token,
  });
}
