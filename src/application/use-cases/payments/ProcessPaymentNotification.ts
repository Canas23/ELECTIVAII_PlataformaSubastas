import { DomainError } from '../../../domain/shared/DomainError';
import { Money } from '../../../domain/shared/Money';
import { PaymentEvent, PaymentEventOutcome, PaymentEventType } from '../../../domain/payment/PaymentEvent';
import { ApplicationError } from '../../errors/ApplicationError';
import { AuctionRepository, PaymentEventRepository } from '../../ports/repositories';
import { Clock, Logger, WebhookSignatureVerifier } from '../../ports/services';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';
import { KeyedMutex } from '../../shared/KeyedMutex';

export interface PaymentNotificationInput {
  rawBody: string;
  signatureHeader: string | undefined;
}

export interface PaymentNotificationResponse {
  received: true;
  eventId: string;
  paymentOrderId: string;
  outcome: PaymentEventOutcome;
}

export interface PaymentNotificationResult {
  response: PaymentNotificationResponse;
  /** true cuando el evento ya se había procesado y solo se repite la respuesta. */
  replayed: boolean;
}

interface GatewayPayload {
  eventId: string;
  type: PaymentEventType;
  paymentOrderId: string;
  amount: Money;
  occurredAt: Date;
}

/**
 * Webhook de la pasarela de pagos (RF-18, RF-19, RF-20).
 *
 * Orden estricto:
 *  1. Verificar el origen antes de cualquier otra cosa (RN-18). Si falla, no
 *     se lee el contenido, no se guarda nada y no cambia ningún estado.
 *  2. Si el evento ya fue procesado, responder lo mismo sin reaplicarlo (RN-19).
 *  3. Solo si es nuevo y legítimo, aplicar el resultado sobre el agregado:
 *     el pago se confirma únicamente aquí (RN-17).
 */
export class ProcessPaymentNotification {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly verifier: WebhookSignatureVerifier,
    private readonly paymentEvents: PaymentEventRepository,
    private readonly auctions: AuctionRepository,
    private readonly lifecycle: AuctionLifecycle,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: PaymentNotificationInput): Promise<PaymentNotificationResult> {
    // 1. RN-18: origen verificable o nada
    if (!this.verifier.verify(input.rawBody, input.signatureHeader)) {
      this.logger.warn('Notificación de pago rechazada: firma inválida o ausente');
      throw new ApplicationError(
        'UNAUTHORIZED',
        'INVALID_WEBHOOK_SIGNATURE',
        'No fue posible verificar el origen de la notificación.',
      );
    }

    const payload = this.parse(input.rawBody);

    return this.mutex.run(`payment-event:${payload.eventId}`, async () => {
      // 2. RN-19: idempotencia por identificador del evento
      const alreadyProcessed = await this.paymentEvents.findByEventId(payload.eventId);
      if (alreadyProcessed) {
        this.logger.info('Notificación de pago repetida: se responde sin reprocesar', { eventId: payload.eventId });
        return { response: this.responseFor(alreadyProcessed), replayed: true };
      }

      const target = await this.auctions.findByPaymentOrderId(payload.paymentOrderId);
      if (!target) {
        throw ApplicationError.notFound('PAYMENT_ORDER_NOT_FOUND', 'La orden de pago indicada no existe.');
      }

      // 3. Aplicar el resultado del cobro sobre el agregado
      const outcome = await this.lifecycle.withAuction(target.id, (auction, now) => {
        try {
          if (payload.type.isApproval()) {
            auction.confirmPayment(payload.paymentOrderId, payload.amount, now);
            return 'PAYMENT_CONFIRMED' as const;
          }
          auction.registerFailedPayment(payload.paymentOrderId, now);
          return 'PAYMENT_FAILURE_RECORDED' as const;
        } catch (error) {
          return this.outcomeForRejection(error);
        }
      });

      const event = PaymentEvent.record({
        eventId: payload.eventId,
        paymentOrderId: payload.paymentOrderId,
        type: payload.type,
        amount: payload.amount,
        occurredAt: payload.occurredAt,
        receivedAt: this.clock.now(),
        outcome,
      });
      await this.paymentEvents.save(event);
      this.logger.info('Notificación de pago procesada', { eventId: event.eventId, outcome });
      return { response: this.responseFor(event), replayed: false };
    });
  }

  /** Un evento legítimo que el dominio no puede aplicar se registra igualmente, sin cambiar la orden. */
  private outcomeForRejection(error: unknown): PaymentEventOutcome {
    if (error instanceof DomainError) {
      switch (error.code) {
        case 'PAYMENT_ORDER_EXPIRED':
          return 'IGNORED_ORDER_EXPIRED';
        case 'PAYMENT_ORDER_NOT_PENDING':
          return 'IGNORED_ORDER_NOT_PENDING';
        case 'PAYMENT_AMOUNT_MISMATCH':
          return 'IGNORED_AMOUNT_MISMATCH';
        default:
          break;
      }
    }
    throw error;
  }

  private responseFor(event: PaymentEvent): PaymentNotificationResponse {
    return { received: true, eventId: event.eventId, paymentOrderId: event.paymentOrderId, outcome: event.outcome };
  }

  private parse(rawBody: string): GatewayPayload {
    const invalid = (detail: string) =>
      new ApplicationError('BAD_REQUEST', 'INVALID_WEBHOOK_PAYLOAD', `Notificación de pago mal formada: ${detail}`);
    let data: unknown;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw invalid('el cuerpo no es JSON válido.');
    }
    if (typeof data !== 'object' || data === null) throw invalid('se esperaba un objeto.');
    const body = data as Record<string, unknown>;
    const { eventId, type, paymentOrderId, amount, occurredAt } = body;
    if (typeof eventId !== 'string' || eventId.trim() === '') throw invalid('falta eventId.');
    if (typeof paymentOrderId !== 'string' || paymentOrderId.trim() === '') throw invalid('falta paymentOrderId.');
    if (typeof type !== 'string') throw invalid('falta type.');
    if (typeof amount !== 'number') throw invalid('amount debe ser numérico.');
    const occurred = typeof occurredAt === 'string' ? new Date(occurredAt) : new Date(NaN);
    if (Number.isNaN(occurred.getTime())) throw invalid('occurredAt debe ser una fecha ISO 8601.');
    try {
      return { eventId, paymentOrderId, type: PaymentEventType.from(type), amount: Money.of(amount), occurredAt: occurred };
    } catch (error) {
      if (error instanceof DomainError) throw invalid(error.message);
      throw error;
    }
  }
}
