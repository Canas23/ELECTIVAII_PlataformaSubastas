import { RejectedBidAttemptView, toRejectedBidAttemptView } from '../../dto/views';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';

/**
 * RF-11: consulta del registro de auditoría de intentos rechazados.
 * El vendedor ve todos los intentos de su subasta; cualquier otro usuario
 * solo ve los suyos.
 */
export class ListRejectedBidAttempts {
  constructor(private readonly lifecycle: AuctionLifecycle) {}

  async execute(input: { auctionId: string; requesterId: string }): Promise<RejectedBidAttemptView[]> {
    const auction = await this.lifecycle.loadSettled(input.auctionId);
    const isSeller = auction.sellerId === input.requesterId;
    return auction.rejectedBidAttempts
      .filter((attempt) => isSeller || attempt.bidderId === input.requesterId)
      .map(toRejectedBidAttemptView)
      .reverse();
  }
}
