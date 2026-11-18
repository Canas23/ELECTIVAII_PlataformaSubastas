import { describe, expect, it } from 'vitest';
import { AuctionStatus } from '../../src/domain/auction/AuctionStatus';
import { DomainError } from '../../src/domain/shared/DomainError';
import { Money } from '../../src/domain/shared/Money';
import { Email } from '../../src/domain/user/Email';

describe('Money (RN-21)', () => {
  it('acepta enteros no negativos en COP', () => {
    expect(Money.of(150_000).amount).toBe(150_000);
    expect(Money.of(0).amount).toBe(0);
  });

  it.each([
    ['decimales', 1500.5],
    ['negativos', -1],
    ['NaN', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
  ])('rechaza valores con %s', (_label, value) => {
    expect(() => Money.of(value)).toThrowError(DomainError);
  });

  it('es inmutable: sumar devuelve un objeto nuevo', () => {
    const a = Money.of(100);
    const b = a.plus(Money.of(50));
    expect(a.amount).toBe(100);
    expect(b.amount).toBe(150);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('se compara por valor', () => {
    expect(Money.of(10).equals(Money.of(10))).toBe(true);
  });
});

describe('Email (RN-22)', () => {
  it('normaliza mayúsculas y espacios para que la unicidad no dependa del formato', () => {
    expect(Email.of('  Ana@Correo.COM ').equals(Email.of('ana@correo.com'))).toBe(true);
  });

  it.each(['sin-arroba', 'a@b', '@correo.com', ''])('rechaza "%s"', (raw) => {
    expect(() => Email.of(raw)).toThrowError(DomainError);
  });
});

describe('AuctionStatus', () => {
  it('rechaza estados desconocidos', () => {
    expect(() => AuctionStatus.from('PAUSED')).toThrowError(DomainError);
  });

  it('solo OPEN admite pujas', () => {
    expect(AuctionStatus.OPEN.acceptsBids()).toBe(true);
    for (const s of [AuctionStatus.CANCELLED, AuctionStatus.DESERTED, AuctionStatus.ADJUDICATED, AuctionStatus.PAID]) {
      expect(s.acceptsBids()).toBe(false);
    }
  });
});
