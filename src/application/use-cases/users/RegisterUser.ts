import { IdGenerator } from '../../../domain/shared/IdGenerator';
import { Email } from '../../../domain/user/Email';
import { User } from '../../../domain/user/User';
import { ApplicationError } from '../../errors/ApplicationError';
import { toUserView, UserView } from '../../dto/views';
import { UserRepository } from '../../ports/repositories';
import { Clock, Logger, PasswordHasher } from '../../ports/services';
import { KeyedMutex } from '../../shared/KeyedMutex';

export interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

/** RF-01: registro de usuario. */
export class RegisterUser {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: RegisterUserInput): Promise<UserView> {
    const email = Email.of(input.email);
    return this.mutex.run(`email:${email.address}`, async () => {
      if (await this.users.findByEmail(email)) {
        throw new ApplicationError('CONFLICT', 'EMAIL_ALREADY_REGISTERED', 'Ya existe un usuario con ese correo electrónico.');
      }
      const passwordHash = await this.hasher.hash(input.password);
      const user = User.register({
        id: this.ids.next(),
        name: input.name,
        email,
        passwordHash,
        now: this.clock.now(),
      });
      await this.users.save(user);
      this.logger.info('Usuario registrado', { userId: user.id });
      return toUserView(user);
    });
  }
}
