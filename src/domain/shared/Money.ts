import { DomainError } from './DomainError';

/**
 * Objeto de valor monetario.
 * RN-21: pesos colombianos, sin decimales y nunca negativos.
 */
export class Money {
  private constructor(private readonly value: number) {
    Object.freeze(this);
  }

  static of(amount: number): Money {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new DomainError('INVALID_MONEY', 'El valor monetario debe ser un número.');
    }
    if (!Number.isInteger(amount)) {
      throw new DomainError('INVALID_MONEY', 'Los valores se expresan en pesos colombianos, sin decimales.');
    }
    if (amount < 0) {
      throw new DomainError('INVALID_MONEY', 'Un valor monetario no puede ser negativo.');
    }
    if (!Number.isSafeInteger(amount)) {
      throw new DomainError('INVALID_MONEY', 'El valor monetario excede el máximo permitido.');
    }
    return new Money(amount);
  }

  get amount(): number {
    return this.value;
  }

  isPositive(): boolean {
    return this.value > 0;
  }

  plus(other: Money): Money {
    return Money.of(this.value + other.value);
  }

  isLessThan(other: Money): boolean {
    return this.value < other.value;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    return this.value >= other.value;
  }

  equals(other: Money): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return `$${this.value.toLocaleString('es-CO')} COP`;
  }

  toJSON(): number {
    return this.value;
  }
}
