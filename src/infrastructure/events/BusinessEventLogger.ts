import { DomainEventSubscriber, Logger } from '../../application/ports/services';
import { AuctionEvent } from '../../domain/auction/AuctionEvents';

/** RNF-17: deja en consola cada hecho relevante del negocio. */
export class BusinessEventLogger implements DomainEventSubscriber {
  readonly name = 'BusinessEventLogger';

  constructor(private readonly logger: Logger) {}

  async handle(event: AuctionEvent): Promise<void> {
    const { type, occurredAt, ...data } = event;
    this.logger.info(`[negocio] ${type}`, { ...data, occurredAt: occurredAt.toISOString() });
  }
}
