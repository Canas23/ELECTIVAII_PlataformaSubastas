import { AuctionDetailView, PublicBidView, toAuctionDetail, toPublicBidView } from '../../dto/views';
import { UserRepository } from '../../ports/repositories';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';
import { resolveUserNames } from '../../shared/userNames';

/** RF-06: detalle con estado, oferta vigente e historial público de pujas (RN-23). */
export class GetAuctionDetail {
  constructor(
    private readonly lifecycle: AuctionLifecycle,
    private readonly users: UserRepository,
  ) {}

  async execute(auctionId: string): Promise<AuctionDetailView> {
    // RF-08: consultar la subasta dispara su cierre si la fecha ya se cumplió
    const auction = await this.lifecycle.loadSettled(auctionId);
    const names = await resolveUserNames(this.users, [auction.sellerId, ...auction.bidderIds()]);
    return toAuctionDetail(auction, names);
  }

  async bidHistory(auctionId: string): Promise<PublicBidView[]> {
    const auction = await this.lifecycle.loadSettled(auctionId);
    const names = await resolveUserNames(this.users, auction.bidderIds());
    return [...auction.acceptedBids].reverse().map((b) => toPublicBidView(b, names));
  }
}
