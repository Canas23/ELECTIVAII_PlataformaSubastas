/*
 * Conexión WebSocket única por sesión.
 * - Recibe avisos personales (te superaron, notificaciones nuevas).
 * - Permite suscribirse a la sala de una subasta para ver cada puja al instante.
 * - Se reconecta sola si el servidor se reinicia.
 */

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws";

export interface RealtimeMessage {
  type: string;
  // El contenido depende del tipo de mensaje (bid.placed, bid.outbid, auction.closed...)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  sentAt: string;
}

type Listener = (message: RealtimeMessage) => void;
type StatusListener = (connected: boolean) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly rooms = new Set<string>();
  private reconnectTimer: number | null = null;
  private attempts = 0;
  connected = false;

  connect(token: string): void {
    if (this.token === token && this.socket) return;
    this.disconnect();
    this.token = token;
    this.open();
  }

  disconnect(): void {
    this.token = null;
    this.rooms.clear();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = null;
    this.setConnected(false);
  }

  subscribe(auctionId: string): void {
    this.rooms.add(auctionId);
    this.send({ type: "subscribe", auctionId });
  }

  unsubscribe(auctionId: string): void {
    this.rooms.delete(auctionId);
    this.send({ type: "unsubscribe", auctionId });
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.connected);
    return () => this.statusListeners.delete(listener);
  }

  private open(): void {
    if (!this.token) return;
    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setConnected(true);
      // Al reconectar, volver a entrar a las salas que se estaban mirando
      for (const auctionId of this.rooms) this.send({ type: "subscribe", auctionId });
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as RealtimeMessage;
        for (const listener of this.listeners) listener(message);
      } catch {
        console.error("Mensaje WebSocket no válido.");
      }
    };

    socket.onclose = () => {
      this.setConnected(false);
      this.socket = null;
      if (!this.token) return;
      const delay = Math.min(10_000, 1_000 * 2 ** this.attempts);
      this.attempts += 1;
      this.reconnectTimer = window.setTimeout(() => this.open(), delay);
    };
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private setConnected(value: boolean): void {
    this.connected = value;
    for (const listener of this.statusListeners) listener(value);
  }
}

export const realtime = new RealtimeClient();
