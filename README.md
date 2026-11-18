# ELECTIVAII_PlataformaSubastas_EsoVaAlFallo

**Materia:** Electiva II – Desarrollo  
**Programa:** Ingeniería de Software – Tecnológico de Antioquia  
**Proyecto:** Plataforma de Subastas en Línea  
**Equipo:** Eso Va al Fallo

## 1. Descripción

Plataforma web de subastas en línea. Un usuario registrado puede publicar un artículo con precio base, incremento mínimo y fecha de cierre. Otros usuarios pueden realizar ofertas; las pujas se validan en el dominio, se registran los intentos rechazados y los participantes reciben novedades en tiempo real mediante WebSocket.

Cuando una subasta vence:

- con pujas: se adjudica al mejor postor y se genera una orden de pago con plazo de 48 horas;
- sin pujas: queda desierta;
- un webhook permite simular la confirmación de pago de una pasarela externa;
- las notificaciones de pago son verificadas por firma HMAC y procesadas de forma idempotente.

## 2. Arquitectura

El proyecto implementa **Arquitectura Hexagonal (Ports & Adapters)** con separación explícita:

```text
src/
├── domain/          # Núcleo: entidades, objetos de valor, reglas y eventos
├── application/     # Casos de uso, puertos, DTO y servicios de aplicación
├── infrastructure/  # Express, SQLite, JWT, bcrypt, WebSocket, eventos, configuración
├── bootstrap.ts     # Composición de dependencias
└── main.ts          # Punto de entrada
```

La dirección de dependencias es:

```text
Infrastructure → Application → Domain
```

El dominio no importa Express, WebSocket, SQLite ni otras tecnologías de infraestructura.

### Agregado principal

`Auction` es la raíz del agregado. Las operaciones de publicar, pujar, cancelar, cerrar y gestionar el resultado del pago pasan por el agregado para impedir que las reglas se salten desde otro punto del sistema.

### Puertos y adaptadores

La persistencia se abstrae mediante interfaces en `src/application/ports`. Actualmente existen:

- SQLite para ejecución normal.
- Memoria para pruebas y escenarios de la primera entrega.

La implementación se selecciona mediante `PERSISTENCE=sqlite` o `PERSISTENCE=memory`.

## 3. Lógica de negocio

Las reglas de negocio principales se encuentran en `src/domain/auction/Auction.ts` y en sus objetos de valor.

Entre las reglas implementadas:

- precio base e incremento mínimo mayores que cero;
- duración entre 1 hora y 30 días;
- una subasta publicada no modifica sus condiciones;
- solo el vendedor puede cancelar y únicamente si no existen pujas;
- solo se puede pujar en subastas abiertas;
- el vendedor no puede pujar;
- la primera puja debe alcanzar el precio base;
- las siguientes deben superar la oferta vigente por el incremento mínimo;
- el mejor postor no puede superarse a sí mismo;
- las pujas aceptadas son irrevocables;
- todo intento rechazado queda auditado;
- al vencer, se adjudica al mejor postor o se declara desierta;
- la adjudicación genera una orden de pago de 48 horas;
- un cierre repetido no genera una segunda adjudicación;
- el pago solo se confirma mediante el webhook;
- los eventos de pago se procesan de forma idempotente;
- los valores monetarios son enteros COP no negativos;
- el correo electrónico es único.

Consulta el detalle de ubicación de cada regla en `docs/REGLAS-DE-NEGOCIO.md`.

## 4. Canales de comunicación

La solución usa los tres mecanismos solicitados:

| Canal | Uso |
|---|---|
| REST | Registro, login, consulta, publicación, pujas y pagos |
| WebSocket | Nuevas pujas, usuarios superados, cierres y notificaciones |
| Webhook | Resultado enviado por la pasarela de pagos |

El caso de uso no conoce la librería WebSocket. Publica eventos por un puerto; el adaptador WebSocket los traduce al canal en tiempo real.

## 5. Frontend

El frontend está desarrollado con:

- React 19
- TypeScript
- Vite
- React Router
- Lucide React

Incluye:

- registro e inicio de sesión;
- catálogo de subastas;
- filtros y búsqueda;
- detalle de subasta;
- historial de pujas;
- pujas en tiempo real;
- indicador de conexión WebSocket;
- publicación de subastas;
- cancelación cuando corresponde;
- notificaciones;
- favoritos locales;
- cuenta del usuario;
- historial de subastas;
- órdenes de pago;
- mensajes comprensibles de errores de negocio.

## 6. Requisitos

### Backend

- Node.js **22.13 o superior**.
- npm.
- Git.

### Frontend

- Node.js 22.13 o superior.
- npm.

No es necesario instalar PostgreSQL ni MySQL. La ejecución normal utiliza SQLite.

## 7. Ejecución local — Windows

### Paso 1: clonar

```bash
git clone <URL_DE_TU_REPOSITORIO>
cd ELECTIVAII_PlataformaSubastas_EsoVaAlFallo
```

### Paso 2: configurar backend

En PowerShell:

```powershell
Copy-Item .env.example .env
```

Edita `.env` y establece como mínimo:

```env
JWT_SECRET=una-clave-local-larga-de-al-menos-16-caracteres
PAYMENT_WEBHOOK_SECRET=otra-clave-local-larga-de-al-menos-16
```

Deja:

```env
PERSISTENCE=sqlite
PORT=3000
```

### Paso 3: instalar backend

```bash
npm ci
```

### Paso 4: instalar frontend

```bash
cd frontend
npm ci
Copy-Item .env.example .env
cd ..
```

Los valores por defecto del frontend ya apuntan a:

```text
REST:      http://localhost:3000/api
WebSocket: ws://localhost:3000/ws
```

### Paso 5: iniciar backend

Terminal 1:

```bash
npm run dev
```

Debe quedar disponible:

```text
http://localhost:3000/api/health
http://localhost:3000/docs
```

### Paso 6: iniciar frontend

Terminal 2:

```bash
cd frontend
npm run dev
```

Vite mostrará la dirección local, normalmente:

```text
http://localhost:5173
```

Abre esa dirección en el navegador.

## 8. Inicio rápido en Windows

También se incluye:

```text
scripts/start-local.ps1
```

Desde PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start-local.ps1
```

El script comprueba Node, crea los `.env` a partir de los ejemplos si todavía no existen, instala dependencias faltantes y abre el backend y frontend en terminales separadas.

## 9. Pruebas y verificaciones

Backend:

```bash
npm test
npm run typecheck
npm run check:domain
npm run build
```

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

`check:domain` verifica que el dominio no tenga importaciones de infraestructura.

## 10. Demostración del pago

El proyecto incluye un simulador de pasarela:

```bash
npm run gateway:simulate
```

Para usarlo, primero debe existir una orden de pago pendiente. El simulador envía la notificación firmada al webhook de la API.

## 11. Documentación de API

La API tiene documentación OpenAPI disponible cuando el backend está ejecutándose:

```text
http://localhost:3000/docs
```

También existe:

```text
docs/openapi.yaml
docs/api.http
```

## 12. Estructura del repositorio

```text
ELECTIVAII_PlataformaSubastas_EsoVaAlFallo/
├── src/
│   ├── domain/
│   ├── application/
│   ├── infrastructure/
│   ├── bootstrap.ts
│   └── main.ts
├── frontend/
│   └── src/
├── tests/
├── scripts/
├── docs/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 13. GitHub

La guía de la asignatura solicita un repositorio público, una rama principal estable y trabajo mediante ramas. Se recomienda:

```text
main
├── develop
├── feature/auth
├── feature/auctions
├── feature/realtime
└── feature/frontend
```

Para una funcionalidad:

```bash
git checkout main
git pull
git checkout -b feature/nombre-funcionalidad
```

Usa mensajes descriptivos y una convención consistente, por ejemplo Conventional Commits:

```text
feat: added auction publication
feat: added websocket bid updates
fix: rejected bids now persist audit records
docs: updated local execution instructions
test: covered auction closing rules
```

Antes de entregar:

```bash
npm test
npm run typecheck
npm run check:domain
npm run build

cd frontend
npm run build
npm run lint
```

Luego verifica que `main` quede ejecutable.

## 14. Seguridad del repositorio

**No subir nunca:**

```text
.env
data/*.sqlite
node_modules/
dist/
```

El repositorio contiene `.env.example`, pero no secretos reales.

## 15. Licencia

MIT. Consulta `LICENSE`.
