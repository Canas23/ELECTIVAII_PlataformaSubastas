/**
 * Errores propios de la orquestación (recurso inexistente, credenciales,
 * permisos, rechazo de puja). La capa HTTP traduce `kind` a un código de estado.
 */
export type ApplicationErrorKind =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE';

export class ApplicationError extends Error {
  constructor(
    public readonly kind: ApplicationErrorKind,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }

  static notFound(code: string, message: string): ApplicationError {
    return new ApplicationError('NOT_FOUND', code, message);
  }

  static forbidden(code: string, message: string): ApplicationError {
    return new ApplicationError('FORBIDDEN', code, message);
  }
}
