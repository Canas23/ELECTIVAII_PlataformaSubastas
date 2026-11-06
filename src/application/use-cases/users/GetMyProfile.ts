import { ApplicationError } from '../../errors/ApplicationError';
import { AuctionSummaryView, toAuctionSummary, toUserView, UserView } from '../../dto/views';
import { AuctionRepository, UserRepository } from '../../ports/repositories';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';

export interface MyProfileView {
  user: UserView;
  publishedAuctions: AuctionSummaryView[];
  participatedAuctions: AuctionSummaryView[];
}

/** RF-03: perfil del usuario autenticado con sus subastas publicadas y en las que participó. */
export class GetMyProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly auctions: AuctionRepository,
    private readonly lifecycle: AuctionLifecycle,
  ) {}

  async execute(userId: string): Promise<MyProfileView> {
    const user = await this.users.findById(userId);
    if (!user) throw ApplicationError.notFound('USER_NOT_FOUND', 'El usuario no existe.');

    await this.lifecycle.settleAllDue();
    const [published, participated] = await Promise.all([
      this.auctions.findBySeller(userId),
      this.auctions.findByBidder(userId),
    ]);
    return {
      user: toUserView(user),
      publishedAuctions: published.map(toAuctionSummary),
      participatedAuctions: participated.map(toAuctionSummary),
    };
  }
}
