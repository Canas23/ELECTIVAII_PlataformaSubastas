import { describe, expect, it } from 'vitest';
import { Auction } from '../../src/domain/auction/Auction';
import { DomainError } from '../../src/domain/shared/DomainError';
import { anItem, anOpenAuction, at, HOUR, SELLER, SequentialIds, T0 } from '../support/fixtures';

const publish = (overrides: Partial<{ basePrice: number; minIncrement: number; closesAt: Date }>) =>
  Auction.publish({
    id: 'a-1',
    sellerId: SELLER,
    item: anItem(),
    basePrice: overrides.basePrice ?? 100_000,
    minIncrement: overrides.minIncrement ?? 10_000,
    closesAt: overrides.closesAt ?? at(24 * HOUR),
    now: T0,
  });

const expectDomainError = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Se esperaba DomainError ${code}`);
};

describe('Publicación de subastas', () => {
  it('publica una subasta abierta y anuncia AuctionPublished', () => {
    const auction = publish({});
    expect(auction.currentStatus.value).toBe('OPEN');
    expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['AuctionPublished']);
  });

  it('RN-01: el precio base debe ser mayor que cero', () => {
    expectDomainError(() => publish({ basePrice: 0 }), 'INVALID_BASE_PRICE');
  });

  it('RN-01: el incremento mínimo debe ser mayor que cero', () => {
    expectDomainError(() => publish({ minIncrement: 0 }), 'INVALID_MIN_INCREMENT');
  });

  it('RN-01 / RN-21: los montos no admiten decimales ni negativos', () => {
    expectDomainError(() => publish({ basePrice: 1000.5 }), 'INVALID_MONEY');
    expectDomainError(() => publish({ minIncrement: -5 }), 'INVALID_MONEY');
  });

  it('RN-01: la fecha de cierre debe ser válida', () => {
    expectDomainError(() => publish({ closesAt: new Date('no-es-fecha') }), 'INVALID_CLOSING_DATE');
  });

  it('RN-02: una subasta no puede nacer vencida', () => {
    expectDomainError(() => publish({ closesAt: at(-1) }), 'CLOSING_DATE_IN_PAST');
    expectDomainError(() => publish({ closesAt: T0 }), 'CLOSING_DATE_IN_PAST');
  });

  it('RN-03: duración mínima de una hora', () => {
    expectDomainError(() => publish({ closesAt: at(HOUR - 1) }), 'INVALID_AUCTION_DURATION');
    expect(publish({ closesAt: at(HOUR) }).currentStatus.value).toBe('OPEN');
  });

  it('RN-03: duración máxima de treinta días', () => {
    expectDomainError(() => publish({ closesAt: at(30 * 24 * HOUR + 1) }), 'INVALID_AUCTION_DURATION');
    expect(publish({ closesAt: at(30 * 24 * HOUR) }).currentStatus.value).toBe('OPEN');
  });

  it('RN-05: las condiciones publicadas son inmutables', () => {
    const auction = anOpenAuction();
    expect(Object.isFrozen(auction.terms)).toBe(true);
    expect(Object.isFrozen(auction.item)).toBe(true);
    expect(() => {
      (auction.terms as unknown as { basePrice: unknown }).basePrice = 1;
    }).toThrow(TypeError);
    // La fecha que devuelve terms es una copia: modificarla no altera la subasta
    auction.terms.closesAt.setFullYear(2000);
    expect(auction.terms.closesAt.getFullYear()).toBe(2026);
  });
});

describe('Cancelación (RN-04)', () => {
  const ids = new SequentialIds();

  it('el vendedor puede cancelar mientras no haya pujas', () => {
    const auction = anOpenAuction();
    auction.cancel(SELLER, at(HOUR), ids);
    expect(auction.currentStatus.value).toBe('CANCELLED');
    expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['AuctionCancelled']);
  });

  it('no se puede cancelar después de la primera puja', () => {
    const auction = anOpenAuction();
    auction.placeBid({ bidderId: 'b-1', amount: 100_000 }, at(HOUR), ids);
    expectDomainError(() => auction.cancel(SELLER, at(2 * HOUR), ids), 'AUCTION_HAS_BIDS');
    expect(auction.currentStatus.value).toBe('OPEN');
  });

  it('solo el vendedor puede cancelar', () => {
    expectDomainError(() => anOpenAuction().cancel('otro', at(HOUR), ids), 'NOT_AUCTION_SELLER');
  });

  it('no se puede cancelar una subasta ya cerrada', () => {
    const auction = anOpenAuction();
    expectDomainError(() => auction.cancel(SELLER, at(25 * HOUR), ids), 'AUCTION_NOT_OPEN');
    expect(auction.currentStatus.value).toBe('DESERTED');
  });
});
