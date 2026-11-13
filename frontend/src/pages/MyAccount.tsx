import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CreditCard, Gavel, Loader2, Tag, UserRound } from "lucide-react";
import {
  getMyPaymentOrders,
  getMyProfile,
  type Auction,
  type MyProfile,
  type PaymentOrder,
} from "../services/auctionService";
import { PAYMENT_LABEL, STATUS_LABEL, formatDateTime, formatPrice } from "../utils/format";

interface MyAccountProps {
  onBack: () => void;
  onOpenAuction: (auctionId: string) => void;
  refreshKey: number;
}

function AuctionList({ auctions, empty, onOpen }: { auctions: Auction[]; empty: string; onOpen: (id: string) => void }) {
  if (auctions.length === 0) return <div className="history-empty">{empty}</div>;
  return (
    <div className="history-table">
      <div className="history-row history-header">
        <span>ARTÍCULO</span>
        <span>PRECIO</span>
        <span>ESTADO</span>
        <span></span>
      </div>
      {auctions.map((a) => (
        <div className="history-row" key={a.id}>
          <span className="history-user">{a.title}</span>
          <strong>{formatPrice(a.currentPrice ?? a.basePrice)}</strong>
          <span className={`status-pill status-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
          <button className="link-button" onClick={() => onOpen(a.id)}>
            Ver <ArrowRight size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** RF-03 perfil (publicadas y en las que participé) + RF-17 órdenes de pago. */
function MyAccount({ onBack, onOpenAuction, refreshKey }: MyAccountProps) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getMyProfile(), getMyPaymentOrders()])
      .then(([p, o]) => {
        setProfile(p);
        setOrders(o);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No fue posible cargar tu cuenta."));
  }, [refreshKey]);

  return (
    <div className="auction-page">
      <div className="auction-breadcrumb">
        <button onClick={onBack}>
          <ArrowLeft size={17} />
          Volver al catálogo
        </button>
        <span>/</span>
        <strong>Mi cuenta</strong>
      </div>

      {error && <div className="empty-state">{error}</div>}
      {!profile && !error && (
        <div className="loading-state">
          <Loader2 className="spin" /> Cargando tu cuenta…
        </div>
      )}

      {profile && (
        <>
          <div className="account-header">
            <div className="seller-avatar account-avatar">
              <UserRound size={30} />
            </div>
            <div>
              <h1>{profile.user.name}</h1>
              <p>
                {profile.user.email} · Miembro desde {formatDateTime(profile.user.registeredAt)}
              </p>
            </div>
            <div className="account-stats">
              <div>
                <strong>{profile.publishedAuctions.length}</strong>
                <span>Publicadas</span>
              </div>
              <div>
                <strong>{profile.participatedAuctions.length}</strong>
                <span>Participaciones</span>
              </div>
              <div>
                <strong>{orders.filter((o) => o.status === "PENDING").length}</strong>
                <span>Pagos pendientes</span>
              </div>
            </div>
          </div>

          <section className="auction-history">
            <div className="history-heading">
              <div>
                <span className="section-label">
                  <CreditCard size={13} /> ÓRDENES DE PAGO
                </span>
                <h2>Tus compras</h2>
              </div>
              <span>{orders.length} órdenes</span>
            </div>
            {orders.length === 0 ? (
              <div className="history-empty">Cuando ganes una subasta, aquí verás la orden de pago.</div>
            ) : (
              <div className="history-table">
                <div className="history-row history-header">
                  <span>ARTÍCULO</span>
                  <span>VALOR</span>
                  <span>PLAZO</span>
                  <span>ESTADO</span>
                </div>
                {orders.map((o) => (
                  <div className="history-row" key={o.id}>
                    <button className="link-button history-user" onClick={() => onOpenAuction(o.auctionId)}>
                      {o.auctionTitle}
                    </button>
                    <strong>{formatPrice(o.amount)}</strong>
                    <span>{formatDateTime(o.dueAt)}</span>
                    <span className={`status-pill payment-${o.status.toLowerCase()}`}>
                      {PAYMENT_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {orders.some((o) => o.status === "PENDING") && (
              <div className="history-notice">
                <CreditCard size={17} />
                El pago lo confirma la pasarela externa mediante el webhook. Identificador de la orden para la demo:{" "}
                <code>{orders.find((o) => o.status === "PENDING")?.id}</code>
              </div>
            )}
          </section>

          <section className="auction-history">
            <div className="history-heading">
              <div>
                <span className="section-label">
                  <Tag size={13} /> VENTAS
                </span>
                <h2>Subastas que publicaste</h2>
              </div>
            </div>
            <AuctionList
              auctions={profile.publishedAuctions}
              empty="Aún no has publicado artículos."
              onOpen={onOpenAuction}
            />
          </section>

          <section className="auction-history">
            <div className="history-heading">
              <div>
                <span className="section-label">
                  <Gavel size={13} /> PUJAS
                </span>
                <h2>Subastas en las que participaste</h2>
              </div>
            </div>
            <AuctionList
              auctions={profile.participatedAuctions}
              empty="Aún no has pujado en ninguna subasta."
              onOpen={onOpenAuction}
            />
          </section>
        </>
      )}
    </div>
  );
}

export default MyAccount;
