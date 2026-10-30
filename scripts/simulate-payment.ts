import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { buildSignatureHeader, SIGNATURE_HEADER } from '../src/infrastructure/security/gatewaySignature';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const orderId = arg('order');
  const amount = Number(arg('amount'));
  if (!orderId || !Number.isFinite(amount)) {
    console.error('Uso: npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> [--status approved|rejected]');
    process.exit(1);
  }
  const status = arg('status') ?? 'approved';
  const eventId = arg('event-id') ?? `evt_${randomUUID()}`;
  const repeat = Number(arg('repeat') ?? '1');
  const badSignature = process.argv.includes('--bad-signature');
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';

  const body = JSON.stringify({
    eventId,
    type: status === 'rejected' ? 'payment.rejected' : 'payment.approved',
    paymentOrderId: orderId,
    amount,
    occurredAt: new Date().toISOString(),
  });

  for (let attempt = 1; attempt <= repeat; attempt++) {
    const signature = badSignature ? buildSignatureHeader('firma-falsa-del-atacante', body) : buildSignatureHeader(secret, body);
    const response = await fetch(`${baseUrl}/api/webhooks/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: signature },
      body,
    });
    const replayed = response.headers.get('idempotent-replayed');
    console.log(`Envío ${attempt}/${repeat} → HTTP ${response.status}${replayed ? ` (replayed=${replayed})` : ''}`);
    console.log(`  ${await response.text()}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
