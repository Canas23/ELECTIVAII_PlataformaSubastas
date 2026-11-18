import { IdGenerator } from '../../../domain/shared/IdGenerator';
import { BidRejectionCode } from '../../../domain/auction/BidRejectionReason';
import { ApplicationError, ApplicationErrorKind } from '../../errors/ApplicationError';
import { AuctionSummaryView, PublicBidView, toAuctionSummary, toPublicBidView } from '../../dto/views';
import { UserRepository } from '../../ports/repositories';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';

export interface PlaceBidInput {
  auctionId: string;
  bidderId: string;
  amount: number;
}

export interface PlaceBidResult {
  bid: PublicBidView;
  auction: AuctionSummaryView;
}

export class BidRejectedError extends ApplicationError {
  constructor(code: BidRejectionCode, message: string, details: Record<string, unknown>) {
    super(BidRejectedError.kindFor(code), code, message, details);
    this.name = 'BidRejectedError';
  }

  /** Conflicto con el estado actual (409), falta de permiso (403) o monto inválido (422). */
  private static kindFor(code: BidRejectionCode): ApplicationErrorKind {
    switch (code) {
      case 'AUCTION_NOT_OPEN':
      case 'ALREADY_HIGHEST_BIDDER':
        return 'CONFLICT';
      case 'SELLER_CANNOT_BID':
        return 'FORBIDDEN';
      case 'INVALID_AMOUNT':
      case 'BELOW_BASE_PRICE':
      case 'BELOW_MINIMUM_INCREMENT':
        return 'UNPROCESSABLE';
    }
  }
}

/**
 * RF-09 / RF-10 / RF-11: registrar una puja.
 */
export class PlaceBid {
  constructor(
    private readonly lifecycle: AuctionLifecycle,
    private readonly users: UserRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: PlaceBidInput): Promise<PlaceBidResult> {
    const outcome = await this.lifecycle.withAuction(input.auctionId, (auction, now) => {
      const result = auction.placeBid({ bidderId: input.bidderId, amount: input.amount }, now, this.ids);
      return { result, summary: toAuctionSummary(auction) };
    });

    const { result, summary } = outcome;
    if (!result.accepted) {
      // El intento ya quedó persistido (RN-12); ahora se informa el motivo (RN-10, RF-10)
      throw new BidRejectedError(result.attempt.reason.code, result.attempt.reason.message, {
        attemptId: result.attempt.id,
        auctionStatus: summary.status,
        currentPrice: summary.currentPrice,
        minimumNextBid: summary.minimumNextBid,
      });
    }

    const bidder = await this.users.findById(input.bidderId);
    const names = new Map<string, string>(bidder ? [[bidder.id, bidder.name]] : []);
    return { bid: toPublicBidView(result.bid, names), auction: summary };
  }
}
