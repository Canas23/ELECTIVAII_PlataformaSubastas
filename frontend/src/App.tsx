import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Gavel,
  Heart,
  Clock3,
  ChevronDown,
  ArrowRight,
  SlidersHorizontal,
  Bell,
  Menu,
  X,
  Plus,
  Lock,
  LogOut,
  UserRound,
  Loader2,
  RefreshCw,
} from "lucide-react";

import AuctionDetail from "./pages/AuctionDetail";
import MyAccount from "./pages/MyAccount";
import AuthModal, { type AuthMode } from "./components/AuthModal";
import PublishAuctionModal from "./components/PublishAuctionModal";
import NotificationsPanel from "./components/NotificationsPanel";
import Toasts, { type Toast } from "./components/Toasts";
import {
  SESSION_EXPIRED_EVENT,
  TOKEN_KEY,
  USER_KEY,
  getAuctions,
  getCategories,
  getNotifications,
  markNotificationAsRead,
  type AppNotification,
  type Auction,
  type AuctionStatus,
  type AuthResponse,
  type Category,
  type User,
} from "./services/auctionService";
import { realtime } from "./services/realtime";
import { STATUS_LABEL, formatPrice, imagesFor, timeLeft } from "./utils/format";

/* ─────────────── Navegación sencilla por hash: #/subasta/<id>, #/cuenta ─────────────── */
type View = { name: "catalog" } | { name: "auction"; id: string } | { name: "account" };

function readView(): View {
  const hash = window.location.hash;
  const match = hash.match(/^#\/subasta\/(.+)$/);
  if (match) return { name: "auction", id: match[1] };
  if (hash === "#/cuenta") return { name: "account" };
  return { name: "catalog" };
}

function loadSession(): { token: string; user: User } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);
  if (!token || !user) return null;
  try {
    return { token, user: JSON.parse(user) as User };
  } catch {
    return null;
  }
}

const STATUS_TABS: { value: AuctionStatus | ""; label: string }[] = [
  { value: "OPEN", label: "Activas" },
  { value: "", label: "Todas" },
  { value: "ADJUDICATED", label: "Adjudicadas" },
  { value: "PAID", label: "Pagadas" },
];

function App() {
  const [session, setSession] = useState(loadSession);
  const user = session?.user ?? null;

  const [view, setView] = useState<View>(readView);
  const [categories, setCategories] = useState<Category[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loadingAuctions, setLoadingAuctions] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState<AuctionStatus | "">("OPEN");
  const [sortOrder, setSortOrder] = useState("closing");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("subastaya_favorites") ?? "[]");
    } catch {
      return [];
    }
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const catalogRef = useRef<HTMLElement>(null);
  const sellRef = useRef<HTMLElement>(null);

  /* ─────────────── Avisos flotantes ─────────────── */
  const pushToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  /* ─────────────── Navegación ─────────────── */
  useEffect(() => {
    const onHash = () => {
      setView(readView());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goTo = (hash: string) => {
    setMenuOpen(false);
    setUserMenuOpen(false);
    setNotificationsOpen(false);
    window.location.hash = hash;
  };
  const openAuction = (id: string) => goTo(`#/subasta/${id}`);
  const backToCatalog = () => goTo("#/");

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    setMenuOpen(false);
    if (view.name !== "catalog") {
      backToCatalog();
      window.setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth" }), 150);
    } else {
      ref.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  /* ─────────────── Sesión ─────────────── */
  const handleAuthenticated = (auth: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, auth.token);
    localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    setSession({ token: auth.token, user: auth.user });
    setAuthMode(null);
    pushToast(`¡Hola, ${auth.user.name.split(" ")[0]}! Ya puedes pujar en vivo.`, "success");
  };

  const logout = useCallback((expired = false) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    realtime.disconnect();
    setSession(null);
    setAuctions([]);
    setNotifications([]);
    setUserMenuOpen(false);
    window.location.hash = "#/";
    if (expired) pushToast("Tu sesión venció. Vuelve a ingresar.", "warning");
  }, [pushToast]);

  useEffect(() => {
    const onExpired = () => logout(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [logout]);

  /* ─────────────── Datos ─────────────── */
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => setCatalogError(err instanceof Error ? err.message : "Sin conexión con el servidor."));
  }, []);

  // RN-23: el catálogo solo se carga con sesión iniciada
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoadingAuctions(true);
    getAuctions({ categoryId: categoryId || undefined, status: statusFilter || undefined, pageSize: 48 })
      .then((page) => {
        if (!cancelled) {
          setAuctions(page.items);
          setCatalogError("");
        }
      })
      .catch((err) => !cancelled && setCatalogError(err instanceof Error ? err.message : "Error al cargar."))
      .finally(() => !cancelled && setLoadingAuctions(false));
    return () => {
      cancelled = true;
    };
  }, [session, categoryId, statusFilter, refreshKey]);

  // El catálogo se refresca cada 15 s para mostrar precios y cierres nuevos
  useEffect(() => {
    if (!session || view.name !== "catalog") return;
    const timer = window.setInterval(() => setRefreshKey((k) => k + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [session, view.name]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  /* ─────────────── Tiempo real y notificaciones ─────────────── */
  useEffect(() => {
    if (!session) return;
    realtime.connect(session.token);
    getNotifications().then(setNotifications).catch(() => undefined);

    const off = realtime.onMessage((msg) => {
      if (msg.type === "notification.created") {
        const n = msg.data as AppNotification;
        setNotifications((prev) => [n, ...prev.filter((p) => p.id !== n.id)]);
        const tone = n.type === "OUTBID" || n.type.includes("FAILED") || n.type.includes("OVERDUE") ? "warning" : "success";
        pushToast(n.message, tone);
        refresh();
      }
    });
    return off;
  }, [session, pushToast, refresh]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const markRead = async (n: AppNotification) => {
    try {
      const updated = await markNotificationAsRead(n.id);
      setNotifications((prev) => prev.map((p) => (p.id === n.id ? updated : p)));
    } catch {
      /* sin importancia */
    }
  };
  const markAllRead = () => notifications.filter((n) => !n.readAt).forEach(markRead);

  /* ─────────────── Filtros locales ─────────────── */
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Subasta";
  const categorySlug = (id: string) => categories.find((c) => c.id === id)?.slug;

  const filteredAuctions = useMemo(() => {
    const term = search.trim().toLowerCase();
    const result = auctions.filter((a) => !term || a.title.toLowerCase().includes(term));
    const price = (a: Auction) => a.currentPrice ?? a.basePrice;
    if (sortOrder === "closing") result.sort((a, b) => a.closesAt.localeCompare(b.closesAt));
    if (sortOrder === "recent") result.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    if (sortOrder === "price-asc") result.sort((a, b) => price(a) - price(b));
    if (sortOrder === "price-desc") result.sort((a, b) => price(b) - price(a));
    if (sortOrder === "bids") result.sort((a, b) => b.bidCount - a.bidCount);
    return result;
  }, [auctions, search, sortOrder]);

  const featured = useMemo(
    () => [...auctions].filter((a) => a.status === "OPEN").sort((a, b) => b.bidCount - a.bidCount)[0] ?? null,
    [auctions],
  );

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem("subastaya_favorites", JSON.stringify(next));
      return next;
    });
  };

  const requireLogin = (action: () => void) => (user ? action() : setAuthMode("login"));

  /* ─────────────── Render ─────────────── */
  return (
    <div className="site">
      {/* ENCABEZADO */}
      <header className="header">
        <a
          className="logo"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            backToCatalog();
          }}
        >
          <span className="logo-icon">
            <Gavel size={21} />
          </span>
          <span>
            SUBASTA<span>YA</span>
          </span>
        </a>

        <div className="search-box">
          <Search size={19} />
          <input
            placeholder="Buscar artículos en subasta..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (view.name !== "catalog") backToCatalog();
            }}
          />
        </div>

        <nav className={menuOpen ? "navigation open" : "navigation"}>
          <a
            className={view.name === "catalog" ? "active" : ""}
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              scrollTo(catalogRef);
            }}
          >
            Explorar
          </a>
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              scrollTo(sellRef);
            }}
          >
            Vender
          </a>
          {user && (
            <a
              className={view.name === "account" ? "active" : ""}
              href="#/cuenta"
              onClick={(e) => {
                e.preventDefault();
                goTo("#/cuenta");
              }}
            >
              Mi cuenta
            </a>
          )}
        </nav>

        <div className="header-actions">
          {user ? (
            <>
              <div className="dropdown-anchor">
                <button
                  className="icon-button bell-button"
                  aria-label="Notificaciones"
                  onClick={() => {
                    setNotificationsOpen(!notificationsOpen);
                    setUserMenuOpen(false);
                  }}
                >
                  <Bell size={19} />
                  {unreadCount > 0 && <span className="badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>
                {notificationsOpen && (
                  <NotificationsPanel
                    notifications={notifications}
                    onOpenAuction={openAuction}
                    onMarkRead={markRead}
                    onMarkAllRead={markAllRead}
                  />
                )}
              </div>

              <button className="register-button" onClick={() => setPublishOpen(true)}>
                <Plus size={14} /> Publicar
              </button>

              <div className="dropdown-anchor">
                <button
                  className="login-button user-button"
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen);
                    setNotificationsOpen(false);
                  }}
                >
                  <UserRound size={14} /> {user.name.split(" ")[0]} <ChevronDown size={13} />
                </button>
                {userMenuOpen && (
                  <div className="user-menu">
                    <small>{user.email}</small>
                    <button onClick={() => goTo("#/cuenta")}>
                      <UserRound size={15} /> Mi cuenta
                    </button>
                    <button onClick={() => logout()}>
                      <LogOut size={15} /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button className="login-button" onClick={() => setAuthMode("login")}>
                Ingresar
              </button>
              <button className="register-button" onClick={() => setAuthMode("register")}>
                Crear cuenta
              </button>
            </>
          )}
        </div>

        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú">
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main>
        {view.name === "auction" && user ? (
          <AuctionDetail
            key={view.id}
            auctionId={view.id}
            categories={categories}
            currentUser={user}
            onBack={backToCatalog}
            onChanged={refresh}
          />
        ) : view.name === "account" && user ? (
          <MyAccount onBack={backToCatalog} onOpenAuction={openAuction} refreshKey={refreshKey} />
        ) : (
          <>
            {/* BANNER PRINCIPAL */}
            <section className="hero">
              <div className="hero-content">
                <div className="hero-label">
                  <span className="live-indicator"></span>
                  EL MARKETPLACE DE SUBASTAS
                </div>
                <h1>
                  Encuentra algo
                  <br />
                  extraordinario<span>.</span>
                </h1>
                <p>Descubre artículos únicos, participa en subastas y consigue lo que buscas al mejor precio.</p>
                <div className="hero-buttons">
                  <button className="primary-button" onClick={() => requireLogin(() => scrollTo(catalogRef))}>
                    Explorar subastas
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => requireLogin(() => setPublishOpen(true))}
                  >
                    Quiero vender
                  </button>
                </div>
                <div className="hero-benefits">
                  <div>
                    <strong>En vivo</strong>
                    <span>Ofertas actualizadas</span>
                  </div>
                  <div>
                    <strong>Transparente</strong>
                    <span>Historial de pujas</span>
                  </div>
                  <div>
                    <strong>Simple</strong>
                    <span>Compra y vende fácil</span>
                  </div>
                </div>
              </div>

              <div className="hero-image">
                <img
                  src={
                    featured
                      ? imagesFor(featured.id, categorySlug(featured.categoryId))[0]
                      : "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1100"
                  }
                  alt="Subasta destacada"
                />
                {featured ? (
                  <button className="featured-card" onClick={() => openAuction(featured.id)}>
                    <span>SUBASTA DESTACADA</span>
                    <strong>{featured.title}</strong>
                    <b>{formatPrice(featured.currentPrice ?? featured.basePrice)}</b>
                    <small>
                      <span className="live-indicator"></span>
                      {featured.bidCount} ofertas · {timeLeft(featured.closesAt, now)}
                    </small>
                  </button>
                ) : (
                  <div className="featured-card">
                    <span>SUBASTA DESTACADA</span>
                    <strong>{user ? "Publica la primera" : "Ingresa para ver"}</strong>
                    <small>
                      <span className="live-indicator"></span>
                      Ofertas en tiempo real
                    </small>
                  </div>
                )}
              </div>
            </section>

            {/* BENEFICIOS */}
            <section className="benefit-strip">
              <div>
                <Gavel />
                <span>
                  <strong>Subastas transparentes</strong>
                  <small>Participa con confianza</small>
                </span>
              </div>
              <div>
                <Clock3 />
                <span>
                  <strong>En tiempo real</strong>
                  <small>Conoce cada nueva oferta</small>
                </span>
              </div>
              <div>
                <Heart />
                <span>
                  <strong>Artículos únicos</strong>
                  <small>Encuentra nuevas oportunidades</small>
                </span>
              </div>
            </section>

            {/* CATÁLOGO */}
            <section className="catalog" id="catalogo" ref={catalogRef}>
              <div className="section-heading">
                <div>
                  <span className="section-label">DESCUBRE OPORTUNIDADES</span>
                  <h2>
                    Subastas <span>{statusFilter === "OPEN" ? "activas" : "publicadas"}</span>
                  </h2>
                  <p>Encuentra artículos interesantes y realiza tu mejor oferta.</p>
                </div>
                {user && (
                  <button className="view-all" onClick={refresh} disabled={loadingAuctions}>
                    {loadingAuctions ? <Loader2 size={17} className="spin" /> : <RefreshCw size={16} />}
                    Actualizar
                  </button>
                )}
              </div>

              {!user ? (
                <div className="auth-gate">
                  <Lock size={30} />
                  <h3>Las subastas son solo para usuarios registrados</h3>
                  <p>Crea una cuenta gratis o inicia sesión para ver los artículos, pujar y recibir avisos en vivo.</p>
                  <div>
                    <button className="primary-button" onClick={() => setAuthMode("register")}>
                      Crear cuenta <ArrowRight size={16} />
                    </button>
                    <button className="login-button" onClick={() => setAuthMode("login")}>
                      Ya tengo cuenta
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* CATEGORÍAS Y FILTROS */}
                  <div className="catalog-toolbar" id="categorias">
                    <div className="category-list">
                      <button
                        className={categoryId === "" ? "category active-category" : "category"}
                        onClick={() => setCategoryId("")}
                      >
                        Todas
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          className={categoryId === c.id ? "category active-category" : "category"}
                          onClick={() => setCategoryId(c.id)}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>

                    <div className="filter-container">
                      <button
                        className="filter-button"
                        onClick={() => setFilterOpen(!filterOpen)}
                        aria-expanded={filterOpen}
                      >
                        <SlidersHorizontal size={16} />
                        Filtros
                        <ChevronDown size={15} />
                      </button>

                      {filterOpen && (
                        <div className="filter-dropdown">
                          <strong>Filtrar y ordenar</strong>

                          <label htmlFor="status-filter">Estado</label>
                          <select
                            id="status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as AuctionStatus | "")}
                          >
                            {STATUS_TABS.map((t) => (
                              <option key={t.label} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>

                          <label htmlFor="sort-order">Ordenar por</label>
                          <select id="sort-order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                            <option value="closing">Cierran primero</option>
                            <option value="recent">Más recientes</option>
                            <option value="price-asc">Menor precio</option>
                            <option value="price-desc">Mayor precio</option>
                            <option value="bids">Más ofertas</option>
                          </select>

                          <button
                            className="reset-filter"
                            onClick={() => {
                              setSortOrder("closing");
                              setStatusFilter("OPEN");
                              setCategoryId("");
                              setSearch("");
                            }}
                          >
                            Restablecer filtros
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {catalogError && <div className="form-error">{catalogError}</div>}

                  {/* PRODUCTOS */}
                  <div className="product-grid">
                    {filteredAuctions.map((a) => (
                      <article className="product-card" key={a.id}>
                        <div className="product-image">
                          <img src={imagesFor(a.id, categorySlug(a.categoryId))[0]} alt={a.title} />
                          <span className={`product-tag tag-${a.status.toLowerCase()}`}>{STATUS_LABEL[a.status]}</span>
                          <button
                            className={favorites.includes(a.id) ? "favorite selected" : "favorite"}
                            onClick={() => toggleFavorite(a.id)}
                            aria-label="Añadir a favoritos"
                          >
                            <Heart size={18} fill={favorites.includes(a.id) ? "currentColor" : "none"} />
                          </button>
                        </div>

                        <div className="product-info">
                          <div className="product-meta">
                            <span>{categoryName(a.categoryId)}</span>
                            <span>
                              {a.bidCount} {a.bidCount === 1 ? "oferta" : "ofertas"}
                            </span>
                          </div>

                          <h3>{a.title}</h3>

                          <div className="price-label">{a.currentPrice ? "Oferta actual" : "Precio base"}</div>
                          <div className="product-price">{formatPrice(a.currentPrice ?? a.basePrice)}</div>

                          <div className="product-footer">
                            <span>
                              <Clock3 size={15} />
                              {a.status === "OPEN" ? timeLeft(a.closesAt, now) : "Cerrada"}
                            </span>
                            <button onClick={() => openAuction(a.id)}>
                              Ver subasta
                              <ArrowRight size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  {!loadingAuctions && filteredAuctions.length === 0 && (
                    <div className="no-results">
                      {auctions.length === 0
                        ? "No hay subastas con estos filtros. ¡Publica la primera!"
                        : "No encontramos artículos con esa búsqueda."}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* VENDEDORES */}
            <section className="seller-banner" id="vender" ref={sellRef}>
              <div>
                <span className="section-label">VENDE CON NOSOTROS</span>
                <h2>
                  Tu próximo artículo
                  <br />
                  puede ser <span>el protagonista.</span>
                </h2>
                <p>Publica tu producto y permite que los compradores hagan sus mejores ofertas.</p>
                <button className="primary-button" onClick={() => requireLogin(() => setPublishOpen(true))}>
                  Publicar artículo
                  <Plus size={17} />
                </button>
              </div>
              <div className="seller-art">
                <Gavel size={88} />
              </div>
            </section>
          </>
        )}
      </main>

      {/* PIE DE PÁGINA */}
      <footer className="footer">
        <a
          className="logo footer-logo"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            backToCatalog();
          }}
        >
          <span className="logo-icon">
            <Gavel size={20} />
          </span>
          <span>
            SUBASTA<span>YA</span>
          </span>
        </a>
        <p>Una nueva forma de encontrar oportunidades.</p>
        <small>© 2026 SubastaYa · Equipo Eso Va al Fallo · Proyecto académico Electiva II.</small>
      </footer>

      {authMode && (
        <AuthModal
          mode={authMode}
          onModeChange={setAuthMode}
          onClose={() => setAuthMode(null)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {publishOpen && (
        <PublishAuctionModal
          categories={categories}
          onClose={() => setPublishOpen(false)}
          onPublished={(auction) => {
            setPublishOpen(false);
            pushToast("¡Tu subasta fue publicada!", "success");
            refresh();
            openAuction(auction.id);
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}

export default App;
