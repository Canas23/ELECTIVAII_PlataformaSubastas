import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApplicationError, ApplicationErrorKind } from '../../application/errors/ApplicationError';
import { DomainError, DomainErrorCode } from '../../domain/shared/DomainError';
import { Logger } from '../../application/ports/services';

const STATUS_BY_KIND: Record<ApplicationErrorKind, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
};

/** Los códigos del dominio no conocen HTTP: aquí se traducen. */
function statusForDomain(code: DomainErrorCode): number {
  switch (code) {
    case 'NOT_AUCTION_SELLER':
    case 'NOT_NOTIFICATION_OWNER':
      return 403;
    case 'PAYMENT_ORDER_NOT_FOUND':
      return 404;
    case 'AUCTION_HAS_BIDS':
    case 'AUCTION_NOT_OPEN':
    case 'PAYMENT_ORDER_NOT_PENDING':
    case 'PAYMENT_ORDER_EXPIRED':
      return 409;
    default:
      return 422;
  }
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Datos de entrada inválidos.', details: err.issues },
      });
      return;
    }
    if (err instanceof ApplicationError) {
      res.status(STATUS_BY_KIND[err.kind]).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    if (err instanceof DomainError) {
      res.status(statusForDomain(err.code)).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo no es un JSON válido.' } });
      return;
    }
    logger.error('Error no controlado', { path: req.path, error: err instanceof Error ? err.stack : String(err) });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } });
  };
}
