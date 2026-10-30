import { AggregateRoot } from '../shared/AggregateRoot';
import { DomainError } from '../shared/DomainError';
import { IdGenerator } from '../shared/IdGenerator';
import { Money } from '../shared/Money';
import { AuctionEvent } from './AuctionEvents';
import { AuctionStatus } from './AuctionStatus';
import { AuctionTerms } from './AuctionTerms';
import { Bid, BidSnapshot } from './Bid';
import { BidRejectionReason } from './BidRejectionReason';
import { Item, ItemSnapshot } from './Item';
import { PaymentOrder, PaymentOrderSnapshot } from './PaymentOrder';
import { RejectedBidAttempt, RejectedBidAttemptSnapshot } from './RejectedBidAttempt';

export interface AuctionSnapshot {
  id: string;
  sellerId: string;
  item: ItemSnapshot;
  basePrice: number;
  minIncrement: number;
  closesAt: Date;
  publishedAt: Date;
  status: string;
  closedAt: Date | null;
  cancelledAt: Date | null;
  winnerId: string | null;
  bids: BidSnapshot[];
  rejectedAttempts: RejectedBidAttemptSnapshot[];
  paymentOrder: PaymentOrderSnapshot | null;
}

export type BidOutcome = { accepted: true; bid: Bid } | { accepted: false; attempt: RejectedBidAttempt };

export class Auction extends AggregateRoot<AuctionEvent> {
  private constructor(
    readonly id: string,
    readonly sellerId: string,
    readonly item: Item,
    readonly terms: AuctionTerms,
    readonly publishedAt: Date,
    private status: AuctionStatus,
    private readonly bids: Bid[],
    private readonly rejectedAttempts: RejectedBidAttempt[],
    private closedAt: Date | null,
    private cancelledAt: Date | null,
    private winnerId: string | null,
    private paymentOrder: PaymentOrder | null,
  ) {
    super();
  }

  static publish(props: {
    id: string;
    sellerId: string;
    item: Item;
    basePrice: number;
    minIncrement: number;
    closesAt: Date;
    now: Date;
  }): Auction {
    const terms = AuctionTerms.forPublication(
      { basePrice: props.basePrice, minIncrement: props.minIncrement, closesAt: props.closesAt },
      props.now,
    );
    const auction = new Auction(
      props.id,
      props.sellerId,
      props.item,
      terms,
      new Date(props.now),
      AuctionStatus.OPEN,
      [],
      [],
      null,
      null,
      null,
      null,
    );
    auction.record({
      type: 'AuctionPublished',
      auctionId: auction.id,
      occurredAt: new Date(props.now),
      sellerId: auction.sellerId,
      title: auction.item.title,
      basePrice: terms.basePrice.amount,
      closesAt: terms.closesAt,
    });
    return auction;
  }

  static restore(s: AuctionSnapshot): Auction {
    return new Auction(
      s.id,
      s.sellerId,
      Item.restore(s.item),
      AuctionTerms.restore({ basePrice: s.basePrice, minIncrement: s.minIncrement, closesAt: s.closesAt }),
      new Date(s.publishedAt),
      AuctionStatus.from(s.status),
      s.bids.map((b) => Bid.restore(b)),
      s.rejectedAttempts.map((a) => RejectedBidAttempt.restore(a)),
      s.closedAt ? new Date(s.closedAt) : null,
      s.cancelledAt ? new Date(s.cancelledAt) : null,
      s.winnerId,
      s.paymentOrder ? PaymentOrder.restore(s.paymentOrder) : null,
    );
  }

  placeBid(command: { bidderId: string; amount: number }, now: Date, ids: IdGenerator): BidOutcome {
    this.settle(now, ids);

    const rejection = this.evaluateBid(command.bidderId, command.amount);
    if (rejection) {
      // RN-12: toda puja rechazada queda registrada con su motivo
      const attempt = RejectedBidAttempt.record({
        id: ids.next(),
        auctionId: this.id,
        bidderId: command.bidderId,
        amount: command.amount,
        reason: rejection,
        attemptedAt: now,
      });
      this.rejectedAttempts.push(attempt);
      this.record({
        type: 'BidRejected',
        auctionId: this.id,
        occurredAt: new Date(now),
        attemptId: attempt.id,
        bidderId: attempt.bidderId,
        amount: attempt.amount,
        reasonCode: rejection.code,
      });
      return { accepted: false, attempt };
    }

    const previous = this.highestBid();
    const bid = Bid.place({
      id: ids.next(),
      auctionId: this.id,
      bidderId: command.bidderId,
      amount: Money.of(command.amount),
      placedAt: now,
    });
    this.bids.push(bid);
    this.record({
      type: 'BidPlaced',
      auctionId: this.id,
      occurredAt: new Date(now),
      bidId: bid.id,
      bidderId: bid.bidderId,
      amount: bid.amount.amount,
      bidCount: this.bids.length,
      minimumNextBid: this.minimumNextBid().amount,
      previousHighestBidderId: previous?.bidderId ?? null,
      previousHighestAmount: previous?.amount.amount ?? null,
    });
    return { accepted: true, bid };
  }

  /** Reglas de aceptación de una puja, en el orden en que se evalúan. */
  private evaluateBid(bidderId: string, rawAmount: number): BidRejectionReason | null {
    // RN-06: solo se aceptan pujas sobre subastas abiertas
    if (!this.status.acceptsBids()) {
      return BidRejectionReason.of('AUCTION_NOT_OPEN');
    }
    // RN-07: el vendedor no puede pujar por su propio artículo
    if (bidderId === this.sellerId) {
      return BidRejectionReason.of('SELLER_CANNOT_BID');
    }
    const highest = this.highestBid();
    // RN-10: el mejor postor no puede superar su propia puja
    if (highest && highest.bidderId === bidderId) {
      return BidRejectionReason.of('ALREADY_HIGHEST_BIDDER');
    }
    // RN-21: montos enteros, en COP, no negativos
    let amount: Money;
    try {
      amount = Money.of(rawAmount);
    } catch {
      return BidRejectionReason.of('INVALID_AMOUNT');
    }
    if (!highest) {
      // RN-08: la primera puja debe ser mayor o igual al precio base
      if (amount.isLessThan(this.terms.basePrice)) {
        return BidRejectionReason.of('BELOW_BASE_PRICE', `Mínimo aceptable: ${this.terms.basePrice.toString()}.`);
      }
    } else {
      // RN-09: superar a la vigente en al menos el incremento mínimo (igual se rechaza)
      const minimum = highest.amount.plus(this.terms.minIncrement);
      if (amount.isLessThan(minimum)) {
        return BidRejectionReason.of('BELOW_MINIMUM_INCREMENT', `Mínimo aceptable: ${minimum.toString()}.`);
      }
    }
    return null;
  }
  /** RN-04: solo puede cancelarse si todavía no ha recibido ninguna puja. */
  cancel(requesterId: string, now: Date, ids: IdGenerator): void {
    if (requesterId !== this.sellerId) {
      throw new DomainError('NOT_AUCTION_SELLER', 'Solo el vendedor puede cancelar su subasta.');
    }
    this.settle(now, ids);
    if (this.bids.length > 0) {
      throw new DomainError(
        'AUCTION_HAS_BIDS',
        'La subasta ya recibió pujas: la venta está comprometida y solo puede terminar por cierre.',
      );
    }
    if (!this.status.isOpen()) {
      throw new DomainError('AUCTION_NOT_OPEN', `La subasta no está abierta (estado: ${this.status.value}).`);
    }
    this.status = AuctionStatus.CANCELLED;
    this.cancelledAt = new Date(now);
    this.record({ type: 'AuctionCancelled', auctionId: this.id, occurredAt: new Date(now), sellerId: this.sellerId });
  }

 
  settle(now: Date, ids: IdGenerator): boolean {
    const closed = this.closeIfDue(now, ids);
    const expired = this.expirePaymentIfOverdue(now);
    return closed || expired;
  }

  closeIfDue(now: Date, ids: IdGenerator): boolean {
    if (!this.status.isOpen()) return false;
    if (!this.terms.hasExpired(now)) return false;

    this.closedAt = new Date(now);
    const winningBid = this.highestBid();

    if (!winningBid) {
      // RN-14: sin pujas se declara desierta y no genera obligación de pago
      this.status = AuctionStatus.DESERTED;
      this.record({ type: 'AuctionDeserted', auctionId: this.id, occurredAt: new Date(now), sellerId: this.sellerId });
      return true;
    }

    // RN-13: se adjudica al autor de la oferta más alta
    this.winnerId = winningBid.bidderId;
    this.status = AuctionStatus.ADJUDICATED;
    // RN-15: orden de pago por el valor ganador, a nombre del ganador, plazo 48 h
    this.paymentOrder = PaymentOrder.issue({
      id: ids.next(),
      auctionId: this.id,
      winnerId: winningBid.bidderId,
      amount: winningBid.amount,
      issuedAt: now,
    });
    this.record({
      type: 'AuctionAdjudicated',
      auctionId: this.id,
      occurredAt: new Date(now),
      sellerId: this.sellerId,
      winnerId: winningBid.bidderId,
      winningAmount: winningBid.amount.amount,
      paymentOrderId: this.paymentOrder.id,
      paymentDueAt: this.paymentOrder.dueAt,
    });
    return true;
  }

  confirmPayment(paymentOrderId: string, amount: Money, now: Date): void {
    const order = this.requirePaymentOrder(paymentOrderId);
    this.expirePaymentIfOverdue(now);
    order.markAsPaid(amount, now);
    this.status = AuctionStatus.PAID;
    this.record({
      type: 'PaymentConfirmed',
      auctionId: this.id,
      occurredAt: new Date(now),
      paymentOrderId: order.id,
      sellerId: this.sellerId,
      winnerId: order.winnerId,
      amount: order.amount.amount,
    });
  }

  registerFailedPayment(paymentOrderId: string, now: Date): void {
    const order = this.requirePaymentOrder(paymentOrderId);
    this.expirePaymentIfOverdue(now);
    if (!order.currentStatus.isPending()) {
      throw new DomainError('PAYMENT_ORDER_NOT_PENDING', `La orden de pago no está pendiente (${order.currentStatus.value}).`);
    }
    this.record({
      type: 'PaymentFailed',
      auctionId: this.id,
      occurredAt: new Date(now),
      paymentOrderId: order.id,
      winnerId: order.winnerId,
    });
  }

  private expirePaymentIfOverdue(now: Date): boolean {
    if (!this.status.isAdjudicated() || !this.paymentOrder || !this.paymentOrder.isOverdue(now)) {
      return false;
    }
    this.paymentOrder.expire(now);
    this.status = AuctionStatus.DEFAULTED;
    this.record({
      type: 'PaymentOrderExpired',
      auctionId: this.id,
      occurredAt: new Date(now),
      paymentOrderId: this.paymentOrder.id,
      sellerId: this.sellerId,
      winnerId: this.paymentOrder.winnerId,
    });
    return true;
  }

  private requirePaymentOrder(paymentOrderId: string): PaymentOrder {
    if (!this.paymentOrder || this.paymentOrder.id !== paymentOrderId) {
      throw new DomainError('PAYMENT_ORDER_NOT_FOUND', 'La subasta no tiene una orden de pago con ese identificador.');
    }
    return this.paymentOrder;
  }

  get currentStatus(): AuctionStatus {
    return this.status;
  }

  /** Copia de solo lectura: nadie fuera del agregado puede retirar pujas (RN-11). */
  get acceptedBids(): readonly Bid[] {
    return [...this.bids];
  }

  get rejectedBidAttempts(): readonly RejectedBidAttempt[] {
    return [...this.rejectedAttempts];
  }

  get winner(): string | null {
    return this.winnerId;
  }

  get order(): PaymentOrder | null {
    return this.paymentOrder;
  }

  get closedAtDate(): Date | null {
    return this.closedAt ? new Date(this.closedAt) : null;
  }

  get cancelledAtDate(): Date | null {
    return this.cancelledAt ? new Date(this.cancelledAt) : null;
  }

  hasBids(): boolean {
    return this.bids.length > 0;
  }

  highestBid(): Bid | null {
    let highest: Bid | null = null;
    for (const bid of this.bids) {
      if (!highest || bid.amount.isGreaterThanOrEqual(highest.amount)) highest = bid;
    }
    return highest;
  }

  /** Valor mínimo que debe tener la próxima puja para ser aceptada. */
  minimumNextBid(): Money {
    const highest = this.highestBid();
    return highest ? highest.amount.plus(this.terms.minIncrement) : this.terms.basePrice;
  }

  bidderIds(): string[] {
    return [...new Set(this.bids.map((b) => b.bidderId))];
  }

  toSnapshot(): AuctionSnapshot {
    return {
      id: this.id,
      sellerId: this.sellerId,
      item: this.item.toSnapshot(),
      basePrice: this.terms.basePrice.amount,
      minIncrement: this.terms.minIncrement.amount,
      closesAt: this.terms.closesAt,
      publishedAt: new Date(this.publishedAt),
      status: this.status.value,
      closedAt: this.closedAtDate,
      cancelledAt: this.cancelledAtDate,
      winnerId: this.winnerId,
      bids: this.bids.map((b) => b.toSnapshot()),
      rejectedAttempts: this.rejectedAttempts.map((a) => a.toSnapshot()),
      paymentOrder: this.paymentOrder ? this.paymentOrder.toSnapshot() : null,
    };
  }
}
