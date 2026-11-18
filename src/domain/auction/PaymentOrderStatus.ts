import { DomainError } from '../shared/DomainError';

export const PAYMENT_ORDER_STATUS_VALUES = ['PENDING', 'PAID', 'EXPIRED'] as const;
export type PaymentOrderStatusValue = (typeof PAYMENT_ORDER_STATUS_VALUES)[number];

/** Objeto de valor: estado de una orden de pago (RNF-07). */
export class PaymentOrderStatus {
  static readonly PENDING = new PaymentOrderStatus('PENDING');
  static readonly PAID = new PaymentOrderStatus('PAID');
  static readonly EXPIRED = new PaymentOrderStatus('EXPIRED');

  private constructor(readonly value: PaymentOrderStatusValue) {
    Object.freeze(this);
  }

  static from(raw: string): PaymentOrderStatus {
    switch (raw) {
      case 'PENDING':
        return PaymentOrderStatus.PENDING;
      case 'PAID':
        return PaymentOrderStatus.PAID;
      case 'EXPIRED':
        return PaymentOrderStatus.EXPIRED;
      default:
        throw new DomainError('INVALID_STATUS', `Estado de orden de pago desconocido: ${raw}`);
    }
  }

  isPending(): boolean {
    return this === PaymentOrderStatus.PENDING;
  }

  equals(other: PaymentOrderStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
