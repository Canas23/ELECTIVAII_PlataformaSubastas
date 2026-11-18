# Análisis técnico — Plataforma de Subastas

## 1. Diagnóstico general

El proyecto original ya contiene una solución bastante completa y coherente con el enunciado: dominio aislado, casos de uso, puertos, adaptadores de infraestructura, persistencia SQLite, autenticación JWT, WebSocket, webhook, pruebas y frontend React.

Por tanto, la estrategia de completación no consiste en reemplazar la arquitectura, sino en **conservar el núcleo que ya cumple el propósito académico y reforzar la documentación y la ejecución local**.

## 2. Arquitectura identificada

**Arquitectura principal:** Hexagonal / Ports & Adapters.

**Enfoque de diseño:** Domain-Driven Design (DDD) pragmático.

### Capas

| Capa | Responsabilidad |
|---|---|
| `domain` | Reglas de negocio y modelo |
| `application` | Casos de uso y puertos |
| `infrastructure` | HTTP, WebSocket, SQLite, seguridad y servicios técnicos |
| `bootstrap` | Inyección y composición |
| `frontend` | Interfaz React que consume REST/WebSocket |

### Regla de dependencia

```text
┌───────────────────────────────┐
│       Infrastructure          │
│ Express / SQLite / JWT / WS   │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│         Application           │
│ Use Cases / Ports / DTOs       │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│           Domain              │
│ Auction / Bid / Money / etc.  │
└───────────────────────────────┘
```

El dominio no depende de Express, SQLite ni WebSocket.

## 3. Dominio

El agregado central es `Auction`.

Conceptos principales:

- `User`
- `Item`
- `Category`
- `Auction`
- `AuctionTerms`
- `Bid`
- `RejectedBidAttempt`
- `PaymentOrder`
- `PaymentEvent`
- `Notification`

Objetos de valor relevantes:

- `Money`
- `Email`
- `AuctionTerms`
- estados y condiciones controladas por el dominio

## 4. Estados de una subasta

```text
OPEN
 ├── CANCELLED
 ├── DESERTED
 └── ADJUDICATED
       ├── PAID
       └── DEFAULTED
```

Una subasta abierta puede recibir pujas. Al llegar la fecha de cierre, se adjudica al mejor postor o se declara desierta.

## 5. Lógica de negocio

Las reglas RN-01 a RN-23 se encuentran documentadas en:

```text
docs/REGLAS-DE-NEGOCIO.md
```

La ubicación de las reglas es deliberadamente el dominio, no los controladores.

### Ejemplo: puja

```text
HTTP POST /api/auctions/:id/bids
             ↓
        Controller
             ↓
        PlaceBid
             ↓
     AuctionLifecycle
             ↓
          Auction
             ↓
  ┌──────────┴──────────┐
  │                     │
Acepta                 Rechaza
  │                     │
BidPlaced          BidRejected
  │                     │
  ↓                     ↓
Persistencia       Auditoría
  │
  ↓
EventBus
  │
  ├── WebSocket
  ├── Notificaciones
  └── Log de negocio
```

## 6. REST + WebSocket + Webhook

### REST

El navegador inicia la comunicación.

Ejemplos:

```text
POST /api/auth/login
GET  /api/auctions
POST /api/auctions
POST /api/auctions/:id/bids
GET  /api/payment-orders
```

### WebSocket

El servidor informa novedades sin que el navegador tenga que preguntar.

Ejemplos:

```text
bid.placed
bid.outbid
auction.closed
notification.created
```

### Webhook

La pasarela externa inicia la comunicación:

```text
Pasarela
   ↓
POST /api/webhooks/payments
   ↓
Verificación HMAC
   ↓
Idempotencia por eventId
   ↓
Cambio de estado de la orden
```

## 7. Persistencia

La interfaz de repositorio está definida en Application.

Existen dos implementaciones:

```text
PERSISTENCE=memory
        ↓
InMemoryRepositories

PERSISTENCE=sqlite
        ↓
SqliteRepositories
```

Esto cumple el principio de sustituibilidad de la persistencia sin modificar el dominio.

## 8. Frontend

El frontend React está organizado en:

```text
frontend/src/
├── App.tsx
├── components/
├── pages/
├── services/
├── utils/
├── index.css
└── main.tsx
```

`auctionService.ts` centraliza las llamadas REST.

`realtime.ts` centraliza la conexión WebSocket y su reconexión.

La interfaz cubre el flujo completo de usuario:

```text
Registro/Login
      ↓
Catálogo
      ↓
Detalle de subasta
      ↓
Puja
      ↓
Actualización WebSocket
      ↓
Cierre
      ↓
Ganador
      ↓
Orden de pago
```

## 9. Puntos importantes para la sustentación

El equipo debería poder explicar como mínimo:

1. Por qué `Auction` es la raíz del agregado.
2. Dónde se valida RN-09 y por qué no está en Express.
3. Cómo se registra un intento de puja rechazado.
4. Cómo se evita que una puja aceptada sea modificada.
5. Cómo se cambia SQLite por memoria.
6. Por qué el caso de uso no importa `ws`.
7. Cómo llega una puja desde React hasta `Auction.placeBid`.
8. Cómo se notifica al resto de clientes.
9. Cómo se verifica la firma HMAC del webhook.
10. Cómo se evita procesar dos veces el mismo `eventId`.
11. Cómo se genera la orden de pago de 48 horas.
12. Qué sucede cuando una subasta vence sin pujas.

## 10. Estado de la entrega

La solución incluye:

- Backend Node.js + Express + TypeScript.
- Arquitectura hexagonal.
- Dominio y reglas de negocio.
- SQLite.
- Persistencia en memoria.
- JWT.
- bcrypt.
- REST.
- WebSocket.
- Webhook firmado.
- Idempotencia.
- React + Vite.
- Pruebas Vitest.
- OpenAPI.
- Documentación de reglas.
- Scripts de demostración.
- Instrucciones de ejecución local.
- Configuración mediante variables de entorno.

## 11. Mejoras realizadas para esta versión

Se reforzó principalmente la parte operativa/documental:

- README completo orientado a Windows y GitHub.
- Instrucciones de configuración de `.env`.
- Flujo de ejecución separado para backend/frontend.
- Script de inicio local `scripts/start-local.ps1`.
- Documento técnico de arquitectura y lógica.
- Checklist de pruebas antes de subir a `main`.
- Recomendaciones de branching y commits.
