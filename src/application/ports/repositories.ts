import { Auction } from '../../domain/auction/Auction';
import { AuctionStatusValue } from '../../domain/auction/AuctionStatus';
import { Category } from '../../domain/category/Category';
import { Notification } from '../../domain/notification/Notification';
import { PaymentEvent } from '../../domain/payment/PaymentEvent';
import { Email } from '../../domain/user/Email';
import { User } from '../../domain/user/User';

/*
 * Puertos de salida de persistencia (RNF-04).
 * La aplicación solo conoce estas interfaces; las implementaciones en memoria
 * y SQLite viven en infraestructura y se pueden intercambiar (RNF-06).
 */

export interface UserRepository {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  findManyByIds(ids: string[]): Promise<User[]>;
}

export interface CategoryRepository {
  save(category: Category): Promise<void>;
  findById(id: string): Promise<Category | null>;
  findAll(): Promise<Category[]>;
}

export interface AuctionListFilter {
  categoryId?: string;
  status?: AuctionStatusValue;
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuctionRepository {
  save(auction: Auction): Promise<void>;
  findById(id: string): Promise<Auction | null>;
  findByPaymentOrderId(paymentOrderId: string): Promise<Auction | null>;
  list(filter: AuctionListFilter): Promise<Page<Auction>>;
  findBySeller(sellerId: string): Promise<Auction[]>;
  findByBidder(bidderId: string): Promise<Auction[]>;
  findByWinner(winnerId: string): Promise<Auction[]>;
  findIdsPendingSettlement(now: Date): Promise<string[]>;
}

export interface PaymentEventRepository {
  findByEventId(eventId: string): Promise<PaymentEvent | null>;
  save(event: PaymentEvent): Promise<void>;
}

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  findById(id: string): Promise<Notification | null>;
  findByRecipient(recipientId: string, options: { unreadOnly: boolean; limit: number }): Promise<Notification[]>;
}
