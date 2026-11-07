import { CategoryRepository } from '../../application/ports/repositories';
import { Category } from '../../domain/category/Category';
import { IdGenerator } from '../../domain/shared/IdGenerator';

const DEFAULT_CATEGORIES = ['Arte y antigüedades', 'Coleccionables', 'Electrónica', 'Hogar', 'Moda', 'Vehículos', 'Otros'];

/** Carga las categorías iniciales si la base está vacía. */
export async function seedCategories(categories: CategoryRepository, ids: IdGenerator): Promise<void> {
  const existing = await categories.findAll();
  if (existing.length > 0) return;
  for (const name of DEFAULT_CATEGORIES) {
    await categories.save(Category.create({ id: ids.next(), name }));
  }
}
