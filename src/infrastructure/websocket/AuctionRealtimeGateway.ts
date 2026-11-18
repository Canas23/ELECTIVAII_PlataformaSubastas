import { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  AuthTokenPayload,
  DomainEventSubscriber,
  Logger,
  RealtimeUserNotifier,
  TokenService,
} from '../../application/ports/services';
import { AuctionEvent } from '../../domain/auction/AuctionEvents';

interface Client {
  socket: WebSocket;
  user: AuthTokenPayload;
  subscriptions: Set<string>;
  alive: boolean;
}

const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), auctionId: z.string().min(1) }),
  z.object({ type: z.literal('unsubscribe'), auctionId: z.string().min(1) }),
  z.object({ type: z.literal('ping') }),
]);

const HEARTBEAT_MS = 30_000;

/**
 * ADAPTADOR de WebSockets (API en la que el servidor informa sin que el
 * cliente pregunte).
 *
 * - Como suscriptor del bus traduce hechos del negocio (BidPlaced,
 *   AuctionAdjudicated…) a mensajes para las salas de cada subasta.
 * - Como RealtimeUserNotifier entrega avisos personales a un usuario.
 *
 * Es el único archivo del proyecto que importa la librería `ws`; ningún caso
 * de uso ni controlador la conoce (RNF-05).
 *
 * Protocolo: conexión a ws://host/ws?token=<JWT>
 *   cliente → { "type": "subscribe" | "unsubscribe", "auctionId": "..." }
 *   servidor → { "type": "...", "data": {...}, "sentAt": "ISO-8601" }
 */
export class AuctionRealtimeGateway implements DomainEventSubscriber, RealtimeUserNotifier {
  readonly name = 'AuctionRealtimeGateway';

  private wss: WebSocketServer | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly rooms = new Map<string, Set<Client>>();
  private readonly clientsByUser = new Map<string, Set<Client>>();

  constructor(
    private readonly tokens: TokenService,
    private readonly auctionExists: (auctionId: string) => Promise<boolean>,
    private readonly logger: Logger,
  ) {}

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket, request) => this.onConnection(socket, request));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const clients of this.clientsByUser.values()) {
      for (const client of clients) client.socket.terminate();
    }
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }

  // ───────────────────────────── Conexiones ─────────────────────────────

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const user = this.tokens.verify(url.searchParams.get('token') ?? '');
    if (!user) {
      // RN-23: la información de las subastas es para usuarios registrados
      socket.close(4401, 'Token ausente o inválido');
      return;
    }

    const client: Client = { socket, user, subscriptions: new Set(), alive: true };
    this.index(this.clientsByUser, user.userId, client);
    this.send(client, 'connected', { userId: user.userId });

    socket.on('pong', () => (client.alive = true));
    socket.on('message', (raw) => void this.onMessage(client, raw.toString()));
    socket.on('close', () => this.onDisconnect(client));
    socket.on('error', (error) => this.logger.warn('Error en conexión WebSocket', { error: error.message }));
  }

  private async onMessage(client: Client, raw: string): Promise<void> {
    let parsed: z.infer<typeof ClientMessage>;
    try {
      parsed = ClientMessage.parse(JSON.parse(raw));
    } catch {
      this.send(client, 'error', {
        code: 'INVALID_MESSAGE',
        message: 'Mensaje no reconocido. Usa {"type":"subscribe","auctionId":"..."}.',
      });
      return;
    }

    switch (parsed.type) {
      case 'ping':
        this.send(client, 'pong', {});
        return;
      case 'subscribe': {
        if (!(await this.auctionExists(parsed.auctionId))) {
          this.send(client, 'error', { code: 'AUCTION_NOT_FOUND', message: 'La subasta no existe.' });
          return;
        }
        client.subscriptions.add(parsed.auctionId);
        this.index(this.rooms, parsed.auctionId, client);
        this.send(client, 'subscribed', { auctionId: parsed.auctionId, participants: this.participants(parsed.auctionId) });
        this.broadcastParticipants(parsed.auctionId);
        return;
      }
      case 'unsubscribe':
        this.leave(client, parsed.auctionId);
        this.send(client, 'unsubscribed', { auctionId: parsed.auctionId });
        return;
    }
  }

  private onDisconnect(client: Client): void {
    for (const auctionId of [...client.subscriptions]) this.leave(client, auctionId);
    this.unindex(this.clientsByUser, client.user.userId, client);
  }

  private leave(client: Client, auctionId: string): void {
    if (!client.subscriptions.delete(auctionId)) return;
    this.unindex(this.rooms, auctionId, client);
    this.broadcastParticipants(auctionId);
  }

  private checkHeartbeats(): void {
    for (const clients of this.clientsByUser.values()) {
      for (const client of clients) {
        if (!client.alive) {
          client.socket.terminate();
          continue;
        }
        client.alive = false;
        client.socket.ping();
      }
    }
  }

  // ───────────────────── Hechos del negocio → mensajes ──────────────────

  async handle(event: AuctionEvent): Promise<void> {
    switch (event.type) {
      case 'BidPlaced':
        // RF-13: nueva puja vigente para todos los suscritos
        this.broadcast(event.auctionId, 'bid.placed', {
          auctionId: event.auctionId,
          bidId: event.bidId,
          bidderId: event.bidderId,
          amount: event.amount,
          bidCount: event.bidCount,
          minimumNextBid: event.minimumNextBid,
          placedAt: event.occurredAt.toISOString(),
        });
        // RF-14: aviso directo a quien acaba de ser superado
        if (event.previousHighestBidderId && event.previousHighestBidderId !== event.bidderId) {
          this.notifyUser(event.previousHighestBidderId, {
            type: 'bid.outbid',
            data: {
              auctionId: event.auctionId,
              yourAmount: event.previousHighestAmount,
              newAmount: event.amount,
              minimumNextBid: event.minimumNextBid,
            },
          });
        }
        return;
      case 'AuctionAdjudicated':
        // RF-15: cierre y resultado
        this.broadcast(event.auctionId, 'auction.closed', {
          auctionId: event.auctionId,
          status: 'ADJUDICATED',
          winnerId: event.winnerId,
          winningAmount: event.winningAmount,
          closedAt: event.occurredAt.toISOString(),
        });
        return;
      case 'AuctionDeserted':
        this.broadcast(event.auctionId, 'auction.closed', {
          auctionId: event.auctionId,
          status: 'DESERTED',
          winnerId: null,
          winningAmount: null,
          closedAt: event.occurredAt.toISOString(),
        });
        return;
      case 'AuctionCancelled':
        this.broadcast(event.auctionId, 'auction.cancelled', { auctionId: event.auctionId });
        return;
      case 'PaymentConfirmed':
        this.broadcast(event.auctionId, 'auction.payment', { auctionId: event.auctionId, status: 'PAID' });
        return;
      case 'PaymentOrderExpired':
        this.broadcast(event.auctionId, 'auction.payment', { auctionId: event.auctionId, status: 'DEFAULTED' });
        return;
      case 'AuctionPublished':
      case 'BidRejected':
      case 'PaymentFailed':
        return;
    }
  }

  notifyUser(userId: string, payload: { type: string; data: unknown }): void {
    for (const client of this.clientsByUser.get(userId) ?? []) this.send(client, payload.type, payload.data);
  }

  // ─────────────────────────────── Envío ────────────────────────────────

  /** RF-16 (opcional): cantidad de conexiones atentas a la subasta. */
  private participants(auctionId: string): number {
    return this.rooms.get(auctionId)?.size ?? 0;
  }

  private broadcastParticipants(auctionId: string): void {
    this.broadcast(auctionId, 'auction.participants', { auctionId, participants: this.participants(auctionId) });
  }

  private broadcast(auctionId: string, type: string, data: unknown): void {
    for (const client of this.rooms.get(auctionId) ?? []) this.send(client, type, data);
  }

  private send(client: Client, type: string, data: unknown): void {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    client.socket.send(JSON.stringify({ type, data, sentAt: new Date().toISOString() }));
  }

  private index(map: Map<string, Set<Client>>, key: string, client: Client): void {
    const set = map.get(key) ?? new Set<Client>();
    set.add(client);
    map.set(key, set);
  }

  private unindex(map: Map<string, Set<Client>>, key: string, client: Client): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) map.delete(key);
  }
}
