import { useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import Modal from "./Modal";
import {
  publishAuction,
  type AuctionDetail,
  type Category,
  type ItemCondition,
} from "../services/auctionService";
import { CONDITION_LABEL } from "../utils/format";

interface PublishAuctionModalProps {
  categories: Category[];
  onClose: () => void;
  onPublished: (auction: AuctionDetail) => void;
}

/** Valor para <input type="datetime-local"> en hora local. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * RF-04: publicar un artículo. Las reglas RN-01 a RN-03 (precio base, incremento,
 * duración entre 1 hora y 30 días) las valida el backend; aquí solo se ayuda al usuario.
 */
function PublishAuctionModal({ categories, onClose, onPublished }: PublishAuctionModalProps) {
  const [now] = useState(() => new Date());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState<ItemCondition>("USED");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [basePrice, setBasePrice] = useState("");
  const [minIncrement, setMinIncrement] = useState("");
  const [closesAt, setClosesAt] = useState(toLocalInput(new Date(now.getTime() + 24 * 3600_000)));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auction = await publishAuction({
        title,
        description,
        condition,
        categoryId,
        basePrice: Number(basePrice),
        minIncrement: Number(minIncrement),
        closesAt: new Date(closesAt).toISOString(),
      });
      onPublished(auction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible publicar la subasta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Publicar un artículo"
      subtitle="Define el precio base, el incremento mínimo entre pujas y la fecha de cierre."
      onClose={onClose}
      wide
    >
      <form className="form form-grid" onSubmit={handleSubmit}>
        <label className="span-2">
          Nombre del artículo
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Cámara Canon AE-1 con lente 50mm"
            minLength={3}
            maxLength={120}
            required
            autoFocus
          />
        </label>

        <label className="span-2">
          Descripción
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Cuenta el estado, accesorios incluidos, detalles de entrega…"
            minLength={10}
            maxLength={2000}
            rows={4}
            required
          />
        </label>

        <label>
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Estado del artículo
          <select value={condition} onChange={(e) => setCondition(e.target.value as ItemCondition)}>
            {(Object.keys(CONDITION_LABEL) as ItemCondition[]).map((key) => (
              <option key={key} value={key}>
                {CONDITION_LABEL[key]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Precio base (COP)
          <input
            type="number"
            min={1}
            step={1}
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="100000"
            required
          />
        </label>

        <label>
          Incremento mínimo (COP)
          <input
            type="number"
            min={1}
            step={1}
            value={minIncrement}
            onChange={(e) => setMinIncrement(e.target.value)}
            placeholder="10000"
            required
          />
        </label>

        <label className="span-2">
          Fecha y hora de cierre
          <input
            type="datetime-local"
            value={closesAt}
            min={toLocalInput(new Date(now.getTime() + 3600_000))}
            onChange={(e) => setClosesAt(e.target.value)}
            required
          />
          <small>Debe durar entre 1 hora y 30 días.</small>
        </label>

        {error && <div className="form-error span-2" role="alert">{error}</div>}

        <button className="primary-button form-submit span-2" type="submit" disabled={loading}>
          {loading ? <Loader2 size={17} className="spin" /> : <Plus size={17} />}
          Publicar subasta
        </button>
      </form>
    </Modal>
  );
}

export default PublishAuctionModal;
