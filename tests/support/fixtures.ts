import { Auction } from '../../src/domain/auction/Auction';
import { Item } from '../../src/domain/auction/Item';
import { IdGenerator } from '../../src/domain/shared/IdGenerator';

export const HOUR = 60 * 60 * 1000;
export const T0 = new Date('2026-11-01T15:00:00.000Z');
export const at = (offsetMs: number): Date => new Date(T0.getTime() + offsetMs);

export const SELLER = 'seller-1';
export const ANA = 'bidder-ana';
export const LUIS = 'bidder-luis';

export class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class FixedClock {
  constructor(private current: Date = T0) {}
  now(): Date {
    return new Date(this.current);
  }
  set(date: Date): void {
    this.current = new Date(date);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export function anItem(overrides: Partial<{ title: string; description: string; condition: string }> = {}): Item {
  return Item.create({
    id: 'item-1',
    title: overrides.title ?? 'Cámara Canon AE-1',
    description: overrides.description ?? 'Cámara de rollo en excelente estado, con lente 50mm.',
    condition: overrides.condition ?? 'USED',
    categoryId: 'cat-1',
  });
}

/** Subasta abierta: base $100.000, incremento $10.000, cierra en 24 h. */
export function anOpenAuction(
  overrides: Partial<{ basePrice: number; minIncrement: number; closesAt: Date; now: Date }> = {},
): Auction {
  const auction = Auction.publish({
    id: 'auction-1',
    sellerId: SELLER,
    item: anItem(),
    basePrice: overrides.basePrice ?? 100_000,
    minIncrement: overrides.minIncrement ?? 10_000,
    closesAt: overrides.closesAt ?? at(24 * HOUR),
    now: overrides.now ?? T0,
  });
  auction.pullDomainEvents();
  return auction;
}
