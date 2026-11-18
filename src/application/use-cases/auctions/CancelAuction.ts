import { IdGenerator } from '../../../domain/shared/IdGenerator';
import { AuctionDetailView, toAuctionDetail } from '../../dto/views';
import { UserRepository } from '../../ports/repositories';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';
import { resolveUserNames } from '../../shared/userNames';

/** RF-07: el vendedor cancela una subasta sin pujas (la regla RN-04 está en Auction.cancel). */
export class CancelAuction {
  constructor(
    private readonly lifecycle: AuctionLifecycle,
    private readonly users: UserRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { auctionId: string; requesterId: string }): Promise<AuctionDetailView> {
    const auction = await this.lifecycle.withAuction(input.auctionId, (a, now) => {
      a.cancel(input.requesterId, now, this.ids);
      return a;
    });
    return toAuctionDetail(auction, await resolveUserNames(this.users, [auction.sellerId]));
  }
}
