import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Gavel,
  ShieldCheck,
  Truck,
  Share2,
  UserRound,
  CheckCircle2,
  Info,
  Loader2,
  Users,
  Ban,
  Trophy,
  CreditCard,
} from "lucide-react";
import {
  cancelAuction,
  getAuctionDetail,
  getRejectedBidAttempts,
  placeBid,
  type AuctionDetail as AuctionDetailData,
  type Category,
  type RejectedBidAttempt,
  type User,
} from "../services/auctionService";
import { realtime } from "../services/realtime";
import {
  CONDITION_LABEL,
  PAYMENT_LABEL,
  STATUS_LABEL,
  formatDateTime,
  formatPrice,
  imagesFor,
  shortId,
  timeAgo,
  timeLeft,
} from "../utils/format";

interface AuctionDetailProps {
  auctionId: string;
  categories: Category[];
  currentUser: User;
  onBack: () => void;
  onChanged: () => void;
}

/**
 * RF-06 detalle de la subasta + RF-09 pujar + RF-13 actualización en vivo.
 * Cada puja de cualquier usuario llega por WebSocket y la pantalla se refresca sola.
 */
function AuctionDetail({ auctionId, categories, currentUser, onBack, onChanged }: AuctionDetailProps) {
  const [auction, setAuction] = useState<AuctionDetailData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [participants, setParticipants] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedImage, setSelectedImage] = useState(0);
  const [rejected, setRejected] = useState<RejectedBidAttempt[]>([]);
  const [flash, setFlash] = useState(false);

  const isSeller = auction?.sellerId === currentUser.id;
  const isOpen = auction?.status === "OPEN";
  const category = categories.find((c) => c.id === auction?.categoryId);
  const images = useMemo(() => imagesFor(auctionId, category?.slug), [auctionId, category?.slug]);
  const highestBid = auction?.bids[0] ?? null;
  const iAmWinning = isOpen && highestBid?.bidderId === currentUser.id;

  const load = useCallback(async () => {
    try {
      const data = await getAuctionDetail(auctionId);
      setAuction(data);
      setLoadError("");
      return data;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No fue posible cargar la subasta.");
      return null;
    }
  }, [auctionId]);

  // Carga inicial y monto sugerido
  useEffect(() => {
    load().then((data) => {
      if (data?.minimumNextBid) setBidAmount(String(data.minimumNextBid));
    });
  }, [load]);

  // Auditoría de pujas rechazadas: solo la ve el vendedor (RF-11)
  useEffect(() => {
    if (isSeller) getRejectedBidAttempts(auctionId).then(setRejected).catch(() => setRejected([]));
  }, [isSeller, auctionId, auction?.bidCount]);

  // Sala en tiempo real de esta subasta
  useEffect(() => {
    realtime.subscribe(auctionId);
    const off = realtime.onMessage(async (msg) => {
      if (msg.data?.auctionId !== auctionId) return;
      if (msg.type === "auction.participants") {
        setParticipants(msg.data.participants);
        return;
      }
      if (["bid.placed", "auction.closed", "auction.cancelled", "auction.payment"].includes(msg.type)) {
        const data = await load();
        if (msg.type === "bid.placed") {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 900);
          // Si el monto que había escrito ya no alcanza, se sugiere el nuevo mínimo
          setBidAmount((current) =>
            data?.minimumNextBid && Number(current) < data.minimumNextBid ? String(data.minimumNextBid) : current,
          );
        }
        onChanged();
      }
    });
    return () => {
      off();
      realtime.unsubscribe(auctionId);
    };
  }, [auctionId, load, onChanged]);

  // Reloj del contador; al llegar a cero se consulta para disparar el cierre
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const closesIn = auction ? new Date(auction.closesAt).getTime() - now : 1;
  useEffect(() => {
    if (isOpen && closesIn <= 0) {
      const t = window.setTimeout(() => load(), 1500);
      return () => window.clearTimeout(t);
    }
  }, [isOpen, closesIn <= 0, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBid = async () => {
    if (!auction) return;
    setMessage(null);
    setSending(true);
    try {
      await placeBid(auction.id, Number(bidAmount));
      setMessage({ text: "¡Tu oferta quedó registrada! Ahora eres el mejor postor.", ok: true });
      const data = await load();
      if (data?.minimumNextBid) setBidAmount(String(data.minimumNextBid));
      onChanged();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "No fue posible registrar la oferta.", ok: false });
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!auction || !window.confirm("¿Seguro que quieres cancelar esta subasta? No se puede deshacer.")) return;
    try {
      setAuction(await cancelAuction(auction.id));
      setMessage({ text: "La subasta fue cancelada.", ok: true });
      onChanged();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "No fue posible cancelarla.", ok: false });
    }
  };

  const handleShare = async () => {
    const text = `Mira esta subasta en SubastaYa: ${auction?.title} (${shortId(auctionId)})`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: "Copiado al portapapeles.", ok: true });
    } catch {
      /* el navegador no permite copiar */
    }
  };

  if (loadError && !auction) {
    return (
      <div className="auction-page">
        <div className="auction-breadcrumb">
          <button onClick={onBack}>
            <ArrowLeft size={17} /> Volver al catálogo
          </button>
        </div>
        <div className="empty-state">{loadError}</div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="auction-page">
        <div className="loading-state">
          <Loader2 className="spin" /> Cargando subasta…
        </div>
      </div>
    );
  }

  const currentPrice = auction.currentPrice ?? auction.basePrice;

  return (
    <div className="auction-page">
      <div className="auction-breadcrumb">
        <button onClick={onBack}>
          <ArrowLeft size={17} />
          Volver al catálogo
        </button>
        <span>/</span>
        <span>{category?.name ?? "Subasta"}</span>
        <span>/</span>
        <strong>{auction.title}</strong>
      </div>

      <div className="auction-detail-grid">
        {/* GALERÍA */}
        <section className="auction-gallery">
          <div className="auction-main-image">
            <img src={images[selectedImage] ?? images[0]} alt={auction.title} />

            <span className={`auction-status status-${auction.status.toLowerCase()}`}>
              {isOpen && <span className="live-indicator"></span>}
              {STATUS_LABEL[auction.status]}
            </span>

            <div className="auction-image-actions">
              <button onClick={handleShare} aria-label="Compartir">
                <Share2 size={19} />
              </button>
            </div>
          </div>

          <div className="auction-thumbnails">
            {images.map((image, index) => (
              <button
                key={image}
                className={selectedImage === index ? "thumbnail active" : "thumbnail"}
                onClick={() => setSelectedImage(index)}
              >
                <img src={image} alt={`Vista ${index + 1}`} />
              </button>
            ))}
          </div>
          <small className="image-note">Imágenes ilustrativas según la categoría.</small>

          <div className="auction-description">
            <span className="section-label">DESCRIPCIÓN DEL ARTÍCULO</span>
            <h2>Sobre este producto</h2>
            <p className="description-text">{auction.description}</p>

            <div className="auction-specifications">
              <div>
                <span>Categoría</span>
                <strong>{category?.name ?? "—"}</strong>
              </div>
              <div>
                <span>Estado</span>
                <strong>{CONDITION_LABEL[auction.condition]}</strong>
              </div>
              <div>
                <span>Identificador</span>
                <strong>{shortId(auction.id)}</strong>
              </div>
              <div>
                <span>Precio base</span>
                <strong>{formatPrice(auction.basePrice)}</strong>
              </div>
              <div>
                <span>Incremento mínimo</span>
                <strong>{formatPrice(auction.minIncrement)}</strong>
              </div>
              <div>
                <span>Cierra</span>
                <strong>{formatDateTime(auction.closesAt)}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* INFORMACIÓN Y PUJAS */}
        <aside className="auction-sidebar">
          <div className="auction-heading">
            <span className="section-label">{(category?.name ?? "Subasta").toUpperCase()}</span>
            <h1>{auction.title}</h1>
            <p>Publicada {timeAgo(auction.publishedAt, now).toLowerCase()}.</p>
          </div>

          <div className="auction-bid-card">
            <div className="bid-card-top">
              <span>{auction.currentPrice ? "OFERTA ACTUAL" : "PRECIO BASE"}</span>
              {isOpen ? (
                <span className="bid-live">{realtime.connected ? "EN VIVO" : "RECONECTANDO…"}</span>
              ) : (
                <span className="bid-closed">CERRADA</span>
              )}
            </div>

            <strong className={flash ? "current-bid bid-flash" : "current-bid"}>{formatPrice(currentPrice)}</strong>

            <div className="bid-statistics">
              <span>
                <Gavel size={15} />
                {auction.bidCount} {auction.bidCount === 1 ? "oferta" : "ofertas"}
              </span>
              {participants !== null && (
                <span>
                  <Users size={15} />
                  {participants} mirando ahora
                </span>
              )}
            </div>

            {isOpen && (
              <div className="auction-countdown">
                <div>
                  <Clock3 size={17} />
                  <span>Tiempo restante</span>
                </div>
                <strong>{timeLeft(auction.closesAt, now)}</strong>
              </div>
            )}

            <div className="bid-divider"></div>

            {/* Formulario de puja: solo abierta y si no eres el vendedor */}
            {isOpen && !isSeller && (
              <>
                {iAmWinning && (
                  <div className="bid-message bid-ok">
                    <Trophy size={15} /> Vas ganando esta subasta.
                  </div>
                )}

                <label htmlFor="bid-amount">Tu oferta (COP)</label>
                <div className="bid-input-wrapper">
                  <span>$</span>
                  <input
                    id="bid-amount"
                    type="number"
                    min={auction.minimumNextBid ?? undefined}
                    step={1}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleBid()}
                  />
                </div>

                <small className="bid-minimum">
                  Oferta mínima: {formatPrice(auction.minimumNextBid ?? auction.basePrice)}
                  {auction.bidCount > 0 && ` (actual + ${formatPrice(auction.minIncrement)})`}
                </small>

                <button
                  className="place-bid-button"
                  onClick={handleBid}
                  disabled={sending || iAmWinning || !bidAmount}
                >
                  {sending ? <Loader2 size={17} className="spin" /> : null}
                  {iAmWinning ? "Eres el mejor postor" : "Realizar oferta"}
                  {!sending && !iAmWinning && <ArrowRight size={17} />}
                </button>
              </>
            )}

            {isOpen && isSeller && (
              <div className="seller-box">
                <p>Eres el vendedor de este artículo, por eso no puedes pujar.</p>
                {auction.bidCount === 0 ? (
                  <button className="danger-button" onClick={handleCancel}>
                    <Ban size={16} /> Cancelar subasta
                  </button>
                ) : (
                  <small>Ya tiene ofertas, así que no se puede cancelar.</small>
                )}
              </div>
            )}

            {/* Resultado al cerrar */}
            {!isOpen && (
              <div className="result-box">
                {auction.status === "CANCELLED" && <p>El vendedor canceló esta subasta.</p>}
                {auction.status === "DESERTED" && <p>Cerró sin ofertas: se declaró desierta.</p>}
                {auction.winner && (
                  <>
                    <p>
                      <Trophy size={16} />
                      {auction.winner.id === currentUser.id ? (
                        <span>
                          ¡Ganaste esta subasta con <strong>{formatPrice(auction.winner.amount)}</strong>!
                        </span>
                      ) : (
                        <span>
                          Ganador: <strong>{auction.winner.name}</strong> con {formatPrice(auction.winner.amount)}
                        </span>
                      )}
                    </p>
                    {auction.payment && (
                      <p className="payment-line">
                        <CreditCard size={16} /> {PAYMENT_LABEL[auction.payment.status] ?? auction.payment.status}
                        {auction.payment.status === "PENDING" && ` · plazo hasta ${formatDateTime(auction.payment.dueAt)}`}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {message && (
              <div className={message.ok ? "bid-message bid-ok" : "bid-message bid-error"} role="status">
                {message.text}
              </div>
            )}

            <div className="bid-security">
              <ShieldCheck size={17} />
              <span>Las reglas de la subasta las valida el servidor.</span>
            </div>
          </div>

          {/* VENDEDOR */}
          <div className="auction-seller-card">
            <div className="seller-avatar">
              <UserRound size={23} />
            </div>
            <div className="seller-information">
              <span>PUBLICADO POR</span>
              <strong>{isSeller ? `${auction.seller.name} (tú)` : auction.seller.name}</strong>
              <small>Vendedor de la plataforma</small>
            </div>
            <CheckCircle2 size={19} className="seller-verified" />
          </div>

          {/* GARANTÍAS */}
          <div className="auction-guarantees">
            <div>
              <ShieldCheck size={19} />
              <span>
                <strong>Transparencia</strong>
                <small>El historial de ofertas no se puede alterar.</small>
              </span>
            </div>
            <div>
              <Truck size={19} />
              <span>
                <strong>Pago en 48 horas</strong>
                <small>El ganador recibe una orden de pago al cierre.</small>
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* HISTORIAL */}
      <section className="auction-history">
        <div className="history-heading">
          <div>
            <span className="section-label">ACTIVIDAD DE LA SUBASTA</span>
            <h2>Historial de ofertas</h2>
          </div>
          <span>{auction.bids.length} registros</span>
        </div>

        <div className="history-table">
          <div className="history-row history-header">
            <span>PARTICIPANTE</span>
            <span>OFERTA</span>
            <span>FECHA</span>
            <span>ESTADO</span>
          </div>

          {auction.bids.map((bid, index) => (
            <div className="history-row" key={bid.id}>
              <span className="history-user">
                <span className="history-avatar">
                  <UserRound size={15} />
                </span>
                {bid.bidderId === currentUser.id ? `${bid.bidderName} (tú)` : bid.bidderName}
              </span>
              <strong>{formatPrice(bid.amount)}</strong>
              <span>{timeAgo(bid.placedAt, now)}</span>
              <span className={index === 0 ? "highest-bid" : "previous-bid"}>
                {index === 0 ? (isOpen ? "Oferta más alta" : "Ganadora") : "Oferta anterior"}
              </span>
            </div>
          ))}

          {auction.bids.length === 0 && (
            <div className="history-empty">Todavía no hay ofertas. ¡Sé el primero!</div>
          )}
        </div>

        <div className="history-notice">
          <Info size={17} />
          Esta pantalla se actualiza en tiempo real: verás cada nueva oferta sin recargar.
        </div>
      </section>

      {/* AUDITORÍA (solo vendedor) */}
      {isSeller && rejected.length > 0 && (
        <section className="auction-history">
          <div className="history-heading">
            <div>
              <span className="section-label">AUDITORÍA</span>
              <h2>Intentos de puja rechazados</h2>
            </div>
            <span>{rejected.length} registros</span>
          </div>
          <div className="history-table">
            <div className="history-row history-header">
              <span>MONTO</span>
              <span>MOTIVO</span>
              <span>FECHA</span>
              <span>CÓDIGO</span>
            </div>
            {rejected.map((r) => (
              <div className="history-row" key={r.id}>
                <strong>{formatPrice(r.amount)}</strong>
                <span>{r.reason}</span>
                <span>{timeAgo(r.attemptedAt, now)}</span>
                <span className="previous-bid">{r.reasonCode}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default AuctionDetail;
