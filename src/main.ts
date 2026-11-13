/*
 * Punto de entrada del servidor: lee la configuración, arma la aplicación
 * (ver bootstrap.ts, la raíz de composición) y la pone a escuchar.
 */
import { loadEnv } from './infrastructure/config/env';
import { bootstrap } from './bootstrap';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await bootstrap(env);
  const { logger } = app;

  app.server.listen(env.PORT, () => {
    logger.info(`API escuchando en http://localhost:${env.PORT}/api`);
    logger.info(`Documentación: http://localhost:${env.PORT}/docs`);
    logger.info(`WebSocket:     ws://localhost:${env.PORT}/ws?token=<JWT>`);
    logger.info(`Persistencia:  ${env.PERSISTENCE}${env.PERSISTENCE === 'sqlite' ? ` (${env.SQLITE_PATH})` : ''}`);
    if (env.DEV_CLOCK_ENABLED) logger.warn('Reloj de demostración HABILITADO (/api/dev/clock). No usar en producción.');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Recibido ${signal}, cerrando...`);
    await app.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('✗ No fue posible arrancar el servidor:', err);
  process.exit(1);
});
