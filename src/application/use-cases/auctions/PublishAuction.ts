import { Auction } from '../../../domain/auction/Auction';
import { Item } from '../../../domain/auction/Item';
import { IdGenerator } from '../../../domain/shared/IdGenerator';
import { ApplicationError } from '../../errors/ApplicationError';
import { AuctionDetailView, toAuctionDetail } from '../../dto/views';
import { CategoryRepository, UserRepository } from '../../ports/repositories';
import { Clock } from '../../ports/services';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';
import { resolveUserNames } from '../../shared/userNames';

export interface PublishAuctionInput {
  sellerId: string;
  title: string;
  description: string;
  condition: string;
  categoryId: string;
  basePrice: number;
  minIncrement: number;
  closesAt: Date;
}

/**
 * RF-04: publicación de una subasta. El caso de uso verifica que existan el
 * vendedor y la categoría (datos de otros agregados) y delega en el dominio
 * las condiciones de publicación (RN-01, RN-02, RN-03).
 */
export class PublishAuction {
  constructor(
    private readonly users: UserRepository,
    private readonly categories: CategoryRepository,
    private readonly lifecycle: AuctionLifecycle,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: PublishAuctionInput): Promise<AuctionDetailView> {
    const seller = await this.users.findById(input.sellerId);
    if (!seller) throw ApplicationError.notFound('USER_NOT_FOUND', 'El vendedor no existe.');

    const category = await this.categories.findById(input.categoryId);
    if (!category) throw ApplicationError.notFound('CATEGORY_NOT_FOUND', 'La categoría indicada no existe.');

    const item = Item.create({
      id: this.ids.next(),
      title: input.title,
      description: input.description,
      condition: input.condition,
      categoryId: category.id,
    });

    const auction = Auction.publish({
      id: this.ids.next(),
      sellerId: seller.id,
      item,
      basePrice: input.basePrice,
      minIncrement: input.minIncrement,
      closesAt: input.closesAt,
      now: this.clock.now(),
    });

    await this.lifecycle.commitNew(auction);
    return toAuctionDetail(auction, await resolveUserNames(this.users, [seller.id]));
  }
}
