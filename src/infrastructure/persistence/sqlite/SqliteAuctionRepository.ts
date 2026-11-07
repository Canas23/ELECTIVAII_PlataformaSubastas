import { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { AuctionListFilter, AuctionRepository, Page } from '../../../application/ports/repositories';
import { Auction, AuctionSnapshot } from '../../../domain/auction/Auction';
import { dateFrom, dateOrNull, inTransaction, num, ms, Row, text, textOrNull } from './SqliteDatabase';

/**
 * Adaptador SQLite del agregado Subasta. Guarda el agregado completo en una
 * transacción. Solo actualiza las columnas que el dominio puede cambiar
 * (estado, cierre, ganador): artículo y condiciones se escriben una vez (RN-05)
 * y las pujas se insertan pero jamás se modifican ni se borran (RN-11).
 */
export class SqliteAuctionRepository implements AuctionRepository {
  constructor(private readonly db: DatabaseSync) {}

  async save(auction: Auction): Promise<void> {
    const s = auction.toSnapshot();
    inTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO auctions (id, seller_id, item_id, item_title, item_description, item_condition, category_id,
             base_price, min_increment, closes_at, published_at, status, closed_at, cancelled_at, winner_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             closed_at = excluded.closed_at,
             cancelled_at = excluded.cancelled_at,
             winner_id = excluded.winner_id`,
        )
        .run(
          s.id,
          s.sellerId,
          s.item.id,
          s.item.title,
          s.item.description,
          s.item.condition,
          s.item.categoryId,
          s.basePrice,
          s.minIncrement,
          s.closesAt.getTime(),
          s.publishedAt.getTime(),
          s.status,
          ms(s.closedAt),
          ms(s.cancelledAt),
          s.winnerId,
        );

      const insertBid = this.db.prepare(
        `INSERT OR IGNORE INTO bids (id, auction_id, seq, bidder_id, amount, placed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      s.bids.forEach((b, seq) => insertBid.run(b.id, s.id, seq, b.bidderId, b.amount, b.placedAt.getTime()));

      const insertAttempt = this.db.prepare(
        `INSERT OR IGNORE INTO rejected_bid_attempts
           (id, auction_id, seq, bidder_id, amount, reason_code, reason_message, attempted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      s.rejectedAttempts.forEach((a, seq) =>
        insertAttempt.run(a.id, s.id, seq, a.bidderId, a.amount, a.reasonCode, a.reasonMessage, a.attemptedAt.getTime()),
      );

      const o = s.paymentOrder;
      if (o) {
        this.db
          .prepare(
            `INSERT INTO payment_orders (id, auction_id, winner_id, amount, issued_at, due_at, status, paid_at, expired_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               status = excluded.status, paid_at = excluded.paid_at, expired_at = excluded.expired_at`,
          )
          .run(o.id, s.id, o.winnerId, o.amount, o.issuedAt.getTime(), o.dueAt.getTime(), o.status, ms(o.paidAt), ms(o.expiredAt));
      }
    });
  }

  async findById(id: string): Promise<Auction | null> {
    const row = this.db.prepare('SELECT * FROM auctions WHERE id = ?').get(id);
    return row ? this.hydrate(row) : null;
  }

  async findByPaymentOrderId(paymentOrderId: string): Promise<Auction | null> {
    const row = this.db
      .prepare('SELECT a.* FROM auctions a JOIN payment_orders p ON p.auction_id = a.id WHERE p.id = ?')
      .get(paymentOrderId);
    return row ? this.hydrate(row) : null;
  }

  async list(filter: AuctionListFilter): Promise<Page<Auction>> {
    const conditions: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.categoryId) {
      conditions.push('category_id = ?');
      params.push(filter.categoryId);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = this.db.prepare(`SELECT COUNT(*) AS total FROM auctions ${where}`).get(...params);
    const rows = this.db
      .prepare(`SELECT * FROM auctions ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`)
      .all(...params, filter.pageSize, (filter.page - 1) * filter.pageSize);
    return {
      items: rows.map((r) => this.hydrate(r)),
      total: totalRow ? num(totalRow, 'total') : 0,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async findBySeller(sellerId: string): Promise<Auction[]> {
    return this.query('SELECT * FROM auctions WHERE seller_id = ? ORDER BY published_at DESC', sellerId);
  }

  async findByBidder(bidderId: string): Promise<Auction[]> {
    return this.query(
      `SELECT * FROM auctions WHERE id IN (SELECT DISTINCT auction_id FROM bids WHERE bidder_id = ?)
       ORDER BY published_at DESC`,
      bidderId,
    );
  }

  async findByWinner(winnerId: string): Promise<Auction[]> {
    return this.query('SELECT * FROM auctions WHERE winner_id = ? ORDER BY published_at DESC', winnerId);
  }

  async findIdsPendingSettlement(now: Date): Promise<string[]> {
    const t = now.getTime();
    const rows = this.db
      .prepare(
        `SELECT id FROM auctions WHERE status = 'OPEN' AND closes_at <= ?
         UNION
         SELECT auction_id AS id FROM payment_orders p
           JOIN auctions a ON a.id = p.auction_id
          WHERE a.status = 'ADJUDICATED' AND p.status = 'PENDING' AND p.due_at <= ?`,
      )
      .all(t, t);
    return rows.map((r) => text(r, 'id'));
  }

  private query(sql: string, ...params: SQLInputValue[]): Auction[] {
    return this.db
      .prepare(sql)
      .all(...params)
      .map((r) => this.hydrate(r));
  }

  private hydrate(row: Row): Auction {
    const id = text(row, 'id');
    const bids = this.db.prepare('SELECT * FROM bids WHERE auction_id = ? ORDER BY seq').all(id);
    const attempts = this.db.prepare('SELECT * FROM rejected_bid_attempts WHERE auction_id = ? ORDER BY seq').all(id);
    const order = this.db.prepare('SELECT * FROM payment_orders WHERE auction_id = ?').get(id);

    const snapshot: AuctionSnapshot = {
      id,
      sellerId: text(row, 'seller_id'),
      item: {
        id: text(row, 'item_id'),
        title: text(row, 'item_title'),
        description: text(row, 'item_description'),
        condition: text(row, 'item_condition'),
        categoryId: text(row, 'category_id'),
      },
      basePrice: num(row, 'base_price'),
      minIncrement: num(row, 'min_increment'),
      closesAt: dateFrom(row, 'closes_at'),
      publishedAt: dateFrom(row, 'published_at'),
      status: text(row, 'status'),
      closedAt: dateOrNull(row, 'closed_at'),
      cancelledAt: dateOrNull(row, 'cancelled_at'),
      winnerId: textOrNull(row, 'winner_id'),
      bids: bids.map((b) => ({
        id: text(b, 'id'),
        auctionId: id,
        bidderId: text(b, 'bidder_id'),
        amount: num(b, 'amount'),
        placedAt: dateFrom(b, 'placed_at'),
      })),
      rejectedAttempts: attempts.map((a) => ({
        id: text(a, 'id'),
        auctionId: id,
        bidderId: text(a, 'bidder_id'),
        amount: num(a, 'amount'),
        reasonCode: text(a, 'reason_code'),
        reasonMessage: text(a, 'reason_message'),
        attemptedAt: dateFrom(a, 'attempted_at'),
      })),
      paymentOrder: order
        ? {
            id: text(order, 'id'),
            auctionId: id,
            winnerId: text(order, 'winner_id'),
            amount: num(order, 'amount'),
            issuedAt: dateFrom(order, 'issued_at'),
            dueAt: dateFrom(order, 'due_at'),
            status: text(order, 'status'),
            paidAt: dateOrNull(order, 'paid_at'),
            expiredAt: dateOrNull(order, 'expired_at'),
          }
        : null,
    };
    return Auction.restore(snapshot);
  }
}
