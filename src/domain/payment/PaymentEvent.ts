import { DomainError } from '../shared/DomainError';
import { Money } from '../shared/Money';

export const PAYMENT_EVENT_TYPES = ['payment.approved', 'payment.rejected'] as const;
export type PaymentEventTypeValue = (typeof PAYMENT_EVENT_TYPES)[number];

/** Objeto de valor: resultado del cobro informado por la pasarela. */
export class PaymentEventType {
  static readonly APPROVED = new PaymentEventType('payment.approved');
  static readonly REJECTED = new PaymentEventType('payment.rejected');

  private constructor(readonly value: PaymentEventTypeValue) {
    Object.freeze(this);
  }

  static from(raw: string): PaymentEventType {
    if (raw === 'payment.approved') return PaymentEventType.APPROVED;
    if (raw === 'payment.rejected') return PaymentEventType.REJECTED;
    throw new DomainError('INVALID_PAYMENT_EVENT', `Tipo de evento de pago desconocido: ${raw}`);
  }

  isApproval(): boolean {
    return this === PaymentEventType.APPROVED;
  }
}

/** Cómo terminó el procesamiento de un evento de pago ya verificado. */
export const PAYMENT_EVENT_OUTCOMES = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILURE_RECORDED',
  'IGNORED_ORDER_EXPIRED',
  'IGNORED_ORDER_NOT_PENDING',
  'IGNORED_AMOUNT_MISMATCH',
] as const;
export type PaymentEventOutcome = (typeof PAYMENT_EVENT_OUTCOMES)[number];

export interface PaymentEventSnapshot {
  eventId: string;
  paymentOrderId: string;
  type: string;
  amount: number;
  occurredAt: Date;
  receivedAt: Date;
  outcome: string;
}

export class PaymentEvent {
  private constructor(
    readonly eventId: string,
    readonly paymentOrderId: string,
    readonly type: PaymentEventType,
    readonly amount: Money,
    readonly occurredAt: Date,
    readonly receivedAt: Date,
    readonly outcome: PaymentEventOutcome,
  ) {
    Object.freeze(this);
  }

  static record(props: {
    eventId: string;
    paymentOrderId: string;
    type: PaymentEventType;
    amount: Money;
    occurredAt: Date;
    receivedAt: Date;
    outcome: PaymentEventOutcome;
  }): PaymentEvent {
    if (props.eventId.trim().length === 0) {
      throw new DomainError('INVALID_PAYMENT_EVENT', 'El evento de pago debe tener identificador.');
    }
    return new PaymentEvent(
      props.eventId,
      props.paymentOrderId,
      props.type,
      props.amount,
      new Date(props.occurredAt),
      new Date(props.receivedAt),
      props.outcome,
    );
  }

  static restore(s: PaymentEventSnapshot): PaymentEvent {
    if (!(PAYMENT_EVENT_OUTCOMES as readonly string[]).includes(s.outcome)) {
      throw new DomainError('INVALID_PAYMENT_EVENT', `Resultado desconocido: ${s.outcome}`);
    }
    return new PaymentEvent(
      s.eventId,
      s.paymentOrderId,
      PaymentEventType.from(s.type),
      Money.of(s.amount),
      new Date(s.occurredAt),
      new Date(s.receivedAt),
      s.outcome as PaymentEventOutcome,
    );
  }

  toSnapshot(): PaymentEventSnapshot {
    return {
      eventId: this.eventId,
      paymentOrderId: this.paymentOrderId,
      type: this.type.value,
      amount: this.amount.amount,
      occurredAt: new Date(this.occurredAt),
      receivedAt: new Date(this.receivedAt),
      outcome: this.outcome,
    };
  }
}
