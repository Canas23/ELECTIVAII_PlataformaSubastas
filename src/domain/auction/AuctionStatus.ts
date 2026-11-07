import { DomainError } from '../shared/DomainError';

export const AUCTION_STATUS_VALUES = ['OPEN', 'CANCELLED', 'DESERTED', 'ADJUDICATED', 'PAID', 'DEFAULTED'] as const;
export type AuctionStatusValue = (typeof AUCTION_STATUS_VALUES)[number];

export class AuctionStatus {
  static readonly OPEN = new AuctionStatus('OPEN');
  static readonly CANCELLED = new AuctionStatus('CANCELLED');
  static readonly DESERTED = new AuctionStatus('DESERTED');
  static readonly ADJUDICATED = new AuctionStatus('ADJUDICATED');
  static readonly PAID = new AuctionStatus('PAID');
  static readonly DEFAULTED = new AuctionStatus('DEFAULTED');

  private constructor(readonly value: AuctionStatusValue) {
    Object.freeze(this);
  }

  static from(raw: string): AuctionStatus {
    switch (raw) {
      case 'OPEN':
        return AuctionStatus.OPEN;
      case 'CANCELLED':
        return AuctionStatus.CANCELLED;
      case 'DESERTED':
        return AuctionStatus.DESERTED;
      case 'ADJUDICATED':
        return AuctionStatus.ADJUDICATED;
      case 'PAID':
        return AuctionStatus.PAID;
      case 'DEFAULTED':
        return AuctionStatus.DEFAULTED;
      default:
        throw new DomainError('INVALID_STATUS', `Estado de subasta desconocido: ${raw}`);
    }
  }

  /** RN-06: solo una subasta abierta admite ofertas. */
  acceptsBids(): boolean {
    return this === AuctionStatus.OPEN;
  }

  isOpen(): boolean {
    return this === AuctionStatus.OPEN;
  }

  isAdjudicated(): boolean {
    return this === AuctionStatus.ADJUDICATED;
  }

  equals(other: AuctionStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
