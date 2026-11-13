/*
 * Prueba de punta a punta: levanta el servidor real (Express + WebSocket) con
 * persistencia en memoria en un puerto libre y recorre el flujo completo por HTTP:
 * registro → publicación → pujas (aceptadas y rechazadas) → tiempo real →
 * cierre → orden de pago → webhook firmado e idempotente.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { bootstrap, type RunningApp } from '../../src/bootstrap';
import { buildSignatureHeader, SIGNATURE_HEADER } from '../../src/infrastructure/security/gatewaySignature';

const WEBHOOK_SECRET = 'secreto-de-pruebas-del-webhook-0123456789';

let app: RunningApp;
let base: string;

async function api<T = any>(method: string, path: string, body?: unknown, token?: string) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as T;
  return { status: response.status, body: json, headers: response.headers };
}

async function signUp(name: string, email: string): Promise<{ token: string; id: string }> {
  await api('POST', '/auth/register', { name, email, password: 'secreta123' });
  const login = await api('POST', '/auth/login', { email, password: 'secreta123' });
  return { token: login.body.token, id: login.body.user.id };
}

function sendWebhook(payload: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(payload);
  return fetch(`${base}/api/webhooks/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: buildSignatureHeader(secret, raw) },
    body: raw,
  });
}

/** Cliente WebSocket que acumula los mensajes recibidos. */
async function openSocket(token: string, auctionId: string) {
  const messages: { type: string; data: any }[] = [];
  const socket = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`);
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise((resolve) => socket.once('open', resolve));
  socket.send(JSON.stringify({ type: 'subscribe', auctionId }));
  await waitFor(() => messages.some((m) => m.type === 'subscribed'));
  return { socket, messages };
}

async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Tiempo de espera agotado');
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  app = await bootstrap(
    {
      PERSISTENCE: 'memory',
      SQLITE_PATH: ':memory:',
      JWT_SECRET: 'secreto-jwt-de-pruebas-0123456789',
      JWT_EXPIRES_IN: '1h',
      BCRYPT_ROUNDS: 4,
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PAYMENT_WEBHOOK_TOLERANCE_SECONDS: 300,
      DEV_CLOCK_ENABLED: true,
      CORS_ORIGIN: '*',
    },
    { quiet: true },
  );
  await new Promise<void>((resolve) => app.server.listen(0, resolve));
  base = `http://localhost:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.stop();
});

describe('Flujo completo por HTTP + WebSocket + webhook', () => {
  let seller: { token: string; id: string };
  let ana: { token: string; id: string };
  let luis: { token: string; id: string };
  let auctionId: string;
  let paymentOrderId: string;

  it('registra usuarios, rechaza correos repetidos y contraseñas cortas', async () => {
    seller = await signUp('Vendedor Uno', 'vendedor@correo.com');
    ana = await signUp('Ana Pérez', 'ana@correo.com');
    luis = await signUp('Luis Gómez', 'luis@correo.com');
    expect(seller.token).toBeTruthy();

    const repeated = await api('POST', '/auth/register', { name: 'Otra', email: 'ana@correo.com', password: 'secreta123' });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const short = await api('POST', '/auth/register', { name: 'Corta', email: 'corta@correo.com', password: '123' });
    expect(short.status).toBe(400);

    const wrong = await api('POST', '/auth/login', { email: 'ana@correo.com', password: 'equivocada' });
    expect(wrong.status).toBe(401);
  });

  it('exige sesión para consultar subastas (RN-23)', async () => {
    const anonymous = await api('GET', '/auctions');
    expect(anonymous.status).toBe(401);
  });

  it('publica una subasta y valida la duración mínima (RN-03)', async () => {
    const categories = await api('GET', '/categories');
    const categoryId = categories.body[0].id;
    const now = Date.now();

    const tooShort = await api(
      'POST',
      '/auctions',
      {
        title: 'Cámara Canon AE-1',
        description: 'Cámara de rollo en excelente estado.',
        condition: 'USED',
        categoryId,
        basePrice: 100_000,
        minIncrement: 10_000,
        closesAt: new Date(now + 10 * 60_000).toISOString(),
      },
      seller.token,
    );
    expect(tooShort.status).toBe(422);
    expect(tooShort.body.error.code).toBe('INVALID_AUCTION_DURATION');

    const created = await api(
      'POST',
      '/auctions',
      {
        title: 'Cámara Canon AE-1',
        description: 'Cámara de rollo en excelente estado.',
        condition: 'USED',
        categoryId,
        basePrice: 100_000,
        minIncrement: 10_000,
        closesAt: new Date(now + 2 * 3600_000).toISOString(),
      },
      seller.token,
    );
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('OPEN');
    auctionId = created.body.id;

    const list = await api('GET', '/auctions?status=OPEN', undefined, ana.token);
    expect(list.body.totalItems).toBe(1);
    expect(list.body.totalPages).toBe(1);
  });

  it('aplica las reglas de puja y difunde cada oferta en tiempo real', async () => {
    const anaWs = await openSocket(ana.token, auctionId);
    const luisWs = await openSocket(luis.token, auctionId);

    // RN-07: el vendedor no puja por su artículo
    const own = await api('POST', `/auctions/${auctionId}/bids`, { amount: 120_000 }, seller.token);
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('SELLER_CANNOT_BID');

    // RN-08: la primera puja no puede ser menor al precio base
    const low = await api('POST', `/auctions/${auctionId}/bids`, { amount: 90_000 }, ana.token);
    expect(low.status).toBe(422);
    expect(low.body.error.code).toBe('BELOW_BASE_PRICE');

    const first = await api('POST', `/auctions/${auctionId}/bids`, { amount: 100_000 }, ana.token);
    expect(first.status).toBe(201);
    await waitFor(() => luisWs.messages.some((m) => m.type === 'bid.placed' && m.data.amount === 100_000));

    // RN-10: el mejor postor no se supera a sí mismo
    const self = await api('POST', `/auctions/${auctionId}/bids`, { amount: 150_000 }, ana.token);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('ALREADY_HIGHEST_BIDDER');

    // RN-09: superar en al menos el incremento mínimo
    const small = await api('POST', `/auctions/${auctionId}/bids`, { amount: 105_000 }, luis.token);
    expect(small.status).toBe(422);
    expect(small.body.error.code).toBe('BELOW_MINIMUM_INCREMENT');

    const second = await api('POST', `/auctions/${auctionId}/bids`, { amount: 130_000 }, luis.token);
    expect(second.status).toBe(201);

    // RF-14: Ana recibe el aviso de que fue superada
    await waitFor(() => anaWs.messages.some((m) => m.type === 'bid.outbid' && m.data.newAmount === 130_000));
    await waitFor(() => anaWs.messages.some((m) => m.type === 'notification.created' && m.data.type === 'OUTBID'));

    // RN-12: los rechazos quedan auditados (el vendedor los ve todos)
    const audit = await api('GET', `/auctions/${auctionId}/rejected-bids`, undefined, seller.token);
    expect(audit.body.map((r: any) => r.reasonCode)).toEqual(
      expect.arrayContaining(['SELLER_CANNOT_BID', 'BELOW_BASE_PRICE', 'ALREADY_HIGHEST_BIDDER', 'BELOW_MINIMUM_INCREMENT']),
    );

    // RN-04: con pujas ya no se puede cancelar
    const cancel = await api('POST', `/auctions/${auctionId}/cancel`, undefined, seller.token);
    expect(cancel.status).toBe(409);

    anaWs.socket.close();
    luisWs.socket.close();
  });

  it('cierra la subasta al vencer y genera la orden de pago al ganador (RN-13, RN-15)', async () => {
    await api('POST', '/dev/clock/advance', { minutes: 180 });

    const detail = await api('GET', `/auctions/${auctionId}`, undefined, luis.token);
    expect(detail.body.status).toBe('ADJUDICATED');
    expect(detail.body.winner).toMatchObject({ id: luis.id, amount: 130_000 });

    const orders = await api('GET', '/payment-orders', undefined, luis.token);
    expect(orders.body).toHaveLength(1);
    expect(orders.body[0]).toMatchObject({ status: 'PENDING', amount: 130_000 });
    paymentOrderId = orders.body[0].id;
  });

  it('rechaza un webhook con firma falsa sin cambiar nada (RN-18)', async () => {
    const forged = await sendWebhook(
      { eventId: 'evt_falso', type: 'payment.approved', paymentOrderId, amount: 130_000, occurredAt: new Date().toISOString() },
      'secreto-del-atacante-0123456789',
    );
    expect(forged.status).toBe(401);
    const orders = await api('GET', '/payment-orders', undefined, luis.token);
    expect(orders.body[0].status).toBe('PENDING');
  });

  it('confirma el pago una sola vez aunque el webhook llegue repetido (RN-17, RN-19)', async () => {
    const payload = {
      eventId: 'evt_pago_1',
      type: 'payment.approved',
      paymentOrderId,
      amount: 130_000,
      occurredAt: new Date().toISOString(),
    };
    const firstDelivery = await sendWebhook(payload);
    expect(firstDelivery.status).toBe(200);
    expect(firstDelivery.headers.get('idempotent-replayed')).toBe('false');
    expect(((await firstDelivery.json()) as { outcome: string }).outcome).toBe('PAYMENT_CONFIRMED');

    const secondDelivery = await sendWebhook(payload);
    expect(secondDelivery.status).toBe(200);
    expect(secondDelivery.headers.get('idempotent-replayed')).toBe('true');

    const detail = await api('GET', `/auctions/${auctionId}`, undefined, luis.token);
    expect(detail.body.status).toBe('PAID');

    const notes = await api('GET', '/notifications', undefined, luis.token);
    expect(notes.body.map((n: any) => n.type)).toEqual(expect.arrayContaining(['AUCTION_WON', 'PAYMENT_CONFIRMED']));
  });

  it('responde 404 con formato de error uniforme en rutas inexistentes', async () => {
    const missing = await api('GET', '/no-existe');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
