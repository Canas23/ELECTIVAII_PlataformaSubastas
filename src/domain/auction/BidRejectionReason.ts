import { DomainError } from '../shared/DomainError';

export const BID_REJECTION_CODES = [
  'AUCTION_NOT_OPEN', // RN-06
  'SELLER_CANNOT_BID', // RN-07
  'ALREADY_HIGHEST_BIDDER', // RN-10
  'INVALID_AMOUNT', // RN-21
  'BELOW_BASE_PRICE', // RN-08
  'BELOW_MINIMUM_INCREMENT', // RN-09
] as const;
export type BidRejectionCode = (typeof BID_REJECTION_CODES)[number];

const MESSAGES: Record<BidRejectionCode, string> = {
  AUCTION_NOT_OPEN: 'La subasta no está abierta: una subasta cerrada, cancelada o desierta no admite ofertas.',
  SELLER_CANNOT_BID: 'No puedes pujar por un artículo que tú mismo publicaste.',
  ALREADY_HIGHEST_BIDDER: 'Ya eres el mejor postor: no puedes superar tu propia puja.',
  INVALID_AMOUNT: 'El valor de la puja debe ser un entero positivo en pesos colombianos, sin decimales.',
  BELOW_BASE_PRICE: 'La primera puja debe ser mayor o igual al precio base.',
  BELOW_MINIMUM_INCREMENT: 'La puja debe superar a la oferta vigente en al menos el incremento mínimo.',
};

export class BidRejectionReason {
  private constructor(
    readonly code: BidRejectionCode,
    readonly message: string,
  ) {
    Object.freeze(this);
  }

  static of(code: BidRejectionCode, detail?: string): BidRejectionReason {
    return new BidRejectionReason(code, detail ? `${MESSAGES[code]} ${detail}` : MESSAGES[code]);
  }

  static restore(code: string, message: string): BidRejectionReason {
    if (!(BID_REJECTION_CODES as readonly string[]).includes(code)) {
      throw new DomainError('INVALID_STATUS', `Motivo de rechazo desconocido: ${code}`);
    }
    return new BidRejectionReason(code as BidRejectionCode, message);
  }
}
