import { DomainError } from '../../../domain/shared/DomainError';
import { Email } from '../../../domain/user/Email';
import { ApplicationError } from '../../errors/ApplicationError';
import { toUserView, UserView } from '../../dto/views';
import { UserRepository } from '../../ports/repositories';
import { PasswordHasher, TokenService } from '../../ports/services';

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: UserView;
}

/** RF-02: inicio de sesión con entrega de token. */
export class LoginUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: { email: string; password: string }): Promise<LoginResult> {
    const invalid = new ApplicationError('UNAUTHORIZED', 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    let email: Email;
    try {
      email = Email.of(input.email);
    } catch (error) {
      if (error instanceof DomainError) throw invalid;
      throw error;
    }
    const user = await this.users.findByEmail(email);
    // Mismo mensaje si el usuario no existe o la contraseña falla: no se revela qué correos están registrados
    if (!user || !(await this.hasher.verify(input.password, user.passwordHash))) {
      throw invalid;
    }
    const { token, expiresIn } = this.tokens.issue({ userId: user.id, name: user.name, email: user.email.address });
    return { token, tokenType: 'Bearer', expiresIn, user: toUserView(user) };
  }
}
