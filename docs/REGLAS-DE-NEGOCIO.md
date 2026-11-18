# Reglas de negocio y requisitos — dónde se cumple cada uno

> Equipo **Eso Va al Fallo** · Electiva II – Desarrollo

Este documento responde, para cada regla y requisito: **¿dónde está el código que lo hace cumplir?** y **¿qué prueba lo demuestra?**

**Principio:** las reglas viven en el **dominio** (`src/domain`). La API, el WebSocket y la base de datos no deciden nada sobre el negocio; solo transportan y guardan. Por eso las reglas se prueban sin servidor.

**Leyenda de colores de capa:** 💎 Dominio · ⚙️ Aplicación · 🔌 Infraestructura

---

## 1. Reglas de negocio (RN-01 a RN-23)

### Publicación

| Regla | Qué dice | Dónde se cumple | Prueba |
|---|---|---|---|
| **RN-01** | Precio base y incremento mínimo mayores que cero; fecha de cierre obligatoria y válida | 💎 `AuctionTerms` (al crear) · `Auction.publish()` | `auctionPublication.test.ts` — "RN-01: …" (4 casos) |
| **RN-02** | Una subasta no puede nacer vencida | 💎 `AuctionTerms` | "RN-02: una subasta no puede nacer vencida" |
| **RN-03** | Duración entre **1 hora** y **30 días** calendario | 💎 `AuctionTerms` → `INVALID_AUCTION_DURATION` | "RN-03: duración mínima…" y "…máxima…" · E2E: `httpFlow.test.ts` |
| **RN-04** | Solo el vendedor cancela, y solo si **no hay pujas** | 💎 `Auction.cancel()` → `NOT_AUCTION_SELLER`, `AUCTION_HAS_BIDS`, `AUCTION_NOT_OPEN` | `auctionPublication.test.ts` — "Cancelación (RN-04)" · E2E |
| **RN-05** | Las condiciones publicadas (precio base, incremento, cierre) no cambian | 💎 `AuctionTerms` es inmutable y no expone métodos para modificarse · 🔌 `SqliteAuctionRepository` escribe artículo y condiciones una sola vez | "RN-05: las condiciones publicadas son inmutables" |

### Pujas

| Regla | Qué dice | Dónde se cumple | Código de rechazo | Prueba |
|---|---|---|---|---|
| **RN-06** | Solo una subasta **abierta** acepta pujas | 💎 `Auction.evaluateBid()` | `AUCTION_NOT_OPEN` (409) | `auctionBidding.test.ts` — "RN-06…" (3 casos) |
| **RN-07** | El vendedor no puja por su artículo | 💎 `Auction.evaluateBid()` | `SELLER_CANNOT_BID` (403) | "RN-07…" · E2E |
| **RN-08** | La primera puja ≥ precio base | 💎 `Auction.evaluateBid()` | `BELOW_BASE_PRICE` (422) | "RN-08: primera puja" (2 casos) · E2E |
| **RN-09** | Superar la vigente en **al menos** el incremento mínimo (igual se rechaza) | 💎 `Auction.evaluateBid()` · `Auction.minimumNextBid()` | `BELOW_MINIMUM_INCREMENT` (422) | "RN-09: incremento mínimo" (4 casos) · E2E |
| **RN-10** | El mejor postor no puede superarse a sí mismo | 💎 `Auction.evaluateBid()` | `ALREADY_HIGHEST_BIDDER` (409) | "RN-10…" (2 casos) · E2E |
| **RN-11** | Las pujas aceptadas son irrevocables | 💎 `Bid` inmutable; `Auction.acceptedBids` devuelve una copia · 🔌 SQLite solo inserta pujas, nunca actualiza ni borra | "RN-11: pujas irrevocables" (2 casos) |
| **RN-12** | Todo intento rechazado queda registrado con su motivo | 💎 `Auction.placeBid()` crea `RejectedBidAttempt` + evento `BidRejected` · ⚙️ `PlaceBid` lo persiste antes de responder el error | "RN-12: auditoría…" (2 casos) · E2E (consulta `/rejected-bids`) |

### Cierre y adjudicación

| Regla | Qué dice | Dónde se cumple | Prueba |
|---|---|---|---|
| **RN-13** | Al cerrar, gana la oferta más alta | 💎 `Auction.closeIfDue()` | `auctionClosingAndPayment.test.ts` — "RN-13…" · E2E |
| **RN-14** | Sin pujas → **desierta**, sin obligación de pago | 💎 `Auction.closeIfDue()` | "RN-14…" |
| **RN-15** | Orden de pago por el valor ganador, a nombre del ganador, plazo **48 horas** | 💎 `Auction.closeIfDue()` crea `PaymentOrder` | "RN-15…" · E2E |
| **RN-16** | Una sola orden por subasta | 💎 `closeIfDue()` solo actúa sobre subastas abiertas · 🔌 restricción `UNIQUE(auction_id)` en `payment_orders` | "RN-16: un segundo cierre no altera el resultado…" |

### Pagos

| Regla | Qué dice | Dónde se cumple | Prueba |
|---|---|---|---|
| **RN-17** | El pago **solo** lo confirma la pasarela, por el valor exacto | 💎 `Auction.confirmPayment()` / `PaymentOrder` · ⚙️ `ProcessPaymentNotification` es el único camino | `auctionClosingAndPayment.test.ts` y `processPaymentNotification.test.ts` — "RN-17…" · E2E |
| **RN-18** | El webhook debe probar que viene de la pasarela | 🔌 `HmacWebhookSignatureVerifier` (HMAC-SHA256, tolerancia de tiempo, comparación en tiempo constante) · ⚙️ se verifica **antes** de leer el cuerpo | "RN-18…" (4 casos: firma inválida, sin cabecera, antigua, cuerpo alterado) · E2E |
| **RN-19** | Una notificación repetida se procesa **una sola vez** | ⚙️ `ProcessPaymentNotification` busca el `eventId` + `KeyedMutex` · 🔌 `event_id` es clave primaria en `payment_events` | "RN-19…" (repetida y simultánea) · E2E (cabecera `Idempotent-Replayed`) |
| **RN-20** | Pasadas 48 h sin pago, la orden **vence** y la subasta queda en incumplimiento | 💎 `PaymentOrder` + `Auction.expirePaymentIfOverdue()` · ⚙️ `settleAllDue()` periódico | "RN-20…" (3 casos) |

### Valores y privacidad

| Regla | Qué dice | Dónde se cumple | Prueba |
|---|---|---|---|
| **RN-21** | Montos en **pesos colombianos**, enteros, nunca negativos | 💎 `Money` (objeto de valor) | `valueObjects.test.ts` — "Money (RN-21)" · "RN-21: rechaza montos con decimales" |
| **RN-22** | Correo electrónico válido y **único** | 💎 `Email` (valida y normaliza) · ⚙️ `RegisterUser` → `EMAIL_ALREADY_REGISTERED` (409) · 🔌 `UNIQUE(email)` | "Email (RN-22)" · E2E |
| **RN-23** | La información de subastas es para **usuarios registrados**; solo se muestran nombres públicos | 🔌 `requireAuth` en todas las rutas de subastas y en la conexión WebSocket · ⚙️ `userNames.ts` expone solo el nombre, nunca el correo | E2E — "exige sesión para consultar subastas (RN-23)" |

---

## 2. Requisitos funcionales

| RF | Descripción | Endpoint / canal | Caso de uso |
|---|---|---|---|
| RF-01 | Registro de usuario | `POST /api/auth/register` | `RegisterUser` |
| RF-02 | Inicio de sesión con token | `POST /api/auth/login` | `LoginUser` |
| RF-03 | Perfil con subastas publicadas y participaciones | `GET /api/users/me` | `GetMyProfile` |
| RF-04 | Publicar subasta | `POST /api/auctions` | `PublishAuction` |
| RF-05 | Listar con filtros (categoría, estado) y paginación | `GET /api/auctions` | `ListAuctions` |
| RF-06 | Detalle con oferta vigente e historial | `GET /api/auctions/:id` | `GetAuctionDetail` |
| RF-07 | Cancelar subasta | `POST /api/auctions/:id/cancel` | `CancelAuction` |
| RF-08 | Cierre automático al vencer | Perezoso al consultar + cada 5 s | `AuctionLifecycle` |
| RF-09 | Pujar | `POST /api/auctions/:id/bids` | `PlaceBid` |
| RF-10 | Informar el motivo del rechazo | Respuesta 403/409/422 con `error.code` | `PlaceBid` / `BidRejectedError` |
| RF-11 | Consultar intentos rechazados | `GET /api/auctions/:id/rejected-bids` | `ListRejectedBidAttempts` |
| RF-13 | Difundir cada nueva puja | WebSocket `bid.placed` | `AuctionRealtimeGateway` |
| RF-14 | Avisar al postor superado | WebSocket `bid.outbid` + notificación `OUTBID` | Gateway + `NotifyUsersOnAuctionEvents` |
| RF-15 | Anunciar cierre y resultado | WebSocket `auction.closed` | `AuctionRealtimeGateway` |
| RF-16 | Participantes conectados (opcional) | WebSocket `auction.participants` | `AuctionRealtimeGateway` |
| RF-17 | Consultar órdenes de pago | `GET /api/payment-orders`, `GET /api/payment-orders/:id` | `GetPaymentOrders` |
| RF-18 | Recibir notificación de la pasarela | `POST /api/webhooks/payments` | `ProcessPaymentNotification` |
| RF-19 | Verificar el origen | Cabecera `x-gateway-signature` | `HmacWebhookSignatureVerifier` |
| RF-20 | Aplicar el resultado del cobro una sola vez | Idempotencia por `eventId` | `ProcessPaymentNotification` |

Además: notificaciones persistentes (`GET /api/notifications`, `PATCH /api/notifications/:id/read`) y reloj de demostración (`/api/dev/clock/*`, solo con `DEV_CLOCK_ENABLED=true`).

---

## 3. Requisitos no funcionales

| RNF | Qué exige | Cómo se cumple |
|---|---|---|
| RNF-02 | El dominio no depende de infraestructura | `npm run check:domain` revisa los `import` de `src/domain` |
| RNF-04 | Persistencia detrás de puertos | Interfaces en `application/ports/repositories.ts` |
| RNF-05 | Los casos de uso no conocen el canal de tiempo real | Publican eventos en `EventPublisher`; el gateway WebSocket es un suscriptor más |
| RNF-06 | Persistencia intercambiable | `PERSISTENCE=sqlite` o `memory`; ambos pasan el mismo contrato de pruebas |
| RNF-07 | Datos siempre válidos | Objetos de valor en el dominio + validación con Zod en el borde HTTP |
| Seguridad | Contraseñas y sesiones protegidas | bcrypt (costo configurable), JWT con vencimiento, mismo mensaje para correo o contraseña incorrectos |
| Concurrencia | Pujas simultáneas consistentes | `KeyedMutex` serializa las operaciones por subasta y por evento de pago |

---

## 4. Cómo se traducen los errores a HTTP

El dominio lanza `DomainError` con un **código de regla**; la capa HTTP (`infrastructure/http/errorHandler.ts`) lo traduce sin conocer la regla:

| Situación | HTTP | Ejemplos de código |
|---|---|---|
| Formato inválido (Zod) | 400 | `VALIDATION_ERROR`, `INVALID_JSON` |
| Sin sesión o firma inválida | 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `INVALID_WEBHOOK_SIGNATURE` |
| Sin permiso | 403 | `SELLER_CANNOT_BID`, `NOT_AUCTION_SELLER`, `NOT_NOTIFICATION_OWNER` |
| No existe | 404 | `AUCTION_NOT_FOUND`, `PAYMENT_ORDER_NOT_FOUND`, `ROUTE_NOT_FOUND` |
| Conflicto con el estado actual | 409 | `AUCTION_NOT_OPEN`, `ALREADY_HIGHEST_BIDDER`, `AUCTION_HAS_BIDS`, `EMAIL_ALREADY_REGISTERED` |
| Regla de negocio incumplida | 422 | `BELOW_MINIMUM_INCREMENT`, `INVALID_AUCTION_DURATION`, `INVALID_MONEY` |

Formato uniforme de todas las respuestas de error:

```json
{ "error": { "code": "BELOW_MINIMUM_INCREMENT", "message": "La puja debe superar…", "details": { "minimumNextBid": 110000 } } }
```

---

## 5. Pruebas

```bash
npm test               # todas las pruebas
npm run check:domain   # verifica que el dominio no importe infraestructura
npm run typecheck      # TypeScript estricto
```

| Archivo | Qué cubre |
|---|---|
| `tests/domain/auctionPublication.test.ts` | RN-01 a RN-05 |
| `tests/domain/auctionBidding.test.ts` | RN-06 a RN-12, RN-21 |
| `tests/domain/auctionClosingAndPayment.test.ts` | RN-13 a RN-17, RN-20 |
| `tests/domain/valueObjects.test.ts` | `Money` (RN-21), `Email` (RN-22), `AuctionStatus` |
| `tests/application/processPaymentNotification.test.ts` | RN-17 a RN-20 en el webhook |
| `tests/infrastructure/auctionRepositoryContract.test.ts` | Mismo contrato para memoria y SQLite (RNF-06) |
| `tests/e2e/httpFlow.test.ts` | Flujo completo real: HTTP + WebSocket + webhook firmado |
