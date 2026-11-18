import { DomainError } from '../shared/DomainError';

export const NOTIFICATION_TYPES = [
  'OUTBID',
  'AUCTION_WON',
  'AUCTION_SOLD',
  'AUCTION_DESERTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'PAYMENT_OVERDUE',
] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

/** Objeto de valor: tipo de aviso. */
export class NotificationType {
  private constructor(readonly value: NotificationTypeValue) {
    Object.freeze(this);
  }

  static from(raw: string): NotificationType {
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(raw)) {
      throw new DomainError('INVALID_NOTIFICATION', `Tipo de notificación desconocido: ${raw}`);
    }
    return new NotificationType(raw as NotificationTypeValue);
  }
}

export interface NotificationSnapshot {
  id: string;
  recipientId: string;
  type: string;
  message: string;
  auctionId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

/** Aviso dirigido a un usuario sobre un hecho relevante para él. */
export class Notification {
  private constructor(
    readonly id: string,
    readonly recipientId: string,
    readonly type: NotificationType,
    readonly message: string,
    readonly auctionId: string | null,
    readonly createdAt: Date,
    private readAt: Date | null,
  ) {}

  static create(props: {
    id: string;
    recipientId: string;
    type: NotificationTypeValue;
    message: string;
    auctionId: string | null;
    now: Date;
  }): Notification {
    if (props.message.trim().length === 0) {
      throw new DomainError('INVALID_NOTIFICATION', 'La notificación debe tener un mensaje.');
    }
    return new Notification(
      props.id,
      props.recipientId,
      NotificationType.from(props.type),
      props.message,
      props.auctionId,
      new Date(props.now),
      null,
    );
  }

  static restore(s: NotificationSnapshot): Notification {
    return new Notification(
      s.id,
      s.recipientId,
      NotificationType.from(s.type),
      s.message,
      s.auctionId,
      new Date(s.createdAt),
      s.readAt ? new Date(s.readAt) : null,
    );
  }

  get readAtDate(): Date | null {
    return this.readAt ? new Date(this.readAt) : null;
  }

  markAsRead(requesterId: string, now: Date): void {
    if (requesterId !== this.recipientId) {
      throw new DomainError('NOT_NOTIFICATION_OWNER', 'La notificación pertenece a otro usuario.');
    }
    if (this.readAt) return;
    this.readAt = new Date(now);
  }

  toSnapshot(): NotificationSnapshot {
    return {
      id: this.id,
      recipientId: this.recipientId,
      type: this.type.value,
      message: this.message,
      auctionId: this.auctionId,
      createdAt: new Date(this.createdAt),
      readAt: this.readAtDate,
    };
  }
}
