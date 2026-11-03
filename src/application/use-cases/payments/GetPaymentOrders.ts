import { ApplicationError } from '../../errors/ApplicationError';
import { PaymentOrderView, toPaymentOrderView } from '../../dto/views';
import { AuctionRepository } from '../../ports/repositories';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';

/** RF-17: consulta ordenes de pago */
export class GetPaymentOrders {
  constructor(
    private readonly auctions: AuctionRepository,
    private readonly lifecycle: AuctionLifecycle,
  ) {}

  /** Órdenes del usuario como ganador. */
  async listMine(userId: string): Promise<PaymentOrderView[]> {
    await this.lifecycle.settleAllDue();
    const won = await this.auctions.findByWinner(userId);
    return won.flatMap((a) => (a.order ? [toPaymentOrderView(a, a.order)] : []));
  }

  /** Una orden concreta: visible para el ganador y para el vendedor. */
  async getById(input: { paymentOrderId: string; requesterId: string }): Promise<PaymentOrderView> {
    const found = await this.auctions.findByPaymentOrderId(input.paymentOrderId);
    if (!found) throw ApplicationError.notFound('PAYMENT_ORDER_NOT_FOUND', 'La orden de pago no existe.');

    const auction = await this.lifecycle.loadSettled(found.id);
    const order = auction.order;
    if (!order) throw ApplicationError.notFound('PAYMENT_ORDER_NOT_FOUND', 'La orden de pago no existe.');
    if (input.requesterId !== order.winnerId && input.requesterId !== auction.sellerId) {
      throw ApplicationError.forbidden('PAYMENT_ORDER_FORBIDDEN', 'Solo el ganador o el vendedor pueden consultar esta orden.');
    }
    return toPaymentOrderView(auction, order);
  }
}
