import {
  AuctionListFilter,
  AuctionRepository,
  CategoryRepository,
  NotificationRepository,
  Page,
  PaymentEventRepository,
  UserRepository,
} from '../../../application/ports/repositories';
import { Auction, AuctionSnapshot } from '../../../domain/auction/Auction';
import { Category, CategorySnapshot } from '../../../domain/category/Category';
import { Notification, NotificationSnapshot } from '../../../domain/notification/Notification';
import { PaymentEvent, PaymentEventSnapshot } from '../../../domain/payment/PaymentEvent';
import { Email } from '../../../domain/user/Email';
import { User, UserSnapshot } from '../../../domain/user/User';

/*
 * Adaptadores de persistencia en memoria (Entrega 1 y pruebas).
 * Guardan copias de las instantáneas, nunca las instancias vivas: así se
 * comportan como una base de datos real y un objeto modificado sin llamar a
 * save() no altera lo almacenado.
 */

export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, UserSnapshot>();

  async save(user: User): Promise<void> {
    this.rows.set(user.id, structuredClone(user.toSnapshot()));
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? User.restore(structuredClone(row)) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const row of this.rows.values()) {
      if (row.email === email.address) return User.restore(structuredClone(row));
    }
    return null;
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    return ids.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [User.restore(structuredClone(row))] : [];
    });
  }
}

export class InMemoryCategoryRepository implements CategoryRepository {
  private readonly rows = new Map<string, CategorySnapshot>();

  async save(category: Category): Promise<void> {
    this.rows.set(category.id, structuredClone(category.toSnapshot()));
  }

  async findById(id: string): Promise<Category | null> {
    const row = this.rows.get(id);
    return row ? Category.restore(structuredClone(row)) : null;
  }

  async findAll(): Promise<Category[]> {
    return [...this.rows.values()]
      .map((row) => Category.restore(structuredClone(row)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
}

export class InMemoryAuctionRepository implements AuctionRepository {
  private readonly rows = new Map<string, AuctionSnapshot>();

  async save(auction: Auction): Promise<void> {
    this.rows.set(auction.id, structuredClone(auction.toSnapshot()));
  }

  async findById(id: string): Promise<Auction | null> {
    const row = this.rows.get(id);
    return row ? this.restore(row) : null;
  }

  async findByPaymentOrderId(paymentOrderId: string): Promise<Auction | null> {
    const row = this.all().find((r) => r.paymentOrder?.id === paymentOrderId);
    return row ? this.restore(row) : null;
  }

  async list(filter: AuctionListFilter): Promise<Page<Auction>> {
    const matching = this.all()
      .filter((r) => !filter.categoryId || r.item.categoryId === filter.categoryId)
      .filter((r) => !filter.status || r.status === filter.status)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const start = (filter.page - 1) * filter.pageSize;
    return {
      items: matching.slice(start, start + filter.pageSize).map((r) => this.restore(r)),
      total: matching.length,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async findBySeller(sellerId: string): Promise<Auction[]> {
    return this.newestFirst(this.all().filter((r) => r.sellerId === sellerId));
  }

  async findByBidder(bidderId: string): Promise<Auction[]> {
    return this.newestFirst(this.all().filter((r) => r.bids.some((b) => b.bidderId === bidderId)));
  }

  async findByWinner(winnerId: string): Promise<Auction[]> {
    return this.newestFirst(this.all().filter((r) => r.winnerId === winnerId));
  }

  async findIdsPendingSettlement(now: Date): Promise<string[]> {
    const t = now.getTime();
    return this.all()
      .filter(
        (r) =>
          (r.status === 'OPEN' && r.closesAt.getTime() <= t) ||
          (r.status === 'ADJUDICATED' && r.paymentOrder?.status === 'PENDING' && r.paymentOrder.dueAt.getTime() <= t),
      )
      .map((r) => r.id);
  }

  private all(): AuctionSnapshot[] {
    return [...this.rows.values()];
  }

  private newestFirst(rows: AuctionSnapshot[]): Auction[] {
    return rows.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).map((r) => this.restore(r));
  }

  private restore(row: AuctionSnapshot): Auction {
    return Auction.restore(structuredClone(row));
  }
}

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly rows = new Map<string, PaymentEventSnapshot>();

  async findByEventId(eventId: string): Promise<PaymentEvent | null> {
    const row = this.rows.get(eventId);
    return row ? PaymentEvent.restore(structuredClone(row)) : null;
  }

  async save(event: PaymentEvent): Promise<void> {
    this.rows.set(event.eventId, structuredClone(event.toSnapshot()));
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly rows = new Map<string, NotificationSnapshot>();

  async save(notification: Notification): Promise<void> {
    this.rows.set(notification.id, structuredClone(notification.toSnapshot()));
  }

  async findById(id: string): Promise<Notification | null> {
    const row = this.rows.get(id);
    return row ? Notification.restore(structuredClone(row)) : null;
  }

  async findByRecipient(recipientId: string, options: { unreadOnly: boolean; limit: number }): Promise<Notification[]> {
    return [...this.rows.values()]
      .filter((r) => r.recipientId === recipientId && (!options.unreadOnly || r.readAt === null))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options.limit)
      .map((r) => Notification.restore(structuredClone(r)));
  }
}
