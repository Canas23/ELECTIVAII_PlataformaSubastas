import { AuctionEvent } from '../../domain/auction/AuctionEvents';

/* Puertos de salida hacia servicios técnicos. Ninguno nombra una librería. */

export interface Clock {
  now(): Date;
}

export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(plainPassword: string, hash: string): Promise<boolean>;
}

export interface AuthTokenPayload {
  userId: string;
  name: string;
  email: string;
}

export interface TokenService {
  issue(payload: AuthTokenPayload): { token: string; expiresIn: string };
  verify(token: string): AuthTokenPayload | null;
}

/**
 * RNF-05: por aquí los casos de uso anuncian que ocurrió un hecho del negocio.
 * No saben si al otro lado hay WebSockets, una consola o un correo.
 */
export interface EventPublisher {
  publish(events: AuctionEvent[]): Promise<void>;
}

/** Un interesado en los hechos del negocio (lo usa el bus de eventos). */
export interface DomainEventSubscriber {
  readonly name: string;
  handle(event: AuctionEvent): Promise<void>;
}

/** Entrega en vivo de avisos personales a un usuario conectado. */
export interface RealtimeUserNotifier {
  notifyUser(userId: string, payload: { type: string; data: unknown }): void;
}

export interface WebhookSignatureVerifier {
  /** RN-18: true solo si la notificación proviene de la pasarela. */
  verify(rawBody: string, signatureHeader: string | undefined): boolean;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
