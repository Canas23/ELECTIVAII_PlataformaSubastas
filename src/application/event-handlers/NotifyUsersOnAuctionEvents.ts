import { AuctionEvent } from '../../domain/auction/AuctionEvents';
import { Notification, NotificationTypeValue } from '../../domain/notification/Notification';
import { IdGenerator } from '../../domain/shared/IdGenerator';
import { Money } from '../../domain/shared/Money';
import { toNotificationView } from '../dto/views';
import { AuctionRepository, NotificationRepository } from '../ports/repositories';
import { Clock, DomainEventSubscriber, RealtimeUserNotifier } from '../ports/services';

interface PendingNotice {
  recipientId: string;
  type: NotificationTypeValue;
  message: string;
}

const cop = (amount: number): string => Money.of(amount).toString();
const bogotaTime = (d: Date): string =>
  d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Reacciona a los hechos del negocio creando los avisos dirigidos a cada
 * usuario afectado (entidad Notificación) y entregándolos en vivo si está
 * conectado
 */
export class NotifyUsersOnAuctionEvents implements DomainEventSubscriber {
  readonly name = 'NotifyUsersOnAuctionEvents';

  constructor(
    private readonly auctions: AuctionRepository,
    private readonly notifications: NotificationRepository,
    private readonly realtime: RealtimeUserNotifier,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async handle(event: AuctionEvent): Promise<void> {
    const auction = await this.auctions.findById(event.auctionId);
    const title = auction ? `«${auction.item.title}»` : 'la subasta';
    const notices = this.noticesFor(event, title);

    for (const notice of notices) {
      const notification = Notification.create({
        id: this.ids.next(),
        recipientId: notice.recipientId,
        type: notice.type,
        message: notice.message,
        auctionId: event.auctionId,
        now: this.clock.now(),
      });
      await this.notifications.save(notification);
      this.realtime.notifyUser(notice.recipientId, {
        type: 'notification.created',
        data: toNotificationView(notification),
      });
    }
  }

  private noticesFor(event: AuctionEvent, title: string): PendingNotice[] {
    switch (event.type) {
      case 'BidPlaced':
        // RF-14: aviso al postor que acaba de ser superado
        if (!event.previousHighestBidderId || event.previousHighestBidderId === event.bidderId) return [];
        return [
          {
            recipientId: event.previousHighestBidderId,
            type: 'OUTBID',
            message: `Tu oferta de ${cop(event.previousHighestAmount ?? 0)} en ${title} fue superada. La nueva oferta vigente es ${cop(event.amount)}.`,
          },
        ];
      case 'AuctionAdjudicated':
        return [
          {
            recipientId: event.winnerId,
            type: 'AUCTION_WON',
            message: `¡Ganaste ${title} por ${cop(event.winningAmount)}! Tienes hasta el ${bogotaTime(event.paymentDueAt)} para pagar la orden.`,
          },
          {
            recipientId: event.sellerId,
            type: 'AUCTION_SOLD',
            message: `Tu subasta ${title} se adjudicó por ${cop(event.winningAmount)}. Esperando el pago del ganador.`,
          },
        ];
      case 'AuctionDeserted':
        return [
          {
            recipientId: event.sellerId,
            type: 'AUCTION_DESERTED',
            message: `Tu subasta ${title} cerró sin pujas y fue declarada desierta.`,
          },
        ];
      case 'PaymentConfirmed':
        return [
          {
            recipientId: event.winnerId,
            type: 'PAYMENT_CONFIRMED',
            message: `La pasarela confirmó tu pago de ${cop(event.amount)} por ${title}.`,
          },
          {
            recipientId: event.sellerId,
            type: 'PAYMENT_CONFIRMED',
            message: `El ganador pagó ${cop(event.amount)} por ${title}.`,
          },
        ];
      case 'PaymentFailed':
        return [
          {
            recipientId: event.winnerId,
            type: 'PAYMENT_FAILED',
            message: `La pasarela rechazó el cobro de ${title}. Puedes intentarlo de nuevo antes del vencimiento.`,
          },
        ];
      case 'PaymentOrderExpired':
        return [
          {
            recipientId: event.winnerId,
            type: 'PAYMENT_OVERDUE',
            message: `La orden de pago de ${title} venció sin confirmación. La subasta quedó en incumplimiento.`,
          },
          {
            recipientId: event.sellerId,
            type: 'PAYMENT_OVERDUE',
            message: `El ganador de ${title} no pagó dentro del plazo. La subasta quedó en incumplimiento.`,
          },
        ];
      case 'AuctionPublished':
      case 'BidRejected':
      case 'AuctionCancelled':
        return [];
    }
  }
}
