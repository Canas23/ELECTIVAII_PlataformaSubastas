import { Auction } from '../../domain/auction/Auction';
import { IdGenerator } from '../../domain/shared/IdGenerator';
import { ApplicationError } from '../errors/ApplicationError';
import { AuctionRepository } from '../ports/repositories';
import { Clock, EventPublisher } from '../ports/services';
import { KeyedMutex } from '../shared/KeyedMutex';


export class AuctionLifecycle {
  constructor(
    private readonly auctions: AuctionRepository,
    private readonly publisher: EventPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly mutex: KeyedMutex = new KeyedMutex(),
  ) {}

  /**
   * Ejecuta `work` con acceso exclusivo a la subasta, ya evaluada al instante
   * actual. Al terminar (con o sin error) persiste y anuncia lo ocurrido, para
   * que un cierre perezoso o un intento rechazado nunca se pierdan.
   */
  async withAuction<T>(auctionId: string, work: (auction: Auction, now: Date) => T | Promise<T>): Promise<T> {
    return this.mutex.run(`auction:${auctionId}`, async () => {
      const auction = await this.auctions.findById(auctionId);
      if (!auction) {
        throw ApplicationError.notFound('AUCTION_NOT_FOUND', 'La subasta solicitada no existe.');
      }
      const now = this.clock.now();
      auction.settle(now, this.ids);
      try {
        return await work(auction, now);
      } finally {
        await this.commit(auction);
      }
    });
  }

  /** Cierre perezoso de una subasta consultada (RF-08). */
  async loadSettled(auctionId: string): Promise<Auction> {
    return this.withAuction(auctionId, (auction) => auction);
  }

  /**
   * Antes de un listado: evalúa las subastas abiertas vencidas y las órdenes de
   * pago vencidas, para que los filtros por estado reflejen la realidad.
   */
  async settleAllDue(): Promise<void> {
    const ids = await this.auctions.findIdsPendingSettlement(this.clock.now());
    for (const id of ids) {
      await this.loadSettled(id);
    }
  }

  private async commit(auction: Auction): Promise<void> {
    const events = auction.pullDomainEvents();
    if (events.length === 0) return;
    await this.auctions.save(auction);
    await this.publisher.publish(events);
  }

  /** Persiste y anuncia una subasta recién creada. */
  async commitNew(auction: Auction): Promise<void> {
    await this.auctions.save(auction);
    await this.publisher.publish(auction.pullDomainEvents());
  }
}
