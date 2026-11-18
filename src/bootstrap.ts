/*
 * Raíz de composición: el único lugar que conoce TODAS las piezas.
 * Aquí se eligen los adaptadores (SQLite o memoria, JWT, bcrypt, ws, Express)
 * y se inyectan en los casos de uso. El dominio no sabe nada de esto.
 * La usan main.ts (servidor real) y las pruebas de punta a punta.
 */
import { createServer, Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Env } from './infrastructure/config/env';
import { SystemClock } from './infrastructure/system/SystemClock';
import { UuidGenerator } from './infrastructure/system/UuidGenerator';
import { ConsoleLogger } from './infrastructure/system/ConsoleLogger';
import { BcryptPasswordHasher } from './infrastructure/security/BcryptPasswordHasher';
import { JwtTokenService } from './infrastructure/security/JwtTokenService';
import { HmacWebhookSignatureVerifier } from './infrastructure/security/HmacWebhookSignatureVerifier';
import { InProcessEventBus } from './infrastructure/events/InProcessEventBus';
import { BusinessEventLogger } from './infrastructure/events/BusinessEventLogger';
import { AuctionRealtimeGateway } from './infrastructure/websocket/AuctionRealtimeGateway';
import { seedCategories } from './infrastructure/persistence/seedCategories';
import {
  InMemoryAuctionRepository,
  InMemoryCategoryRepository,
  InMemoryNotificationRepository,
  InMemoryPaymentEventRepository,
  InMemoryUserRepository,
} from './infrastructure/persistence/memory/InMemoryRepositories';
import { openDatabase } from './infrastructure/persistence/sqlite/SqliteDatabase';
import { SqliteAuctionRepository } from './infrastructure/persistence/sqlite/SqliteAuctionRepository';
import {
  SqliteCategoryRepository,
  SqliteNotificationRepository,
  SqlitePaymentEventRepository,
  SqliteUserRepository,
} from './infrastructure/persistence/sqlite/SqliteRepositories';
import { createApp } from './infrastructure/http/createApp';
import { AuctionLifecycle } from './application/services/AuctionLifecycle';
import { NotifyUsersOnAuctionEvents } from './application/event-handlers/NotifyUsersOnAuctionEvents';
import { RegisterUser } from './application/use-cases/users/RegisterUser';
import { LoginUser } from './application/use-cases/users/LoginUser';
import { GetMyProfile } from './application/use-cases/users/GetMyProfile';
import { ListCategories } from './application/use-cases/categories/ListCategories';
import { ListAuctions } from './application/use-cases/auctions/ListAuctions';
import { PublishAuction } from './application/use-cases/auctions/PublishAuction';
import { GetAuctionDetail } from './application/use-cases/auctions/GetAuctionDetail';
import { CancelAuction } from './application/use-cases/auctions/CancelAuction';
import { PlaceBid } from './application/use-cases/bids/PlaceBid';
import { ListRejectedBidAttempts } from './application/use-cases/bids/ListRejectedBidAttempts';
import { GetPaymentOrders } from './application/use-cases/payments/GetPaymentOrders';
import { ProcessPaymentNotification } from './application/use-cases/payments/ProcessPaymentNotification';
import { ListMyNotifications, MarkNotificationAsRead } from './application/use-cases/notifications/ManageNotifications';

/** Cada cuánto se revisan subastas vencidas para cerrarlas y adjudicarlas. */
const SETTLEMENT_INTERVAL_MS = 5_000;

export type AppConfig = Omit<Env, 'PORT'>;

export interface RunningApp {
  server: Server;
  clock: SystemClock;
  logger: ConsoleLogger;
  /** Detiene el cierre automático, cierra los WebSockets, el servidor y la base de datos. */
  stop(): Promise<void>;
}

/** Carga la especificación OpenAPI (docs/openapi.yaml) para servirla en /docs. */
function loadOpenApi(logger: ConsoleLogger): Record<string, unknown> | undefined {
  const path = resolve(process.cwd(), 'docs/openapi.yaml');
  if (!existsSync(path)) {
    logger.warn('No se encontró docs/openapi.yaml: /docs no estará disponible');
    return undefined;
  }
  return parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export async function bootstrap(config: AppConfig, options: { quiet?: boolean } = {}): Promise<RunningApp> {
  // 1. Servicios técnicos
  const logger = new ConsoleLogger(options.quiet);
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const hasher = new BcryptPasswordHasher(config.BCRYPT_ROUNDS);
  const tokens = new JwtTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN);
  // La frescura de la firma se mide con la hora REAL, no con el reloj de negocio:
  // así adelantar el reloj de demostración no invalida las firmas de la pasarela.
  const realTime = { now: () => new Date() };
  const webhookVerifier = new HmacWebhookSignatureVerifier(
    config.PAYMENT_WEBHOOK_SECRET,
    config.PAYMENT_WEBHOOK_TOLERANCE_SECONDS,
    realTime,
  );

  // 2. Persistencia (RNF-06: se cambia con una variable de entorno)
  const db = config.PERSISTENCE === 'sqlite' ? openDatabase(config.SQLITE_PATH) : null;
  const users = db ? new SqliteUserRepository(db) : new InMemoryUserRepository();
  const categories = db ? new SqliteCategoryRepository(db) : new InMemoryCategoryRepository();
  const auctions = db ? new SqliteAuctionRepository(db) : new InMemoryAuctionRepository();
  const paymentEvents = db ? new SqlitePaymentEventRepository(db) : new InMemoryPaymentEventRepository();
  const notifications = db ? new SqliteNotificationRepository(db) : new InMemoryNotificationRepository();
  await seedCategories(categories, ids);

  // 3. Eventos de dominio y tiempo real
  const eventBus = new InProcessEventBus(logger);
  const realtime = new AuctionRealtimeGateway(
    tokens,
    async (auctionId) => (await auctions.findById(auctionId)) !== null,
    logger,
  );
  eventBus.subscribe(new BusinessEventLogger(logger));
  eventBus.subscribe(realtime);
  eventBus.subscribe(new NotifyUsersOnAuctionEvents(auctions, notifications, realtime, ids, clock));

  // 4. Casos de uso
  const lifecycle = new AuctionLifecycle(auctions, eventBus, clock, ids);

  const app = createApp({
    logger,
    tokens,
    clock,
    devClockEnabled: config.DEV_CLOCK_ENABLED,
    corsOrigin: config.CORS_ORIGIN,
    openApiDocument: loadOpenApi(logger),
    useCases: {
      registerUser: new RegisterUser(users, hasher, ids, clock, logger),
      loginUser: new LoginUser(users, hasher, tokens),
      getMyProfile: new GetMyProfile(users, auctions, lifecycle),
      listCategories: new ListCategories(categories),
      listAuctions: new ListAuctions(auctions, lifecycle),
      publishAuction: new PublishAuction(users, categories, lifecycle, ids, clock),
      getAuctionDetail: new GetAuctionDetail(lifecycle, users),
      cancelAuction: new CancelAuction(lifecycle, users, ids),
      placeBid: new PlaceBid(lifecycle, users, ids),
      listRejectedBidAttempts: new ListRejectedBidAttempts(lifecycle),
      getPaymentOrders: new GetPaymentOrders(auctions, lifecycle),
      processPaymentNotification: new ProcessPaymentNotification(
        webhookVerifier,
        paymentEvents,
        auctions,
        lifecycle,
        clock,
        logger,
      ),
      listMyNotifications: new ListMyNotifications(notifications),
      markNotificationAsRead: new MarkNotificationAsRead(notifications, clock),
    },
  });

  // 5. Servidor HTTP + WebSocket en el mismo puerto
  const server = createServer(app);
  realtime.attach(server);

  // 6. Cierre automático de subastas vencidas y de órdenes de pago sin pagar (RF-08, RN-20)
  const settlement = setInterval(() => {
    lifecycle.settleAllDue().catch((err) => logger.error('Fallo al liquidar subastas vencidas', { error: String(err) }));
  }, SETTLEMENT_INTERVAL_MS);
  settlement.unref();

  return {
    server,
    clock,
    logger,
    async stop() {
      clearInterval(settlement);
      await realtime.close();
      await new Promise<void>((done) => (server.listening ? server.close(() => done()) : done()));
      db?.close();
    },
  };
}
