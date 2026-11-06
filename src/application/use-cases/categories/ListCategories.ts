import { CategoryView, toCategoryView } from '../../dto/views';
import { CategoryRepository } from '../../ports/repositories';

export class ListCategories {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(): Promise<CategoryView[]> {
    const all = await this.categories.findAll();
    return all.map(toCategoryView);
  }
}
