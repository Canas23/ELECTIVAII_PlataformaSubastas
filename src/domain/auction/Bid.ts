import { Money } from '../shared/Money';

export interface BidSnapshot {
  id: string;
  auctionId: string;
  bidderId: string;
  amount: number;
  placedAt: Date;
}

export class Bid {
  private readonly placedAtMs: number;

  private constructor(
    readonly id: string,
    readonly auctionId: string,
    readonly bidderId: string,
    readonly amount: Money,
    placedAt: Date,
  ) {
    this.placedAtMs = placedAt.getTime();
    Object.freeze(this);
  }

  static place(props: { id: string; auctionId: string; bidderId: string; amount: Money; placedAt: Date }): Bid {
    return new Bid(props.id, props.auctionId, props.bidderId, props.amount, props.placedAt);
  }

  static restore(snapshot: BidSnapshot): Bid {
    return new Bid(snapshot.id, snapshot.auctionId, snapshot.bidderId, Money.of(snapshot.amount), snapshot.placedAt);
  }

  get placedAt(): Date {
    return new Date(this.placedAtMs);
  }

  toSnapshot(): BidSnapshot {
    return {
      id: this.id,
      auctionId: this.auctionId,
      bidderId: this.bidderId,
      amount: this.amount.amount,
      placedAt: this.placedAt,
    };
  }
}
