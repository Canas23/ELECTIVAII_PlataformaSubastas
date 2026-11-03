import { ApplicationError } from '../../errors/ApplicationError';
import { NotificationView, toNotificationView } from '../../dto/views';
import { NotificationRepository } from '../../ports/repositories';
import { Clock } from '../../ports/services';

export class ListMyNotifications {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(input: { userId: string; unreadOnly: boolean; limit: number }): Promise<NotificationView[]> {
    const found = await this.notifications.findByRecipient(input.userId, {
      unreadOnly: input.unreadOnly,
      limit: input.limit,
    });
    return found.map(toNotificationView);
  }
}

export class MarkNotificationAsRead {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { notificationId: string; userId: string }): Promise<NotificationView> {
    const notification = await this.notifications.findById(input.notificationId);
    if (!notification) throw ApplicationError.notFound('NOTIFICATION_NOT_FOUND', 'La notificación no existe.');
    notification.markAsRead(input.userId, this.clock.now());
    await this.notifications.save(notification);
    return toNotificationView(notification);
  }
}
