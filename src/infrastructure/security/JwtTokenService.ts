import jwt, { SignOptions } from 'jsonwebtoken';
import { AuthTokenPayload, TokenService } from '../../application/ports/services';

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  issue(payload: AuthTokenPayload): { token: string; expiresIn: string } {
    const token = jwt.sign(
      { name: payload.name, email: payload.email },
      this.secret,
      { subject: payload.userId, expiresIn: this.expiresIn as SignOptions['expiresIn'] },
    );
    return { token, expiresIn: this.expiresIn };
  }

  verify(token: string): AuthTokenPayload | null {
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, this.secret);
      if (typeof decoded === 'string' || !decoded.sub) return null;
      return { userId: decoded.sub, name: String(decoded.name ?? ''), email: String(decoded.email ?? '') };
    } catch {
      return null;
    }
  }
}
