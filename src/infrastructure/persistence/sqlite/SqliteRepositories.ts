import { DatabaseSync } from 'node:sqlite';
import {
  CategoryRepository,
  NotificationRepository,
  PaymentEventRepository,
  UserRepository,
} from '../../../application/ports/repositories';
import { Category } from '../../../domain/category/Category';
import { Notification } from '../../../domain/notification/Notification';
import { PaymentEvent } from '../../../domain/payment/PaymentEvent';
import { Email } from '../../../domain/user/Email';
import { User } from '../../../domain/user/User';
import { dateFrom, dateOrNull, num, ms, Row, text, textOrNull } from './SqliteDatabase';

export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  async save(user: User): Promise<void> {
    const s = user.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, registered_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash`,
      )
      .run(s.id, s.name, s.email, s.passwordHash, s.registeredAt.getTime());
  }

  async findById(id: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.hydrate(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.address);
    return row ? this.hydrate(row) : null;
  }

  async findManyByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    return this.db
      .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
      .all(...ids)
      .map((r) => this.hydrate(r));
  }

  private hydrate(row: Row): User {
    return User.restore({
      id: text(row, 'id'),
      name: text(row, 'name'),
      email: text(row, 'email'),
      passwordHash: text(row, 'password_hash'),
      registeredAt: dateFrom(row, 'registered_at'),
    });
  }
}

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(private readonly db: DatabaseSync) {}

  async save(category: Category): Promise<void> {
    const s = category.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug`,
      )
      .run(s.id, s.name, s.slug);
  }

  async findById(id: string): Promise<Category | null> {
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    return row ? this.hydrate(row) : null;
  }

  async findAll(): Promise<Category[]> {
    return this.db
      .prepare('SELECT * FROM categories ORDER BY name')
      .all()
      .map((r) => this.hydrate(r));
  }

  private hydrate(row: Row): Category {
    return Category.restore({ id: text(row, 'id'), name: text(row, 'name'), slug: text(row, 'slug') });
  }
}

export class SqlitePaymentEventRepository implements PaymentEventRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findByEventId(eventId: string): Promise<PaymentEvent | null> {
    const row = this.db.prepare('SELECT * FROM payment_events WHERE event_id = ?').get(eventId);
    if (!row) return null;
    return PaymentEvent.restore({
      eventId: text(row, 'event_id'),
      paymentOrderId: text(row, 'payment_order_id'),
      type: text(row, 'type'),
      amount: num(row, 'amount'),
      occurredAt: dateFrom(row, 'occurred_at'),
      receivedAt: dateFrom(row, 'received_at'),
      outcome: text(row, 'outcome'),
    });
  }

  async save(event: PaymentEvent): Promise<void> {
    const s = event.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO payment_events (event_id, payment_order_id, type, amount, occurred_at, received_at, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(s.eventId, s.paymentOrderId, s.type, s.amount, s.occurredAt.getTime(), s.receivedAt.getTime(), s.outcome);
  }
}

export class SqliteNotificationRepository implements NotificationRepository {
  constructor(private readonly db: DatabaseSync) {}

  async save(notification: Notification): Promise<void> {
    const s = notification.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO notifications (id, recipient_id, type, message, auction_id, created_at, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET read_at = excluded.read_at`,
      )
      .run(s.id, s.recipientId, s.type, s.message, s.auctionId, s.createdAt.getTime(), ms(s.readAt));
  }

  async findById(id: string): Promise<Notification | null> {
    const row = this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    return row ? this.hydrate(row) : null;
  }

  async findByRecipient(recipientId: string, options: { unreadOnly: boolean; limit: number }): Promise<Notification[]> {
    const unread = options.unreadOnly ? 'AND read_at IS NULL' : '';
    return this.db
      .prepare(`SELECT * FROM notifications WHERE recipient_id = ? ${unread} ORDER BY created_at DESC LIMIT ?`)
      .all(recipientId, options.limit)
      .map((r) => this.hydrate(r));
  }

  private hydrate(row: Row): Notification {
    return Notification.restore({
      id: text(row, 'id'),
      recipientId: text(row, 'recipient_id'),
      type: text(row, 'type'),
      message: text(row, 'message'),
      auctionId: textOrNull(row, 'auction_id'),
      createdAt: dateFrom(row, 'created_at'),
      readAt: dateOrNull(row, 'read_at'),
    });
  }
}
