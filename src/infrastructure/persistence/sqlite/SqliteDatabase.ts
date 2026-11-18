import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, SQLOutputValue } from 'node:sqlite';

/**
 * Conexión SQLite (módulo nativo node:sqlite, sin dependencias compiladas) y
 * esquema. Las restricciones de la base son una segunda red de seguridad; la
 * fuente de verdad de las reglas sigue siendo el dominio.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,          -- RN-22 (respaldo)
  password_hash  TEXT NOT NULL,                 -- RNF-16: nunca texto plano
  registered_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS auctions (
  id                TEXT PRIMARY KEY,
  seller_id         TEXT NOT NULL REFERENCES users(id),
  item_id           TEXT NOT NULL,
  item_title        TEXT NOT NULL,
  item_description  TEXT NOT NULL,
  item_condition    TEXT NOT NULL,
  category_id       TEXT NOT NULL REFERENCES categories(id),
  base_price        INTEGER NOT NULL CHECK (base_price > 0),
  min_increment     INTEGER NOT NULL CHECK (min_increment > 0),
  closes_at         INTEGER NOT NULL,
  published_at      INTEGER NOT NULL,
  status            TEXT NOT NULL,
  closed_at         INTEGER,
  cancelled_at      INTEGER,
  winner_id         TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_auctions_status   ON auctions(status, closes_at);
CREATE INDEX IF NOT EXISTS idx_auctions_category ON auctions(category_id);
CREATE INDEX IF NOT EXISTS idx_auctions_seller   ON auctions(seller_id);
CREATE INDEX IF NOT EXISTS idx_auctions_winner   ON auctions(winner_id);

CREATE TABLE IF NOT EXISTS bids (
  id          TEXT PRIMARY KEY,
  auction_id  TEXT NOT NULL REFERENCES auctions(id),
  seq         INTEGER NOT NULL,
  bidder_id   TEXT NOT NULL REFERENCES users(id),
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  placed_at   INTEGER NOT NULL,
  UNIQUE (auction_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_bids_bidder ON bids(bidder_id);

CREATE TABLE IF NOT EXISTS rejected_bid_attempts (
  id              TEXT PRIMARY KEY,
  auction_id      TEXT NOT NULL REFERENCES auctions(id),
  seq             INTEGER NOT NULL,
  bidder_id       TEXT NOT NULL,
  amount          REAL NOT NULL,
  reason_code     TEXT NOT NULL,
  reason_message  TEXT NOT NULL,
  attempted_at    INTEGER NOT NULL,
  UNIQUE (auction_id, seq)
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id          TEXT PRIMARY KEY,
  auction_id  TEXT NOT NULL UNIQUE REFERENCES auctions(id),  -- RN-16 (respaldo): una orden por subasta
  winner_id   TEXT NOT NULL REFERENCES users(id),
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  issued_at   INTEGER NOT NULL,
  due_at      INTEGER NOT NULL,
  status      TEXT NOT NULL,
  paid_at     INTEGER,
  expired_at  INTEGER
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id          TEXT PRIMARY KEY,                -- RN-19 (respaldo): un registro por evento
  payment_order_id  TEXT NOT NULL,
  type              TEXT NOT NULL,
  amount            INTEGER NOT NULL,
  occurred_at       INTEGER NOT NULL,
  received_at       INTEGER NOT NULL,
  outcome           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  recipient_id  TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,
  message       TEXT NOT NULL,
  auction_id    TEXT,
  created_at    INTEGER NOT NULL,
  read_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at);
`;

export type Row = Record<string, SQLOutputValue>;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* Lectura tipada de columnas: evita `any` y detecta columnas inesperadas. */

export function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Columna ${column}: se esperaba texto`);
  return value;
}

export function textOrNull(row: Row, column: string): string | null {
  const value = row[column];
  return value === null || value === undefined ? null : text(row, column);
}

export function num(row: Row, column: string): number {
  const value = row[column];
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'number') throw new Error(`Columna ${column}: se esperaba un número`);
  return value;
}

export function dateFrom(row: Row, column: string): Date {
  return new Date(num(row, column));
}

export function dateOrNull(row: Row, column: string): Date | null {
  const value = row[column];
  return value === null || value === undefined ? null : dateFrom(row, column);
}

export const ms = (d: Date | null): number | null => (d ? d.getTime() : null);
