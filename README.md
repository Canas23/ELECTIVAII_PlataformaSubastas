ELECTIVAII_PlataformaSubastas_EsoVaAlFallo

Nombre de la Materia: Electiva II – Desarrollo (Ingeniería de Software, Tecnológico de Antioquia)

Nombre del Proyecto: Plataforma de Subastas en Línea

Equipo: Eso Va al Fallo

Integrantes:

Juan Esteban Canas Garcia
Alejandro Rodriguez Blanco
Juan David Maturana Lozano
Sthyd Anderson Guissao Ramirez

Docente: Ricardo José Montes Barba — Semestre 2026-02, grupo 002

Descripción

API para una plataforma de subastas públicas: un vendedor publica un artículo con precio base, incremento mínimo y fecha de cierre; los usuarios registrados pujan y todos los conectados ven cada nueva oferta al instante; al cerrar, la oferta más alta gana y se genera una orden de pago que una pasarela externa confirma mediante un webhook.

El proyecto está construido con arquitectura hexagonal y diseño guiado por el dominio: las 23 reglas de negocio se hacen cumplir dentro del modelo de dominio, que no depende de Express, de la librería de WebSockets ni de la base de datos.

Las tres formas de comunicación conviven porque el negocio las necesita:

Canal	Quién inicia	Qué transporta
API REST	La aplicación web	Registro, sesión, subastas, pujas, órdenes de pago
WebSockets	El servidor	Nueva puja vigente, aviso de superación, cierre, pago
Webhook	La pasarela de pagos	Resultado del cobro de una orden

Estado: Entrega 2 completa — API terminada, persistencia SQLite, tiempo real operando y webhook de pagos con verificación de origen e idempotencia (opcional en esta entrega, incluido).

Requerimientos
Node.js 22.13 o superior (usa el módulo nativo node:sqlite, sin compilar dependencias). Recomendado: Node 22 LTS o 24 LTS.
npm 10+
Express 5, TypeScript (modo estricto), ws, Zod, bcryptjs, jsonwebtoken
Base de datos: SQLite (archivo local, se crea solo). No requiere instalar ningún motor.
Pruebas: Vitest
Instrucciones de instalación y ejecución
Requisitos previos
Node.js 22.13 o superior (recomendado Node 22 LTS o 24 LTS): https://nodejs.org
Git: https://git-scm.com
Opcional: Visual Studio Code

Verifica la instalación:

bash
node -v
git --version
1. Clonar el repositorio
bash
git clone https://github.com/<usuario>/ELECTIVAII_PlataformaSubastas_EsoVaAlFallo.git
cd ELECTIVAII_PlataformaSubastas_EsoVaAlFallo

En VS Code: Archivo → Abrir carpeta… y selecciona la carpeta que contiene package.json. Abre la terminal con Terminal → Nueva terminal.

2. Instalar dependencias
bash
npm install

Debe terminar con added ... packages y found 0 vulnerabilities.

3. Configurar las variables de entorno

Crea el archivo .env a partir de la plantilla (funciona en PowerShell y en Git Bash):

bash
cp .env.example .env

Genera dos claves secretas (ejecuta el comando dos veces):

bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

Abre .env y pega una clave en JWT_SECRET= y la otra en PAYMENT_WEBHOOK_SECRET=. Para la demostración, cambia también DEV_CLOCK_ENABLED=true.

El archivo debe llamarse exactamente .env y estar en la raíz del proyecto, junto a package.json. No se sube al repositorio (está excluido en .gitignore).

4. Ejecutar las pruebas
bash
npm test

Debe mostrar Tests 95 passed.

5. Ejecutar el servidor

Modo desarrollo (se reinicia solo al guardar cambios):

bash
npm run dev

Modo producción (compila y ejecuta):

bash
npm run build
npm start

Al arrancar se muestra:

API escuchando en http://localhost:3000
Documentación: http://localhost:3000/docs
WebSocket:     ws://localhost:3000/ws?token=<JWT>
6. Probar la API
Documentación interactiva (Swagger): abre http://localhost:3000/docs en el navegador.
Demostración completa (dos clientes en tiempo real, pujas, cierre y pago): ver docs/DEMO.md.
Colección de peticiones: docs/api.http (extensión REST Client de VS Code).

Para detener el servidor, presiona Ctrl + C en su terminal.

Variables de entorno
Variable	Obligatoria	Por defecto	Descripción
PORT	no	3000	Puerto HTTP (el WebSocket usa el mismo puerto, ruta /ws)
PERSISTENCE	no	sqlite	sqlite (definitiva) o memory (Entrega 1 / pruebas)
SQLITE_PATH	no	./data/subastas.sqlite	Archivo de la base de datos
JWT_SECRET	sí	—	Secreto para firmar tokens de sesión (mín. 16 caracteres)
JWT_EXPIRES_IN	no	2h	Vigencia del token
BCRYPT_ROUNDS	no	10	Costo del cifrado de contraseñas
PAYMENT_WEBHOOK_SECRET	sí	—	Secreto compartido con la pasarela para firmar el webhook (mín. 16)
PAYMENT_WEBHOOK_TOLERANCE_SECONDS	no	300	Antigüedad máxima de una firma
API_BASE_URL	no	http://localhost:3000	Usada por los scripts de apoyo
DEV_CLOCK_ENABLED	no	false	Solo demostraciones: habilita /api/dev/clock para adelantar el reloj

Si falta una variable obligatoria, el servidor no arranca y dice cuál falta.

Pruebas
bash
npm test               # 95 pruebas: dominio, webhook, contrato de repositorios y flujo E2E
npm run typecheck      # compilación estricta sin emitir archivos
npm run check:domain   # verifica que el dominio no importe infraestructura (RNF-02)
Demostración completa (sustentación)

La guía paso a paso, con comandos para PowerShell probados en Windows, está en docs/DEMO.md: dos clientes en tiempo real, rechazos de pujas, cierre, adjudicación y pago por webhook. También incluye una tabla de problemas frecuentes en Windows.

En PowerShell, si npm run <script> -- ... no recibe los argumentos, ejecuta el script directamente: npx tsx scripts/ws-client.ts ... o npx tsx scripts/simulate-payment.ts ....

Demostración de tiempo real (dos clientes)

Con el servidor corriendo y una subasta creada, abre dos terminales:

bash
npm run ws:client -- --email ana@correo.com  --password secreta123 --auction <auctionId>
npm run ws:client -- --email luis@correo.com --password secreta123 --auction <auctionId>

Cada puja que se registre por la API (Swagger, docs/api.http o curl) aparece al instante en ambas terminales; quien es superado recibe además bid.outbid.

Simular la pasarela de pagos
bash
# Notificación legítima (firmada con PAYMENT_WEBHOOK_SECRET), enviada 3 veces para ver la idempotencia
npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> --repeat 3

# Notificación falsificada: debe responder 401 sin cambiar nada
npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> --bad-signature

# Cobro rechazado por la pasarela
npm run gateway:simulate -- --order <paymentOrderId> --amount <valor> --status rejected
Adelantar el reloj (solo para la sustentación)

La duración mínima de una subasta es una hora (RN-03). Para mostrar cierre y adjudicación sin esperar, arranca con DEV_CLOCK_ENABLED=true y usa:

bash
curl -X POST http://localhost:3000/api/dev/clock/advance -H "Content-Type: application/json" -d '{"minutes":120}'

El dominio recibe la hora por el puerto Clock; solo cambia el adaptador. Ver docs/ARQUITECTURA.md.

Documentación del repositorio
docs/ARQUITECTURA.md — estructura de carpetas, capas hexagonales, modelo de dominio, ramas y commits.
docs/REGLAS-DE-NEGOCIO.md — dónde se hace cumplir cada regla (RN-01 a RN-23) y cada requisito.
docs/DEMO.md — guía de demostración paso a paso para la sustentación.
docs/openapi.yaml — especificación de la API REST, del protocolo WebSocket y del contrato del webhook.
Licencia

MIT — ver LICENSE.