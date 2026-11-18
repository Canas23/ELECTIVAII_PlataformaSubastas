import type { AuctionStatus, ItemCondition } from "../services/auctionService";

export const formatPrice = (price: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(price);

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** "Hace 3 min", "Hace 2 h"... */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Hace unos segundos";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return formatDateTime(iso);
}

/** Tiempo restante hasta el cierre: "02 h 45 min", "3 d 04 h", "Cerrando…". */
export function timeLeft(closesAt: string, now = Date.now()): string {
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return "Cerrando…";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days} d ${pad(hours)} h`;
  if (hours > 0) return `${pad(hours)} h ${pad(minutes)} min`;
  return `${pad(minutes)} min ${pad(seconds)} s`;
}

export const STATUS_LABEL: Record<AuctionStatus, string> = {
  OPEN: "SUBASTA ACTIVA",
  CANCELLED: "CANCELADA",
  DESERTED: "DESIERTA",
  ADJUDICATED: "ADJUDICADA",
  PAID: "PAGADA",
  DEFAULTED: "PAGO VENCIDO",
};

export const CONDITION_LABEL: Record<ItemCondition, string> = {
  NEW: "Nuevo",
  LIKE_NEW: "Como nuevo",
  USED: "Usado",
  FOR_PARTS: "Para repuestos",
};

export const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Pendiente de pago",
  PAID: "Pagada",
  EXPIRED: "Vencida",
};

/*
 * El backend no maneja fotos de los artículos, así que se muestra una imagen
 * ilustrativa según la categoría (las mismas del diseño original).
 */
const IMAGES = {
  laptop: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900",
  camera: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900",
  watch: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=900",
  bike: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=900",
  console: "https://images.unsplash.com/photo-1605901309584-818e25960a8f?w=900",
  glasses: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=900",
  watchHero: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900",
};

const IMAGES_BY_CATEGORY: Record<string, string[]> = {
  electronica: [IMAGES.laptop, IMAGES.camera, IMAGES.console],
  coleccionables: [IMAGES.console, IMAGES.watch, IMAGES.camera],
  moda: [IMAGES.glasses, IMAGES.watchHero, IMAGES.watch],
  vehiculos: [IMAGES.bike],
  "arte-y-antiguedades": [IMAGES.watch, IMAGES.camera, IMAGES.watchHero],
  hogar: [IMAGES.watchHero, IMAGES.laptop],
  otros: [IMAGES.watchHero, IMAGES.glasses, IMAGES.bike],
};

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

/** Galería ilustrativa: la primera imagen depende del id para que cada subasta se vea distinta. */
export function imagesFor(auctionId: string, categoryName?: string): string[] {
  const pool = IMAGES_BY_CATEGORY[normalize(categoryName ?? "")] ?? Object.values(IMAGES);
  const start = hash(auctionId) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

export const shortId = (id: string) => `SUB-${id.slice(0, 6).toUpperCase()}`;
