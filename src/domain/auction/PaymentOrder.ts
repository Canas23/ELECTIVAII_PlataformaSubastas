import { DomainError } from '../shared/DomainError';
import { Money } from '../shared/Money';
import { PaymentOrderStatus } from './PaymentOrderStatus';

export const PAYMENT_TERM_MS = 48 * 60 * 60 * 1000; // RN-15: cuarenta y ocho horas

export interface PaymentOrderSnapshot {
  id: string;
  auctionId: string;
  winnerId: string;
  amount: number;
  issuedAt: Date;
  dueAt: Date;
  status: string;
  paidAt: Date | null;
  expiredAt: Date | null;
}

export class PaymentOrder {
  private constructor(
    readonly id: string,
    readonly auctionId: string,
    readonly winnerId: string,
    readonly amount: Money,
    readonly issuedAt: Date,
    readonly dueAt: Date,
    private status: PaymentOrderStatus,
    private paidAt: Date | null,
    private expiredAt: Date | null,
  ) {}

  static issue(props: { id: string; auctionId: string; winnerId: string; amount: Money; issuedAt: Date }): PaymentOrder {
    const issuedAt = new Date(props.issuedAt);
    const dueAt = new Date(issuedAt.getTime() + PAYMENT_TERM_MS);
    return new PaymentOrder(
      props.id,
      props.auctionId,
      props.winnerId,
      props.amount,
      issuedAt,
      dueAt,
      PaymentOrderStatus.PENDING,
      null,
      null,
    );
  }

  static restore(s: PaymentOrderSnapshot): PaymentOrder {
    return new PaymentOrder(
      s.id,
      s.auctionId,
      s.winnerId,
      Money.of(s.amount),
      new Date(s.issuedAt),
      new Date(s.dueAt),
      PaymentOrderStatus.from(s.status),
      s.paidAt ? new Date(s.paidAt) : null,
      s.expiredAt ? new Date(s.expiredAt) : null,
    );
  }

  get currentStatus(): PaymentOrderStatus {
    return this.status;
  }

  get paidAtDate(): Date | null {
    return this.paidAt ? new Date(this.paidAt) : null;
  }

  get expiredAtDate(): Date | null {
    return this.expiredAt ? new Date(this.expiredAt) : null;
  }

  isOverdue(now: Date): boolean {
    return this.status.isPending() && now.getTime() >= this.dueAt.getTime();
  }

  /** Solo la invoca el agregado cuando la pasarela confirmó el cobro (RN-17). */
  markAsPaid(amount: Money, now: Date): void {
    if (this.status.equals(PaymentOrderStatus.EXPIRED)) {
      throw new DomainError('PAYMENT_ORDER_EXPIRED', 'La orden de pago ya venció y no puede pagarse.');
    }
    if (!this.status.isPending()) {
      throw new DomainError('PAYMENT_ORDER_NOT_PENDING', 'La orden de pago ya fue pagada.');
    }
    if (!amount.equals(this.amount)) {
      throw new DomainError(
        'PAYMENT_AMOUNT_MISMATCH',
        `El valor cobrado (${amount.toString()}) no coincide con el de la orden (${this.amount.toString()}).`,
      );
    }
    this.status = PaymentOrderStatus.PAID;
    this.paidAt = new Date(now);
  }

  /** RN-20: transcurrido el plazo sin confirmación, la orden se declara vencida. */
  expire(now: Date): void {
    if (!this.status.isPending()) return;
    this.status = PaymentOrderStatus.EXPIRED;
    this.expiredAt = new Date(now);
  }

  toSnapshot(): PaymentOrderSnapshot {
    return {
      id: this.id,
      auctionId: this.auctionId,
      winnerId: this.winnerId,
      amount: this.amount.amount,
      issuedAt: new Date(this.issuedAt),
      dueAt: new Date(this.dueAt),
      status: this.status.value,
      paidAt: this.paidAtDate,
      expiredAt: this.expiredAtDate,
    };
  }
}
