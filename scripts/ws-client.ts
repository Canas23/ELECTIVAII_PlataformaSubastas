/**
 * Cliente WebSocket de consola para demostrar el tiempo real con varios
 * participantes (abre una terminal por usuario).
 */
import 'dotenv/config';
import { WebSocket } from 'ws';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg('email');
  const password = arg('password');
  const auctionId = arg('auction');
  if (!email || !password || !auctionId) {
    console.error('Uso: npm run ws:client -- --email <correo> --password <clave> --auction <auctionId>');
    process.exit(1);
  }
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    console.error(`No se pudo iniciar sesión (HTTP ${login.status}): ${await login.text()}`);
    process.exit(1);
  }
  const { token, user } = (await login.json()) as { token: string; user: { name: string } };

  const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
  socket.on('open', () => {
    console.log(`Conectado como ${user.name}. Escuchando la subasta ${auctionId}... (Ctrl+C para salir)\n`);
    socket.send(JSON.stringify({ type: 'subscribe', auctionId }));
  });
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as { type: string; data: unknown; sentAt: string };
    const time = new Date(message.sentAt).toLocaleTimeString('es-CO');
    console.log(`[${time}] ${message.type}`, JSON.stringify(message.data));
  });
  socket.on('close', (code, reason) => {
    console.log(`Conexión cerrada (${code}) ${reason.toString()}`);
    process.exit(0);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
