import express, { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { AUCTION_STATUS_VALUES } from '../../domain/auction/AuctionStatus';
import { Logger, TokenService } from '../../application/ports/services';
import { RegisterUser } from '../../application/use-cases/users/RegisterUser';
import { LoginUser } from '../../application/use-cases/users/LoginUser';
import { GetMyProfile } from '../../application/use-cases/users/GetMyProfile';
import { ListCategories } from '../../application/use-cases/categories/ListCategories';
import { ListAuctions } from '../../application/use-cases/auctions/ListAuctions';
import { PublishAuction } from '../../application/use-cases/auctions/PublishAuction';
import { GetAuctionDetail } from '../../application/use-cases/auctions/GetAuctionDetail';
import { CancelAuction } from '../../application/use-cases/auctions/CancelAuction';
import { PlaceBid } from '../../application/use-cases/bids/PlaceBid';
import { ListRejectedBidAttempts } from '../../application/use-cases/bids/ListRejectedBidAttempts';
import { GetPaymentOrders } from '../../application/use-cases/payments/GetPaymentOrders';
import { ProcessPaymentNotification } from '../../application/use-cases/payments/ProcessPaymentNotification';
import { ListMyNotifications, MarkNotificationAsRead } from '../../application/use-cases/notifications/ManageNotifications';
import { SIGNATURE_HEADER } from '../security/gatewaySignature';
import { SystemClock } from '../system/SystemClock';
import { requireAuth, currentUser } from './auth';
import { errorHandler } from './errorHandler';

export interface HttpDependencies {
  logger: Logger;
  tokens: TokenService;
  clock: SystemClock;
  devClockEnabled: boolean;
  corsOrigin: string;
  /** Especificación OpenAPI para la documentación interactiva en /docs. */
  openApiDocument?: Record<string, unknown>;
  useCases: {
    registerUser: RegisterUser;
    loginUser: LoginUser;
    getMyProfile: GetMyProfile;
    listCategories: ListCategories;
    listAuctions: ListAuctions;
    publishAuction: PublishAuction;
    getAuctionDetail: GetAuctionDetail;
    cancelAuction: CancelAuction;
    placeBid: PlaceBid;
    listRejectedBidAttempts: ListRejectedBidAttempts;
    getPaymentOrders: GetPaymentOrders;
    processPaymentNotification: ProcessPaymentNotification;
    listMyNotifications: ListMyNotifications;
    markNotificationAsRead: MarkNotificationAsRead;
  };
}

/* ---------- Esquemas de entrada (validación en el borde, RNF-07) ---------- */
const RegisterBody = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});
const LoginBody = z.object({ email: z.string(), password: z.string() });
const PublishBody = z.object({
  title: z.string(),
  description: z.string(),
  condition: z.string(),
  categoryId: z.string(),
  basePrice: z.number(),
  minIncrement: z.number(),
  closesAt: z.coerce.date(),
});
const BidBody = z.object({ amount: z.number() });
const ListQuery = z.object({
  categoryId: z.string().optional(),
  status: z.enum(AUCTION_STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const NotificationsQuery = z.object({
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const AdvanceClockBody = z.object({ minutes: z.number().positive() });

export function createApp(deps: HttpDependencies): express.Express {
  const { useCases: uc, tokens, logger, clock } = deps;
  const app = express();
  const auth = requireAuth(tokens);

  // CORS sencillo para el frontend (Vite en http://localhost:5173)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', deps.corsOrigin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  /* ---------- Webhook: necesita el cuerpo crudo para verificar la firma (RN-18) ---------- */
  app.post('/api/webhooks/payments', express.text({ type: '*/*' }), async (req, res) => {
    const rawBody = typeof req.body === 'string' ? req.body : '';
    const result = await uc.processPaymentNotification.execute({
      rawBody,
      signatureHeader: req.header(SIGNATURE_HEADER),
    });
    // RN-19: la respuesta indica si el evento ya se había procesado antes
    res.setHeader('Idempotent-Replayed', String(result.replayed));
    res.status(200).json({ ...result.response, replayed: result.replayed });
  });

  app.use(express.json());

  if (deps.openApiDocument) {
    const spec = deps.openApiDocument;
    app.get('/docs/openapi.json', (_req, res) => {
      res.json(spec);
    });
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Subastas API · Documentación' }));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', now: clock.now().toISOString() });
  });

  const api = Router();

  /* ---------- Usuarios y sesión ---------- */
  api.post('/auth/register', async (req, res) => {
    res.status(201).json(await uc.registerUser.execute(RegisterBody.parse(req.body)));
  });
  api.post('/auth/login', async (req, res) => {
    res.json(await uc.loginUser.execute(LoginBody.parse(req.body)));
  });
  api.get('/users/me', auth, async (_req, res) => {
    res.json(await uc.getMyProfile.execute(currentUser(res).userId));
  });

  /* ---------- Categorías ---------- */
  api.get('/categories', async (_req, res) => {
    res.json(await uc.listCategories.execute());
  });

  /* ---------- Subastas (RN-23: solo para usuarios registrados) ---------- */
  api.get('/auctions', auth, async (req, res) => {
    const page = await uc.listAuctions.execute(ListQuery.parse(req.query));
    res.json({
      ...page,
      totalItems: page.total,
      totalPages: Math.max(1, Math.ceil(page.total / page.pageSize)),
    });
  });
  api.post('/auctions', auth, async (req, res) => {
    const body = PublishBody.parse(req.body);
    res.status(201).json(await uc.publishAuction.execute({ ...body, sellerId: currentUser(res).userId }));
  });
  api.get('/auctions/:id', auth, async (req, res) => {
    res.json(await uc.getAuctionDetail.execute(String(req.params.id)));
  });
  api.post('/auctions/:id/cancel', auth, async (req, res) => {
    res.json(await uc.cancelAuction.execute({ auctionId: String(req.params.id), requesterId: currentUser(res).userId }));
  });

  /* ---------- Pujas ---------- */
  api.get('/auctions/:id/bids', auth, async (req, res) => {
    res.json(await uc.getAuctionDetail.bidHistory(String(req.params.id)));
  });
  api.post('/auctions/:id/bids', auth, async (req, res) => {
    const { amount } = BidBody.parse(req.body);
    res
      .status(201)
      .json(await uc.placeBid.execute({ auctionId: String(req.params.id), bidderId: currentUser(res).userId, amount }));
  });
  api.get('/auctions/:id/rejected-bids', auth, async (req, res) => {
    res.json(
      await uc.listRejectedBidAttempts.execute({ auctionId: String(req.params.id), requesterId: currentUser(res).userId }),
    );
  });

  /* ---------- Órdenes de pago ---------- */
  api.get('/payment-orders', auth, async (_req, res) => {
    res.json(await uc.getPaymentOrders.listMine(currentUser(res).userId));
  });
  api.get('/payment-orders/:id', auth, async (req, res) => {
    res.json(
      await uc.getPaymentOrders.getById({ paymentOrderId: String(req.params.id), requesterId: currentUser(res).userId }),
    );
  });

  /* ---------- Notificaciones ---------- */
  api.get('/notifications', auth, async (req, res) => {
    const q = NotificationsQuery.parse(req.query);
    res.json(await uc.listMyNotifications.execute({ userId: currentUser(res).userId, ...q }));
  });
  api.patch('/notifications/:id/read', auth, async (req, res) => {
    res.json(
      await uc.markNotificationAsRead.execute({ notificationId: String(req.params.id), userId: currentUser(res).userId }),
    );
  });

  /* ---------- Reloj de demostración (solo con DEV_CLOCK_ENABLED=true) ---------- */
  if (deps.devClockEnabled) {
    api.get('/dev/clock', (_req, res) => {
      res.json({ now: clock.now().toISOString(), offsetMinutes: clock.offsetMinutes });
    });
    api.post('/dev/clock/advance', (req, res) => {
      const { minutes } = AdvanceClockBody.parse(req.body);
      clock.advance(minutes);
      logger.warn('Reloj de demostración adelantado', { minutes, now: clock.now().toISOString() });
      res.json({ now: clock.now().toISOString(), offsetMinutes: clock.offsetMinutes });
    });
    api.post('/dev/clock/reset', (_req, res) => {
      clock.reset();
      res.json({ now: clock.now().toISOString(), offsetMinutes: 0 });
    });
  }

  app.use('/api', api);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `No existe ${req.method} ${req.path}` } });
  });
  app.use(errorHandler(logger));

  return app;
}
