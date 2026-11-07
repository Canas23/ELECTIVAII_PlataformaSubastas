import { DomainError } from '../shared/DomainError';

export interface CategorySnapshot {
  id: string;
  name: string;
  slug: string;
}

export class Category {
  private constructor(
    readonly id: string,
    readonly name: string,
    readonly slug: string,
  ) {}

  static create(props: { id: string; name: string }): Category {
    const name = props.name.trim();
    if (name.length < 2 || name.length > 60) {
      throw new DomainError('INVALID_CATEGORY', 'El nombre de la categoría debe tener entre 2 y 60 caracteres.');
    }
    return new Category(props.id, name, Category.slugify(name));
  }

  static restore(snapshot: CategorySnapshot): Category {
    return new Category(snapshot.id, snapshot.name, snapshot.slug);
  }

  private static slugify(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  toSnapshot(): CategorySnapshot {
    return { id: this.id, name: this.name, slug: this.slug };
  }
}
