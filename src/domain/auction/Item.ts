import { DomainError } from '../shared/DomainError';
import { ItemCondition } from './ItemCondition';

export interface ItemSnapshot {
  id: string;
  title: string;
  description: string;
  condition: string;
  categoryId: string;
}

export class Item {
  private constructor(
    readonly id: string,
    readonly title: string,
    readonly description: string,
    readonly condition: ItemCondition,
    readonly categoryId: string,
  ) {
    Object.freeze(this);
  }

  static create(props: { id: string; title: string; description: string; condition: string; categoryId: string }): Item {
    const title = props.title.trim();
    const description = props.description.trim();
    if (title.length < 3 || title.length > 120) {
      throw new DomainError('INVALID_ITEM', 'La denominación del artículo debe tener entre 3 y 120 caracteres.');
    }
    if (description.length < 10 || description.length > 2000) {
      throw new DomainError('INVALID_ITEM', 'La descripción del artículo debe tener entre 10 y 2000 caracteres.');
    }
    if (props.categoryId.trim().length === 0) {
      throw new DomainError('INVALID_ITEM', 'El artículo debe pertenecer a una categoría.');
    }
    return new Item(props.id, title, description, ItemCondition.from(props.condition), props.categoryId);
  }

  static restore(snapshot: ItemSnapshot): Item {
    return new Item(
      snapshot.id,
      snapshot.title,
      snapshot.description,
      ItemCondition.from(snapshot.condition),
      snapshot.categoryId,
    );
  }

  toSnapshot(): ItemSnapshot {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      condition: this.condition.value,
      categoryId: this.categoryId,
    };
  }
}
