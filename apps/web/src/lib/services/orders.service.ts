import { request, mutate, invalidateCache } from "../api-core";
import type { NegotiationStatus } from "./negotiations.service";

export type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELED";

export type CartSummary = {
  id: string;
  status: "OPEN" | "CHECKED_OUT" | "ABANDONED";
  currency: string;
  subtotalUsdCents: number;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    listingId: string;
    quantity: number;
    unitPriceUsdCents: number;
    lineTotalUsdCents: number;
    negotiationId: string | null;
    negotiationStatus: NegotiationStatus | null;
    originalPriceUsdCents: number;
    itemState: "COMMANDE" | "MARCHANDAGE";
    listing: {
      id: string;
      type: string;
      title: string;
      category: string;
      city: string;
      imageUrl: string | null;
      isNegotiable?: boolean;
      owner: {
        userId: string;
        displayName: string;
        businessId: string | null;
        businessPublicName: string | null;
        businessSlug: string | null;
      };
    };
  }>;
};

export type OrderSummary = {
  id: string;
  status: OrderStatus;
  currency: string;
  totalUsdCents: number;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  autoExpireAt: string | null;
  buyer: {
    userId: string;
    displayName: string;
    username: string | null;
  };
  seller: {
    userId: string;
    displayName: string;
    username: string | null;
    businessId: string | null;
    businessPublicName: string | null;
    businessSlug: string | null;
  };
  itemsCount: number;
  items: Array<{
    id: string;
    listingId: string | null;
    listingType: string;
    title: string;
    category: string;
    city: string;
    quantity: number;
    unitPriceUsdCents: number;
    lineTotalUsdCents: number;
    imageUrl: string | null;
  }>;
};

export const orders = {
  buyerCart: () => request<CartSummary>("/orders/buyer/cart"),
  addCartItem: (body: { listingId: string; quantity?: number; unitPriceUsdCents?: number }) =>
    mutate<CartSummary>("/orders/buyer/cart/items", { method: "POST", body }, ["/orders/buyer/cart"]),
  updateCartItem: (itemId: string, body: { quantity?: number; unitPriceUsdCents?: number }) =>
    mutate<CartSummary>(`/orders/buyer/cart/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body }, ["/orders/buyer/cart"]),
  removeCartItem: (itemId: string) =>
    mutate<CartSummary>(`/orders/buyer/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }, ["/orders/buyer/cart"]),
  checkoutBuyerCart: (body?: { notes?: string; deliveryAddress?: string; deliveryCity?: string; deliveryCountry?: string; deliveryLatitude?: number; deliveryLongitude?: number; deliveryPlaceId?: string; deliveryFormattedAddress?: string }) =>
    mutate<{ message: string; orders: OrderSummary[] }>("/orders/buyer/checkout", { method: "POST", body }, ["/orders/"]),
  buyerOrders: (params?: { page?: number; limit?: number; status?: OrderStatus; inProgressOnly?: boolean }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; orders: OrderSummary[] }>("/orders/buyer/orders", {
      params: params
        ? {
            page: params.page,
            limit: params.limit,
            status: params.status,
            inProgressOnly: params.inProgressOnly === undefined ? undefined : (params.inProgressOnly ? "true" : "false")
          }
        : undefined
    }),
  sellerOrders: (params?: { page?: number; limit?: number; status?: OrderStatus; inProgressOnly?: boolean }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; orders: OrderSummary[] }>("/orders/seller/orders", {
      params: params
        ? {
            page: params.page,
            limit: params.limit,
            status: params.status,
            inProgressOnly: params.inProgressOnly === undefined ? undefined : (params.inProgressOnly ? "true" : "false")
          }
        : undefined
    }),
  detail: (orderId: string) => request<OrderSummary>(`/orders/${encodeURIComponent(orderId)}`),
  updateSellerOrderStatus: (orderId: string, body: { status: OrderStatus }) =>
    mutate<OrderSummary>(`/orders/${encodeURIComponent(orderId)}/status`, { method: "PATCH", body }, ["/orders/"]),
  getValidationCode: (orderId: string) =>
    request<{ validationCode: string; expiresAt: string }>(`/orders/${encodeURIComponent(orderId)}/validation-code`),
  buyerConfirmDelivery: (orderId: string, body: { code: string }) =>
    mutate<OrderSummary>(`/orders/${encodeURIComponent(orderId)}/buyer-confirm`, { method: "POST", body }, ["/orders/"]),
};
