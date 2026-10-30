import { DomainError } from '../shared/DomainError';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Email {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static of(raw: string): Email {
    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (normalized.length === 0 || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
      throw new DomainError('INVALID_EMAIL', 'El correo electrónico no tiene un formato válido.');
    }
    return new Email(normalized);
  }

  get address(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
