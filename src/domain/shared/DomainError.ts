/**
 * Códigos de error del dominio. Cada código identifica una regla de negocio
 * violada; la capa HTTP los traduce a códigos de estado sin conocer las reglas.
 */
export type DomainErrorCode =
  // Valores (RN-21, RN-22, RNF-07)
  | 'INVALID_MONEY'
  | 'INVALID_EMAIL'
  | 'INVALID_USER_NAME'
  | 'INVALID_STATUS'
  | 'INVALID_ITEM'
  | 'INVALID_CATEGORY'
  | 'INVALID_NOTIFICATION'
  | 'INVALID_PAYMENT_EVENT'
  // Publicación (RN-01..RN-03)
  | 'INVALID_BASE_PRICE'
  | 'INVALID_MIN_INCREMENT'
  | 'INVALID_CLOSING_DATE'
  | 'CLOSING_DATE_IN_PAST'
  | 'INVALID_AUCTION_DURATION'
  // Cancelación (RN-04)
  | 'NOT_AUCTION_SELLER'
  | 'AUCTION_HAS_BIDS'
  | 'AUCTION_NOT_OPEN'
  // Pago (RN-15, RN-17, RN-20)
  | 'PAYMENT_ORDER_NOT_FOUND'
  | 'PAYMENT_ORDER_NOT_PENDING'
  | 'PAYMENT_ORDER_EXPIRED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  // Notificaciones
  | 'NOT_NOTIFICATION_OWNER';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
