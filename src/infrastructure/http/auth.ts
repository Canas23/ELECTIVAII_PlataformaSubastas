import { RequestHandler } from 'express';
import { TokenService, AuthTokenPayload } from '../../application/ports/services';
import { ApplicationError } from '../../application/errors/ApplicationError';

/** Extrae el usuario del token Bearer o responde 401. */
export function requireAuth(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = tokens.verify(token);
    if (!user) {
      next(new ApplicationError('UNAUTHORIZED', 'UNAUTHENTICATED', 'Debes iniciar sesión (token Bearer ausente o inválido).'));
      return;
    }
    res.locals.user = user;
    next();
  };
}

export function currentUser(res: { locals: Record<string, unknown> }): AuthTokenPayload {
  return res.locals.user as AuthTokenPayload;
}

