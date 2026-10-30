import { DomainEventSubscriber, EventPublisher, Logger } from '../../application/ports/services';
import { AuctionEvent } from '../../domain/auction/AuctionEvents';

/**
 * Adaptador del puerto EventPublisher: reparte cada hecho del negocio entre los
 * suscriptores registrados en la raíz de composición (WebSocket, avisos,
 * registro en consola). Un suscriptor que falla no afecta a los demás ni a la
 * operación que ya fue persistida.
 */
export class InProcessEventBus implements EventPublisher {
  private readonly subscribers: DomainEventSubscriber[] = [];

  constructor(private readonly logger: Logger) {}

  subscribe(subscriber: DomainEventSubscriber): void {
    this.subscribers.push(subscriber);
  }

  async publish(events: AuctionEvent[]): Promise<void> {
    for (const event of events) {
      for (const subscriber of this.subscribers) {
        try {
          await subscriber.handle(event);
        } catch (error) {
          this.logger.error(`El suscriptor ${subscriber.name} falló al procesar ${event.type}`, {
            auctionId: event.auctionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}
