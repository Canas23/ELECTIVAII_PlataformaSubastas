import { DomainError } from '../shared/DomainError';
import { Email } from './Email';

export interface UserSnapshot {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  registeredAt: Date;
}

export class User {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly email: Email,
    readonly passwordHash: string,
    readonly registeredAt: Date,
  ) {}

  static register(props: { id: string; name: string; email: Email; passwordHash: string; now: Date }): User {
    const name = props.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new DomainError('INVALID_USER_NAME', 'El nombre debe tener entre 2 y 80 caracteres.');
    }
    return new User(props.id, name, props.email, props.passwordHash, new Date(props.now));
  }

  static restore(snapshot: UserSnapshot): User {
    return new User(
      snapshot.id,
      snapshot.name,
      Email.of(snapshot.email),
      snapshot.passwordHash,
      new Date(snapshot.registeredAt),
    );
  }

  toSnapshot(): UserSnapshot {
    return {
      id: this.id,
      name: this.name,
      email: this.email.address,
      passwordHash: this.passwordHash,
      registeredAt: new Date(this.registeredAt),
    };
  }
}
