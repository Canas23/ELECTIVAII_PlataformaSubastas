import { BidRejectionReason } from './BidRejectionReason';

export interface RejectedBidAttemptSnapshot {
  id: string;
  auctionId: string;
  bidderId: string;
  amount: number;
  reasonCode: string;
  reasonMessage: string;
  attemptedAt: Date;
}

export class RejectedBidAttempt {
  private readonly attemptedAtMs: number;

  private constructor(
    readonly id: string,
    readonly auctionId: string,
    readonly bidderId: string,
    readonly amount: number,
    readonly reason: BidRejectionReason,
    attemptedAt: Date,
  ) {
    this.attemptedAtMs = attemptedAt.getTime();
    Object.freeze(this);
  }

  static record(props: {
    id: string;
    auctionId: string;
    bidderId: string;
    amount: number;
    reason: BidRejectionReason;
    attemptedAt: Date;
  }): RejectedBidAttempt {
    return new RejectedBidAttempt(props.id, props.auctionId, props.bidderId, props.amount, props.reason, props.attemptedAt);
  }

  static restore(s: RejectedBidAttemptSnapshot): RejectedBidAttempt {
    return new RejectedBidAttempt(
      s.id,
      s.auctionId,
      s.bidderId,
      s.amount,
      BidRejectionReason.restore(s.reasonCode, s.reasonMessage),
      s.attemptedAt,
    );
  }

  get attemptedAt(): Date {
    return new Date(this.attemptedAtMs);
  }

  toSnapshot(): RejectedBidAttemptSnapshot {
    return {
      id: this.id,
      auctionId: this.auctionId,
      bidderId: this.bidderId,
      amount: this.amount,
      reasonCode: this.reason.code,
      reasonMessage: this.reason.message,
      attemptedAt: this.attemptedAt,
    };
  }
}
