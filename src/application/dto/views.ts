import { Auction } from '../../domain/auction/Auction';
import { Bid } from '../../domain/auction/Bid';
import { PaymentOrder } from '../../domain/auction/PaymentOrder';
import { RejectedBidAttempt } from '../../domain/auction/RejectedBidAttempt';
import { Category } from '../../domain/category/Category';
import { Notification } from '../../domain/notification/Notification';
import { User } from '../../domain/user/User';


const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export interface UserView {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
}

export const toUserView = (u: User): UserView => ({
  id: u.id,
  name: u.name,
  email: u.email.address,
  registeredAt: u.registeredAt.toISOString(),
});

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
}

export const toCategoryView = (c: Category): CategoryView => ({ id: c.id, name: c.name, slug: c.slug });

export interface AuctionSummaryView {
  id: string;
  title: string;
  condition: string;
  categoryId: string;
  sellerId: string;
  status: string;
  currency: 'COP';
  basePrice: number;
  minIncrement: number;
  currentPrice: number | null;
  minimumNextBid: number | null;
  bidCount: number;
  publishedAt: string;
  closesAt: string;
  closedAt: string | null;
}

export const toAuctionSummary = (a: Auction): AuctionSummaryView => {
  const highest = a.highestBid();
  return {
    id: a.id,
    title: a.item.title,
    condition: a.item.condition.value,
    categoryId: a.item.categoryId,
    sellerId: a.sellerId,
    status: a.currentStatus.value,
    currency: 'COP',
    basePrice: a.terms.basePrice.amount,
    minIncrement: a.terms.minIncrement.amount,
    currentPrice: highest ? highest.amount.amount : null,
    minimumNextBid: a.currentStatus.acceptsBids() ? a.minimumNextBid().amount : null,
    bidCount: a.acceptedBids.length,
    publishedAt: a.publishedAt.toISOString(),
    closesAt: a.terms.closesAt.toISOString(),
    closedAt: iso(a.closedAtDate),
  };
};

export interface PublicBidView {
  id: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  placedAt: string;
}

export const toPublicBidView = (b: Bid, names: Map<string, string>): PublicBidView => ({
  id: b.id,
  bidderId: b.bidderId,
  bidderName: names.get(b.bidderId) ?? 'Usuario',
  amount: b.amount.amount,
  placedAt: b.placedAt.toISOString(),
});

export interface AuctionDetailView extends AuctionSummaryView {
  description: string;
  seller: { id: string; name: string };
  bids: PublicBidView[];
  winner: { id: string; name: string; amount: number } | null;
  payment: { status: string; dueAt: string } | null;
  cancelledAt: string | null;
}

export const toAuctionDetail = (a: Auction, names: Map<string, string>): AuctionDetailView => {
  const order = a.order;
  const winnerId = a.winner;
  const winningBid = a.highestBid();
  return {
    ...toAuctionSummary(a),
    description: a.item.description,
    seller: { id: a.sellerId, name: names.get(a.sellerId) ?? 'Usuario' },
    // Historial en orden cronológico inverso: la oferta vigente primero
    bids: [...a.acceptedBids].reverse().map((b) => toPublicBidView(b, names)),
    winner:
      winnerId && winningBid
        ? { id: winnerId, name: names.get(winnerId) ?? 'Usuario', amount: winningBid.amount.amount }
        : null,
    payment: order ? { status: order.currentStatus.value, dueAt: order.dueAt.toISOString() } : null,
    cancelledAt: iso(a.cancelledAtDate),
  };
};

export interface RejectedBidAttemptView {
  id: string;
  bidderId: string;
  amount: number;
  reasonCode: string;
  reason: string;
  attemptedAt: string;
}

export const toRejectedBidAttemptView = (r: RejectedBidAttempt): RejectedBidAttemptView => ({
  id: r.id,
  bidderId: r.bidderId,
  amount: r.amount,
  reasonCode: r.reason.code,
  reason: r.reason.message,
  attemptedAt: r.attemptedAt.toISOString(),
});

export interface PaymentOrderView {
  id: string;
  auctionId: string;
  auctionTitle: string;
  winnerId: string;
  sellerId: string;
  currency: 'COP';
  amount: number;
  status: string;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  expiredAt: string | null;
}

export const toPaymentOrderView = (a: Auction, o: PaymentOrder): PaymentOrderView => ({
  id: o.id,
  auctionId: a.id,
  auctionTitle: a.item.title,
  winnerId: o.winnerId,
  sellerId: a.sellerId,
  currency: 'COP',
  amount: o.amount.amount,
  status: o.currentStatus.value,
  issuedAt: o.issuedAt.toISOString(),
  dueAt: o.dueAt.toISOString(),
  paidAt: iso(o.paidAtDate),
  expiredAt: iso(o.expiredAtDate),
});

export interface NotificationView {
  id: string;
  type: string;
  message: string;
  auctionId: string | null;
  createdAt: string;
  readAt: string | null;
}

export const toNotificationView = (n: Notification): NotificationView => ({
  id: n.id,
  type: n.type.value,
  message: n.message,
  auctionId: n.auctionId,
  createdAt: n.createdAt.toISOString(),
  readAt: iso(n.readAtDate),
});
