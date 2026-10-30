import { beforeEach, describe, expect, it } from 'vitest';
import { EventPublisher, Logger } from '../../src/application/ports/services';
import { AuctionLifecycle } from '../../src/application/services/AuctionLifecycle';
import { ProcessPaymentNotification } from '../../src/application/use-cases/payments/ProcessPaymentNotification';
import { AuctionEvent } from '../../src/domain/auction/AuctionEvents';
import {
  InMemoryAuctionRepository,
  InMemoryPaymentEventRepository,
} from '../../src/infrastructure/persistence/memory/InMemoryRepositories';
import { buildSignatureHeader } from '../../src/infrastructure/security/gatewaySignature';
import { HmacWebhookSignatureVerifier } from '../../src/infrastructure/security/HmacWebhookSignatureVerifier';
import { ANA, anOpenAuction, at, FixedClock, HOUR, SequentialIds } from '../support/fixtures';

const SECRET = 'secreto-de-prueba-123456';
const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} };

class RecordingPublisher implements EventPublisher {
  readonly published: AuctionEvent[] = [];
  async publish(events: AuctionEvent[]): Promise<void> {
    this.published.push(...events);
  }
}

describe('ProcessPaymentNotification (webhook)', () => {
  let auctions: InMemoryAuctionRepository;
  let paymentEvents: InMemoryPaymentEventRepository;
  let publisher: RecordingPublisher;
  let clock: FixedClock;
  let useCase: ProcessPaymentNotification;
  let orderId: string;

  const send = (payload: Record<string, unknown>, signature?: string) => {
    const rawBody = JSON.stringify(payload);
    const header = signature ?? buildSignatureHeader(SECRET, rawBody, Math.floor(clock.now().getTime() / 1000));
    return useCase.execute({ rawBody, signatureHeader: header });
  };

  const approved = (eventId = 'evt-1', amount = 150_000) => ({
    eventId,
    type: 'payment.approved',
    paymentOrderId: orderId,
    amount,
    occurredAt: clock.now().toISOString(),
  });

  beforeEach(async () => {
    auctions = new InMemoryAuctionRepository();
    paymentEvents = new InMemoryPaymentEventRepository();
    publisher = new RecordingPublisher();
    clock = new FixedClock(at(25 * HOUR));
    const ids = new SequentialIds();

    const auction = anOpenAuction();
    auction.placeBid({ bidderId: ANA, amount: 150_000 }, at(HOUR), ids);
    auction.closeIfDue(at(24 * HOUR), ids);
    auction.pullDomainEvents();
    orderId = auction.order?.id ?? '';
    await auctions.save(auction);

    const lifecycle = new AuctionLifecycle(auctions, publisher, clock, ids);
    const verifier = new HmacWebhookSignatureVerifier(SECRET, 300, clock);
    useCase = new ProcessPaymentNotification(verifier, paymentEvents, auctions, lifecycle, clock, silent);
  });

  it('RN-17: confirma el pago cuando la pasarela lo notifica', async () => {
    const result = await send(approved());
    expect(result.response.outcome).toBe('PAYMENT_CONFIRMED');
    expect(result.replayed).toBe(false);
    const stored = await auctions.findById('auction-1');
    expect(stored?.currentStatus.value).toBe('PAID');
    expect(publisher.published.map((e) => e.type)).toEqual(['PaymentConfirmed']);
  });

  it('RN-18: una firma inválida se rechaza sin producir ningún cambio', async () => {
    await expect(send(approved(), buildSignatureHeader('otro-secreto-cualquiera', '{}'))).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
    expect((await auctions.findById('auction-1'))?.order?.currentStatus.value).toBe('PENDING');
    expect(await paymentEvents.findByEventId('evt-1')).toBeNull();
    expect(publisher.published).toEqual([]);
  });

  it('RN-18: sin cabecera de firma tampoco se procesa', async () => {
    const rawBody = JSON.stringify(approved());
    await expect(useCase.execute({ rawBody, signatureHeader: undefined })).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  });

  it('RN-18: una firma antigua (fuera de la tolerancia) se rechaza', async () => {
    const rawBody = JSON.stringify(approved());
    const old = buildSignatureHeader(SECRET, rawBody, Math.floor(clock.now().getTime() / 1000) - 3600);
    await expect(useCase.execute({ rawBody, signatureHeader: old })).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  });

  it('RN-18: alterar el cuerpo invalida la firma', async () => {
    const original = JSON.stringify(approved());
    const header = buildSignatureHeader(SECRET, original, Math.floor(clock.now().getTime() / 1000));
    const tampered = original.replace('150000', '1');
    await expect(useCase.execute({ rawBody: tampered, signatureHeader: header })).rejects.toMatchObject({
      code: 'INVALID_WEBHOOK_SIGNATURE',
    });
  });

  it('RN-19: la misma notificación repetida se procesa una sola vez y responde igual', async () => {
    const first = await send(approved('evt-dup'));
    const second = await send(approved('evt-dup'));
    const third = await send(approved('evt-dup'));

    expect(second.response).toEqual(first.response);
    expect(third.response).toEqual(first.response);
    expect([first.replayed, second.replayed, third.replayed]).toEqual([false, true, true]);
    expect(publisher.published.filter((e) => e.type === 'PaymentConfirmed')).toHaveLength(1);
  });

  it('RN-19: envíos simultáneos del mismo evento tampoco se duplican', async () => {
    const results = await Promise.all([send(approved('evt-x')), send(approved('evt-x')), send(approved('evt-x'))]);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(publisher.published.filter((e) => e.type === 'PaymentConfirmed')).toHaveLength(1);
  });

  it('registra pero no aplica un cobro por un valor distinto al de la orden', async () => {
    const result = await send(approved('evt-bad-amount', 1));
    expect(result.response.outcome).toBe('IGNORED_AMOUNT_MISMATCH');
    expect((await auctions.findById('auction-1'))?.currentStatus.value).toBe('ADJUDICATED');
  });

  it('RN-20: una confirmación tardía no revive una orden vencida', async () => {
    clock.set(at(24 * HOUR + 49 * HOUR));
    const result = await send(approved('evt-late'));
    expect(result.response.outcome).toBe('IGNORED_ORDER_EXPIRED');
    expect((await auctions.findById('auction-1'))?.currentStatus.value).toBe('DEFAULTED');
  });

  it('un cobro rechazado por la pasarela deja la orden pendiente', async () => {
    const result = await send({ ...approved('evt-rej'), type: 'payment.rejected' });
    expect(result.response.outcome).toBe('PAYMENT_FAILURE_RECORDED');
    expect((await auctions.findById('auction-1'))?.order?.currentStatus.value).toBe('PENDING');
  });

  it('responde 404 lógico si la orden no existe', async () => {
    await expect(send({ ...approved('evt-404'), paymentOrderId: 'no-existe' })).rejects.toMatchObject({
      code: 'PAYMENT_ORDER_NOT_FOUND',
    });
  });
});
