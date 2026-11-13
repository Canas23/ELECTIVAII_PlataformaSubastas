import 'dotenv/config';
import { z } from 'zod';

/** Lee y valida las variables de entorno una sola vez al arrancar. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PERSISTENCE: z.enum(['sqlite', 'memory']).default('sqlite'),
  SQLITE_PATH: z.string().default('./data/subastas.sqlite'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres (revisa tu archivo .env)'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16, 'PAYMENT_WEBHOOK_SECRET debe tener al menos 16 caracteres (revisa tu archivo .env)'),
  PAYMENT_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  DEV_CLOCK_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
  CORS_ORIGIN: z.string().default('*'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`✗ Configuración inválida. Crea el archivo .env a partir de .env.example:\n${problems}`);
    process.exit(1);
  }
  return parsed.data;
}
