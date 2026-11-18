/**
 * El dominio necesita crear identidades (pujas, órdenes de pago) sin depender
 * de ninguna librería concreta. La implementación vive en infraestructura.
 */
export interface IdGenerator {
  next(): string;
}
