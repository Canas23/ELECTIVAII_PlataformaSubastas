/**
 * Hechos relevantes del negocio que produce el agregado Subasta.
 * Son datos planos: cualquier adaptador (WebSocket, consola, notificaciones)
 * puede reaccionar a ellos sin que el dominio sepa que existen.
 */
interface BaseAuctionEvent {
  auctionId: string;
  occurredAt: Date;
}

export interface AuctionPublished extends BaseAuctionEvent {
  type: 'AuctionPublished';
  sellerId: string;
  title: string;
  basePrice: number;
  closesAt: Date;
}

export interface BidPlaced extends BaseAuctionEvent {
  type: 'BidPlaced';
  bidId: string;
  bidderId: string;
  amount: number;
  bidCount: number;
  minimumNextBid: number;
  previousHighestBidderId: string | null;
  previousHighestAmount: number | null;
}

export interface BidRejected extends BaseAuctionEvent {
  type: 'BidRejected';
  attemptId: string;
  bidderId: string;
  amount: number;
  reasonCode: string;
}

export interface AuctionAdjudicated extends BaseAuctionEvent {
  type: 'AuctionAdjudicated';
  sellerId: string;
  winnerId: string;
  winningAmount: number;
  paymentOrderId: string;
  paymentDueAt: Date;
}

export interface AuctionDeserted extends BaseAuctionEvent {
  type: 'AuctionDeserted';
  sellerId: string;
}

export interface AuctionCancelled extends BaseAuctionEvent {
  type: 'AuctionCancelled';
  sellerId: string;
}

export interface PaymentConfirmed extends BaseAuctionEvent {
  type: 'PaymentConfirmed';
  paymentOrderId: string;
  sellerId: string;
  winnerId: string;
  amount: number;
}

export interface PaymentFailed extends BaseAuctionEvent {
  type: 'PaymentFailed';
  paymentOrderId: string;
  winnerId: string;
}

export interface PaymentOrderExpired extends BaseAuctionEvent {
  type: 'PaymentOrderExpired';
  paymentOrderId: string;
  sellerId: string;
  winnerId: string;
}

export type AuctionEvent =
  | AuctionPublished
  | BidPlaced
  | BidRejected
  | AuctionAdjudicated
  | AuctionDeserted
  | AuctionCancelled
  | PaymentConfirmed
  | PaymentFailed
  | PaymentOrderExpired;
