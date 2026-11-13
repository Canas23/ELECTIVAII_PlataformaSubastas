# Guía de demostración (sustentación)

> Duración sugerida: **10 a 12 minutos**. Muestra los tres canales: API REST, WebSockets y webhook.

Hay dos formas de hacer la demo. Se recomienda la **A (aplicación web)**, que es más visual, y usar la **B (terminal)** para mostrar el webhook y los rechazos con detalle.

---

## 0. Preparación (antes de la sustentación)

**1. Configurar `.env`** en la raíz del proyecto (junto a `package.json`):

```powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ejecútalo 2 veces
```

Pega una clave en `JWT_SECRET=`, la otra en `PAYMENT_WEBHOOK_SECRET=` y cambia `DEV_CLOCK_ENABLED=true`.

**2. Empezar con la base de datos limpia** (opcional, para que no aparezcan datos de ensayos):

```powershell
Remove-Item -Recurse -Force .\data -ErrorAction SilentlyContinue
```

**3. Abrir 3 terminales en VS Code** (`Terminal → Nueva terminal`, tres veces):

| Terminal | Comando | Debe mostrar |
|---|---|---|
| 1 · Backend | `npm run dev` | `API escuchando en http://localhost:3000/api` |
| 2 · Frontend | `cd frontend` y luego `npm run dev` | `Local: http://localhost:5173/` |
| 3 · Comandos | (libre) | — |

**4. Abrir dos navegadores distintos** (por ejemplo Chrome normal y Chrome en ventana de incógnito, o Chrome y Edge), uno al lado del otro, ambos en `http://localhost:5173`. Así cada uno tiene su propia sesión.

---

## A. Demostración con la aplicación web

### Paso 1 — Arquitectura (1 min)

Abre `docs/ARQUITECTURA.md` en GitHub o en VS Code (vista previa con `Ctrl+Shift+V`) y muestra el primer diagrama: dominio en el centro, adaptadores alrededor. Ejecuta en la terminal 3:

```powershell
npm run check:domain
npm test
```

> 💬 "El dominio no importa nada de Express, WebSockets ni SQLite, y esto lo verifica un script. Todas las pruebas pasan, incluida una de punta a punta."

### Paso 2 — Registro y regla RN-23 (1 min)

1. En el **navegador izquierdo**, baja al catálogo: aparece el candado *"Las subastas son solo para usuarios registrados"* (RN-23).
2. Clic en **Crear cuenta** → registra a **Vendedor** (`vendedor@demo.com`, contraseña `secreta123`).

### Paso 3 — Publicar (1 min)

1. Clic en **Publicar** (arriba a la derecha).
2. Llena: *Cámara Canon AE-1*, una descripción, categoría *Electrónica*, precio base **100000**, incremento **10000**, cierre: deja el valor sugerido (mañana).
3. 💡 Para mostrar RN-03, primero pon una fecha de cierre a **10 minutos** → el servidor responde *"La subasta debe durar entre una hora y treinta días"*. Luego corrígela.
4. Al publicar se abre el detalle: como eres el vendedor, **no aparece el formulario de puja** (RN-07) y sí el botón **Cancelar subasta** (RN-04).

### Paso 4 — Dos compradores en tiempo real (3 min)

1. En el navegador izquierdo: menú del usuario → **Cerrar sesión** → **Crear cuenta** como **Ana** (`ana@demo.com`).
2. En el **navegador derecho**: **Crear cuenta** como **Luis** (`luis@demo.com`).
3. Ambos abren la misma subasta (**Ver subasta**). Observa el contador **"2 mirando ahora"** (RF-16).
4. **Ana** puja **100000** → en el navegador de **Luis** el precio cambia solo, con un destello verde (RF-13).
5. **Luis** intenta **105000** → mensaje rojo: *"debe superar a la oferta vigente en al menos el incremento mínimo"* (RN-09).
6. **Luis** puja **130000** → **Ana** recibe al instante el aviso *"Tu oferta fue superada"* y la campana marca **1** (RF-14).
7. **Luis** intenta pujar otra vez → el botón dice *"Eres el mejor postor"* (RN-10).

> 💬 "Ningún navegador recargó la página. El servidor publica un evento de dominio, y el gateway de WebSockets lo reparte a los que están mirando esa subasta."

### Paso 5 — Cierre y adjudicación (1 min)

En la terminal 3, adelanta el reloj del negocio 3 horas:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/dev/clock/advance -ContentType 'application/json' -Body '{"minutes":180}'
```

En pocos segundos, sin recargar:

- Ambos navegadores muestran **ADJUDICADA** (RF-15, RN-13).
- **Luis** ve *"¡Ganaste esta subasta con $130.000!"* y *"Pendiente de pago · plazo hasta…"* (RN-15, 48 horas).

> 💬 "El dominio recibe la hora por un puerto `Clock`. Para la demo solo cambiamos el adaptador; las reglas no saben que adelantamos el reloj."

### Paso 6 — Pago por webhook (2 min)

1. **Luis** → menú → **Mi cuenta** → en *Tus compras* aparece la orden y abajo su identificador. Cópialo.
2. En la terminal 3, simula la pasarela **con firma falsa**:

   ```powershell
   npx tsx scripts/simulate-payment.ts --order <ID_DE_LA_ORDEN> --amount 130000 --bad-signature
   ```

   → `HTTP 401` y nada cambia (RN-18).

3. Ahora la notificación **legítima, enviada 3 veces**:

   ```powershell
   npx tsx scripts/simulate-payment.ts --order <ID_DE_LA_ORDEN> --amount 130000 --repeat 3
   ```

   → los tres envíos responden `200`, pero solo el primero dice `replayed=false`; los otros dos `replayed=true` (RN-19).

4. En el navegador de Luis la subasta pasa a **PAGADA** y llega la notificación *"Pago confirmado"* (RN-17).

### Paso 7 — Documentación de la API (1 min)

Abre `http://localhost:3000/docs`: Swagger con todos los endpoints, los códigos de error de cada regla y el protocolo WebSocket.

---

## B. Demostración solo con terminal (alternativa)

Útil si algo falla con el navegador o para mostrar los mensajes crudos.

### B.1 Usuarios, subasta y token

Usa la colección [`docs/api.http`](api.http) con la extensión **REST Client** de VS Code: tiene todas las peticiones en orden (registro, login, publicar, pujas válidas e inválidas, cierre). Ejecuta cada una con **Send Request**.

O con PowerShell:

```powershell
$api = "http://localhost:3000/api"
function Post($path, $body, $token) {
  $h = @{}; if ($token) { $h.Authorization = "Bearer $token" }
  # Se envía como bytes UTF-8 para que las tildes lleguen bien también en PowerShell 5
  $json = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json))
  Invoke-RestMethod -Method Post -Uri "$api$path" -Headers $h -ContentType 'application/json; charset=utf-8' -Body $json
}

Post "/auth/register" @{ name="Vendedor"; email="vendedor@demo.com"; password="secreta123" }
Post "/auth/register" @{ name="Ana";      email="ana@demo.com";      password="secreta123" }
Post "/auth/register" @{ name="Luis";     email="luis@demo.com";     password="secreta123" }

$tv = (Post "/auth/login" @{ email="vendedor@demo.com"; password="secreta123" }).token
$ta = (Post "/auth/login" @{ email="ana@demo.com";      password="secreta123" }).token
$tl = (Post "/auth/login" @{ email="luis@demo.com";     password="secreta123" }).token

$cat = (Invoke-RestMethod "$api/categories")[0].id
$cierre = (Get-Date).ToUniversalTime().AddHours(2).ToString("o")
$sub = Post "/auctions" @{ title="Cámara Canon AE-1"; description="Cámara de rollo con lente 50mm"; condition="USED"; categoryId=$cat; basePrice=100000; minIncrement=10000; closesAt=$cierre } $tv
$sub.id
```

### B.2 Dos clientes WebSocket

Abre **dos terminales más** y deja escuchando a Ana y a Luis:

```powershell
npx tsx scripts/ws-client.ts --email ana@demo.com  --password secreta123 --auction <ID_SUBASTA>
npx tsx scripts/ws-client.ts --email luis@demo.com --password secreta123 --auction <ID_SUBASTA>
```

### B.3 Pujas

```powershell
Post "/auctions/$($sub.id)/bids" @{ amount=100000 } $ta   # aceptada → bid.placed en ambas terminales
Post "/auctions/$($sub.id)/bids" @{ amount=130000 } $tl   # aceptada → Ana recibe bid.outbid
Post "/auctions/$($sub.id)/bids" @{ amount=120000 } $tv   # 403 SELLER_CANNOT_BID (RN-07)
```

Para ver el cuerpo del error en PowerShell 7: `Invoke-RestMethod ... -SkipHttpErrorCheck`. En PowerShell 5 el error aparece en rojo con el mensaje del servidor.

### B.4 Cierre y pago

Igual que los pasos 5 y 6 de la parte A. El identificador de la orden se obtiene con:

```powershell
Invoke-RestMethod -Uri "$api/payment-orders" -Headers @{ Authorization = "Bearer $tl" }
```

---

## Problemas frecuentes en Windows

| Síntoma | Causa | Solución |
|---|---|---|
| `Configuración inválida… JWT_SECRET` al arrancar | No existe `.env` o le faltan las claves | Revisa el paso 0.1; el archivo debe llamarse exactamente `.env` |
| `No hay conexión con el servidor` en la web | El backend no está corriendo | Arranca `npm run dev` en la raíz del proyecto (terminal 1) |
| `EADDRINUSE :3000` | Ya hay otro servidor en el puerto | Cierra la otra terminal o cambia `PORT` en `.env` (y `VITE_API_URL`/`VITE_WS_URL` en `frontend/.env`) |
| `npm run gateway:simulate -- --order …` no recibe los argumentos | PowerShell se come el `--` | Usa `npx tsx scripts/simulate-payment.ts --order …` |
| `node:sqlite` no existe | Node.js menor a 22.13 | Instala Node 22 LTS o 24 LTS (`node -v`) |
| El webhook siempre responde 401 | El simulador y el servidor usan secretos distintos | Ambos leen `PAYMENT_WEBHOOK_SECRET` del mismo `.env`; reinicia el servidor tras editarlo |
| Ambos navegadores son el mismo usuario | Comparten `localStorage` | Usa uno en ventana de incógnito o dos navegadores distintos |
| No aparecen las imágenes | Sin internet (se cargan desde Unsplash) | Son ilustrativas; la demo funciona igual |
| La subasta no cierra al adelantar el reloj | `DEV_CLOCK_ENABLED` no está en `true` | Cámbialo en `.env` y reinicia el backend |

---

## Checklist rápido

- [ ] `.env` con las dos claves y `DEV_CLOCK_ENABLED=true`
- [ ] Carpeta `data/` borrada (demo limpia)
- [ ] Terminal 1: backend corriendo · Terminal 2: frontend corriendo
- [ ] Dos navegadores con sesiones distintas
- [ ] `npm test` en verde
- [ ] `http://localhost:3000/docs` abre Swagger
