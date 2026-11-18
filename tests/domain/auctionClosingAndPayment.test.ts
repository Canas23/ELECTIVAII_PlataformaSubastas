import { beforeEach, describe, expect, it } from 'vitest';
import { Auction } from '../../src/domain/auction/Auction';
import { AuctionAdjudicated } from '../../src/domain/auction/AuctionEvents';
import { DomainError } from '../../src/domain/shared/DomainError';
import { Money } from '../../src/domain/shared/Money';
import { ANA, anOpenAuction, at, HOUR, LUIS, SequentialIds } from '../support/fixtures';

const CLOSES = 24 * HOUR;

describe('Cierre y adjudicación', () => {
  let auction: Auction;
  let ids: SequentialIds;

  beforeEach(() => {
    auction = anOpenAuction({ closesAt: at(CLOSES) });
    ids = new SequentialIds();
  });

  it('no cierra antes de la fecha de cierre', () => {
    expect(auction.closeIfDue(at(CLOSES - 1), ids)).toBe(false);
    expect(auction.currentStatus.value).toBe('OPEN');
  });

  it('RN-13: adjudica al autor de la oferta más alta', () => {
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
    auction.placeBid({ bidderId: LUIS, amount: 150_000 }, at(2 * HOUR), ids);
    auction.closeIfDue(at(CLOSES), ids);

    expect(auction.currentStatus.value).toBe('ADJUDICATED');
    expect(auction.winner).toBe(LUIS);
  });

  it('RN-14: sin pujas se declara desierta y no genera orden de pago', () => {
    auction.closeIfDue(at(CLOSES), ids);
    expect(auction.currentStatus.value).toBe('DESERTED');
    expect(auction.order).toBeNull();
    expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['AuctionDeserted']);
  });

  it('RN-15: genera la orden por el valor ganador, a nombre del ganador, con plazo de 48 h', () => {
    auction.placeBid({ bidderId: ANA, amount: 180_000 }, at(HOUR), ids);
    auction.closeIfDue(at(CLOSES), ids);

    const order = auction.order;
    expect(order).not.toBeNull();
    expect(order?.winnerId).toBe(ANA);
    expect(order?.amount.amount).toBe(180_000);
    expect(order?.currentStatus.value).toBe('PENDING');
    expect(order?.dueAt.getTime()).toBe(at(CLOSES + 48 * HOUR).getTime());

    const event = auction.pullDomainEvents().find((e) => e.type === 'AuctionAdjudicated') as AuctionAdjudicated;
    expect(event).toMatchObject({ winnerId: ANA, winningAmount: 180_000, paymentOrderId: order?.id });
  });

  it('RN-16: un segundo cierre no altera el resultado ni genera otra orden', () => {
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
    auction.closeIfDue(at(CLOSES), ids);
    const firstOrderId = auction.order?.id;
    auction.pullDomainEvents();

    expect(auction.closeIfDue(at(CLOSES + HOUR), ids)).toBe(false);
    expect(auction.settle(at(CLOSES + 2 * HOUR), ids)).toBe(false);
    expect(auction.order?.id).toBe(firstOrderId);
    expect(auction.winner).toBe(ANA);
    expect(auction.pullDomainEvents()).toEqual([]);
  });

  it('el cierre perezoso se dispara al consultar (settle)', () => {
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
    expect(auction.settle(at(CLOSES + 5 * HOUR), ids)).toBe(true);
    expect(auction.currentStatus.value).toBe('ADJUDICATED');
  });
});

describe('Pago', () => {
  let auction: Auction;
  let ids: SequentialIds;
  let orderId: string;
  const closedAt = at(CLOSES);

  beforeEach(() => {
    ids = new SequentialIds();
    auction = anOpenAuction({ closesAt: at(CLOSES) });
    auction.placeBid({ bidderId: ANA, amount: 200_000 }, at(HOUR), ids);
    auction.closeIfDue(closedAt, ids);
    auction.pullDomainEvents();
    orderId = auction.order?.id ?? '';
  });

  it('RN-17: la confirmación de la pasarela marca la orden y la subasta como pagadas', () => {
    auction.confirmPayment(orderId, Money.of(200_000), at(CLOSES + HOUR));
    expect(auction.order?.currentStatus.value).toBe('PAID');
    expect(auction.currentStatus.value).toBe('PAID');
    expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['PaymentConfirmed']);
  });

  it('RN-17: no se confirma un pago por un valor distinto al de la orden', () => {
    expect(() => auction.confirmPayment(orderId, Money.of(1), at(CLOSES + HOUR))).toThrowError(DomainError);
    expect(auction.order?.currentStatus.value).toBe('PENDING');
  });

  it('una orden pagada no puede volver a pagarse', () => {
    auction.confirmPayment(orderId, Money.of(200_000), at(CLOSES + HOUR));
    expect(() => auction.confirmPayment(orderId, Money.of(200_000), at(CLOSES + 2 * HOUR))).toThrowError(
      expect.objectContaining({ code: 'PAYMENT_ORDER_NOT_PENDING' }),
    );
  });

  it('RN-20: vencido el plazo, la orden vence y la subasta queda en incumplimiento', () => {
    expect(auction.settle(at(CLOSES + 48 * HOUR), ids)).toBe(true);
    expect(auction.order?.currentStatus.value).toBe('EXPIRED');
    expect(auction.currentStatus.value).toBe('DEFAULTED');
    expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['PaymentOrderExpired']);
  });

  it('RN-20: una confirmación que llega después del vencimiento no se aplica', () => {
    expect(() => auction.confirmPayment(orderId, Money.of(200_000), at(CLOSES + 49 * HOUR))).toThrowError(
      expect.objectContaining({ code: 'PAYMENT_ORDER_EXPIRED' }),
    );
    expect(auction.currentStatus.value).toBe('DEFAULTED');
  });

  it('un cobro fallido deja la orden pendiente', () => {
    auction.registerFailedPayment(orderId, at(CLOSES + HOUR));
    expect(auction.order?.currentStatus.value).toBe('PENDING');
    expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['PaymentFailed']);
  });

  it('rechaza una orden que no pertenece a la subasta', () => {
    expect(() => auction.confirmPayment('otra-orden', Money.of(200_000), at(CLOSES + HOUR))).toThrowError(
      expect.objectContaining({ code: 'PAYMENT_ORDER_NOT_FOUND' }),
    );
  });
});

describe('Reconstrucción desde persistencia', () => {
  it('restore(toSnapshot()) conserva estado, pujas, intentos y orden', () => {
    const ids = new SequentialIds();
    const auction = anOpenAuction({ closesAt: at(CLOSES) });
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
    auction.placeBid({ bidderId: ANA, amount: 300_000 }, at(HOUR), ids); // rechazada (RN-10)
    auction.closeIfDue(at(CLOSES), ids);

    const restored = Auction.restore(auction.toSnapshot());
    expect(restored.toSnapshot()).toEqual(auction.toSnapshot());
    expect(restored.pullDomainEvents()).toEqual([]);
  });
});
