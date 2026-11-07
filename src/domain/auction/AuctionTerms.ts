import { DomainError } from '../shared/DomainError';
import { Money } from '../shared/Money';

export const MIN_AUCTION_DURATION_MS = 60 * 60 * 1000; // 1 hora
export const MAX_AUCTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días calendario

/**
 * Objeto de valor: condiciones económicas y temporales fijadas al publicar.
 * Es inmutable (RN-05): no expone ningún método que permita alterarlas.
 */
export class AuctionTerms {
  private readonly closesAtMs: number;

  private constructor(
    readonly basePrice: Money,
    readonly minIncrement: Money,
    closesAt: Date,
  ) {
    this.closesAtMs = closesAt.getTime();
    Object.freeze(this);
  }

  /**
   * Crea las condiciones de una subasta nueva validando las reglas de publicación.
   */
  static forPublication(
    props: { basePrice: number; minIncrement: number; closesAt: Date },
    publishedAt: Date,
  ): AuctionTerms {
    const basePrice = Money.of(props.basePrice);
    const minIncrement = Money.of(props.minIncrement);

    // RN-01: precio base mayor que cero
    if (!basePrice.isPositive()) {
      throw new DomainError('INVALID_BASE_PRICE', 'El precio base debe ser mayor que cero.');
    }
    // RN-01: incremento mínimo mayor que cero
    if (!minIncrement.isPositive()) {
      throw new DomainError('INVALID_MIN_INCREMENT', 'El incremento mínimo debe ser mayor que cero.');
    }
    // RN-01: fecha y hora de cierre obligatoria y válida
    if (!(props.closesAt instanceof Date) || Number.isNaN(props.closesAt.getTime())) {
      throw new DomainError('INVALID_CLOSING_DATE', 'La fecha de cierre es obligatoria y debe ser válida.');
    }

    const durationMs = props.closesAt.getTime() - publishedAt.getTime();

    // RN-02: una subasta no puede nacer vencida
    if (durationMs <= 0) {
      throw new DomainError('CLOSING_DATE_IN_PAST', 'La fecha de cierre debe ser posterior al momento de publicación.');
    }
    // RN-03: duración entre una hora y treinta días calendario
    if (durationMs < MIN_AUCTION_DURATION_MS || durationMs > MAX_AUCTION_DURATION_MS) {
      throw new DomainError(
        'INVALID_AUCTION_DURATION',
        'La duración de la subasta debe estar entre una hora y treinta días calendario.',
      );
    }

    return new AuctionTerms(basePrice, minIncrement, props.closesAt);
  }

  /** Reconstruye condiciones ya publicadas (desde persistencia) sin revalidar plazos. */
  static restore(props: { basePrice: number; minIncrement: number; closesAt: Date }): AuctionTerms {
    return new AuctionTerms(Money.of(props.basePrice), Money.of(props.minIncrement), new Date(props.closesAt));
  }

  get closesAt(): Date {
    return new Date(this.closesAtMs);
  }

  /** Cierre perezoso: ¿ya llegó la fecha de cierre? */
  hasExpired(now: Date): boolean {
    return now.getTime() >= this.closesAtMs;
  }
}
