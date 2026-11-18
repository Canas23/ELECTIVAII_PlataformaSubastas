import { Bell, CheckCheck } from "lucide-react";
import type { AppNotification } from "../services/auctionService";
import { timeAgo } from "../utils/format";

interface NotificationsPanelProps {
  notifications: AppNotification[];
  onOpenAuction: (auctionId: string) => void;
  onMarkRead: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
}

/** Lista de avisos personales: superado, ganaste, vendiste, pago confirmado... */
function NotificationsPanel({ notifications, onOpenAuction, onMarkRead, onMarkAllRead }: NotificationsPanelProps) {
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="notifications-panel">
      <div className="notifications-head">
        <strong>Notificaciones</strong>
        {unread > 0 && (
          <button onClick={onMarkAllRead}>
            <CheckCheck size={14} /> Marcar todas como leídas
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="notifications-empty">
          <Bell size={22} />
          <span>Aún no tienes notificaciones.</span>
        </div>
      ) : (
        <ul>
          {notifications.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "unread"}>
              <button
                onClick={() => {
                  if (!n.readAt) onMarkRead(n);
                  if (n.auctionId) onOpenAuction(n.auctionId);
                }}
              >
                <span className="notification-dot" />
                <span className="notification-body">
                  <span>{n.message}</span>
                  <small>{timeAgo(n.createdAt)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPanel;
