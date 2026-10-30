import { DomainError } from '../shared/DomainError';

export const ITEM_CONDITION_VALUES = ['NEW', 'LIKE_NEW', 'USED', 'FOR_PARTS'] as const;
export type ItemConditionValue = (typeof ITEM_CONDITION_VALUES)[number];

/** Objeto de valor: estado de conservación del artículo. */
export class ItemCondition {
  private constructor(readonly value: ItemConditionValue) {
    Object.freeze(this);
  }

  static from(raw: string): ItemCondition {
    if (!(ITEM_CONDITION_VALUES as readonly string[]).includes(raw)) {
      throw new DomainError(
        'INVALID_ITEM',
        `Estado de conservación inválido. Valores permitidos: ${ITEM_CONDITION_VALUES.join(', ')}.`,
      );
    }
    return new ItemCondition(raw as ItemConditionValue);
  }

  equals(other: ItemCondition): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
