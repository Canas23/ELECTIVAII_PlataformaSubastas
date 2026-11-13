/*
 * Cliente de la API REST de la plataforma.
 * Todas las pantallas hablan con el backend únicamente a través de este archivo.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const TOKEN_KEY = "subastaya_token";
export const USER_KEY = "subastaya_user";

/* ─────────────────────────── Tipos (iguales a los DTO del backend) ─────────────────────────── */

export interface User {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
}

export interface AuthResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export type AuctionStatus =
  | "OPEN"
  | "CANCELLED"
  | "DESERTED"
  | "ADJUDICATED"
  | "PAID"
  | "DEFAULTED";

export type ItemCondition = "NEW" | "LIKE_NEW" | "USED" | "FOR_PARTS";

export interface Auction {
  id: string;
  title: string;
  condition: ItemCondition;
  categoryId: string;
  sellerId: string;
  status: AuctionStatus;
  currency: "COP";
  basePrice: number;
  minIncrement: number;
  currentPrice: number | null;
  minimumNextBid: number | null;
  bidCount: number;
  publishedAt: string;
  closesAt: string;
  closedAt: string | null;
}

export interface Bid {
  id: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  placedAt: string;
}

export interface AuctionDetail extends Auction {
  description: string;
  seller: { id: string; name: string };
  bids: Bid[];
  winner: { id: string; name: string; amount: number } | null;
  payment: { status: string; dueAt: string } | null;
  cancelledAt: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalItems: number;
  totalPages: number;
}

export interface MyProfile {
  user: User;
  publishedAuctions: Auction[];
  participatedAuctions: Auction[];
}

export interface PaymentOrder {
  id: string;
  auctionId: string;
  auctionTitle: string;
  winnerId: string;
  sellerId: string;
  currency: "COP";
  amount: number;
  status: "PENDING" | "PAID" | "EXPIRED";
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  expiredAt: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  auctionId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface RejectedBidAttempt {
  id: string;
  bidderId: string;
  amount: number;
  reasonCode: string;
  reason: string;
  attemptedAt: string;
}

/* ─────────────────────────── Errores ─────────────────────────── */

/** Error de la API con el código de negocio que devuelve el backend (ej: BELOW_MINIMUM_INCREMENT). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, status: number, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Se dispara cuando el token venció: la App cierra la sesión. */
export const SESSION_EXPIRED_EVENT = "subastaya:session-expired";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "No hay conexión con el servidor. ¿Está corriendo el backend en el puerto 3000?",
      0,
      "NETWORK_ERROR",
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const firstIssue = data?.error?.details?.[0]?.message;
    const message =
      (data?.error?.code === "VALIDATION_ERROR" && firstIssue) ||
      data?.error?.message ||
      "No fue posible completar la solicitud.";
    throw new ApiError(message, response.status, data?.error?.code ?? "UNKNOWN", data?.error?.details);
  }

  return data as T;
}

/* ─────────────────────────── Autenticación ─────────────────────────── */

export const registerUser = (input: { name: string; email: string; password: string }) =>
  request<User>("/auth/register", { method: "POST", body: JSON.stringify(input) });

export const loginUser = (input: { email: string; password: string }) =>
  request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });

export const getMyProfile = () => request<MyProfile>("/users/me");

/* ─────────────────────────── Categorías ─────────────────────────── */

export const getCategories = () => request<Category[]>("/categories");

/* ─────────────────────────── Subastas ─────────────────────────── */

export const getAuctions = (filters?: {
  categoryId?: string;
  status?: AuctionStatus;
  page?: number;
  pageSize?: number;
}) => {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.status) params.set("status", filters.status);
  params.set("page", String(filters?.page ?? 1));
  params.set("pageSize", String(filters?.pageSize ?? 24));
  return request<Page<Auction>>(`/auctions?${params.toString()}`);
};

export const getAuctionDetail = (id: string) => request<AuctionDetail>(`/auctions/${id}`);

export const publishAuction = (input: {
  title: string;
  description: string;
  condition: ItemCondition;
  categoryId: string;
  basePrice: number;
  minIncrement: number;
  closesAt: string;
}) => request<AuctionDetail>("/auctions", { method: "POST", body: JSON.stringify(input) });

export const cancelAuction = (id: string) =>
  request<AuctionDetail>(`/auctions/${id}/cancel`, { method: "POST" });

/* ─────────────────────────── Pujas ─────────────────────────── */

export const getAuctionBids = (id: string) => request<Bid[]>(`/auctions/${id}/bids`);

export const placeBid = (id: string, amount: number) =>
  request<{ bid: Bid; auction: Auction }>(`/auctions/${id}/bids`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });

export const getRejectedBidAttempts = (id: string) =>
  request<RejectedBidAttempt[]>(`/auctions/${id}/rejected-bids`);

/* ─────────────────────────── Pagos ─────────────────────────── */

export const getMyPaymentOrders = () => request<PaymentOrder[]>("/payment-orders");

/* ─────────────────────────── Notificaciones ─────────────────────────── */

export const getNotifications = (unreadOnly = false) =>
  request<AppNotification[]>(`/notifications?unreadOnly=${unreadOnly}&limit=30`);

export const markNotificationAsRead = (id: string) =>
  request<AppNotification>(`/notifications/${id}/read`, { method: "PATCH" });
