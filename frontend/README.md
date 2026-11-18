# SubastaYa — Frontend

Aplicación web de la **Plataforma de Subastas en Línea** (equipo Eso Va al Fallo). React 19 + TypeScript + Vite.

Se conecta al backend de la carpeta raíz por **API REST** (`http://localhost:3000/api`) y **WebSocket** (`ws://localhost:3000/ws`).

## Ejecutar

El backend debe estar corriendo primero (`npm run dev` en la raíz del proyecto).

```bash
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>.

Si el backend usa otro puerto, copia `.env.example` a `.env` y ajusta `VITE_API_URL` y `VITE_WS_URL`.

## Qué incluye

| Pantalla | Funcionalidad |
|---|---|
| Inicio / catálogo | Subastas reales con filtros por categoría y estado, búsqueda, orden, contador de cierre |
| Registro e ingreso | Ventana emergente; la sesión (JWT) se guarda en el navegador |
| Publicar | Formulario con precio base, incremento mínimo y fecha de cierre |
| Detalle | Pujar, oferta mínima sugerida, historial y precio **en vivo**, participantes conectados, cancelar (vendedor), resultado y estado del pago |
| Notificaciones | Campana con avisos (te superaron, ganaste, vendiste, pago confirmado) y avisos flotantes en tiempo real |
| Mi cuenta | Perfil, órdenes de pago, subastas publicadas y en las que participaste |

Sin sesión, el catálogo muestra una invitación a registrarse (RN-23: la información de las subastas es solo para usuarios registrados).

## Estructura

```text
src/
├── App.tsx                 Encabezado, catálogo y navegación (#/subasta/:id, #/cuenta)
├── pages/                  AuctionDetail.tsx, MyAccount.tsx
├── components/             AuthModal, PublishAuctionModal, NotificationsPanel, Toasts, Modal
├── services/
│   ├── auctionService.ts   Cliente de la API REST
│   └── realtime.ts         Conexión WebSocket única con reconexión automática
├── utils/format.ts         Formato de pesos, tiempos, etiquetas e imágenes ilustrativas
├── index.css               Estilos base del diseño
└── app-extra.css           Estilos de modales, avisos, cuenta y estados
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm run build` | Verificación de tipos + compilación para producción en `dist/` |
| `npm run preview` | Sirve la compilación de `dist/` |
| `npm run lint` | Revisión con oxlint |

> Las imágenes de los artículos son ilustrativas (según la categoría): el backend no almacena fotos.
