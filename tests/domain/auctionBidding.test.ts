import { beforeEach, describe, expect, it } from 'vitest';
import { Auction, BidOutcome } from '../../src/domain/auction/Auction';
import { BidPlaced } from '../../src/domain/auction/AuctionEvents';
import { ANA, anOpenAuction, at, HOUR, LUIS, SELLER, SequentialIds } from '../support/fixtures';

/** Ayuda para leer el motivo de rechazo en las aserciones. */
const rejection = (outcome: BidOutcome): string | null => (outcome.accepted ? null : outcome.attempt.reason.code);

describe('Aceptación y rechazo de pujas', () => {
  let auction: Auction;
  let ids: SequentialIds;
  const now = at(HOUR);

  beforeEach(() => {
    auction = anOpenAuction({ basePrice: 100_000, minIncrement: 10_000 });
    ids = new SequentialIds();
  });

  describe('RN-08: primera puja', () => {
    it('acepta una primera puja igual al precio base', () => {
      const outcome = auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
      expect(outcome.accepted).toBe(true);
      expect(auction.highestBid()?.amount.amount).toBe(100_000);
    });

    it('rechaza una primera puja inferior al precio base', () => {
      expect(rejection(auction.placeBid({ bidderId: ANA, amount: 99_999 }, now, ids))).toBe('BELOW_BASE_PRICE');
      expect(auction.hasBids()).toBe(false);
    });
  });

  describe('RN-09: incremento mínimo', () => {
    beforeEach(() => {
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
    });

    it('acepta una puja que supera la vigente en exactamente el incremento', () => {
      expect(auction.placeBid({ bidderId: LUIS, amount: 110_000 }, now, ids).accepted).toBe(true);
    });

    it('rechaza una puja igual a la vigente', () => {
      expect(rejection(auction.placeBid({ bidderId: LUIS, amount: 100_000 }, now, ids))).toBe('BELOW_MINIMUM_INCREMENT');
    });

    it('rechaza una puja que supera la vigente por menos del incremento', () => {
      expect(rejection(auction.placeBid({ bidderId: LUIS, amount: 109_999 }, now, ids))).toBe('BELOW_MINIMUM_INCREMENT');
    });

    it('informa el siguiente valor mínimo aceptable', () => {
      expect(auction.minimumNextBid().amount).toBe(110_000);
    });
  });

  it('RN-07: el vendedor no puede pujar por su propio artículo', () => {
    expect(rejection(auction.placeBid({ bidderId: SELLER, amount: 500_000 }, now, ids))).toBe('SELLER_CANNOT_BID');
  });

  it('RN-10: el mejor postor no puede superar su propia puja', () => {
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
    expect(rejection(auction.placeBid({ bidderId: ANA, amount: 200_000 }, now, ids))).toBe('ALREADY_HIGHEST_BIDDER');
  });

  it('RN-10: puede volver a pujar cuando otro lo supera', () => {
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
    auction.placeBid({ bidderId: LUIS, amount: 110_000 }, now, ids);
    expect(auction.placeBid({ bidderId: ANA, amount: 120_000 }, now, ids).accepted).toBe(true);
  });

  it('RN-21: rechaza montos con decimales', () => {
    expect(rejection(auction.placeBid({ bidderId: ANA, amount: 100_000.5 }, now, ids))).toBe('INVALID_AMOUNT');
  });

  describe('RN-06: solo subastas abiertas', () => {
    it('rechaza pujas sobre una subasta cancelada', () => {
      auction.cancel(SELLER, now, ids);
      expect(rejection(auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids))).toBe('AUCTION_NOT_OPEN');
    });

    it('rechaza una puja que llega justo en la fecha de cierre (y cierra la subasta)', () => {
      const outcome = auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(24 * HOUR), ids);
      expect(rejection(outcome)).toBe('AUCTION_NOT_OPEN');
      expect(auction.currentStatus.value).toBe('DESERTED');
    });

    it('rechaza pujas sobre una subasta adjudicada', () => {
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
      auction.closeIfDue(at(25 * HOUR), ids);
      expect(rejection(auction.placeBid({ bidderId: LUIS, amount: 500_000 }, at(25 * HOUR), ids))).toBe(
        'AUCTION_NOT_OPEN',
      );
    });
  });

  describe('RN-12: auditoría de intentos rechazados', () => {
    it('registra cada intento rechazado con su motivo y monto original', () => {
      auction.placeBid({ bidderId: SELLER, amount: 150_000 }, now, ids);
      auction.placeBid({ bidderId: ANA, amount: 50_000 }, now, ids);
      const attempts = auction.rejectedBidAttempts;
      expect(attempts).toHaveLength(2);
      expect(attempts.map((a) => [a.bidderId, a.amount, a.reason.code])).toEqual([
        [SELLER, 150_000, 'SELLER_CANNOT_BID'],
        [ANA, 50_000, 'BELOW_BASE_PRICE'],
      ]);
    });

    it('emite BidRejected para que quede en el registro de eventos', () => {
      auction.placeBid({ bidderId: SELLER, amount: 150_000 }, now, ids);
      expect(auction.pullDomainEvents().map((e) => e.type)).toEqual(['BidRejected']);
    });
  });

  describe('RN-11: pujas irrevocables', () => {
    it('la lista expuesta es una copia: modificarla no altera el agregado', () => {
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
      const exposed = auction.acceptedBids as unknown as unknown[];
      exposed.pop();
      expect(auction.acceptedBids).toHaveLength(1);
    });

    it('una puja aceptada no se puede alterar', () => {
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
      const bid = auction.acceptedBids[0];
      expect(Object.isFrozen(bid)).toBe(true);
    });
  });

  it('anuncia BidPlaced con el postor superado (base de RF-13 y RF-14)', () => {
    auction.placeBid({ bidderId: ANA, amount: 100_000 }, now, ids);
    auction.pullDomainEvents();
    auction.placeBid({ bidderId: LUIS, amount: 130_000 }, now, ids);
    const [event] = auction.pullDomainEvents() as BidPlaced[];
    expect(event).toMatchObject({
      type: 'BidPlaced',
      bidderId: LUIS,
      amount: 130_000,
      previousHighestBidderId: ANA,
      previousHighestAmount: 100_000,
      minimumNextBid: 140_000,
    });
  });
});
