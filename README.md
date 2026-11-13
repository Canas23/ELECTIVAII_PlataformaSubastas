# ELECTIVAII_PlataformaSubastas_EsoVaAlFallo

**Materia:** Electiva II – Desarrollo (Ingeniería de Software, Tecnológico de Antioquia)
**Proyecto:** Plataforma de Subastas en Línea
**Equipo:** Eso Va al Fallo
**Docente:** Ricardo José Montes Barba — Semestre 2026-02, grupo 002

**Integrantes**

- Juan Esteban Canas Garcia
- Alejandro Rodriguez Blanco
- Juan David Maturana Lozano
- Sthyd Anderson Guissao Ramirez

---

## Descripción

Plataforma de subastas públicas: un vendedor publica un artículo con precio base, incremento mínimo y fecha de cierre; los usuarios registrados pujan y todos los conectados ven cada nueva oferta al instante; al cerrar, la oferta más alta gana y se genera una orden de pago que una pasarela externa confirma mediante un webhook.

El proyecto está construido con **arquitectura hexagonal** y **diseño guiado por el dominio**: las 23 reglas de negocio se hacen cumplir dentro del modelo de dominio, que no depende de Express, de la librería de WebSockets ni de la base de datos.

Las tres formas de comunicación conviven porque el negocio las necesita:

| Canal | Quién inicia | Qué transporta |
|---|---|---|
| API REST | La aplicación web | Registro, sesión, subastas, pujas, órdenes de pago |
| WebSockets | El servidor | Nueva puja vigente, aviso de superación, cierre, pago |
| Webhook | La pasarela de pagos | Resultado del cobro de una orden |

**Estado:** Entrega 2 completa — API terminada, persistencia SQLite, tiempo real operando, webhook de pagos con verificación de origen e idempotencia, documentación Swagger y aplicación web (*SubastaYa*) conectada al backend.

## Tecnologías

| Parte | Tecnologías |
|---|---|
| Backend | Node.js 22.13+, TypeScript (modo estricto), Express 5, ws, Zod, bcryptjs, jsonwebtoken |
| Base de datos | SQLite con el módulo nativo `node:sqlite` (archivo local, se crea solo; no requiere instalar ningún motor) |
| Frontend | React 19, Vite, TypeScript, lucide-react |
| Pruebas | Vitest (dominio, webhook, contrato de repositorios y flujo de punta a punta) |
| Documentación | OpenAPI 3 + Swagger UI en `/docs` |

---

## Instalación y ejecución

### Requisitos previos

- [Node.js](https://nodejs.org) 22.13 o superior (recomendado Node 22 LTS o 24 LTS)
- [Git](https://git-scm.com)
- Opcional: Visual Studio Code

```bash
node -v
git --version
```

### 1. Clonar el repositorio

```bash
git clone https://github.com/Canas23/ELECTIVAII_PlataformaSubastas.git
cd ELECTIVAII_PlataformaSubastas
```

En VS Code: **Archivo → Abrir carpeta…** y selecciona la carpeta que contiene `package.json`. Abre la terminal con **Terminal → Nueva terminal**.

### 2. Instalar dependencias

```bash
npm install
cd frontend
npm install
cd ..
```

### 3. Configurar las variables de entorno

Crea el archivo `.env` a partir de la plantilla:

```bash
cp .env.example .env            # Git Bash
Copy-Item .env.example .env     # PowerShell
```

Genera dos claves secretas (ejecuta el comando dos veces):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Abre `.env` y pega una clave en `JWT_SECRET=` y la otra en `PAYMENT_WEBHOOK_SECRET=`. Para la demostración, cambia también `DEV_CLOCK_ENABLED=true`.

> El archivo debe llamarse exactamente `.env` y estar en la raíz del proyecto, junto a `package.json`. No se sube al repositorio (está excluido en `.gitignore`).

### 4. Ejecutar las pruebas

```bash
npm test
```

Debe mostrar `Tests  86 passed`.

### 5. Ejecutar el backend

Modo desarrollo (se reinicia solo al guardar cambios):

```bash
npm run dev
```

Modo producción (compila y ejecuta):

```bash
npm run build
npm start
```

Al arrancar se muestra:

```text
API escuchando en http://localhost:3000/api
Documentación: http://localhost:3000/docs
WebSocket:     ws://localhost:3000/ws?token=<JWT>
```

### 6. Ejecutar la aplicación web

En **otra terminal** (con el backend corriendo):

```bash
cd frontend
npm run dev
```

Abre <http://localhost:5173>. Para probar el tiempo real, abre la aplicación en dos navegadores (o uno en ventana de incógnito) con usuarios distintos.

Para detener cualquiera de los dos servidores, presiona `Ctrl + C` en su terminal.

### 7. Probar la API

- **Documentación interactiva (Swagger):** <http://localhost:3000/docs>
- **Colección de peticiones:** [`docs/api.http`](docs/api.http) (extensión *REST Client* de VS Code)
- **Demostración completa** (dos clientes en tiempo real, pujas, cierre y pago): [`docs/DEMO.md`](docs/DEMO.md)

---

## Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
|---|---|---|---|
| `PORT` | no | `3000` | Puerto HTTP (el WebSocket usa el mismo puerto, ruta `/ws`) |
| `PERSISTENCE` | no | `sqlite` | `sqlite` (definitiva) o `memory` (Entrega 1 / pruebas) |
| `SQLITE_PATH` | no | `./data/subastas.sqlite` | Archivo de la base de datos |
| `JWT_SECRET` | **sí** | — | Secreto para firmar tokens de sesión (mín. 16 caracteres) |
| `JWT_EXPIRES_IN` | no | `2h` | Vigencia del token |
| `BCRYPT_ROUNDS` | no | `10` | Costo del cifrado de contraseñas |
| `PAYMENT_WEBHOOK_SECRET` | **sí** | — | Secreto compartido con la pasarela para firmar el webhook (mín. 16) |
| `PAYMENT_WEBHOOK_TOLERANCE_SECONDS` | no | `300` | Antigüedad máxima de una firma |
| `API_BASE_URL` | no | `http://localhost:3000` | Usada por los scripts de apoyo |
| `DEV_CLOCK_ENABLED` | no | `false` | Solo demostraciones: habilita `/api/dev/clock` para adelantar el reloj |
| `CORS_ORIGIN` | no | `*` | Origen permitido para la aplicación web |

Si falta una variable obligatoria, el servidor no arranca y dice cuál falta.

El frontend admite `VITE_API_URL` y `VITE_WS_URL` en `frontend/.env` (ver `frontend/.env.example`).

---

## Endpoints principales

Todas las rutas de subastas requieren sesión (`Authorization: Bearer <token>`), porque la información es solo para usuarios registrados (RN-23). El detalle completo está en Swagger.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/register` | Registrar usuario |
| `POST` | `/api/auth/login` | Iniciar sesión (devuelve el token) |
| `GET` | `/api/users/me` | Perfil con subastas publicadas y participaciones |
| `GET` | `/api/categories` | Categorías |
| `GET` | `/api/auctions` | Listar (filtros `categoryId`, `status`, `page`, `pageSize`) |
| `POST` | `/api/auctions` | Publicar |
| `GET` | `/api/auctions/:id` | Detalle con historial de pujas |
| `POST` | `/api/auctions/:id/cancel` | Cancelar (vendedor, sin pujas) |
| `GET` / `POST` | `/api/auctions/:id/bids` | Historial / pujar |
| `GET` | `/api/auctions/:id/rejected-bids` | Auditoría de intentos rechazados |
| `GET` | `/api/payment-orders` | Mis órdenes de pago |
| `GET` | `/api/notifications` | Mis notificaciones |
| `PATCH` | `/api/notifications/:id/read` | Marcar como leída |
| `POST` | `/api/webhooks/payments` | Webhook de la pasarela (firmado) |
| `POST` | `/api/dev/clock/advance` | Adelantar el reloj (solo demo) |

---

## Pruebas

```bash
npm test               # 86 pruebas: dominio, webhook, contrato de repositorios y flujo E2E
npm run typecheck      # compilación estricta sin emitir archivos
npm run check:domain   # verifica que el dominio no importe infraestructura (RNF-02)
```

## Demostración (sustentación)

La guía paso a paso, con comandos para PowerShell, está en [`docs/DEMO.md`](docs/DEMO.md): dos usuarios en tiempo real, rechazos de pujas, cierre, adjudicación y pago por webhook. Incluye una tabla de problemas frecuentes en Windows.

> En PowerShell, si `npm run <script> -- ...` no recibe los argumentos, ejecuta el script directamente: `npx tsx scripts/ws-client.ts ...` o `npx tsx scripts/simulate-payment.ts ...`.

### Tiempo real desde la terminal (dos clientes)

Con el servidor corriendo y una subasta creada, abre dos terminales:

```bash
npm run ws:client -- --email ana@correo.com  --password secreta123 --auction <auctionId>
npm run ws:client -- --email luis@correo.com --password secreta123 --auction <auctionId>
```

Cada puja que se registre (por la web, Swagger, `docs/api.http` o curl) aparece al instante en ambas terminales; quien es superado recibe además `bid.outbid`.

### Simular la pasarela de pagos

```bash
# Notificación legítima (firmada con PAYMENT_WEBHOOK_SECRET), enviada 3 veces para ver la idempotencia
npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> --repeat 3

# Notificación falsificada: debe responder 401 sin cambiar nada
npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> --bad-signature

# Cobro rechazado por la pasarela
npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> --status rejected
```

### Adelantar el reloj (solo para la sustentación)

La duración mínima de una subasta es una hora (RN-03). Para mostrar cierre y adjudicación sin esperar, arranca con `DEV_CLOCK_ENABLED=true` y usa:

```bash
curl -X POST http://localhost:3000/api/dev/clock/advance -H "Content-Type: application/json" -d '{"minutes":120}'
```

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/dev/clock/advance -ContentType 'application/json' -Body '{"minutes":120}'
```

El dominio recibe la hora por el puerto `Clock`; solo cambia el adaptador. Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## Estructura del repositorio

```text
├── src/
│   ├── domain/          Reglas de negocio (agregado Auction, objetos de valor, eventos)
│   ├── application/     Casos de uso, puertos y DTO
│   ├── infrastructure/  HTTP, WebSocket, SQLite, seguridad, eventos, configuración
│   ├── bootstrap.ts     Raíz de composición
│   └── main.ts          Punto de entrada
├── tests/               Pruebas (dominio, aplicación, infraestructura, e2e)
├── frontend/            Aplicación web SubastaYa (React + Vite)
├── scripts/             Simulador de pasarela, cliente WebSocket, verificación de capas
└── docs/                Arquitectura, reglas de negocio, demo, OpenAPI, colección HTTP
```

## Documentación del repositorio

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — capas hexagonales, estructura de carpetas, modelo de dominio, flujos, ramas y commits (con diagramas).
- [`docs/REGLAS-DE-NEGOCIO.md`](docs/REGLAS-DE-NEGOCIO.md) — dónde se hace cumplir cada regla (RN-01 a RN-23) y cada requisito, y qué prueba lo demuestra.
- [`docs/DEMO.md`](docs/DEMO.md) — guía de demostración paso a paso para la sustentación.
- [`docs/openapi.yaml`](docs/openapi.yaml) — especificación de la API REST, del protocolo WebSocket y del contrato del webhook.
- [`docs/api.http`](docs/api.http) — colección de peticiones lista para ejecutar.

## Licencia

MIT — ver [LICENSE](LICENSE).
